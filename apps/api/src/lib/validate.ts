import { z } from 'zod';
import { AppError } from './errors';
import { normalizePhone } from './phone';

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
    throw new AppError(400, msg, 'validation');
  }
  return r.data;
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const phoneSchema = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid Kenyan phone number, for example 0712345678' });
    return z.NEVER;
  }
  return p;
});

export const idParam = (v: unknown): string => parse(objectId, v);
