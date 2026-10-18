import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted } from '../middleware/auth.js';
import { createPaymentOrder, paymentPolicy, razorpayWebhook, requestDepositRefund, verifyPayment } from '../controllers/payments.js';

const router = Router();

// Razorpay signs the raw request body. This endpoint is intentionally public;
// authenticity is established by the provider HMAC, not a student session.
router.post('/webhook/razorpay', razorpayWebhook);
router.get('/policy', paymentPolicy);

router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted);
router.post('/orders', createPaymentOrder);
router.post('/verify', verifyPayment);
router.post('/refunds/:bookingId', requestDepositRefund);

export default router;
