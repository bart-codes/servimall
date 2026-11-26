import { Router } from 'express';
import { z } from 'zod';
import { WINDOW_KEYS } from '../lib/constants';
import { conflict, forbidden, notFound } from '../lib/errors';
import { dateString, idParam, objectId, parse, phoneSchema } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { Booking, Business, Dispute, User } from '../models';
import { cancelByCustomer, createBooking, rescheduleBooking, startPayment, submitReview } from '../services/bookings';
import { sendSms } from '../services/notify';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

type PlainBooking = Record<string, unknown> & { slotKeys?: unknown };
const dto = (b: { toObject: () => PlainBooking }) => {
  const { slotKeys: _hidden, ...rest } = b.toObject();
  return rest;
};

const createSchema = z.object({
  serviceId: objectId,
  slotStart: z.string().datetime({ offset: true }).optional(),
  quantity: z.number().int().min(1).max(50).default(1),
  locationType: z.enum(['at_shop', 'at_customer', 'online']).optional(),
  fulfilment: z.enum(['delivery', 'pickup']).optional(),
  address: z.string().trim().max(200).optional(),
  zoneId: objectId.optional(),
  windowDate: dateString.optional(),
  windowKey: z.enum(WINDOW_KEYS).optional(),
  mapPin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  notes: z.string().trim().max(500).optional(),
  phone: phoneSchema,
});

bookingsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const b = parse(createSchema, req.body);
  const { booking, paymentError } = await createBooking({ ...b, customerId: user.id, payPhone: b.phone });
  res.status(201).json({ booking: dto(booking), paymentError });
});

bookingsRouter.get('/mine', async (req, res) => {
  const rows = await Booking.find({ customerId: currentUser(req).id })
    .select('-slotKeys')
    .sort('-createdAt')
    .limit(100)
    .populate('businessId', 'name slug phone whatsapp')
    .lean();
  res.json(rows.map(({ businessId, ...rest }) => ({ ...rest, business: businessId })));
});

async function loadAccessible(id: string, user: { id: string; role: string }) {
  const b = await Booking.findById(id);
  if (!b) throw notFound('Booking not found');
  if (user.role === 'admin' || String(b.customerId) === user.id) return b;
  const biz = await Business.findById(b.businessId).select('ownerId');
  if (!biz || String(biz.ownerId) !== user.id) throw forbidden();
  return b;
}

bookingsRouter.get('/:id', async (req, res) => {
  res.json({ booking: dto(await loadAccessible(idParam(req.params.id), currentUser(req))) });
});

bookingsRouter.post('/:id/pay', async (req, res) => {
  const user = currentUser(req);
  const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
  const b = await Booking.findById(idParam(req.params.id));
  if (!b || String(b.customerId) !== user.id) throw notFound('Booking not found');
  await startPayment(b, phone);
  res.json({ ok: true });
});

bookingsRouter.post('/:id/cancel', async (req, res) => {
  res.json(await cancelByCustomer(idParam(req.params.id), currentUser(req).id));
});

bookingsRouter.post('/:id/review', async (req, res) => {
  const b = parse(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') }), req.body);
  await submitReview(idParam(req.params.id), currentUser(req).id, b.rating, b.comment);
  res.status(201).json({ ok: true });
});

bookingsRouter.post('/:id/reschedule', async (req, res) => {
  const { slotStart } = parse(z.object({ slotStart: z.string().datetime({ offset: true }) }), req.body);
  await rescheduleBooking(idParam(req.params.id), currentUser(req), slotStart);
  res.json({ ok: true });
});

// Customers can report a problem; the admin resolves it and any payout for the booking waits.
bookingsRouter.post('/:id/dispute', async (req, res) => {
  const user = currentUser(req);
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Tell us what went wrong (at least 10 characters)').max(1000) }), req.body);
  const b = await Booking.findById(idParam(req.params.id));
  if (!b || String(b.customerId) !== user.id) throw notFound('Booking not found');
  if (!['confirmed', 'completed', 'no_show', 'cancelled_by_shop'].includes(b.status)) throw conflict('You cannot report a problem on this booking');
  if (await Dispute.exists({ bookingId: b._id, status: 'open' })) throw conflict('You already reported a problem on this booking');
  await Dispute.create({ bookingId: b._id, customerId: user.id, businessId: b.businessId, reason });
  await Booking.updateOne({ _id: b._id }, { $set: { disputed: true } });
  const biz = await Business.findById(b.businessId).select('ownerId name');
  const owner = biz ? await User.findById(biz.ownerId).select('phone') : null;
  if (owner) await sendSms(owner.phone, `A problem was reported on booking ${b.reference} (${b.serviceName}). The platform will contact you.`);
  res.status(201).json({ ok: true });
});
