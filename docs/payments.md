# Payment and deposit workflow

## Payment modes

Set `PAYMENT_MODE` in the server environment:

- `demo` (default) records a simulation, confirms the accepted booking, and clearly reports that no money was collected.
- `disabled` lets the borrower confirm without a payment step.
- `razorpay_test` creates Razorpay test orders from the backend. It requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. The key ID must start with `rzp_test_`; all values are server-only.

The browser receives the public test key ID and server-created order ID. It never receives the key secret or webhook secret. Amounts are calculated from the saved booking record and sent to Razorpay in paise. The server verifies the checkout HMAC, fetches the payment from Razorpay, and confirms only a captured payment. Configure automatic capture in the Razorpay test account before testing this flow. The integration follows Razorpay's [test integration steps](https://razorpay.com/docs/server-integration/python/test-app/) and [webhook signature guidance](https://razorpay.com/docs/webhooks/validate-test/).

## Configure sandbox checkout

1. Add the three test credentials to `server/.env` or the backend host's secret manager. Do not paste them into `client/.env`.
2. Set `PAYMENT_MODE=razorpay_test` and restart the backend. An amount below ₹1 remains eligible for demo mode but cannot be sent through Razorpay test checkout.
3. Add a Razorpay test webhook for `https://YOUR_API_HOST/api/v1/payments/webhook/razorpay`. Use the exact same webhook secret in `RAZORPAY_WEBHOOK_SECRET` and subscribe to `payment.authorized`, `payment.captured`, and `payment.failed`.
4. Create an accepted booking worth at least ₹1 and use the payment action on the Bookings page. Verify the status changes only after provider confirmation.

Webhook requests preserve their raw JSON bytes for signature verification. The API stores provider event IDs and ignores duplicate events. Payment records contain provider references and statuses only; card details are never collected or stored by Lendly.

## Deposit refunds

After a Razorpay test booking is completed, the borrower can request a refund of the listed deposit. The request creates a separate `refunds` record and sets the deposit to `refund_requested`. An administrator reviews the request at `/admin/refunds`.

Approval does not issue money. The operator must issue the **partial deposit amount** for the matching payment in the Razorpay test dashboard. Then the operator records the resulting `rfnd_` reference in Lendly. Only that final step sets the deposit status to `refunded`. Rejected and failed requests remain auditable. Demo payments cannot be refunded because they never collected money.

There is no live payment mode, escrow, automatic deposit capture/refund service, or late-fee collection. Database functions, provider checkout, webhook delivery, and refund processing still need to be validated with an applied migration and owner-provided test credentials.
