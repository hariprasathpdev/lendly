import { z } from 'zod';

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine(isCalendarDate, 'Enter a valid calendar date.');

export const bookingCreateSchema = z.object({
  listingId: z.string().uuid(),
  startDate: dateString,
  endDate: dateString,
}).strict().refine((value) => value.endDate >= value.startDate, {
  path: ['endDate'],
  message: 'The end date must be on or after the start date.',
});

export const bookingActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'confirm', 'cancel', 'handover', 'return', 'complete', 'dispute']),
  reason: z.string().trim().min(2).max(120).optional(),
  details: z.string().trim().min(10).max(5000).optional(),
}).strict().refine((value) => value.action !== 'dispute' || (value.reason && value.details), {
  path: ['details'],
  message: 'Provide a short reason and at least ten characters of detail to open a dispute.',
});
