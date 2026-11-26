import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../lib/errors';
import { dateString, idParam, objectId, parse, phoneSchema } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { Business, Quote, Service, User } from '../models';
import { acceptQuote } from '../services/bookings';
import { sendSms } from '../services/notify';

export const quotesRouter = Router();
quotesRouter.use(requireAuth);

quotesRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const b = parse(
    z.object({
      serviceId: objectId,
      brief: z.string().trim().min(10, 'Describe what you need (at least 10 characters)').max(2000),
      preferredDate: dateString.optional(),
      phone: phoneSchema,
    }),
    req.body,
  );
  const svc = await Service.findOne({ _id: b.serviceId, active: true });
  if (!svc || svc.priceType !== 'quote' || svc.kind !== 'service') throw badRequest('This item does not take quote requests');
  const biz = await Business.findOne({ _id: svc.businessId, status: 'active' });
  if (!biz) throw notFound('Shop not found');
  const open = await Quote.countDocuments({ customerId: user.id, serviceId: svc._id, status: { $in: ['requested', 'offered'] } });
  if (open >= 2) throw conflict('You already have open requests for this service. Wait for the shop to reply.');
  const q = await Quote.create({
    customerId: user.id, businessId: biz._id, serviceId: svc._id, regionId: svc.regionId, serviceName: svc.name,
    brief: b.brief, preferredDate: b.preferredDate, contactPhone: b.phone,
  });
  const owner = await User.findById(biz.ownerId).select('phone');
  if (owner) await sendSms(owner.phone, `New quote request for ${svc.name}. Open Services Mall > My shops > Quotes to reply.`);
  res.status(201).json(q);
});

quotesRouter.get('/mine', async (req, res) => {
  const rows = await Quote.find({ customerId: currentUser(req).id }).sort('-createdAt').limit(50).populate('businessId', 'name slug whatsapp').lean();
  res.json(rows.map(({ businessId, ...rest }) => ({ ...rest, business: businessId })));
});

quotesRouter.post('/:id/accept', async (req, res) => {
  const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
  const { booking, paymentError } = await acceptQuote(idParam(req.params.id), currentUser(req).id, phone);
  const { slotKeys: _hidden, ...plain } = booking.toObject() as Record<string, unknown>;
  res.status(201).json({ booking: plain, paymentError });
});

quotesRouter.post('/:id/decline', async (req, res) => {
  const r = await Quote.updateOne({ _id: idParam(req.params.id), customerId: currentUser(req).id, status: 'offered' }, { $set: { status: 'declined' } });
  if (r.modifiedCount !== 1) throw conflict('This offer can no longer be declined');
  res.json({ ok: true });
});
