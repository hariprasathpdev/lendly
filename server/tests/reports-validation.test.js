import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportSchema, reportReviewSchema } from '../src/validators/reports.js';

const listingId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';

test('report validation accepts one listing target with a useful description', () => {
  const result = createReportSchema.safeParse({ listingId, reason: 'Unsafe item', details: 'The listing description promises a damaged electrical device.' });
  assert.equal(result.success, true);
});

test('report validation requires exactly one target', () => {
  const base = { reason: 'Wrong category', details: 'This listing appears in the wrong campus category.' };
  assert.equal(createReportSchema.safeParse({ ...base, listingId, bookingId }).success, false);
  assert.equal(createReportSchema.safeParse(base).success, false);
  assert.equal(createReportSchema.safeParse({ ...base, bookingId }).success, true);
});

test('report closure requires a resolution note', () => {
  assert.equal(reportReviewSchema.safeParse({ action: 'review' }).success, true);
  assert.equal(reportReviewSchema.safeParse({ action: 'resolve' }).success, false);
  assert.equal(reportReviewSchema.safeParse({ action: 'dismiss', resolution: 'Duplicate report.' }).success, true);
});
