import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';
import { disputeQuerySchema, disputeResolutionSchema, moderationActionSchema, moderationQuerySchema } from '../validators/admin.js';
import { reportQuerySchema, reportReviewSchema } from '../validators/reports.js';

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
    .select('id,title,description,item_condition,price_per_day,deposit_amount,late_fee_per_day,handover_location,rules,available_from,available_until,status,created_at,category:categories(id,name,slug),owner:profiles!listings_owner_id_fkey(id,full_name,college_id),listing_photos(id,storage_path,position)')
    .eq('status', parsed.data.status)
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
    .select('id,booking_id,opened_by,reason,details,status,resolution,created_at,booking:bookings!disputes_booking_id_fkey(id,status,start_date,end_date,total_price,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey(id,full_name),lender:profiles!bookings_lender_id_fkey(id,full_name))')
    .eq('status', parsed.data.status)
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
