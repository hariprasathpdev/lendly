import test from 'node:test';
import assert from 'node:assert/strict';
import { disputeQuerySchema, disputeResolutionSchema, moderationActionSchema, moderationQuerySchema } from '../src/validators/admin.js';

test('moderation queue accepts only supported review states', () => {
  assert.equal(moderationQuerySchema.parse({}).status, 'pending_review');
  assert.equal(moderationQuerySchema.safeParse({ status: 'approved' }).success, false);
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
