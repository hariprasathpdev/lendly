import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createReviewSchema, reviewListSchema } from '../validators/reviews.js';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function validationError(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted fields.' } });
}

export const createReview = asyncHandler(async (req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data, error } = await adminClient.rpc('submit_review', {
    p_booking_id: parsed.data.bookingId,
    p_reviewer_id: req.user.id,
    p_rating: parsed.data.rating,
    p_body: parsed.data.body ?? null,
  });
  if (error) {
    const known = {
      INVALID_REVIEW: [400, 'INVALID_REVIEW', 'Choose a rating from 1 to 5 and keep your comment under 2,000 characters.'],
      BOOKING_NOT_FOUND: [404, 'BOOKING_NOT_FOUND', 'The completed booking could not be found.'],
      BOOKING_NOT_COMPLETE: [409, 'BOOKING_NOT_COMPLETE', 'You can leave a review after the item return is confirmed.'],
      REVIEW_ALREADY_SUBMITTED: [409, 'REVIEW_ALREADY_SUBMITTED', 'You already reviewed this completed booking.'],
    };
    const mapped = known[error.message];
    if (mapped) return next(fail(...mapped));
    if (error.code === '42501') return next(fail(403, 'BOOKING_ACCESS_DENIED', 'Only a participant in this booking can leave a review.'));
    return next(fail(503, 'REVIEW_SERVICE_UNAVAILABLE', 'Your review could not be saved.'));
  }
  res.status(201).json({ data });
});

export const listUserReviews = asyncHandler(async (req, res, next) => {
  if (!adminClient) return next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  const parsed = reviewListSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed);
  const { data: target, error: profileError } = await adminClient.from('profiles')
    .select('id,college_id').eq('id', req.params.userId).maybeSingle();
  if (profileError) return next(fail(503, 'REVIEW_SERVICE_UNAVAILABLE', 'Reviews could not be loaded.'));
  if (!target || target.college_id !== req.profile.college_id) return next(fail(404, 'PROFILE_NOT_FOUND', 'That campus profile could not be found.'));
  const from = (parsed.data.page - 1) * parsed.data.pageSize;
  const to = from + parsed.data.pageSize - 1;
  const [{ data, error }, { data: summary, error: summaryError }] = await Promise.all([
    adminClient.from('reviews')
      .select('id,rating,body,created_at,reviewer:profiles!reviews_reviewer_id_fkey(id,full_name)')
    .eq('reviewee_id', target.id)
    .order('created_at', { ascending: false })
      .range(from, to),
    adminClient.rpc('get_user_review_summary', { p_user_id: target.id }),
  ]);
  if (error || summaryError) return next(fail(503, 'REVIEW_SERVICE_UNAVAILABLE', 'Reviews could not be loaded.'));
  const reviews = (data ?? []).map((row) => ({
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.created_at,
    reviewer: row.reviewer ? { fullName: row.reviewer.full_name } : null,
  }));
  res.json({ data: { reviews, total: Number(summary.total), ratingAverage: summary.ratingAverage === null ? null : Number(summary.ratingAverage), page: parsed.data.page, pageSize: parsed.data.pageSize } });
});
