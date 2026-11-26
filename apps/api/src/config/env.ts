import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
    PUBLIC_API_URL: z.string().default('http://localhost:4000'),
    HOLD_MINUTES: z.coerce.number().int().min(2).default(10),
    MPESA_ENV: z.enum(['mock', 'sandbox', 'production']).default('mock'),
    MPESA_CONSUMER_KEY: z.string().optional(),
    MPESA_CONSUMER_SECRET: z.string().optional(),
    MPESA_SHORTCODE: z.string().optional(),
    MPESA_PASSKEY: z.string().optional(),
    MPESA_TXN_TYPE: z
      .enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'])
      .default('CustomerPayBillOnline'),
    MPESA_CALLBACK_SECRET: z.string().min(16).default('change-me-change-me'),
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_SENDER_ID: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    PAYOUT_HOLD_DAYS: z.coerce.number().int().min(0).default(2),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production') {
      if (v.MPESA_ENV === 'mock') {
        ctx.addIssue({ code: 'custom', message: 'MPESA_ENV=mock is not allowed in production' });
      }
      if (v.MPESA_CALLBACK_SECRET === 'change-me-change-me') {
        ctx.addIssue({ code: 'custom', message: 'Set MPESA_CALLBACK_SECRET in production' });
      }
      if (!v.AT_USERNAME || !v.AT_API_KEY) {
        ctx.addIssue({ code: 'custom', message: 'Set AT_USERNAME and AT_API_KEY in production (SMS is needed for codes and reminders)' });
      }
    }
    if (v.MPESA_ENV !== 'mock') {
      for (const k of ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY'] as const) {
        if (!v[k]) ctx.addIssue({ code: 'custom', message: `${k} is required when MPESA_ENV is ${v.MPESA_ENV}` });
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.') || 'env'}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
