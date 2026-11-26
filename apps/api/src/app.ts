import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { bookingsRouter } from './routes/bookings';
import { ownerRouter } from './routes/owner';
import { paymentsRouter } from './routes/payments';
import { publicRouter } from './routes/public';
import { quotesRouter } from './routes/quotes';
import { uploadsRouter } from './routes/uploads';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return;
    console.log(JSON.stringify({ level: 'info', method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

const limiter = (limit: number, windowMs: number) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(limiter(600, 15 * 60e3));
app.use('/api/auth', limiter(30, 15 * 60e3), authRouter);
app.use('/api/bookings', limiter(60, 60e3), bookingsRouter);
app.use('/api/quotes', limiter(60, 60e3), quotesRouter);
app.use('/api/uploads', limiter(30, 60e3), uploadsRouter);
app.use('/api/owner', ownerRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', publicRouter);

app.use(notFoundHandler);
app.use(errorHandler);
