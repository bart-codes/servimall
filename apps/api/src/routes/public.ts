import { Router } from 'express';
import { z } from 'zod';
import { addDays, eatDateString } from '../lib/time';
import { notFound } from '../lib/errors';
import { dateString, objectId, parse, idParam } from '../lib/validate';
import { whatsappLink } from '../services/notify';
import { listSlots } from '../services/bookings';
import { Availability, Business, CATEGORIES, DeliveryZone, Region, Review, Service } from '../models';

export const publicRouter = Router();
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

publicRouter.get('/regions', async (_req, res) => {
  res.json(await Region.find({ active: true }).sort('name').lean());
});

publicRouter.get('/businesses', async (req, res) => {
  const q = parse(
    z.object({ region: objectId.optional(), category: z.enum(CATEGORIES).optional(), q: z.string().max(60).optional() }),
    req.query,
  );
  const filter: Record<string, unknown> = { status: 'active' };
  if (q.region) filter.regionId = q.region;
  if (q.category) filter.category = q.category;
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: 'i' };
  const items = await Business.find(filter).select('-ownerId').sort({ ratingAverage: -1, name: 1 }).limit(100).lean();
  const stats = await Service.aggregate<{ _id: unknown; serviceCount: number; fromPrice: number }>([
    { $match: { businessId: { $in: items.map((i) => i._id) }, active: true } },
    { $group: { _id: '$businessId', serviceCount: { $sum: 1 }, fromPrice: { $min: '$price' } } },
  ]);
  const byId = new Map(stats.map((s) => [String(s._id), s]));
  res.json(
    items.map((i) => ({
      ...i,
      serviceCount: byId.get(String(i._id))?.serviceCount ?? 0,
      fromPrice: byId.get(String(i._id))?.fromPrice ?? null,
    })),
  );
});

publicRouter.get('/businesses/:slug', async (req, res) => {
  const slug = parse(z.string().min(1).max(120), req.params.slug);
  const biz = await Business.findOne({ slug, status: 'active' }).select('-ownerId').lean();
  if (!biz) throw notFound('Shop not found');
  const [services, avail, reviews] = await Promise.all([
    Service.find({ businessId: biz._id, active: true }).sort({ kind: 1, name: 1 }).lean(),
    Availability.findOne({ businessId: biz._id }).select('weeklyHours').lean(),
    Review.find({ businessId: biz._id, status: 'visible' }).sort('-createdAt').limit(10).populate('customerId', 'name').lean(),
  ]);
  res.json({
    business: biz,
    whatsappUrl: biz.whatsapp ? whatsappLink(biz.whatsapp, `Hi ${biz.name}, I have a question.`) : null,
    services,
    weeklyHours: avail?.weeklyHours ?? [],
    reviews: reviews.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      comment: r.comment,
      ownerReply: r.ownerReply,
      createdAt: r.createdAt,
      name: ((r.customerId as unknown as { name?: string } | null)?.name ?? 'Customer').split(' ')[0],
    })),
  });
});

publicRouter.get('/services/:id/slots', async (req, res) => {
  const id = idParam(req.params.id);
  const { date } = parse(z.object({ date: dateString }), req.query);
  const today = eatDateString(new Date());
  if (date < today || date > addDays(today, 90)) return res.json({ date, slots: [] });
  res.json({ date, slots: await listSlots(id, date) });
});

publicRouter.get('/delivery-zones', async (req, res) => {
  const { region } = parse(z.object({ region: objectId }), req.query);
  res.json(await DeliveryZone.find({ regionId: region, active: true }).sort('name').lean());
});
