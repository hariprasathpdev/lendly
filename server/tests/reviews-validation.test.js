import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewSchema, reviewListSchema } from '../src/validators/reviews.js';

test('review validation accepts a completed booking rating and optional comment', () => {
  assert.equal(createReviewSchema.safeParse({ bookingId: '11111111-1111-4111-8111-111111111111', rating: '5', body: 'Returned on time.' }).success, true);
  assert.equal(createReviewSchema.safeParse({ bookingId: '11111111-1111-4111-8111-111111111111', rating: 1 }).success, true);
});

test('review validation bounds ratings and comment length', () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  assert.equal(createReviewSchema.safeParse({ bookingId, rating: 0 }).success, false);
  assert.equal(createReviewSchema.safeParse({ bookingId, rating: 6 }).success, false);
  assert.equal(createReviewSchema.safeParse({ bookingId, rating: 4, body: 'x'.repeat(2001) }).success, false);
});

test('review history pagination has safe bounded defaults', () => {
  assert.deepEqual(reviewListSchema.parse({}), { page: 1, pageSize: 10 });
  assert.equal(reviewListSchema.safeParse({ page: 1, pageSize: 1000 }).success, false);
});
