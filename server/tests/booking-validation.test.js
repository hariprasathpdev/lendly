import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingActionSchema, bookingCreateSchema } from '../src/validators/bookings.js';
import { messageCreateSchema } from '../src/validators/conversations.js';

test('booking request validation accepts a valid date range', () => {
  const parsed = bookingCreateSchema.safeParse({
    listingId: 'f28fdc70-c6bc-4f47-9752-a8c818fd9168',
    startDate: '2028-02-29',
    endDate: '2028-03-01',
  });
  assert.equal(parsed.success, true);
});

test('booking request validation rejects impossible or inverted calendar dates', () => {
  for (const dates of [
    { startDate: '2027-02-29', endDate: '2027-03-01' },
    { startDate: '2028-03-02', endDate: '2028-03-01' },
  ]) {
    const parsed = bookingCreateSchema.safeParse({
      listingId: 'f28fdc70-c6bc-4f47-9752-a8c818fd9168',
      ...dates,
    });
    assert.equal(parsed.success, false);
  }
});

test('opening a dispute requires a reason and useful details', () => {
  assert.equal(bookingActionSchema.safeParse({ action: 'dispute' }).success, false);
  assert.equal(bookingActionSchema.safeParse({ action: 'dispute', reason: 'Return', details: 'Item was damaged.' }).success, true);
});

test('message validation rejects empty content and trims accepted messages', () => {
  assert.equal(messageCreateSchema.safeParse({ body: '   ' }).success, false);
  assert.deepEqual(messageCreateSchema.parse({ body: '  Please meet at the library.  ' }), { body: 'Please meet at the library.' });
});
