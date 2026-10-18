import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createReportSchema } from '../validators/reports.js';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function validationError(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted fields.' } });
}

export const createReport = asyncHandler(async (req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.rpc('submit_report', {
    p_reporter_id: req.user.id,
    p_listing_id: parsed.data.listingId ?? null,
    p_booking_id: parsed.data.bookingId ?? null,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error) {
    const known = {
      INVALID_REPORT: [400, 'INVALID_REPORT', 'Check the report details and target.'],
      REPORTER_NOT_ELIGIBLE: [403, 'REPORTER_NOT_ELIGIBLE', 'Verify your account and accept the campus policies before reporting.'],
      REPORT_TARGET_NOT_FOUND: [404, 'REPORT_TARGET_NOT_FOUND', 'That campus item or booking could not be found.'],
      CANNOT_REPORT_OWN_LISTING: [403, 'CANNOT_REPORT_OWN_LISTING', 'You cannot report your own listing.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    return next(fail(503, 'REPORT_SERVICE_UNAVAILABLE', 'The report could not be submitted.'));
  }
  res.status(201).json({ data: { id: data, status: 'open' } });
});
