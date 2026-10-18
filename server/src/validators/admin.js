import { z } from 'zod';

export const moderationQuerySchema = z.object({
  status: z.enum(['pending_review', 'rejected']).default('pending_review'),
}).strict();

export const moderationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(2).max(1000).optional(),
}).strict().refine((value) => value.action !== 'reject' || value.reason, {
  path: ['reason'],
  message: 'Add a reason so the listing owner can make the requested changes.',
});

export const disputeQuerySchema = z.object({
  status: z.enum(['open', 'under_review']).default('open'),
}).strict();

export const disputeResolutionSchema = z.object({
  action: z.enum(['cancel', 'complete', 'dismiss']),
  resolution: z.string().trim().min(2).max(2000),
}).strict();

export const lateFeeReviewSchema = z.object({
  action: z.enum(['confirm', 'waive']),
  resolution: z.string().trim().min(2).max(2000),
}).strict();
