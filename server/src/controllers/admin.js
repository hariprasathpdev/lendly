import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';
import { adminAuditQuerySchema, adminBookingQuerySchema, adminUserQuerySchema, disputeQuerySchema, disputeResolutionSchema, moderationActionSchema, moderationQuerySchema } from '../validators/admin.js';
import { reportQuerySchema, reportReviewSchema } from '../validators/reports.js';
import { env } from '../config/env.js';
import { cutoffDate } from '../utils/overdue.js';

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

export const listModerationQueue = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = moderationQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.from('listings')
    .select('id,title,description,item_condition,price_per_day,deposit_amount,late_fee_per_day,handover_location,rules,available_from,available_until,status,created_at,category:categories(id,name,slug),owner:profiles!listings_owner_id_fkey!inner(id,full_name,college_id),listing_photos(id,storage_path,position)')
    .eq('status', parsed.data.status)
    .eq('owner.college_id', req.profile.college_id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return next(fail(503, 'MODERATION_SERVICE_UNAVAILABLE', 'The moderation queue could not be loaded.'));

  const paths = (data ?? []).flatMap((listing) => (listing.listing_photos ?? []).map((photo) => photo.storage_path));
  const urls = new Map();
  if (paths.length) {
    const { data: signed, error: signedError } = await adminClient.storage.from('item-photos').createSignedUrls(paths, 900);
    if (signedError) return next(fail(503, 'PHOTO_SERVICE_UNAVAILABLE', 'Listing photos could not be loaded.'));
    for (const photo of signed ?? []) if (photo.signedUrl) urls.set(photo.path, photo.signedUrl);
  }

  const listings = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    condition: row.item_condition,
    pricePerDay: Number(row.price_per_day),
    depositAmount: Number(row.deposit_amount),
    lateFeePerDay: Number(row.late_fee_per_day),
    handoverLocation: row.handover_location,
    rules: row.rules,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    status: row.status,
    createdAt: row.created_at,
    category: row.category,
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name, collegeId: row.owner.college_id } : null,
    photos: (row.listing_photos ?? []).slice().sort((a, b) => a.position - b.position).map((photo) => ({ id: photo.id, url: urls.get(photo.storage_path) ?? null })),
  }));
  res.json({ data: { listings } });
});

export const reviewListing = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = moderationActionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data: target, error: targetError } = await adminClient.from('listings')
    .select('id,owner:profiles!listings_owner_id_fkey!inner(college_id)')
    .eq('id', req.params.id).eq('owner.college_id', req.profile.college_id).maybeSingle();
  if (targetError) return next(fail(503, 'MODERATION_SERVICE_UNAVAILABLE', 'The listing could not be checked.'));
  if (!target) return next(fail(404, 'LISTING_NOT_FOUND', 'The listing was not found.'));
  const { data, error } = await adminClient.rpc('moderate_listing', {
    p_listing_id: req.params.id,
    p_admin_id: req.user.id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const known = {
      LISTING_NOT_FOUND: [404, 'LISTING_NOT_FOUND', 'The listing was not found.'],
      LISTING_NOT_REVIEWABLE: [409, 'LISTING_NOT_REVIEWABLE', 'This listing is no longer waiting for a review.'],
      REJECTION_REASON_REQUIRED: [400, 'REJECTION_REASON_REQUIRED', 'Provide a clear reason for rejection.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    if (error.code === '42501') return next(fail(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
    return next(fail(503, 'MODERATION_SERVICE_UNAVAILABLE', 'The listing review could not be saved.'));
  }
  res.json({ data });
});

export const listDisputes = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = disputeQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.from('disputes')
    .select('id,booking_id,opened_by,reason,details,status,resolution,created_at,booking:bookings!disputes_booking_id_fkey!inner(id,status,start_date,end_date,total_price,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey!inner(id,full_name,college_id),lender:profiles!bookings_lender_id_fkey(id,full_name))')
    .eq('status', parsed.data.status)
    .eq('booking.borrower.college_id', req.profile.college_id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return next(fail(503, 'DISPUTE_SERVICE_UNAVAILABLE', 'The dispute queue could not be loaded.'));
  const disputes = (data ?? []).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    openedBy: row.opened_by,
    reason: row.reason,
    details: row.details,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    booking: row.booking ? {
      id: row.booking.id,
      status: row.booking.status,
      startDate: row.booking.start_date,
      endDate: row.booking.end_date,
      totalPrice: Number(row.booking.total_price),
      listing: row.booking.listing ? { id: row.booking.listing.id, title: row.booking.listing.title } : null,
      borrower: row.booking.borrower ? { id: row.booking.borrower.id, fullName: row.booking.borrower.full_name } : null,
      lender: row.booking.lender ? { id: row.booking.lender.id, fullName: row.booking.lender.full_name } : null,
    } : null,
  }));
  res.json({ data: { disputes } });
});

export const resolveDispute = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = disputeResolutionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data: target, error: targetError } = await adminClient.from('disputes')
    .select('id,booking:bookings!disputes_booking_id_fkey!inner(borrower:profiles!bookings_borrower_id_fkey!inner(college_id))')
    .eq('id', req.params.id).eq('booking.borrower.college_id', req.profile.college_id).maybeSingle();
  if (targetError) return next(fail(503, 'DISPUTE_SERVICE_UNAVAILABLE', 'The dispute could not be checked.'));
  if (!target) return next(fail(404, 'DISPUTE_NOT_FOUND', 'The dispute was not found.'));
  const { data, error } = await adminClient.rpc('resolve_dispute', {
    p_dispute_id: req.params.id,
    p_admin_id: req.user.id,
    p_action: parsed.data.action,
    p_resolution: parsed.data.resolution,
  });
  if (error) {
    const known = {
      DISPUTE_NOT_FOUND: [404, 'DISPUTE_NOT_FOUND', 'The dispute was not found.'],
      DISPUTE_ALREADY_CLOSED: [409, 'DISPUTE_ALREADY_CLOSED', 'This dispute has already been reviewed.'],
      BOOKING_NOT_DISPUTED: [409, 'BOOKING_NOT_DISPUTED', 'The booking is no longer under dispute.'],
      DISPUTE_PRIOR_STATE_MISSING: [409, 'DISPUTE_PRIOR_STATE_MISSING', 'The booking history does not contain a state to restore.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    if (error.code === '42501') return next(fail(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
    return next(fail(503, 'DISPUTE_SERVICE_UNAVAILABLE', 'The dispute decision could not be saved.'));
  }
  res.json({ data });
});

export const listReports = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.from('reports')
    .select('id,reporter_id,listing_id,booking_id,reason,details,status,resolution,created_at,reporter:profiles!reports_reporter_id_fkey(id,full_name),listing:listings!reports_listing_id_fkey(id,title,owner:profiles!listings_owner_id_fkey(id,full_name)),booking:bookings!reports_booking_id_fkey(id,status,listing:listings!bookings_listing_id_fkey(id,title))')
    .eq('status', parsed.data.status)
    .eq('college_id', req.profile.college_id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return next(fail(503, 'REPORT_SERVICE_UNAVAILABLE', 'The campus report queue could not be loaded.'));
  const reports = (data ?? []).map((row) => ({
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    reporter: row.reporter ? { id: row.reporter.id, fullName: row.reporter.full_name } : null,
    listing: row.listing ? { id: row.listing.id, title: row.listing.title, owner: row.listing.owner ? { id: row.listing.owner.id, fullName: row.listing.owner.full_name } : null } : null,
    booking: row.booking ? { id: row.booking.id, status: row.booking.status, listingTitle: row.booking.listing?.title ?? 'Campus item' } : null,
  }));
  res.json({ data: { reports } });
});

export const reviewReport = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = reportReviewSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.rpc('review_report', {
    p_report_id: req.params.id,
    p_admin_id: req.user.id,
    p_action: parsed.data.action,
    p_resolution: parsed.data.resolution ?? null,
  });
  if (error) {
    const known = {
      REPORT_NOT_FOUND: [404, 'REPORT_NOT_FOUND', 'The campus report was not found.'],
      REPORT_ALREADY_CLOSED: [409, 'REPORT_ALREADY_CLOSED', 'This report has already been closed.'],
      REPORT_RESOLUTION_REQUIRED: [400, 'REPORT_RESOLUTION_REQUIRED', 'Add a short resolution note before closing this report.'],
      INVALID_REPORT_ACTION: [400, 'INVALID_REPORT_ACTION', 'Choose a valid report action.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    if (error.code === '42501') return next(fail(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
    return next(fail(503, 'REPORT_SERVICE_UNAVAILABLE', 'The report review could not be saved.'));
  }
  res.json({ data });
});

export const getAdminOverview = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = cutoffDate(today, env.overdueGraceDays);
  const queries = [
    adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('college_id', req.profile.college_id),
    adminClient.from('listings').select('id,owner:profiles!listings_owner_id_fkey!inner(college_id)', { count: 'exact', head: true }).eq('status', 'pending_review').eq('owner.college_id', req.profile.college_id),
    adminClient.from('bookings').select('id,borrower:profiles!bookings_borrower_id_fkey!inner(college_id)', { count: 'exact', head: true }).in('status', ['pending', 'accepted', 'awaiting_payment', 'confirmed', 'active', 'return_requested', 'disputed']).eq('borrower.college_id', req.profile.college_id),
    adminClient.from('reports').select('id', { count: 'exact', head: true }).eq('college_id', req.profile.college_id).in('status', ['open', 'under_review']),
    adminClient.from('disputes').select('id,booking:bookings!disputes_booking_id_fkey!inner(borrower:profiles!bookings_borrower_id_fkey!inner(college_id))', { count: 'exact', head: true }).in('status', ['open', 'under_review']).eq('booking.borrower.college_id', req.profile.college_id),
    adminClient.from('refunds').select('id,payment:payments!refunds_payment_id_fkey!inner(booking:bookings!payments_booking_id_fkey!inner(borrower:profiles!bookings_borrower_id_fkey!inner(college_id)))', { count: 'exact', head: true }).in('status', ['requested', 'under_review', 'approved']).eq('payment.booking.borrower.college_id', req.profile.college_id),
    adminClient.from('bookings').select('id,borrower:profiles!bookings_borrower_id_fkey!inner(college_id)', { count: 'exact', head: true }).eq('status', 'active').lt('end_date', cutoff).eq('borrower.college_id', req.profile.college_id),
    adminClient.from('late_fees').select('id,booking:bookings!late_fees_booking_id_fkey!inner(borrower:profiles!bookings_borrower_id_fkey!inner(college_id))', { count: 'exact', head: true }).in('status', ['calculated', 'disputed']).eq('booking.borrower.college_id', req.profile.college_id),
  ];
  const results = await Promise.all(queries);
  if (results.some((result) => result.error)) return next(fail(503, 'ADMIN_OVERVIEW_UNAVAILABLE', 'Campus summary counts could not be loaded.'));
  res.json({ data: { counts: {
    students: results[0].count ?? 0,
    listingsToReview: results[1].count ?? 0,
    activeBookings: results[2].count ?? 0,
    reportsToReview: results[3].count ?? 0,
    disputesToReview: results[4].count ?? 0,
    refundsToReview: results[5].count ?? 0,
    overdueBookings: results[6].count ?? 0,
    feesToReview: results[7].count ?? 0,
  } } });
});

export const listAdminUsers = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = adminUserQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const from = (parsed.data.page - 1) * parsed.data.pageSize;
  let query = adminClient.from('profiles')
    .select('id,full_name,college_email,role,email_verified_at,terms_accepted_at,created_at,college:colleges!profiles_college_id_fkey(id,name)', { count: 'exact' })
    .eq('college_id', req.profile.college_id)
    .order('created_at', { ascending: false });
  if (parsed.data.q) {
    const safe = parsed.data.q.replace(/[,%().\\]/g, ' ').trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,college_email.ilike.%${safe}%`);
  }
  const { data, count, error } = await query.range(from, from + parsed.data.pageSize - 1);
  if (error) return next(fail(503, 'ADMIN_USERS_UNAVAILABLE', 'Student accounts could not be loaded.'));
  res.json({ data: { users: (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.college_email,
    role: row.role,
    verified: Boolean(row.email_verified_at),
    termsAccepted: Boolean(row.terms_accepted_at),
    createdAt: row.created_at,
    college: row.college ? row.college.name : 'Campus',
  })), total: count ?? 0, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});

export const listAdminBookings = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = adminBookingQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const from = (parsed.data.page - 1) * parsed.data.pageSize;
  let query = adminClient.from('bookings')
    .select('id,status,start_date,end_date,total_price,deposit_amount,late_fee_per_day,created_at,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey!inner(id,full_name,college_id),lender:profiles!bookings_lender_id_fkey(id,full_name),payments(provider,amount,status),deposits(amount,status)', { count: 'exact' })
    .eq('borrower.college_id', req.profile.college_id)
    .order('created_at', { ascending: false });
  if (parsed.data.status !== 'all') query = query.eq('status', parsed.data.status);
  const { data, count, error } = await query.range(from, from + parsed.data.pageSize - 1);
  if (error) return next(fail(503, 'ADMIN_BOOKINGS_UNAVAILABLE', 'Campus bookings could not be loaded.'));
  const bookings = (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    totalPrice: Number(row.total_price),
    depositAmount: Number(row.deposit_amount),
    lateFeePerDay: Number(row.late_fee_per_day),
    createdAt: row.created_at,
    listing: row.listing ? { id: row.listing.id, title: row.listing.title } : null,
    borrower: row.borrower ? { fullName: row.borrower.full_name } : null,
    lender: row.lender ? { fullName: row.lender.full_name } : null,
    payments: (row.payments ?? []).map((payment) => ({ provider: payment.provider, amount: Number(payment.amount), status: payment.status })),
    depositStatus: (Array.isArray(row.deposits) ? row.deposits[0] : row.deposits)?.status ?? 'not_collected',
  }));
  res.json({ data: { bookings, total: count ?? 0, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});

export const listAdminAudit = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = adminAuditQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const from = (parsed.data.page - 1) * parsed.data.pageSize;
  const { data, count, error } = await adminClient.from('admin_audit_logs')
    .select('id,admin_id,action,target_type,target_id,metadata,created_at,admin:profiles!admin_audit_logs_admin_id_fkey!inner(id,full_name,college_id)', { count: 'exact' })
    .eq('admin.college_id', req.profile.college_id)
    .order('created_at', { ascending: false })
    .range(from, from + parsed.data.pageSize - 1);
  if (error) return next(fail(503, 'ADMIN_AUDIT_UNAVAILABLE', 'Administrator activity could not be loaded.'));
  res.json({ data: { entries: (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    admin: row.admin ? { fullName: row.admin.full_name } : null,
  })), total: count ?? 0, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});
