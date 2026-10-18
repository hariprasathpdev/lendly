import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmacHex, toMinorUnits, verifyCheckoutSignature, verifyHmacHex } from '../src/utils/payment-security.js';
import { refundReviewSchema } from '../src/validators/payments.js';

test('Razorpay checkout signature is bound to the order and payment ids', () => {
  const secret = 'test-secret';
  const signature = createHmacHex('order_test123|pay_test456', secret);
  assert.equal(verifyCheckoutSignature('order_test123', 'pay_test456', signature, secret), true);
  assert.equal(verifyCheckoutSignature('order_other', 'pay_test456', signature, secret), false);
  assert.equal(verifyHmacHex('order_test123|pay_test456', 'not-a-signature', secret), false);
});

test('webhook signature uses the exact request body bytes', () => {
  const secret = 'webhook-test-secret';
  const body = '{"event":"payment.captured"}';
  const signature = createHmacHex(body, secret);
  assert.equal(verifyHmacHex(body, signature, secret), true);
  assert.equal(verifyHmacHex('{ "event":"payment.captured"}', signature, secret), false);
});

test('Rupee totals convert to integer paise without losing precision', () => {
  assert.equal(toMinorUnits(129.35), 12935);
  assert.throws(() => toMinorUnits(-1), TypeError);
});

test('refund status updates require an issued provider reference only after provider issuance', () => {
  assert.equal(refundReviewSchema.safeParse({ action: 'approve' }).success, true);
  assert.equal(refundReviewSchema.safeParse({ action: 'issued' }).success, false);
  assert.equal(refundReviewSchema.safeParse({ action: 'issued', providerReference: 'rfnd_test123' }).success, true);
  assert.equal(refundReviewSchema.safeParse({ action: 'reject', providerReference: 'rfnd_test123' }).success, false);
});
