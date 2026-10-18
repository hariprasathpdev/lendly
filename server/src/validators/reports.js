import { z } from 'zod';

export const createReportSchema = z.object({
  listingId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  reason: z.string().trim().min(2).max(120),
  details: z.string().trim().min(10).max(4000),
}).strict().refine((value) => Boolean(value.listingId) !== Boolean(value.bookingId), {
  path: ['listingId'],
  message: 'Choose one listing or booking to report.',
});

export const reportQuerySchema = z.object({
  status: z.enum(['open', 'under_review']).default('open'),
}).strict();

export const reportReviewSchema = z.object({
  action: z.enum(['review', 'resolve', 'dismiss']),
  resolution: z.string().trim().min(2).max(2000).optional(),
}).strict().refine((value) => value.action === 'review' || Boolean(value.resolution), {
  path: ['resolution'],
  message: 'Add a short resolution note before closing this report.',
});
