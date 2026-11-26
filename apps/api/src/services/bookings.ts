import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { env } from '../config/env';
import {
  DELIVERY_WINDOWS,
  type WindowKey,
  deliveryWindowAllowed,
} from '../lib/constants';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { cellsFor, freeStarts, generateSlotStarts } from '../lib/slots';
import { addDays, eatDateString, formatEat, toDate } from '../lib/time';
import { Availability, Booking, Business, DeliveryZone, Payment, Quote, Review, Service, User } from '../models';
import { sendSms } from './notify';
import { stkPush } from './mpesa';

export type BookingDoc = NonNullable<Awaited<ReturnType<typeof Booking.findById>>>;
type ServiceDoc = NonNullable<Awaited<ReturnType<typeof Service.findById>>>;
type BusinessDoc = NonNullable<Awaited<ReturnType<typeof Business.findById>>>;
const logErr = (msg: string, e: unknown) =>
  console.error(JSON.stringify({ level: 'error', msg, error: (e as Error)?.message }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- slots

export async function occupancy(businessId: Types.ObjectId | string, date: string, interval: number) {
  const from = toDate(date, '00:00');
  const to = toDate(addDays(date, 1), '00:00');
  const rows = await Booking.find({
    businessId,
    slotKeys: { $exists: true },
    slotStart: { $lt: to },
    slotEnd: { $gt: from },
  })
    .select('slotStart slotEnd')
    .lean();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.slotStart || !r.slotEnd) continue;
    const minutes = (r.slotEnd.getTime() - r.slotStart.getTime()) / 60000;
    for (const c of cellsFor(r.slotStart, minutes, interval)) map.set(c, (map.get(c) ?? 0) + 1);
  }
  return map;
}

export async function listSlots(serviceId: string, date: string): Promise<string[]> {
  const svc = await Service.findOne({ _id: serviceId, active: true, kind: 'service' });
  if (!svc) throw notFound('Service not found');
  const biz = await Business.findOne({ _id: svc.businessId, status: 'active' });
  if (!biz) throw notFound('Service not found');
  const avail = await Availability.findOne({ businessId: biz._id });
  if (!avail) return [];
  const starts = generateSlotStarts({
    date,
    weeklyHours: avail.weeklyHours.map((h) => ({ day: h.day ?? 0, open: h.open ?? '00:00', close: h.close ?? '00:00' })),
    daysOff: avail.daysOff.map((d) => ({ from: d.from ?? '', to: d.to ?? '' })),
    durationMinutes: svc.durationMinutes,
    intervalMinutes: avail.slotIntervalMinutes,
    leadTimeHours: svc.leadTimeHours,
    now: new Date(),
  });
  const occ = await occupancy(biz._id, date, avail.slotIntervalMinutes);
  return freeStarts(starts, occ, biz.concurrentCapacity, svc.durationMinutes, avail.slotIntervalMinutes).map((d) =>
    d.toISOString(),
  );
}

// ---------------------------------------------------------------- create

export interface CreateBookingInput {
  customerId: string;
  serviceId: string;
  slotStart?: string;
  quantity: number;
  locationType?: 'at_shop' | 'at_customer' | 'online';
  fulfilment?: 'delivery' | 'pickup';
  address?: string;
  zoneId?: string;
  windowDate?: string;
  windowKey?: WindowKey;
  mapPin?: { lat: number; lng: number };
  notes?: string;
  payPhone: string;
}

const newReference = () => randomBytes(5).toString('hex').toUpperCase().slice(0, 8);

export async function createBooking(input: CreateBookingInput) {
  const now = new Date();
  const svc = await Service.findById(input.serviceId);
  if (!svc || !svc.active) throw notFound('Service not found');
  const biz = await Business.findById(svc.businessId);
  if (!biz || biz.status !== 'active') throw notFound('Service not found');
  if (svc.priceType === 'quote') {
    throw badRequest('This service is priced by quote. Message the shop to ask for a price.');
  }

  let slotStart: Date | undefined;
  let slotEnd: Date | undefined;
  let cells: string[] | undefined;
  let locationType: 'at_shop' | 'at_customer' | 'online' | undefined;
  let fulfilment: 'delivery' | 'pickup' | undefined;
  let address: string | undefined;
  let delivery: Record<string, unknown> | undefined;
  let zone: NonNullable<Awaited<ReturnType<typeof DeliveryZone.findOne>>> | null = null;
  let quantity = 1;

  if (svc.kind === 'service') {
    if (!input.slotStart) throw badRequest('Choose a date and time');
    const start = new Date(input.slotStart);
    if (Number.isNaN(start.getTime())) throw badRequest('Invalid time');
    const interval = await assertSlotOpen(svc, biz, start, now);
    if (!input.locationType || !svc.locationOptions.includes(input.locationType)) {
      throw badRequest('Choose where the service should happen');
    }
    if (input.locationType === 'at_customer' && (input.address ?? '').trim().length < 5) {
      throw badRequest('Enter the address where the service should happen');
    }
    locationType = input.locationType;
    address = locationType === 'at_customer' ? input.address!.trim() : undefined;
    slotStart = start;
    slotEnd = new Date(start.getTime() + svc.durationMinutes * 60e3);
    cells = cellsFor(start, svc.durationMinutes, interval);
  } else {
    quantity = input.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw badRequest('Choose a quantity between 1 and 50');
    if (!input.fulfilment || !svc.fulfilmentOptions.includes(input.fulfilment)) {
      throw badRequest('Choose delivery or pickup');
    }
    fulfilment = input.fulfilment;
    if (!input.windowDate || !input.windowKey || !deliveryWindowAllowed(input.windowDate, input.windowKey, now, svc.deliveryCutoffHour)) {
      throw badRequest('Choose an available delivery or pickup time');
    }
    if (fulfilment === 'delivery') {
      zone = input.zoneId ? await DeliveryZone.findOne({ _id: input.zoneId, regionId: svc.regionId, active: true }) : null;
      if (!zone) throw badRequest('Choose a delivery area');
      if ((input.address ?? '').trim().length < 5) throw badRequest('Enter the delivery address');
      address = input.address!.trim();
    }
    delivery = {
      zoneId: zone?._id,
      windowDate: input.windowDate,
      windowKey: input.windowKey,
      mapPin: input.mapPin,
      status: 'confirmed',
    };
  }

  const subtotal = svc.price * quantity;
  const deliveryFee = zone ? (zone.freeDeliveryOver != null && subtotal >= zone.freeDeliveryOver ? 0 : zone.fee) : 0;
  const total = subtotal + deliveryFee;
  const depositDue = depositFor(svc, total);
  const needsPayment = depositDue > 0;

  // Reserve stock atomically (goods only).
  if (svc.kind === 'goods') {
    const r = await Service.updateOne({ _id: svc._id, stockQuantity: { $gte: quantity } }, { $inc: { stockQuantity: -quantity } });
    if (r.modifiedCount !== 1) throw conflict('Sorry, there is not enough stock left');
  }

  let booking: BookingDoc | undefined;
  try {
    const lanes = cells ? biz.concurrentCapacity : 1;
    for (let lane = 0; lane < lanes && !booking; lane++) {
      try {
        booking = await Booking.create({
          reference: newReference(),
          customerId: input.customerId,
          businessId: biz._id,
          serviceId: svc._id,
          regionId: svc.regionId,
          kind: svc.kind,
          serviceName: svc.name,
          unitPrice: svc.price,
          quantity,
          subtotal,
          deliveryFee,
          total,
          depositDue,
          slotStart,
          slotEnd,
          slotKeys: cells?.map((c) => `${biz.id}:${c}:${lane}`),
          locationType,
          fulfilment,
          customerAddress: address,
          notes: input.notes?.trim() || undefined,
          delivery,
          status: needsPayment ? 'pending_payment' : 'confirmed',
          holdExpiresAt: needsPayment ? new Date(now.getTime() + env.HOLD_MINUTES * 60e3) : undefined,
        });
      } catch (e) {
        if ((e as { code?: number }).code === 11000 && cells) continue; // lane taken, try the next one
        throw e;
      }
    }
    if (!booking) throw conflict('That time was just taken. Please choose another.');
  } catch (e) {
    if (svc.kind === 'goods') await Service.updateOne({ _id: svc._id }, { $inc: { stockQuantity: quantity } });
    throw e;
  }

  if (!needsPayment) {
    void notifyConfirmed(booking.id);
    return { booking };
  }
  try {
    await startPayment(booking, input.payPhone);
    return { booking };
  } catch (e) {
    logErr('start payment failed', e);
    return { booking, paymentError: (e as Error).message };
  }
}

// ---------------------------------------------------------------- payments

export async function startPayment(booking: BookingDoc, phone: string) {
  if (booking.status !== 'pending_payment' || (booking.holdExpiresAt && booking.holdExpiresAt < new Date())) {
    throw conflict('This booking can no longer be paid');
  }
  const amount = booking.depositDue - booking.amountPaid;
  if (amount <= 0) throw conflict('Nothing left to pay');
  const res = await stkPush({ phone, amount, reference: booking.reference, description: `Booking ${booking.reference}` });
  const biz = await Business.findById(booking.businessId).select('commissionRate');
  await Payment.create({
    bookingId: booking._id,
    customerId: booking.customerId,
    businessId: booking.businessId,
    amount,
    purpose: booking.kind === 'goods' ? 'full' : 'deposit',
    phoneUsed: phone,
    checkoutRequestId: res.checkoutRequestId,
    status: 'initiated',
    commissionAmount: Math.round(amount * (biz?.commissionRate ?? 0)),
  });
  if (env.MPESA_ENV === 'mock') {
    setTimeout(() => {
      settlePayment(res.checkoutRequestId, true, `MOCK${Date.now()}`, { mock: true }).catch((e) => logErr('mock settle', e));
    }, 3000);
  }
}

/** Idempotent: processing the same callback twice changes nothing the second time. */
export async function settlePayment(
  checkoutRequestId: string,
  success: boolean,
  receipt?: string,
  raw?: unknown,
  attempt = 0,
): Promise<void> {
  const pay = await Payment.findOneAndUpdate(
    { checkoutRequestId, status: 'initiated' },
    { $set: { status: success ? 'succeeded' : 'failed', mpesaReceipt: receipt, rawCallback: raw } },
    { new: true },
  );
  if (!pay) {
    // The callback can beat the Payment insert by a moment; look once more before giving up.
    if (attempt < 2) {
      await sleep(2000);
      return settlePayment(checkoutRequestId, success, receipt, raw, attempt + 1);
    }
    return;
  }
  if (!success) return;
  const booking = await Booking.findById(pay.bookingId);
  if (!booking) return;
  booking.amountPaid += pay.amount;
  let justConfirmed = false;
  if (booking.status === 'pending_payment') {
    if (booking.amountPaid >= booking.depositDue) {
      booking.status = 'confirmed';
      booking.holdExpiresAt = undefined;
      justConfirmed = true;
    }
  } else if (booking.status === 'expired' || booking.status.startsWith('cancelled')) {
    // Money arrived after the hold ended. Flag it so the admin can refund it.
    booking.refundDue += pay.amount;
  }
  await booking.save();
  if (justConfirmed) await notifyConfirmed(booking.id);
}

// ---------------------------------------------------------------- notifications

function whenText(b: BookingDoc): string {
  if (b.slotStart) return formatEat(b.slotStart);
  const w = b.delivery?.windowKey ? DELIVERY_WINDOWS[b.delivery.windowKey as WindowKey]?.label : '';
  return `${b.delivery?.windowDate ?? ''} ${w}`.trim();
}

export async function notifyConfirmed(bookingId: string) {
  try {
    const b = await Booking.findById(bookingId);
    if (!b) return;
    const [cust, biz] = await Promise.all([User.findById(b.customerId), Business.findById(b.businessId)]);
    const owner = biz ? await User.findById(biz.ownerId) : null;
    const what = b.kind === 'goods' ? `${b.quantity} x ${b.serviceName}` : b.serviceName;
    if (cust && biz) {
      await sendSms(
        cust.phone,
        `${biz.name}: booking ${b.reference} confirmed for ${whenText(b)}. Total KES ${b.total}, paid KES ${b.amountPaid}.`,
      );
    }
    if (owner && cust) {
      await sendSms(owner.phone, `New booking ${b.reference}: ${what}, ${whenText(b)}. Customer ${cust.name} ${cust.phone}.`);
    }
  } catch (e) {
    logErr('notifyConfirmed', e);
  }
}

async function notifyCustomer(b: { customerId: unknown }, message: string) {
  const cust = await User.findById(b.customerId).select('phone');
  if (cust) await sendSms(cust.phone, message);
}

// ---------------------------------------------------------------- cancel and release

/** Atomically moves a booking out of an active state and frees its slot and stock. */
export async function releaseBooking(
  id: string,
  allowedFrom: string[],
  newStatus: 'expired' | 'cancelled_by_customer' | 'cancelled_by_shop',
  reason?: string,
) {
  const before = await Booking.findOneAndUpdate(
    { _id: id, status: { $in: allowedFrom } },
    { $set: { status: newStatus, cancelledAt: new Date(), cancelReason: reason }, $unset: { slotKeys: 1, holdExpiresAt: 1 } },
    { new: false },
  );
  if (!before) return null;
  if (before.kind === 'goods') {
    await Service.updateOne({ _id: before.serviceId }, { $inc: { stockQuantity: before.quantity } });
  }
  if (before.quoteId && (newStatus === 'expired' || before.status === 'pending_payment')) {
    // an unpaid quote order goes back to "offered" so the customer can try again
    await Quote.updateOne({ _id: before.quoteId, status: 'accepted' }, { $set: { status: 'offered' }, $unset: { bookingId: 1 } });
  }
  return before;
}

function refundPercent(b: BookingDoc, biz: { cancellationPolicy?: { fullRefundHours?: number; partialRefundHours?: number; partialRefundPercent?: number } | null }, now: Date) {
  if (b.kind === 'goods') return 100;
  if (!b.slotStart) return biz.cancellationPolicy?.partialRefundPercent ?? 50; // project work started from a quote
  const p = biz.cancellationPolicy;
  const hours = ((b.slotStart?.getTime() ?? now.getTime()) - now.getTime()) / 3.6e6;
  if (hours >= (p?.fullRefundHours ?? 48)) return 100;
  if (hours >= (p?.partialRefundHours ?? 24)) return p?.partialRefundPercent ?? 50;
  return 0;
}

const PACKED = ['packed', 'out_for_delivery', 'delivered'];

export async function cancelByCustomer(bookingId: string, userId: string) {
  const now = new Date();
  const b = await Booking.findById(bookingId);
  if (!b || String(b.customerId) !== userId) throw notFound('Booking not found');
  if (!['pending_payment', 'confirmed'].includes(b.status)) throw conflict('This booking can no longer be cancelled');
  if (b.kind === 'goods' && PACKED.includes(b.delivery?.status ?? '')) {
    throw conflict('This order has already been packed. Please contact the shop.');
  }
  if (b.slotStart && b.slotStart <= now) throw conflict('This booking has already started');
  const biz = await Business.findById(b.businessId);
  if (!biz) throw notFound('Shop not found');
  const pct = refundPercent(b, biz, now);
  const before = await releaseBooking(bookingId, ['pending_payment', 'confirmed'], 'cancelled_by_customer', 'Cancelled by customer');
  if (!before) throw conflict('This booking can no longer be cancelled');
  const refundDue = Math.round((before.amountPaid * pct) / 100);
  if (refundDue > 0) await Booking.updateOne({ _id: bookingId }, { $set: { refundDue } });
  const owner = await User.findById(biz.ownerId).select('phone');
  if (owner) await sendSms(owner.phone, `Booking ${b.reference} (${b.serviceName}) was cancelled by the customer.`);
  return { refundDue, refundPercent: pct };
}

// ---------------------------------------------------------------- shop and admin actions

async function loadForActor(bookingId: string, actor: { id: string; role: string }) {
  const b = await Booking.findById(bookingId);
  if (!b) throw notFound('Booking not found');
  if (actor.role !== 'admin') {
    const biz = await Business.findById(b.businessId).select('ownerId');
    if (!biz || String(biz.ownerId) !== actor.id) throw forbidden();
  }
  return b;
}

export async function shopSetStatus(
  bookingId: string,
  actor: { id: string; role: string },
  status: 'completed' | 'no_show' | 'cancelled_by_shop',
  reason?: string,
) {
  const b = await loadForActor(bookingId, actor);
  if (status === 'cancelled_by_shop') {
    const before = await releaseBooking(bookingId, ['pending_payment', 'confirmed'], 'cancelled_by_shop', reason ?? 'Cancelled by shop');
    if (!before) throw conflict('This booking can no longer be cancelled');
    if (before.amountPaid > 0) await Booking.updateOne({ _id: bookingId }, { $set: { refundDue: before.amountPaid } });
    await notifyCustomer(b, `Sorry, ${b.serviceName} (booking ${b.reference}) was cancelled by the shop. Any payment will be refunded.`);
    return;
  }
  if (b.kind === 'goods') throw badRequest('Goods orders are completed through delivery updates');
  if (b.status !== 'confirmed') throw conflict('Only confirmed bookings can be updated');
  if (b.slotStart && b.slotStart > new Date()) throw conflict('This booking has not started yet');
  b.status = status;
  if (status === 'completed') b.completedAt = new Date();
  await b.save();
}

const DELIVERY_FLOW: Record<string, string[]> = {
  confirmed: ['packed'],
  packed: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered', 'failed'],
  failed: ['out_for_delivery'],
};

export async function setDeliveryStatus(
  bookingId: string,
  actor: { id: string; role: string },
  status: 'packed' | 'out_for_delivery' | 'delivered' | 'failed',
) {
  const b = await loadForActor(bookingId, actor);
  if (b.kind !== 'goods' || !b.delivery) throw badRequest('This is not a goods order');
  if (b.status !== 'confirmed') throw conflict('Only confirmed orders can be updated');
  const current = b.delivery.status ?? 'confirmed';
  if (!DELIVERY_FLOW[current]?.includes(status)) throw conflict(`Cannot move an order from ${current} to ${status}`);
  b.delivery.status = status;
  if (status === 'delivered') {
    b.delivery.deliveredAt = new Date();
    b.status = 'completed';
    b.completedAt = new Date();
  }
  await b.save();
  const text: Record<string, string> = {
    packed: `Your order ${b.reference} is packed and ready.`,
    out_for_delivery: `Your order ${b.reference} is on its way.`,
    delivered: `Your order ${b.reference} was ${b.fulfilment === 'pickup' ? 'collected' : 'delivered'}. Thank you!`,
    failed: `We could not deliver order ${b.reference}. We will contact you to reschedule.`,
  };
  await notifyCustomer(b, text[status]);
}

// ---------------------------------------------------------------- reviews

export async function submitReview(bookingId: string, userId: string, rating: number, comment: string) {
  const b = await Booking.findById(bookingId);
  if (!b || String(b.customerId) !== userId) throw notFound('Booking not found');
  if (b.status !== 'completed') throw conflict('You can review a booking once it is completed');
  if (await Review.exists({ bookingId })) throw conflict('You have already reviewed this booking');
  await Review.create({ bookingId, customerId: userId, businessId: b.businessId, rating, comment });
  await recomputeRating(b.businessId);
}

// ---------------------------------------------------------------- housekeeping

export async function expireHolds(now = new Date()): Promise<number> {
  await Quote.updateMany({ status: 'offered', offerExpiresAt: { $lt: now } }, { $set: { status: 'expired' } });
  const due = await Booking.find({ status: 'pending_payment', holdExpiresAt: { $lt: now } })
    .select('_id')
    .limit(200)
    .lean();
  for (const d of due) await releaseBooking(String(d._id), ['pending_payment'], 'expired', 'Payment not received in time');
  return due.length;
}

// ================================================================ helpers shared by the features below

async function assertSlotOpen(svc: ServiceDoc, biz: BusinessDoc, start: Date, now: Date): Promise<number> {
  const avail = await Availability.findOne({ businessId: biz._id });
  if (!avail) throw conflict('This shop has not set its opening hours yet');
  const starts = generateSlotStarts({
    date: eatDateString(start),
    weeklyHours: avail.weeklyHours.map((h) => ({ day: h.day ?? 0, open: h.open ?? '00:00', close: h.close ?? '00:00' })),
    daysOff: avail.daysOff.map((d) => ({ from: d.from ?? '', to: d.to ?? '' })),
    durationMinutes: svc.durationMinutes,
    intervalMinutes: avail.slotIntervalMinutes,
    leadTimeHours: svc.leadTimeHours,
    now,
  });
  if (!starts.some((s) => s.getTime() === start.getTime())) throw conflict('That time is no longer available');
  return avail.slotIntervalMinutes;
}

function depositFor(svc: ServiceDoc, total: number): number {
  if (svc.kind === 'goods') return total;
  if (svc.depositType === 'fixed') return Math.min(Math.round(svc.depositValue), total);
  if (svc.depositType === 'percent') return Math.ceil((total * Math.min(svc.depositValue, 100)) / 100);
  return 0;
}

export async function recomputeRating(businessId: Types.ObjectId | string) {
  const [agg] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { businessId: new Types.ObjectId(String(businessId)), status: 'visible' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  await Business.updateOne(
    { _id: businessId },
    { $set: { ratingAverage: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.n ?? 0 } },
  );
}

// ================================================================ quotes: accept an offer and pay the deposit

export async function acceptQuote(quoteId: string, userId: string, payPhone: string) {
  const now = new Date();
  const q = await Quote.findOneAndUpdate(
    { _id: quoteId, customerId: userId, status: 'offered', offerExpiresAt: { $gt: now } },
    { $set: { status: 'accepted' } },
    { new: true },
  );
  if (!q) throw conflict('This offer is no longer available');
  let booking: BookingDoc;
  let needsPayment = false;
  try {
    const [svc, biz] = await Promise.all([Service.findById(q.serviceId), Business.findById(q.businessId)]);
    if (!svc || !svc.active || !biz || biz.status !== 'active' || q.priceOffered == null) {
      throw conflict('This shop is not taking orders right now');
    }
    const total = q.priceOffered;
    const depositDue = depositFor(svc, total);
    needsPayment = depositDue > 0;
    booking = await Booking.create({
      reference: newReference(),
      customerId: userId,
      businessId: biz._id,
      serviceId: svc._id,
      regionId: svc.regionId,
      kind: 'service',
      serviceName: svc.name,
      unitPrice: total,
      quantity: 1,
      subtotal: total,
      deliveryFee: 0,
      total,
      depositDue,
      locationType: 'online',
      notes: q.brief.slice(0, 500),
      projectDeadline: q.deadline,
      quoteId: q._id,
      status: needsPayment ? 'pending_payment' : 'confirmed',
      holdExpiresAt: needsPayment ? new Date(now.getTime() + env.HOLD_MINUTES * 60e3) : undefined,
    });
    await Quote.updateOne({ _id: q._id }, { $set: { bookingId: booking._id } });
  } catch (e) {
    await Quote.updateOne({ _id: q._id }, { $set: { status: 'offered' } });
    throw e;
  }
  if (!needsPayment) {
    void notifyConfirmed(booking.id);
    return { booking };
  }
  try {
    await startPayment(booking, payPhone);
    return { booking };
  } catch (e) {
    logErr('start payment failed', e);
    return { booking, paymentError: (e as Error).message };
  }
}

// ================================================================ reschedule

/** Customers: once, at least 24 hours ahead. Shops and admins: any time. Moves the slot keys atomically. */
export async function rescheduleBooking(bookingId: string, actor: { id: string; role: string }, slotStartIso: string) {
  const now = new Date();
  const b = await Booking.findById(bookingId);
  if (!b) throw notFound('Booking not found');
  const isCustomer = String(b.customerId) === actor.id;
  if (!isCustomer) await loadForActor(bookingId, actor); // throws unless shop owner or admin
  if (b.kind !== 'service' || !b.slotStart || b.status !== 'confirmed') throw conflict('This booking cannot be rescheduled');
  if (isCustomer) {
    if ((b.rescheduleCount ?? 0) >= 1) throw conflict('A booking can be rescheduled once. Please contact the shop or cancel and rebook.');
    if (b.slotStart.getTime() - now.getTime() < 24 * 3600e3) throw conflict('Bookings can only be rescheduled at least 24 hours before they start');
  }
  const start = new Date(slotStartIso);
  if (Number.isNaN(start.getTime())) throw badRequest('Invalid time');
  const [svc, biz] = await Promise.all([Service.findById(b.serviceId), Business.findById(b.businessId)]);
  if (!svc || !biz) throw notFound('Booking not found');
  const interval = await assertSlotOpen(svc, biz, start, now);
  const cells = cellsFor(start, svc.durationMinutes, interval);
  const end = new Date(start.getTime() + svc.durationMinutes * 60e3);
  let moved = false;
  for (let lane = 0; lane < biz.concurrentCapacity && !moved; lane++) {
    try {
      const r = await Booking.updateOne(
        { _id: b._id, status: 'confirmed', slotStart: b.slotStart },
        {
          $set: { slotStart: start, slotEnd: end, slotKeys: cells.map((c) => `${biz.id}:${c}:${lane}`), rescheduleCount: (b.rescheduleCount ?? 0) + (isCustomer ? 1 : 0) },
          $unset: { reminder24SentAt: 1, reminder2SentAt: 1 },
        },
      );
      if (r.modifiedCount !== 1) throw conflict('This booking just changed. Please refresh and try again.');
      moved = true;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) continue; // lane taken, try the next one
      throw e;
    }
  }
  if (!moved) throw conflict('That time was just taken. Please choose another.');
  const msg = `Booking ${b.reference} (${b.serviceName}) moved to ${formatEat(start)}.`;
  if (isCustomer) {
    const owner = await User.findById(biz.ownerId).select('phone');
    if (owner) await sendSms(owner.phone, msg);
  } else {
    await notifyCustomer(b, `${biz.name}: ${msg}`);
  }
}

// ================================================================ reminders (24 hours and 2 hours before)

export async function sendReminders(now = new Date()) {
  const H = 3600e3;
  const claim = async (id: unknown, field: 'reminder24SentAt' | 'reminder2SentAt') =>
    (await Booking.updateOne({ _id: id, [field]: { $exists: false } }, { $set: { [field]: now } })).modifiedCount === 1;
  const text = async (b: BookingDoc, lead: string) => {
    const biz = await Business.findById(b.businessId).select('name phone');
    const where = b.locationType === 'at_customer' ? ' at your address' : b.locationType === 'online' ? ' (online)' : '';
    await notifyCustomer(b, `Reminder${lead}: ${b.serviceName} with ${biz?.name ?? 'the shop'}${where} on ${formatEat(b.slotStart!)}. Booking ${b.reference}.${biz ? ` Call ${biz.phone}.` : ''}`);
  };

  const due24 = await Booking.find({
    status: 'confirmed', kind: 'service', reminder24SentAt: { $exists: false },
    slotStart: { $gt: new Date(now.getTime() + 2 * H), $lte: new Date(now.getTime() + 24 * H) },
  }).limit(200);
  for (const b of due24) {
    const bookedAt = (b as { createdAt?: Date }).createdAt;
    const bookedLate = !!bookedAt && b.slotStart!.getTime() - bookedAt.getTime() < 24 * H; // booked less than a day ahead: no day-before reminder
    if (await claim(b._id, 'reminder24SentAt')) {
      if (!bookedLate) await text(b, ' for tomorrow');
    }
  }
  const due2 = await Booking.find({
    status: 'confirmed', kind: 'service', reminder2SentAt: { $exists: false },
    slotStart: { $gt: now, $lte: new Date(now.getTime() + 2 * H) },
  }).limit(200);
  for (const b of due2) {
    if (await claim(b._id, 'reminder2SentAt')) await text(b, ' in 2 hours');
  }
}
