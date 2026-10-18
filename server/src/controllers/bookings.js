import { adminClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/async-handler.js';
import { bookingActionSchema, bookingCreateSchema } from '../validators/bookings.js';
import { calculateOverdueDays } from '../utils/overdue.js';

const bookingSelect = [
  'id,listing_id,borrower_id,lender_id,start_date,end_date,status,daily_price,deposit_amount,late_fee_per_day,total_price,created_at,updated_at',
  'listing:listings!bookings_listing_id_fkey(id,title,handover_location,owner_id)',
  'borrower:profiles!bookings_borrower_id_fkey(id,full_name)',
  'lender:profiles!bookings_lender_id_fkey(id,full_name)',
  'history:booking_status_history(id,changed_by,old_status,new_status,reason,created_at)',
  'payments(id,provider,amount,currency,status,provider_payment_id,created_at,refunds(id,amount,status,provider_reference,created_at))',
  'late_fees(id,amount,days_overdue,grace_days,status,reason,created_at)',
  'deposits(amount,status)',
].join(',');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function requireDb(next) {
  if (adminClient) return true;
  next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  return false;
}

function validationError(res, parsed) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted fields.' },
  });
}

function databaseError(error, operation) {
  const known = {
    INVALID_BOOKING_DATES: [400, 'INVALID_BOOKING_DATES', 'Choose valid future dates for this request.'],
    LISTING_UNAVAILABLE: [409, 'LISTING_UNAVAILABLE', 'This item is not available for those dates.'],
    BOOKING_CONFLICT: [409, 'BOOKING_CONFLICT', 'Another confirmed booking overlaps those dates.'],
    SELF_BOOKING_NOT_ALLOWED: [403, 'SELF_BOOKING_NOT_ALLOWED', 'You cannot request your own listing.'],
    COLLEGE_MISMATCH: [403, 'COLLEGE_MISMATCH', 'This booking is limited to students from the same campus.'],
    BOOKING_NOT_FOUND: [404, 'BOOKING_NOT_FOUND', 'The booking was not found.'],
    BOOKING_ACCESS_DENIED: [403, 'BOOKING_ACCESS_DENIED', 'You are not part of this booking.'],
    LENDER_ACTION_REQUIRED: [403, 'LENDER_ACTION_REQUIRED', 'Only the lender can perform this action.'],
    BORROWER_ACTION_REQUIRED: [403, 'BORROWER_ACTION_REQUIRED', 'Only the borrower can perform this action.'],
    BOOKING_STATE_CHANGED: [409, 'BOOKING_STATE_CHANGED', 'The booking changed. Refresh the page and try again.'],
    PAYMENT_REFUND_REVIEW_REQUIRED: [409, 'PAYMENT_REFUND_REVIEW_REQUIRED', 'A captured payment needs refund review before this booking can be cancelled.'],
    DISPUTE_DETAILS_REQUIRED: [400, 'DISPUTE_DETAILS_REQUIRED', 'Add a reason and more detail before opening a dispute.'],
    INVALID_BOOKING_ACTION: [400, 'INVALID_BOOKING_ACTION', 'That booking action is not available.'],
  };
  const mapped = known[error.message];
  if (mapped) return fail(...mapped);
  if (error.code === '23P01') return fail(409, 'BOOKING_CONFLICT', 'Another confirmed booking overlaps those dates.');
  if (error.code === '42501') return fail(403, 'BOOKING_ACCESS_DENIED', 'You cannot perform that booking action.');
  console.error({ event: 'booking_database_error', operation, code: error.code ?? 'UNKNOWN' });
  return fail(503, 'BOOKING_SERVICE_UNAVAILABLE', 'Booking services are temporarily unavailable.');
}

function formatBooking(row, userId) {
  const deposit = Array.isArray(row.deposits) ? row.deposits[0] : row.deposits;
  return {
    id: row.id,
    listingId: row.listing_id,
    borrowerId: row.borrower_id,
    lenderId: row.lender_id,
    side: row.borrower_id === userId ? 'borrower' : 'lender',
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    dailyPrice: Number(row.daily_price),
    depositAmount: Number(row.deposit_amount),
    lateFeePerDay: Number(row.late_fee_per_day),
    totalPrice: Number(row.total_price),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listing: row.listing ? {
      id: row.listing.id,
      title: row.listing.title,
      handoverLocation: row.listing.handover_location,
    } : null,
    borrower: row.borrower ? { id: row.borrower.id, fullName: row.borrower.full_name } : null,
    lender: row.lender ? { id: row.lender.id, fullName: row.lender.full_name } : null,
    history: (row.history ?? []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((entry) => ({
      id: entry.id,
      oldStatus: entry.old_status,
      newStatus: entry.new_status,
      reason: entry.reason,
      createdAt: entry.created_at,
    })),
    payments: (row.payments ?? []).map((payment) => ({
      provider: payment.provider,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      providerPaymentId: payment.provider_payment_id,
      createdAt: payment.created_at,
      refunds: (payment.refunds ?? []).map((refund) => ({
        amount: Number(refund.amount),
        status: refund.status,
        providerReference: refund.provider_reference,
        createdAt: refund.created_at,
      })),
    })),
    depositStatus: deposit?.status ?? 'not_collected',
    overdueDays: row.status === 'active' ? calculateOverdueDays(row.end_date, env.overdueGraceDays) : 0,
    lateFees: (row.late_fees ?? []).slice().sort((a, b) => a.days_overdue - b.days_overdue).map((fee) => ({
      amount: Number(fee.amount),
      daysOverdue: fee.days_overdue,
      graceDays: fee.grace_days,
      status: fee.status,
      reason: fee.reason,
      createdAt: fee.created_at,
    })),
  };
}

async function getBooking(bookingId, userId) {
  const { data, error } = await adminClient.from('bookings').select(bookingSelect)
    .eq('id', bookingId)
    .or(`borrower_id.eq.${userId},lender_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw fail(503, 'BOOKING_SERVICE_UNAVAILABLE', 'The booking could not be loaded.');
  if (!data) throw fail(404, 'BOOKING_NOT_FOUND', 'The booking was not found.');
  return formatBooking(data, userId);
}

export const listBookings = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.from('bookings').select(bookingSelect)
    .or(`borrower_id.eq.${req.user.id},lender_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return next(fail(503, 'BOOKING_SERVICE_UNAVAILABLE', 'Your bookings could not be loaded.'));
  res.json({ data: { bookings: (data ?? []).map((row) => formatBooking(row, req.user.id)) } });
});

export const createBooking = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = bookingCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data: bookingId, error } = await adminClient.rpc('create_booking_request', {
    p_listing_id: parsed.data.listingId,
    p_borrower_id: req.user.id,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_college_id: req.profile.college_id,
  });
  if (error) return next(databaseError(error, 'create'));
  res.status(201).json({ data: await getBooking(bookingId, req.user.id) });
});

export const getBookingDetails = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  res.json({ data: await getBooking(req.params.id, req.user.id) });
});

export const updateBookingAction = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = bookingActionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  if (parsed.data.action === 'confirm' && env.paymentMode !== 'disabled') {
    return next(fail(409, 'PAYMENT_FLOW_REQUIRED', 'Use the booking payment action to confirm this request.'));
  }
  const { error } = await adminClient.rpc('transition_booking', {
    p_booking_id: req.params.id,
    p_actor_id: req.user.id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason ?? null,
    p_details: parsed.data.details ?? null,
  });
  if (error) return next(databaseError(error, 'transition'));
  res.json({ data: await getBooking(req.params.id, req.user.id) });
});
