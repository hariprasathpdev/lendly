# Deployment guide

Deployment is not configured or verified. Supabase, hosting, domain, email, and payment accounts require owner credentials. `render.yaml` defines the API service and `vercel.json` configures the client build, SPA routes, and browser security headers. These files prepare deployment; adding the repository to either host and supplying credentials still requires access to the owner's account. See the [Render Blueprint reference](https://render.com/docs/blueprint-spec) and [Vercel project configuration reference](https://vercel.com/docs/project-configuration/vercel-json) if host settings change.

Before creating Render resources, install the [Render CLI](https://render.com/docs/cli) and run `render blueprints validate render.yaml` from the repository root. This validates the Blueprint structure without creating services.

1. Create a Supabase project. Keep the service-role key and database password private; only the project URL and anon key are public browser configuration.
2. From PowerShell in the repository root, apply the reviewed migrations to the intended hosted project:

   ```powershell
   cd E:\Engineering_Year2\Career_Development\Projects\Lendly
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Check the project ref before `db push`. The local `supabase db reset` command recreates the selected local database and must not be used against production.
3. In Supabase Auth, set the production Site URL and allowlisted callback URLs. Enable email confirmation. Configure a real SMTP provider before relying on signup or recovery messages.
4. In Render, create a Blueprint from this repository and select `render.yaml`. Set the prompted server-only Supabase values. Render prompts for `sync: false` values on initial creation; add any later secret values through the service's Environment settings. After Vercel creates the frontend URL, set `CLIENT_ORIGINS` to that exact HTTPS origin. Keep `PAYMENT_MODE=demo` until test credentials are intentionally configured. The manifest selects the Singapore Starter web-service plan; review the host's current pricing before creating it.
5. In Vercel, import this repository with the repository root as the project root. `vercel.json` uses the npm workspace lockfile, builds the client, serves `client/dist`, and routes client-side pages to the SPA entry point. Configure these build-time values:

   ```text
   VITE_API_URL=https://YOUR_RENDER_SERVICE.onrender.com/api/v1
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   ```

6. Add the final Vercel HTTPS URL to Supabase Auth's Site URL and redirect allowlist, including `/auth/callback` and `/reset-password`. Add the same origin to Render's `CLIENT_ORIGINS` setting, then redeploy the API.
7. Verify the deployed health route from PowerShell:

   ```powershell
   Invoke-WebRequest https://YOUR_RENDER_SERVICE.onrender.com/api/v1/health
   ```

   Then verify sign-up, email verification, recovery, persistence, private uploads and authorization, booking conflicts, admin access, and mobile/desktop layouts with separate test accounts before launch.

## Overdue reminders

The Render Blueprint includes a daily Cron service scheduled for 00:00 UTC. It sends the request over Render's private network and receives the same generated `CRON_SECRET` as the API service. The job exits nonzero on an API error, so failures appear in the Cron run history. Confirm `OVERDUE_GRACE_DAYS` (default `1`) before use, and verify the run and resulting in-app notifications after applying migration `202610180008_reports_overdue.sql`. Render Cron services are billed separately with a minimum monthly charge; confirm the current [Cron job pricing](https://render.com/docs/cronjobs#compute-plans-and-billing) before creating the Blueprint.

For another hosting platform, set a random `CRON_SECRET` with at least 32 characters in the API and the scheduler. Call `POST https://YOUR_API_HOST/api/v1/internal/overdue/run` once per day with `Authorization: Bearer <CRON_SECRET>`. Keep the secret only in the backend and scheduler secret stores, never in the frontend or a checked-in workflow file. The endpoint returns 503 until the secret and Supabase service-role connection are configured.

The database operation is idempotent for each booking and date. A later run fills any missing per-day fee calculation records. Reminders are in-app only, are emitted once for each successful job date, and no late fee is automatically collected. Administrators can review and waive fee records in the dashboard.

## Payment provider test setup

The default `PAYMENT_MODE=demo` records booking confirmation without processing money. To test Razorpay, set `PAYMENT_MODE=razorpay_test` and configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the backend secret manager. Use a Razorpay test key (`rzp_test_...`) and the matching webhook secret. Never configure live keys; this application deliberately has no live payment mode.

In Razorpay test mode, create a webhook to `https://YOUR_API_HOST/api/v1/payments/webhook/razorpay`, configure the same webhook secret on the backend, and subscribe to `payment.authorized`, `payment.captured`, and `payment.failed`. Configure automatic capture in the test account. The app also verifies checkout callback signatures and fetches payment status server-side before confirming the booking. Test with non-production data only.

For deposit refunds, the borrower requests a refund after the booking is completed. An administrator reviews the request, issues the partial refund in Razorpay's test dashboard, then records the resulting `rfnd_` reference at `/admin/refunds`. Approval alone does not update the deposit to refunded. Test this path with a sandbox payment before relying on the records.

All 10 migration files were accepted in order by a disposable PostgreSQL 18 instance with minimal Auth/Storage compatibility schemas, but no Supabase project has received them and provider-specific policies remain unverified. No live payment, escrow, deposit hold, or automatic late-fee collection is implemented. No service credentials or production URL have been provided, so Razorpay checkout/webhook behavior, refund behavior, and deployment remain unverified.
