import { Router } from 'express';
import { createHash } from 'crypto';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { currentUser, requireAuth } from '../middleware/auth';

export const uploadsRouter = Router();

/**
 * Signed direct upload to Cloudinary: the browser sends the image straight to Cloudinary, so
 * files never pass through this server. Set the three CLOUDINARY_* variables to turn it on.
 */
uploadsRouter.post('/sign', requireAuth, (req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = env;
  if (!cloudName || !apiKey || !secret) throw new AppError(501, 'Image uploads are not set up yet');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `services-mall/${currentUser(req).id}`;
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
  res.json({ cloudName, apiKey, timestamp, folder, signature });
});
