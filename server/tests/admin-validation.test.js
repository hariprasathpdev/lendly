import test from 'node:test';
import assert from 'node:assert/strict';
import { disputeQuerySchema, disputeResolutionSchema, listingRemovalSchema, moderationActionSchema, moderationQuerySchema, securityEventQuerySchema, securityEventReviewSchema } from '../src/validators/admin.js';

test('moderation queue accepts only supported review states', () => {
  assert.equal(moderationQuerySchema.parse({}).status, 'pending_review');
  assert.equal(moderationQuerySchema.safeParse({ status: 'approved' }).success, true);
  assert.equal(moderationQuerySchema.safeParse({ status: 'archived' }).success, false);
});

test('rejecting a listing requires owner-facing feedback', () => {
  assert.equal(moderationActionSchema.safeParse({ action: 'reject' }).success, false);
  assert.equal(moderationActionSchema.safeParse({ action: 'reject', reason: 'Add clear photos.' }).success, true);
  assert.equal(moderationActionSchema.safeParse({ action: 'approve' }).success, true);
});

test('admin dispute decisions require an explicit outcome and resolution note', () => {
  assert.equal(disputeQuerySchema.parse({}).status, 'open');
  assert.equal(disputeResolutionSchema.safeParse({ action: 'dismiss', resolution: '' }).success, false);
  assert.equal(disputeResolutionSchema.safeParse({ action: 'complete', resolution: 'The item was returned.' }).success, true);
});

test('security event queues accept only supported statuses and require notes to close events', () => {
  assert.equal(securityEventQuerySchema.parse({}).status, 'open');
  assert.equal(securityEventQuerySchema.safeParse({ status: 'ignored' }).success, false);
  assert.equal(securityEventReviewSchema.safeParse({ action: 'review' }).success, true);
  assert.equal(securityEventReviewSchema.safeParse({ action: 'resolve' }).success, false);
  assert.equal(securityEventReviewSchema.safeParse({ action: 'dismiss', resolution: 'Expected test retry.' }).success, true);
});

test('approved listings can only be removed with a reason', () => {
  assert.equal(moderationQuerySchema.safeParse({ status: 'approved' }).success, true);
  assert.equal(listingRemovalSchema.safeParse({}).success, false);
  assert.equal(listingRemovalSchema.safeParse({ reason: 'Unsafe electrical equipment.' }).success, true);
});
