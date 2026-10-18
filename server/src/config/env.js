import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  CLIENT_APP_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_EMAIL_DOMAINS: z.string().default('kongu.edu'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_MODE: z.enum(['disabled', 'demo', 'razorpay_test']).default('demo'),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional()),
  OVERDUE_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(1),
}).superRefine((value, context) => {
  if (value.PAYMENT_MODE === 'razorpay_test') {
    for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required in razorpay_test mode.` });
    }
    if (value.RAZORPAY_KEY_ID && !value.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
      context.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Only a Razorpay test key is allowed in razorpay_test mode.' });
    }
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.message}`);

export const env = {
  ...parsed.data,
  clientOrigins: parsed.data.CLIENT_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  allowedEmailDomains: parsed.data.ALLOWED_EMAIL_DOMAINS.split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean),
  paymentMode: parsed.data.PAYMENT_MODE,
  razorpayKeyId: parsed.data.RAZORPAY_KEY_ID,
  razorpayKeySecret: parsed.data.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: parsed.data.RAZORPAY_WEBHOOK_SECRET,
  cronSecret: parsed.data.CRON_SECRET,
  overdueGraceDays: parsed.data.OVERDUE_GRACE_DAYS,
};
