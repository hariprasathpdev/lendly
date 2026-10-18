import { z } from 'zod';

export const paymentOrderSchema = z.object({ bookingId: z.string().uuid() }).strict();

export const paymentVerificationSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const refundReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'issued', 'failed']),
  providerReference: z.string().regex(/^rfnd_[A-Za-z0-9]+$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'issued' && !value.providerReference) {
    context.addIssue({ code: 'custom', path: ['providerReference'], message: 'Enter the Razorpay refund reference after issuing it in the test dashboard.' });
  }
  if (value.action !== 'issued' && value.providerReference) {
    context.addIssue({ code: 'custom', path: ['providerReference'], message: 'A provider reference is only accepted when marking a refund issued.' });
  }
});
