import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { notFound } from '../lib/errors';
import { parseCallback } from '../services/mpesa';
import { settlePayment } from '../services/bookings';

export const paymentsRouter = Router();

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Daraja posts here after the customer answers the STK prompt. There is no signature, so the
// secret in the URL is the check; keep MPESA_CALLBACK_SECRET long and private.
paymentsRouter.post('/mpesa/callback/:secret', (req, res) => {
  if (!safeEqual(req.params.secret, env.MPESA_CALLBACK_SECRET)) throw notFound();
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // answer Safaricom first, then process
  const cb = parseCallback(req.body);
  if (!cb) return;
  settlePayment(cb.checkoutRequestId, cb.success, cb.receipt, req.body).catch((e) =>
    console.error(JSON.stringify({ level: 'error', msg: 'settlePayment failed', error: (e as Error).message })),
  );
});
