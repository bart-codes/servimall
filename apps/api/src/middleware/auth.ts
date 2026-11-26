import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { User } from '../models';

export type Role = 'customer' | 'owner' | 'admin';
export interface AuthUser { id: string; role: Role }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const signToken = (u: { id: string; role: string }) =>
  jwt.sign({ sub: u.id }, env.JWT_SECRET, { expiresIn: '7d' });

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let sub: string;
  try {
    sub = (jwt.verify(header.slice(7), env.JWT_SECRET) as { sub: string }).sub;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  // Role and status are read fresh so suspensions and role changes apply immediately.
  const user = await User.findById(sub).select('role status');
  if (!user || user.status !== 'active') throw unauthorized('This account is not active');
  req.user = { id: user.id, role: user.role as Role };
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
