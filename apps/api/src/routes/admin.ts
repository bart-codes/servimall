import { Router } from 'express';
import { z } from 'zod';
import { conflict, notFound } from '../lib/errors';
import { eatDateString } from '../lib/time';
import { dateString, idParam, objectId, parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { Booking, Business, DeliveryZone, Dispute, Payout, Region, Review, User } from '../models';
import { recomputeRating, setDeliveryStatus } from '../services/bookings';
import { generatePayouts, markPayoutPaid } from '../services/payouts';
import { sendSms } from '../services/notify';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- shops ----------
adminRouter.get('/businesses', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'active', 'suspended']).optional() }), req.query);
  res.json(await Business.find(status ? { status } : {}).sort('-createdAt').populate('ownerId', 'name phone').lean());
});

adminRouter.post('/businesses/:id/status', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'active', 'suspended']) }), req.body);
  const biz = await Business.findByIdAndUpdate(idParam(req.params.id), { $set: { status } }, { new: true });
  if (!biz) throw notFound('Shop not found');
  res.json(biz);
});

// ---------- regions and delivery zones ----------
adminRouter.get('/regions', async (_req, res) => res.json(await Region.find().sort('name').lean()));

adminRouter.post('/regions', async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(60), towns: z.array(z.string().trim().min(1)).default([]) }), req.body);
  res.status(201).json(await Region.create({ ...b, slug: slugify(b.name) }));
});

const zoneBody = z.object({
  regionId: objectId,
  name: z.string().trim().min(2).max(60),
  towns: z.array(z.string().trim().min(1)).default([]),
  fee: z.number().int().min(0).max(10000),
  freeDeliveryOver: z.number().int().min(0).optional(),
  active: z.boolean().default(true),
});

adminRouter.get('/zones', async (_req, res) => res.json(await DeliveryZone.find().sort('name').lean()));
adminRouter.post('/zones', async (req, res) => res.status(201).json(await DeliveryZone.create(parse(zoneBody, req.body))));
adminRouter.put('/zones/:id', async (req, res) => {
  const z1 = await DeliveryZone.findByIdAndUpdate(idParam(req.params.id), { $set: parse(zoneBody, req.body) }, { new: true });
  if (!z1) throw notFound('Zone not found');
  res.json(z1);
});

// ---------- deliveries (handled by the platform owner) ----------
adminRouter.get('/deliveries', async (req, res) => {
  const { date } = parse(z.object({ date: dateString.default(eatDateString(new Date())) }), req.query);
  const rows = await Booking.find({ kind: 'goods', 'delivery.windowDate': date, status: { $in: ['confirmed', 'completed'] } })
    .select('-slotKeys')
    .populate('customerId', 'name phone')
    .populate('businessId', 'name')
    .populate('delivery.zoneId', 'name')
    .sort({ 'delivery.windowKey': 1, createdAt: 1 })
    .lean();
  res.json(rows.map(({ customerId, businessId, ...rest }) => ({ ...rest, customer: customerId, business: businessId })));
});

adminRouter.post('/bookings/:id/delivery', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['packed', 'out_for_delivery', 'delivered', 'failed']) }), req.body);
  await setDeliveryStatus(idParam(req.params.id), currentUser(req), status);
  res.json({ ok: true });
});

// ---------- refunds (recorded here, paid out manually in the MVP) ----------
adminRouter.get('/refunds', async (_req, res) => {
  const rows = await Booking.find({ refundDue: { $gt: 0 }, refundedAt: { $exists: false } })
    .select('-slotKeys')
    .populate('customerId', 'name phone')
    .sort('createdAt')
    .lean();
  res.json(rows.map(({ customerId, ...rest }) => ({ ...rest, customer: customerId })));
});

adminRouter.post('/bookings/:id/refunded', async (req, res) => {
  const r = await Booking.updateOne({ _id: idParam(req.params.id), refundDue: { $gt: 0 }, refundedAt: { $exists: false } }, { $set: { refundedAt: new Date() } });
  if (r.modifiedCount !== 1) throw conflict('No pending refund on this booking');
  res.json({ ok: true });
});

// ---------- payouts to shops ----------
adminRouter.get('/payouts', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'paid']).optional() }), req.query);
  const rows = await Payout.find(status ? { status } : {}).sort('-createdAt').limit(200).populate('businessId', 'name phone commissionRate').lean();
  res.json(rows.map(({ businessId, ...rest }) => ({ ...rest, business: businessId })));
});

adminRouter.post('/payouts/generate', async (_req, res) => {
  res.json({ created: await generatePayouts() });
});

adminRouter.post('/payouts/:id/paid', async (req, res) => {
  const { mpesaReference } = parse(z.object({ mpesaReference: z.string().trim().min(6).max(30) }), req.body);
  await markPayoutPaid(idParam(req.params.id), mpesaReference);
  res.json({ ok: true });
});

// ---------- disputes ----------
adminRouter.get('/disputes', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['open', 'resolved']).default('open') }), req.query);
  const rows = await Dispute.find({ status }).sort('createdAt').limit(100)
    .populate('customerId', 'name phone').populate('businessId', 'name')
    .populate('bookingId', 'reference serviceName total amountPaid refundDue refundedAt status').lean();
  res.json(rows.map(({ customerId, businessId, bookingId, ...rest }) => ({ ...rest, customer: customerId, business: businessId, booking: bookingId })));
});

adminRouter.post('/disputes/:id/resolve', async (req, res) => {
  const user = currentUser(req);
  const b = parse(z.object({ resolution: z.string().trim().min(3).max(1000), refundAmount: z.number().int().min(0).default(0) }), req.body);
  const d = await Dispute.findOne({ _id: idParam(req.params.id), status: 'open' });
  if (!d) throw notFound('Open dispute not found');
  const booking = await Booking.findById(d.bookingId);
  if (!booking) throw notFound('Booking not found');
  if (b.refundAmount > 0) {
    if (booking.refundedAt) throw conflict('A refund was already sent for this booking');
    if (b.refundAmount > booking.amountPaid - booking.refundDue) throw conflict('The refund is more than the customer paid');
    booking.refundDue += b.refundAmount;
  }
  booking.disputed = false;
  await booking.save();
  d.set({ status: 'resolved', resolution: b.resolution, refundAmount: b.refundAmount, resolvedBy: user.id, resolvedAt: new Date() });
  await d.save();
  const cust = await User.findById(d.customerId).select('phone');
  if (cust) await sendSms(cust.phone, `Your report on booking ${booking.reference} was reviewed: ${b.resolution}${b.refundAmount ? ` A refund of KES ${b.refundAmount} will be sent to you.` : ''}`);
  res.json({ ok: true });
});

// ---------- review moderation ----------
adminRouter.get('/reviews', async (_req, res) => {
  const rows = await Review.find().sort('-createdAt').limit(100).populate('businessId', 'name').populate('customerId', 'name').lean();
  res.json(rows.map(({ businessId, customerId, ...rest }) => ({ ...rest, business: businessId, customer: customerId })));
});

adminRouter.post('/reviews/:id/visibility', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['visible', 'hidden']) }), req.body);
  const r = await Review.findByIdAndUpdate(idParam(req.params.id), { $set: { status } }, { new: true });
  if (!r) throw notFound('Review not found');
  await recomputeRating(r.businessId);
  res.json({ ok: true });
});
