import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOverdueDays, cutoffDate } from '../src/utils/overdue.js';

test('overdue calculation waits until the configured grace period has passed', () => {
  assert.equal(calculateOverdueDays('2026-10-17', 1, '2026-10-18'), 0);
  assert.equal(calculateOverdueDays('2026-10-16', 1, '2026-10-18'), 1);
  assert.equal(calculateOverdueDays('2026-10-12', 2, '2026-10-18'), 4);
});

test('overdue calculation does not count future dates and validates grace days', () => {
  assert.equal(calculateOverdueDays('2026-10-20', 0, '2026-10-18'), 0);
  assert.equal(calculateOverdueDays('2026-10-10', -1, '2026-10-18'), 0);
  assert.equal(calculateOverdueDays('not-a-date', 0, '2026-10-18'), 0);
});

test('daily job cutoff uses the configured grace days', () => {
  assert.equal(cutoffDate('2026-10-18', 1), '2026-10-17');
  assert.equal(cutoffDate('2026-01-01', 2), '2025-12-30');
  assert.equal(cutoffDate('invalid', 1), null);
});
