import { adminClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/async-handler.js';
import { calculateOverdueDays, cutoffDate } from '../utils/overdue.js';
import { lateFeeReviewSchema } from '../validators/admin.js';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function validationError(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted fields.' } });
}

export const runOverdueCheck = asyncHandler(async (_req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const { data, error } = await adminClient.rpc('run_overdue_check', { p_grace_days: env.overdueGraceDays });
  if (error) return next(fail(503, 'OVERDUE_JOB_FAILED', 'The overdue reminder check could not be completed.'));
  res.json({ data });
});

export const getOverdueDashboard = asyncHandler(async (req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = cutoffDate(today, env.overdueGraceDays);
  const [bookingsResult, feesResult] = await Promise.all([
    adminClient.from('bookings')
      .select('id,end_date,status,total_price,late_fee_per_day,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey!inner(id,full_name,college_id),lender:profiles!bookings_lender_id_fkey(id,full_name)')
      .eq('status', 'active').eq('borrower.college_id', req.profile.college_id).lt('end_date', cutoff).order('end_date', { ascending: true }).limit(100),
    adminClient.from('late_fees')
      .select('id,booking_id,amount,days_overdue,grace_days,status,reason,resolution,created_at,booking:bookings!late_fees_booking_id_fkey!inner(id,status,end_date,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey!inner(id,full_name,college_id),lender:profiles!bookings_lender_id_fkey(id,full_name))')
      .in('status', ['calculated', 'disputed']).eq('booking.borrower.college_id', req.profile.college_id).order('created_at', { ascending: true }).limit(100),
  ]);
  if (bookingsResult.error || feesResult.error) return next(fail(503, 'OVERDUE_SERVICE_UNAVAILABLE', 'Overdue bookings and fee reviews could not be loaded.'));
  const bookings = (bookingsResult.data ?? []).map((row) => {
    const daysOverdue = calculateOverdueDays(row.end_date, env.overdueGraceDays, today);
    return {
      id: row.id,
      endDate: row.end_date,
      daysOverdue,
      lateFeePerDay: Number(row.late_fee_per_day),
      estimatedLateFees: Number(row.late_fee_per_day) * daysOverdue,
      listing: row.listing ? { id: row.listing.id, title: row.listing.title } : null,
      borrower: row.borrower ? { id: row.borrower.id, fullName: row.borrower.full_name } : null,
      lender: row.lender ? { id: row.lender.id, fullName: row.lender.full_name } : null,
    };
  });
  const fees = (feesResult.data ?? []).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    amount: Number(row.amount),
    daysOverdue: row.days_overdue,
    graceDays: row.grace_days,
    status: row.status,
    reason: row.reason,
    resolution: row.resolution,
    createdAt: row.created_at,
    booking: row.booking ? {
      id: row.booking.id,
      status: row.booking.status,
      endDate: row.booking.end_date,
      listing: row.booking.listing ? { title: row.booking.listing.title } : null,
      borrower: row.booking.borrower ? { fullName: row.booking.borrower.full_name } : null,
      lender: row.booking.lender ? { fullName: row.booking.lender.full_name } : null,
    } : null,
  }));
  res.json({ data: { today, graceDays: env.overdueGraceDays, bookings, fees } });
});

export const reviewLateFee = asyncHandler(async (req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const parsed = lateFeeReviewSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.rpc('review_late_fee', {
    p_late_fee_id: req.params.id,
    p_admin_id: req.user.id,
    p_action: parsed.data.action,
    p_resolution: parsed.data.resolution,
  });
  if (error) {
    const known = {
      LATE_FEE_NOT_FOUND: [404, 'LATE_FEE_NOT_FOUND', 'The calculated fee was not found.'],
      LATE_FEE_NOT_REVIEWABLE: [409, 'LATE_FEE_NOT_REVIEWABLE', 'This fee is no longer awaiting review.'],
      INVALID_LATE_FEE_REVIEW: [400, 'INVALID_LATE_FEE_REVIEW', 'Choose a valid fee decision and include a resolution note.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    if (error.code === '42501') return next(fail(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
    return next(fail(503, 'OVERDUE_SERVICE_UNAVAILABLE', 'The fee decision could not be saved.'));
  }
  res.json({ data });
});
