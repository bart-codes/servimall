import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { TERMS_VERSION } from '../lib/constants';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../lib/errors';
import { parse, phoneSchema } from '../lib/validate';
import { currentUser, requireAuth, signToken } from '../middleware/auth';
import { OtpCode, User } from '../models';
import { sendSms } from '../services/notify';

export const authRouter = Router();

const publicUser = (u: { id: string; name: string; phone: string; email?: string | null; role: string }) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email ?? undefined,
  role: u.role,
});

authRouter.post('/register', async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(80),
      phone: phoneSchema,
      email: z.string().trim().email().optional(),
      password: z.string().min(8, 'Use at least 8 characters').max(100),
      acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms to continue' }) }),
    }),
    req.body,
  );
  if (await User.exists({ phone: b.phone })) throw conflict('An account with this phone number already exists');
  if (b.email && (await User.exists({ email: b.email.toLowerCase() }))) throw conflict('An account with this email already exists');
  const user = await User.create({
    name: b.name,
    phone: b.phone,
    email: b.email,
    passwordHash: await bcrypt.hash(b.password, 12),
    acceptedTermsVersion: TERMS_VERSION,
    acceptedTermsAt: new Date(),
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const b = parse(z.object({ phone: phoneSchema, password: z.string().min(1).max(100) }), req.body);
  const user = await User.findOne({ phone: b.phone }).select('+passwordHash');
  const ok = user ? await bcrypt.compare(b.password, user.passwordHash) : false;
  if (!user || !ok) throw unauthorized('Phone number or password is incorrect');
  if (user.status !== 'active') throw new AppError(403, 'This account is suspended');
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(currentUser(req).id);
  if (!user) throw unauthorized();
  res.json({ user: publicUser(user) });
});

// ---------- password reset with an SMS code ----------
const hashCode = (phone: string, code: string) =>
  createHash('sha256').update(`${env.JWT_SECRET}:${phone}:${code}`).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Always answers "ok" so the endpoint cannot be used to find out which numbers have accounts.
authRouter.post('/forgot', async (req, res) => {
  const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
  const user = await User.findOne({ phone });
  if (user && user.status === 'active') {
    const recent = await OtpCode.countDocuments({ phone, createdAt: { $gt: new Date(Date.now() - 3600e3) } });
    if (recent < 3) {
      const code = String(randomInt(100000, 1000000));
      await OtpCode.create({ phone, codeHash: hashCode(phone, code), purpose: 'reset', expiresAt: new Date(Date.now() + 10 * 60e3) });
      await sendSms(phone, `Your Services Mall code is ${code}. It expires in 10 minutes. Do not share it.`);
    }
  }
  res.json({ ok: true });
});

authRouter.post('/reset', async (req, res) => {
  const b = parse(
    z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), password: z.string().min(8, 'Use at least 8 characters').max(100) }),
    req.body,
  );
  const invalid = () => badRequest('That code is not valid. Request a new one.');
  const otp = await OtpCode.findOne({ phone: b.phone, purpose: 'reset', usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort('-createdAt');
  if (!otp || otp.attempts >= 5) throw invalid();
  if (!sameHash(otp.codeHash, hashCode(b.phone, b.code))) {
    await OtpCode.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw invalid();
  }
  const claimed = await OtpCode.updateOne({ _id: otp._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date() } });
  if (claimed.modifiedCount !== 1) throw invalid();
  const user = await User.findOneAndUpdate({ phone: b.phone }, { $set: { passwordHash: await bcrypt.hash(b.password, 12) } }, { new: true });
  if (!user) throw notFound('Account not found');
  res.json({ token: signToken(user), user: publicUser(user) });
});
