import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { AppError, forbidden, notFound } from '../lib/errors';
import { dateString, idParam, objectId, parse, phoneSchema } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { Availability, Booking, BOOKING_STATUSES, Business, CATEGORIES, FULFILMENT, LOCATION_TYPES, Quote, Region, Review, Service, User } from '../models';
import { imageUrl } from '../lib/images';
import { earningsFor } from '../services/payouts';
import { sendSms } from '../services/notify';
import { rescheduleBooking, setDeliveryStatus, shopSetStatus } from '../services/bookings';

export const ownerRouter = Router();
ownerRouter.use(requireAuth);

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shop';

async function loadOwned(businessId: string, user: { id: string; role: string }) {
  const biz = await Business.findById(businessId);
  if (!biz) throw notFound('Shop not found');
  if (user.role !== 'admin' && String(biz.ownerId) !== user.id) throw forbidden();
  return biz;
}

const businessBody = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(2000).default(''),
  phone: phoneSchema,
  whatsapp: phoneSchema.optional(),
  town: z.string().trim().min(2).max(60),
  address: z.string().trim().max(200).optional(),
  logoUrl: imageUrl.optional(),
  concurrentCapacity: z.number().int().min(1).max(20).default(1),
  cancellationPolicy: z
    .object({
      fullRefundHours: z.number().min(0).max(720),
      partialRefundHours: z.number().min(0).max(720),
      partialRefundPercent: z.number().min(0).max(100),
    })
    .optional(),
});

ownerRouter.get('/businesses', async (req, res) => {
  const user = currentUser(req);
  const businesses = await Business.find(user.role === 'admin' ? {} : { ownerId: user.id }).sort('name').lean();
  res.json(businesses);
});

ownerRouter.post('/businesses', async (req, res) => {
  const user = currentUser(req);
  const b = parse(businessBody.extend({ regionId: objectId }), req.body);
  const region = await Region.findOne({ _id: b.regionId, active: true });
  if (!region) throw notFound('Region not found');
  const biz = await Business.create({
    ...b,
    ownerId: user.id,
    slug: `${slugify(b.name)}-${randomBytes(2).toString('hex')}`,
    status: 'pending',
  });
  await Availability.create({ businessId: biz._id });
  if (user.role === 'customer') await User.updateOne({ _id: user.id }, { $set: { role: 'owner' } });
  res.status(201).json(biz);
});

ownerRouter.get('/businesses/:id', async (req, res) => {
  const biz = await loadOwned(idParam(req.params.id), currentUser(req));
  const [services, availability] = await Promise.all([
    Service.find({ businessId: biz._id }).sort({ kind: 1, name: 1 }).lean(),
    Availability.findOne({ businessId: biz._id }).lean(),
  ]);
  res.json({ business: biz, services, availability });
});

ownerRouter.put('/businesses/:id', async (req, res) => {
  const biz = await loadOwned(idParam(req.params.id), currentUser(req));
  const b = parse(businessBody, req.body);
  biz.set({ ...b }); // status, slug and commission are not editable by owners
  await biz.save();
  res.json(biz);
});

// ---------- services ----------
const serviceBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).default(''),
    kind: z.enum(['service', 'goods']),
    price: z.number().int().min(0).max(1_000_000),
    priceType: z.enum(['fixed', 'from', 'quote']).default('fixed'),
    durationMinutes: z.number().int().min(15).max(960).default(60),
    depositType: z.enum(['none', 'fixed', 'percent']).default('none'),
    depositValue: z.number().min(0).max(1_000_000).default(0),
    locationOptions: z.array(z.enum(LOCATION_TYPES)).default([]),
    leadTimeHours: z.number().int().min(0).max(720).default(2),
    fulfilmentOptions: z.array(z.enum(FULFILMENT)).default([]),
    unit: z.string().trim().max(20).optional(),
    stockQuantity: z.number().int().min(0).max(100000).optional(),
    deliveryCutoffHour: z.number().int().min(0).max(23).default(18),
    photos: z.array(imageUrl).max(6).default([]),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'service' && v.locationOptions.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['locationOptions'], message: 'Choose where the service happens' });
    }
    if (v.kind === 'goods') {
      if (v.fulfilmentOptions.length === 0) ctx.addIssue({ code: 'custom', path: ['fulfilmentOptions'], message: 'Choose delivery, pickup or both' });
      if (v.stockQuantity === undefined) ctx.addIssue({ code: 'custom', path: ['stockQuantity'], message: 'Enter the stock quantity' });
      if (!v.unit) ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Enter a unit, for example tray or kit' });
    }
    if (v.depositType === 'percent' && v.depositValue > 100) {
      ctx.addIssue({ code: 'custom', path: ['depositValue'], message: 'A percentage deposit cannot be over 100' });
    }
  });

ownerRouter.post('/businesses/:id/services', async (req, res) => {
  const biz = await loadOwned(idParam(req.params.id), currentUser(req));
  const b = parse(serviceBody, req.body);
  res.status(201).json(await Service.create({ ...b, businessId: biz._id, regionId: biz.regionId }));
});

ownerRouter.put('/services/:id', async (req, res) => {
  const svc = await Service.findById(idParam(req.params.id));
  if (!svc) throw notFound('Service not found');
  await loadOwned(String(svc.businessId), currentUser(req));
  svc.set(parse(serviceBody, req.body));
  await svc.save();
  res.json(svc);
});

// ---------- availability ----------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');
ownerRouter.put('/businesses/:id/availability', async (req, res) => {
  const biz = await loadOwned(idParam(req.params.id), currentUser(req));
  const b = parse(
    z.object({
      weeklyHours: z
        .array(z.object({ day: z.number().int().min(0).max(6), open: hhmm, close: hhmm }))
        .max(21)
        .refine((a) => a.every((h) => h.open < h.close), 'Opening time must be before closing time'),
      daysOff: z
        .array(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(100).optional() }))
        .max(60)
        .default([]),
      slotIntervalMinutes: z.number().int().min(15).max(120).default(30),
    }),
    req.body,
  );
  const doc = await Availability.findOneAndUpdate({ businessId: biz._id }, { $set: b }, { upsert: true, new: true });
  res.json(doc);
});

// ---------- bookings for the shop ----------
ownerRouter.get('/bookings', async (req, res) => {
  const user = currentUser(req);
  const q = parse(z.object({ businessId: objectId, status: z.enum(BOOKING_STATUSES).optional() }), req.query);
  const biz = await loadOwned(q.businessId, user);
  const filter: Record<string, unknown> = { businessId: biz._id };
  if (q.status) filter.status = q.status;
  const rows = await Booking.find(filter).select('-slotKeys').sort('-createdAt').limit(200).populate('customerId', 'name phone').lean();
  res.json(rows.map(({ customerId, ...rest }) => ({ ...rest, customer: customerId })));
});

ownerRouter.post('/bookings/:id/status', async (req, res) => {
  const b = parse(z.object({ status: z.enum(['completed', 'no_show', 'cancelled_by_shop']), reason: z.string().max(200).optional() }), req.body);
  await shopSetStatus(idParam(req.params.id), currentUser(req), b.status, b.reason);
  res.json({ ok: true });
});

ownerRouter.post('/bookings/:id/delivery', async (req, res) => {
  const b = parse(z.object({ status: z.enum(['packed', 'out_for_delivery', 'delivered', 'failed']) }), req.body);
  await setDeliveryStatus(idParam(req.params.id), currentUser(req), b.status);
  res.json({ ok: true });
});


ownerRouter.post('/bookings/:id/reschedule', async (req, res) => {
  const { slotStart } = parse(z.object({ slotStart: z.string().datetime({ offset: true }) }), req.body);
  await rescheduleBooking(idParam(req.params.id), currentUser(req), slotStart);
  res.json({ ok: true });
});

// ---------- quotes ----------
ownerRouter.get('/quotes', async (req, res) => {
  const q = parse(z.object({ businessId: objectId, status: z.enum(['requested', 'offered', 'accepted', 'declined', 'expired']).optional() }), req.query);
  const biz = await loadOwned(q.businessId, currentUser(req));
  const rows = await Quote.find({ businessId: biz._id, ...(q.status ? { status: q.status } : {}) }).sort('-createdAt').limit(100).populate('customerId', 'name phone').lean();
  res.json(rows.map(({ customerId, ...rest }) => ({ ...rest, customer: customerId })));
});

async function loadQuote(id: string, user: { id: string; role: string }) {
  const q = await Quote.findById(id);
  if (!q) throw notFound('Quote request not found');
  await loadOwned(String(q.businessId), user);
  return q;
}

ownerRouter.post('/quotes/:id/offer', async (req, res) => {
  const q = await loadQuote(idParam(req.params.id), currentUser(req));
  const b = parse(z.object({ priceOffered: z.number().int().min(1).max(1_000_000), deadline: dateString, note: z.string().trim().max(500).optional() }), req.body);
  if (!['requested', 'offered'].includes(q.status)) throw new AppError(409, 'This request can no longer be changed');
  q.set({ ...b, status: 'offered', offerExpiresAt: new Date(Date.now() + 7 * 86400e3) });
  await q.save();
  await sendSms(q.contactPhone, `You have an offer for ${q.serviceName}: KES ${b.priceOffered}, ready by ${b.deadline}. Open Services Mall to accept within 7 days.`);
  res.json(q);
});

ownerRouter.post('/quotes/:id/decline', async (req, res) => {
  const q = await loadQuote(idParam(req.params.id), currentUser(req));
  if (!['requested', 'offered'].includes(q.status)) throw new AppError(409, 'This request can no longer be changed');
  q.status = 'declined';
  await q.save();
  await sendSms(q.contactPhone, `Sorry, the shop cannot take your request for ${q.serviceName} right now.`);
  res.json({ ok: true });
});

// ---------- reviews ----------
ownerRouter.get('/reviews', async (req, res) => {
  const { businessId } = parse(z.object({ businessId: objectId }), req.query);
  const biz = await loadOwned(businessId, currentUser(req));
  const rows = await Review.find({ businessId: biz._id }).sort('-createdAt').limit(100).populate('customerId', 'name').lean();
  res.json(rows.map(({ customerId, ...rest }) => ({ ...rest, customerName: ((customerId as unknown as { name?: string } | null)?.name ?? 'Customer').split(' ')[0] })));
});

ownerRouter.post('/reviews/:id/reply', async (req, res) => {
  const { reply } = parse(z.object({ reply: z.string().trim().min(1).max(500) }), req.body);
  const r = await Review.findById(idParam(req.params.id));
  if (!r) throw notFound('Review not found');
  await loadOwned(String(r.businessId), currentUser(req));
  r.ownerReply = reply;
  r.ownerRepliedAt = new Date();
  await r.save();
  res.json({ ok: true });
});

// ---------- earnings ----------
ownerRouter.get('/earnings', async (req, res) => {
  const { businessId } = parse(z.object({ businessId: objectId }), req.query);
  const biz = await loadOwned(businessId, currentUser(req));
  res.json(await earningsFor(biz._id));
});
