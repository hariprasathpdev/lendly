import { z } from 'zod';

export const moderationQuerySchema = z.object({
  status: z.enum(['pending_review', 'rejected', 'approved']).default('pending_review'),
}).strict();

export const moderationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(2).max(1000).optional(),
}).strict().refine((value) => value.action !== 'reject' || value.reason, {
  path: ['reason'],
  message: 'Add a reason so the listing owner can make the requested changes.',
});

export const listingRemovalSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
}).strict();

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

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const adminBookingQuerySchema = z.object({
  status: z.enum(['all', 'pending', 'accepted', 'declined', 'cancelled', 'awaiting_payment', 'confirmed', 'active', 'return_requested', 'completed', 'disputed']).default('all'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const securityEventQuerySchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved', 'dismissed']).default('open'),
}).strict();

export const securityEventReviewSchema = z.object({
  action: z.enum(['review', 'resolve', 'dismiss']),
  resolution: z.string().trim().min(2).max(2000).optional(),
}).strict().refine((value) => value.action === 'review' || Boolean(value.resolution), {
  path: ['resolution'],
  message: 'Add a short resolution note before closing this security event.',
});
