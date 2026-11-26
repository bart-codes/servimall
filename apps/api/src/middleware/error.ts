import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  const e = err as { name?: string; code?: number; message?: string };
  if (e?.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (e?.code === 11000) return res.status(409).json({ error: 'That already exists' });
  if (e?.name === 'ValidationError') return res.status(400).json({ error: e.message });
  console.error(JSON.stringify({ level: 'error', path: req.originalUrl, message: e?.message, stack: (err as Error)?.stack }));
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
