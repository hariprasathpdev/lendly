import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import health from './routes/health.js';
import me from './routes/me.js';
import auth from './routes/auth.js';
import items from './routes/items.js';
import bookings from './routes/bookings.js';
import payments from './routes/payments.js';
import notifications from './routes/notifications.js';
import conversations from './routes/conversations.js';
import categories from './routes/categories.js';
import admin from './routes/admin.js';
import reports from './routes/reports.js';
import internal from './routes/internal.js';
import { notFound, errorHandler } from './middleware/errors.js';

export const app = express();
app.disable('x-powered-by');
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.clientOrigins, credentials: true }));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
}));
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => console.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`));
  next();
});

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/v1/health', health);
app.use('/api/v1/auth', auth);
app.use('/api/v1/categories', categories);
app.use('/api/v1/items', items);
app.use('/api/v1/bookings', bookings);
app.use('/api/v1/payments', payments);
app.use('/api/v1/notifications', notifications);
app.use('/api/v1/conversations', conversations);
app.use('/api/v1/me', me);
app.use('/api/v1/admin', admin);
app.use('/api/v1/reports', reports);
app.use('/api/v1/internal', internal);
app.use(notFound);
app.use(errorHandler);

