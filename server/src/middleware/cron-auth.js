import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export function requireCronSecret(req, _res, next) {
  if (!env.cronSecret) return next(Object.assign(new Error('The overdue job is not configured.'), { status: 503, code: 'OVERDUE_JOB_DISABLED' }));
  const provided = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const expectedBytes = Buffer.from(env.cronSecret);
  const providedBytes = Buffer.from(provided);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return next(Object.assign(new Error('The scheduled job credential is invalid.'), { status: 401, code: 'CRON_AUTH_REQUIRED' }));
  }
  next();
}
