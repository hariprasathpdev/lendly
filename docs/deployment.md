# Deployment guide

Deployment is not configured or verified. Supabase, hosting, domain, email, and payment accounts require owner credentials.

1. Create a Supabase project. Copy its project URL and public anon key into the browser environment; keep the service-role key and database password only in server secret settings.
2. Run migrations from the repository root: `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, and `npx supabase db push`.
3. In Supabase Auth, set the production Site URL and allowlisted callback URLs. Enable email confirmation. Configure a real SMTP provider before relying on signup or recovery messages.
4. Set `ALLOWED_EMAIL_DOMAINS=kongu.edu` (or approved comma-separated domains) and the exact production web origin in the backend's `CLIENT_ORIGINS` secret.
5. Deploy `server` to a Node.js host. Set backend variables in that host's secret manager. Set the health check path to `/api/v1/health`.
6. Deploy `client` to Vercel. Set `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` as build variables. Build command: `npm run build --workspace client`; output directory: `client/dist`.
7. Add the final HTTPS web URL to Supabase Auth redirects and backend `CLIENT_ORIGINS`. Verify sign-up, verification, recovery, API health, persistence, uploads, private authorization, and mobile/desktop layouts before launch.

## Overdue reminders

Configure `OVERDUE_GRACE_DAYS` in the backend environment (default `1`) and generate a random `CRON_SECRET` with at least 32 characters. Configure the same secret in a scheduler that can send an authenticated HTTP request. Run `POST https://YOUR_API_HOST/api/v1/internal/overdue/run` once per day with `Authorization: Bearer <CRON_SECRET>`. Keep the secret in the backend and scheduler secret stores; never put it in the frontend or a checked-in workflow file. The endpoint returns 503 until both the secret and Supabase service-role connection are configured. Verify its response and the resulting in-app notifications after applying migration `202610180008_reports_overdue.sql`.

The job is idempotent for each booking and date. A later run fills any missing per-day fee calculation records. Reminders are in-app only, are emitted once for each successful job date, and no late fee is automatically collected. Administrators can review and waive fee records in the dashboard.

## Payment provider test setup

The default `PAYMENT_MODE=demo` records booking confirmation without processing money. To test Razorpay, set `PAYMENT_MODE=razorpay_test` and configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the backend secret manager. Use a Razorpay test key (`rzp_test_...`) and the matching webhook secret. Never configure live keys; this application deliberately has no live payment mode.

In Razorpay test mode, create a webhook to `https://YOUR_API_HOST/api/v1/payments/webhook/razorpay`, configure the same webhook secret on the backend, and subscribe to `payment.authorized`, `payment.captured`, and `payment.failed`. Configure automatic capture in the test account. The app also verifies checkout callback signatures and fetches payment status server-side before confirming the booking. Test with non-production data only.

For deposit refunds, the borrower requests a refund after the booking is completed. An administrator reviews the request, issues the partial refund in Razorpay's test dashboard, then records the resulting `rfnd_` reference at `/admin/refunds`. Approval alone does not update the deposit to refunded. Test this path with a sandbox payment before relying on the records.

No live payment, escrow, deposit hold, or automatic late-fee collection is implemented. No service credentials or production URL have been provided, so database application, Razorpay checkout/webhook behavior, refund behavior, and deployment remain unverified.
