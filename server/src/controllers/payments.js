import { adminClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/async-handler.js';
import { toMinorUnits, verifyCheckoutSignature, verifyHmacHex } from '../utils/payment-security.js';
import { paymentOrderSchema, paymentVerificationSchema, refundReviewSchema } from '../validators/payments.js';

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
    error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Check the submitted payment details.' },
  });
}

function mapPaymentError(error) {
  const known = {
    BOOKING_NOT_FOUND: [404, 'BOOKING_NOT_FOUND', 'The booking was not found.'],
    BORROWER_ACTION_REQUIRED: [403, 'BORROWER_ACTION_REQUIRED', 'Only the borrower can start this payment.'],
    BOOKING_STATE_CHANGED: [409, 'BOOKING_STATE_CHANGED', 'This booking is not ready for payment. Refresh and try again.'],
    PAYMENT_NOT_REQUIRED: [400, 'PAYMENT_NOT_REQUIRED', 'This booking has no amount to collect.'],
    PAYMENT_ORDER_NOT_FOUND: [404, 'PAYMENT_ORDER_NOT_FOUND', 'The payment order was not found.'],
    PAYMENT_AMOUNT_MISMATCH: [400, 'PAYMENT_AMOUNT_MISMATCH', 'The payment amount does not match the server order.'],
    PAYMENT_BELOW_PROVIDER_MINIMUM: [400, 'PAYMENT_BELOW_PROVIDER_MINIMUM', 'Razorpay test checkout requires at least ₹1. Use demo mode for smaller totals.'],
    INVALID_PROVIDER_PAYMENT_STATUS: [400, 'INVALID_PROVIDER_PAYMENT_STATUS', 'The provider returned an unsupported payment status.'],
    REFUND_NOT_ELIGIBLE: [409, 'REFUND_NOT_ELIGIBLE', 'This booking does not have a refundable captured deposit.'],
    REFUND_NOT_FOUND: [404, 'REFUND_NOT_FOUND', 'The refund request was not found.'],
    REFUND_STATE_CHANGED: [409, 'REFUND_STATE_CHANGED', 'The refund request changed. Refresh the page and try again.'],
  };
  const mapped = known[error.message];
  if (mapped) return fail(...mapped);
  if (error.code === '42501') return fail(403, 'PAYMENT_ACCESS_DENIED', 'You cannot access this payment.');
  console.error({ event: 'payment_service_error', code: error.code ?? 'UNKNOWN' });
  return fail(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'Payment services are temporarily unavailable.');
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const credentials = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${credentials}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay could not be reached. Try again shortly.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay returned an unreadable response.');
  }
  if (!response.ok) {
    console.error({ event: 'razorpay_request_failed', status: response.status, path });
    throw fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay could not complete the request. Check the test credentials and retry.');
  }
  return result;
}

function checkoutResponse(order, payment, bookingId) {
  const amount = toMinorUnits(payment.amount);
  return {
    mode: 'razorpay_test',
    bookingId,
    paymentId: payment.paymentId,
    keyId: env.razorpayKeyId,
    orderId: order.id,
    amount,
    currency: 'INR',
    description: 'Campus borrowing and requested refundable deposit',
  };
}

export const paymentPolicy = asyncHandler(async (_req, res) => {
  const descriptions = {
    disabled: 'Payment processing is disabled. Borrowers can confirm without paying through Lendly.',
    demo: 'Demo mode records a simulation only. No money is collected or refunded.',
    razorpay_test: 'Razorpay test mode uses sandbox credentials. No live money is collected.',
  };
  res.json({ data: { mode: env.paymentMode, enabled: env.paymentMode !== 'disabled', description: descriptions[env.paymentMode] } });
});

export const createPaymentOrder = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = paymentOrderSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  if (env.paymentMode === 'disabled') return next(fail(409, 'PAYMENTS_DISABLED', 'Payments are disabled. Confirm the booking without paying through Lendly.'));

  if (env.paymentMode === 'demo') {
    const { data, error } = await adminClient.rpc('complete_demo_payment', {
      p_booking_id: parsed.data.bookingId,
      p_payer_id: req.user.id,
    });
    if (error) return next(mapPaymentError(error));
    return res.status(201).json({ data: { mode: 'demo', ...data, message: 'Demo only. No money was collected.' } });
  }

  const { data: payment, error } = await adminClient.rpc('reserve_razorpay_payment', {
    p_booking_id: parsed.data.bookingId,
    p_payer_id: req.user.id,
  });
  if (error) {
    if (error.message === 'PAYMENT_NOT_REQUIRED') {
      const { error: confirmError } = await adminClient.rpc('transition_booking', {
        p_booking_id: parsed.data.bookingId,
        p_actor_id: req.user.id,
        p_action: 'confirm',
        p_reason: null,
        p_details: null,
      });
      if (confirmError) return next(mapPaymentError(confirmError));
      return res.json({ data: { mode: 'razorpay_test', bookingId: parsed.data.bookingId, paymentRequired: false } });
    }
    return next(mapPaymentError(error));
  }

  if (payment.status === 'captured') return next(fail(409, 'PAYMENT_ALREADY_CAPTURED', 'This booking payment is already captured.'));
  if (payment.providerReference) {
    return res.status(200).json({ data: checkoutResponse({ id: payment.providerReference }, payment, parsed.data.bookingId) });
  }

  let order;
  const amount = toMinorUnits(payment.amount);
  if (amount < 100) return next(fail(400, 'PAYMENT_BELOW_PROVIDER_MINIMUM', 'Razorpay test checkout requires at least ₹1. Use demo mode for smaller totals.'));
  try {
    order = await razorpayRequest('/orders', {
      method: 'POST',
      body: {
        amount,
        currency: 'INR',
        receipt: `L${parsed.data.bookingId.replaceAll('-', '')}`,
        notes: { booking_id: parsed.data.bookingId, app: 'lendly' },
      },
    });
    if (typeof order.id !== 'string' || !order.id.startsWith('order_')) {
      throw fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay did not return a valid order.');
    }
  } catch (providerError) {
    await adminClient.from('payments').update({ status: 'failed' }).eq('id', payment.paymentId);
    await adminClient.from('deposits').update({ status: 'not_collected' }).eq('booking_id', parsed.data.bookingId);
    return next(providerError.status ? providerError : fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The test order could not be created.'));
  }
  const { error: saveError } = await adminClient.from('payments')
    .update({ provider_reference: order.id })
    .eq('id', payment.paymentId)
    .eq('payer_id', req.user.id);
  if (saveError) return next(fail(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'The test order was created but could not be linked. Contact campus support before retrying.'));
  res.status(201).json({ data: checkoutResponse(order, payment, parsed.data.bookingId) });
});

export const verifyPayment = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = paymentVerificationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  if (env.paymentMode !== 'razorpay_test') return next(fail(409, 'PAYMENT_MODE_MISMATCH', 'Razorpay verification is unavailable in this payment mode.'));

  const { orderId, paymentId, signature } = parsed.data;
  const { data: payment, error } = await adminClient.from('payments')
    .select('id,booking_id,payer_id,amount,status,provider_reference')
    .eq('provider', 'razorpay_test')
    .eq('payer_id', req.user.id)
    .eq('provider_reference', orderId)
    .maybeSingle();
  if (error) return next(fail(503, 'PAYMENT_SERVICE_UNAVAILABLE', 'The payment record could not be checked.'));
  if (!payment) return next(fail(404, 'PAYMENT_ORDER_NOT_FOUND', 'The payment order was not found.'));
  if (!verifyCheckoutSignature(orderId, paymentId, signature, env.razorpayKeySecret)) {
    return next(fail(400, 'INVALID_PAYMENT_SIGNATURE', 'Razorpay could not verify this checkout response.'));
  }

  let providerPayment;
  try {
    providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
  } catch (providerError) {
    return next(providerError);
  }
  if (providerPayment.order_id !== orderId || providerPayment.status !== 'captured'
      || Number(providerPayment.amount) !== toMinorUnits(payment.amount) || providerPayment.currency !== 'INR') {
    return next(fail(409, 'PAYMENT_NOT_CAPTURED', 'The test payment is not captured yet. Wait for the provider update and refresh.'));
  }
  const { data, error: recordError } = await adminClient.rpc('record_razorpay_payment_event', {
    p_event_id: `client_verify_${paymentId}`,
    p_event_type: 'client.payment.verify',
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_payment_status: 'captured',
    p_amount: providerPayment.amount,
    p_currency: providerPayment.currency,
  });
  if (recordError) return next(mapPaymentError(recordError));
  res.json({ data: { ...data, mode: 'razorpay_test', message: 'Test payment verified. No live transaction was made.' } });
});

export const razorpayWebhook = asyncHandler(async (req, res, next) => {
  if (env.paymentMode !== 'razorpay_test' || !env.razorpayWebhookSecret) {
    return next(fail(503, 'PAYMENT_WEBHOOK_UNAVAILABLE', 'The Razorpay test webhook is not configured.'));
  }
  const rawBody = req.rawBody;
  const signature = req.get('x-razorpay-signature');
  const eventId = req.get('x-razorpay-event-id');
  if (!Buffer.isBuffer(rawBody) || !eventId || eventId.length > 120
      || !verifyHmacHex(rawBody, signature, env.razorpayWebhookSecret)) {
    return next(fail(400, 'INVALID_WEBHOOK_SIGNATURE', 'The Razorpay webhook could not be verified.'));
  }

  const eventType = req.body?.event;
  const supported = {
    'payment.authorized': 'authorized',
    'payment.captured': 'captured',
    'payment.failed': 'failed',
  };
  const paymentStatus = supported[eventType];
  if (!paymentStatus) return res.json({ data: { received: true, ignored: true } });
  const entity = req.body?.payload?.payment?.entity;
  if (!entity?.order_id || !entity?.id || !Number.isInteger(entity.amount) || entity.currency !== 'INR') {
    return next(fail(400, 'INVALID_WEBHOOK_PAYLOAD', 'The Razorpay webhook payload is incomplete.'));
  }
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.rpc('record_razorpay_payment_event', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_order_id: entity.order_id,
    p_payment_id: entity.id,
    p_payment_status: paymentStatus,
    p_amount: entity.amount,
    p_currency: entity.currency,
  });
  if (error) return next(mapPaymentError(error));
  res.json({ data: { received: true, duplicate: Boolean(data?.duplicate) } });
});

export const requestDepositRefund = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = paymentOrderSchema.safeParse({ bookingId: req.params.bookingId });
  if (!parsed.success) return validationError(res, parsed);
  if (env.paymentMode !== 'razorpay_test') return next(fail(409, 'REFUND_NOT_ELIGIBLE', 'Refund requests are available only for captured Razorpay test deposits.'));
  const { data, error } = await adminClient.rpc('request_deposit_refund', {
    p_booking_id: parsed.data.bookingId,
    p_user_id: req.user.id,
  });
  if (error) return next(mapPaymentError(error));
  res.status(201).json({ data: { ...data, note: 'This request is pending administrator review. No refund has been issued.' } });
});

export const listRefundRequests = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.from('refunds')
    .select('id,payment_id,requested_by,amount,status,provider_reference,created_at,payment:payments!refunds_payment_id_fkey!inner(provider,provider_payment_id,booking:bookings!payments_booking_id_fkey!inner(id,status,start_date,end_date,listing:listings!bookings_listing_id_fkey(id,title),borrower:profiles!bookings_borrower_id_fkey!inner(college_id)),payer:profiles!payments_payer_id_fkey(id,full_name))')
    .in('status', ['requested', 'under_review', 'approved', 'failed'])
    .eq('payment.booking.borrower.college_id', req.profile.college_id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return next(fail(503, 'REFUND_SERVICE_UNAVAILABLE', 'Refund requests could not be loaded.'));
  const refunds = (data ?? []).map((refund) => ({
    id: refund.id,
    amount: Number(refund.amount),
    status: refund.status,
    providerReference: refund.provider_reference,
    createdAt: refund.created_at,
    payment: refund.payment ? {
      provider: refund.payment.provider,
      providerPaymentId: refund.payment.provider_payment_id,
      booking: refund.payment.booking ? {
        id: refund.payment.booking.id,
        status: refund.payment.booking.status,
        startDate: refund.payment.booking.start_date,
        endDate: refund.payment.booking.end_date,
        listing: refund.payment.booking.listing ? { id: refund.payment.booking.listing.id, title: refund.payment.booking.listing.title } : null,
      } : null,
      payer: refund.payment.payer ? { id: refund.payment.payer.id, fullName: refund.payment.payer.full_name } : null,
    } : null,
  }));
  res.json({ data: { refunds } });
});

export const reviewRefund = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const parsed = refundReviewSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { data: target, error: targetError } = await adminClient.from('refunds')
    .select('id,payment:payments!refunds_payment_id_fkey!inner(booking:bookings!payments_booking_id_fkey!inner(borrower:profiles!bookings_borrower_id_fkey!inner(college_id)))')
    .eq('id', req.params.id).eq('payment.booking.borrower.college_id', req.profile.college_id).maybeSingle();
  if (targetError) return next(fail(503, 'REFUND_SERVICE_UNAVAILABLE', 'The refund request could not be checked.'));
  if (!target) return next(fail(404, 'REFUND_NOT_FOUND', 'The refund request was not found.'));
  const { data, error } = await adminClient.rpc('review_test_refund', {
    p_refund_id: req.params.id,
    p_admin_id: req.user.id,
    p_action: parsed.data.action,
    p_provider_reference: parsed.data.providerReference ?? null,
  });
  if (error) return next(mapPaymentError(error));
  const note = parsed.data.action === 'issued'
    ? 'Razorpay issued the refund recorded above.'
    : parsed.data.action === 'approve'
      ? 'Approved. Issue the partial refund in the Razorpay test dashboard, then record its rfnd_ reference here.'
      : parsed.data.action === 'reject'
        ? 'The refund request was rejected; no provider refund was issued.'
        : 'The refund is marked failed and requires an operator check in the Razorpay test dashboard.';
  res.json({ data: { ...data, note } });
});
