import { z } from 'zod';

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
}).strict();

export const reviewListSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
}).strict();
