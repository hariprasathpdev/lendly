import { createHmac, timingSafeEqual } from 'node:crypto';

export function toMinorUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new TypeError('Payment amount must be a non-negative number.');
  const minorUnits = Math.round(value * 100);
  if (Math.abs(value * 100 - minorUnits) > 0.000001) throw new TypeError('Payment amount has more than two decimal places.');
  return minorUnits;
}

export function createHmacHex(message, secret) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function verifyHmacHex(message, received, secret) {
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = Buffer.from(createHmacHex(message, secret), 'hex');
  const actual = Buffer.from(received, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyCheckoutSignature(orderId, paymentId, signature, secret) {
  return verifyHmacHex(`${orderId}|${paymentId}`, signature, secret);
}
