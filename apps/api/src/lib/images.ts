import { z } from 'zod';
import { env } from '../config/env';

/** With Cloudinary configured only that account's images are accepted; otherwise any https image URL. */
export function isAllowedImageUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    if (env.CLOUDINARY_CLOUD_NAME) return url.hostname === 'res.cloudinary.com' && url.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/`);
    return true;
  } catch {
    return false;
  }
}
export const imageUrl = z.string().max(500).refine(isAllowedImageUrl, 'Use an image uploaded through the app');
