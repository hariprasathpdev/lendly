# Security

## Current controls

- Supabase Auth owns passwords, verification, and recovery. No passwords are stored by Lendly.
- The API verifies Supabase access tokens with `auth.getUser` before protected routes.
- Verified college email and exact allowlisted domain checks are required for account operations.
- Account creation is also checked by the database trigger: a valid full name and explicit Terms/Privacy acceptance are required, and the acceptance time is assigned by PostgreSQL rather than taken from browser metadata. Email changes must map to the account's original active college domain; changes to an unapproved domain or a different campus are rolled back.
- The profile role is never accepted from registration input. The SQL grants ordinary users updates only to name and student ID.
- The admin middleware checks the server-side profile role for each protected admin router.
- Rejected admin API access by a verified student and failed checkout signature checks are recorded as campus-scoped security events. Repeated events are grouped per account and hour; administrators can review them through a role-checked, audited queue. The event records omit IP addresses, emails, tokens, and raw payment data.
- Admin data and decision routes are scoped to the administrator's college; database review functions repeat campus checks for report and fee decisions.
- Helmet, explicit environment-controlled CORS, a bounded JSON body, request rate limits, and centralized safe error responses are configured.
- PostgreSQL RLS is enabled on all application tables. Private objects are stored in a non-public bucket; no browser storage-write policies are present.
- Booking reads and actions are scoped to participants. The database calculates the total from listing prices, enforces same-campus and no-self-booking rules, and rejects overlapping accepted bookings.
- Reviews can be written once by a participant after a completed booking. Review history is visible only to signed-in students from the same campus.
- Conversation reads and writes check participation on the server. Messages are inserted with a database function that also creates the recipient notification.
- Admin listing review checks the role in both Express and the database function and writes an audit entry. Ordinary users cannot call the service-role functions.
- Campus administrators can archive an approved listing with an audited reason. The database function repeats the role and college checks and blocks removal while the listing has an open booking; no booking or financial row is deleted.
- Report creation validates verified account, campus, listing ownership, and booking participation in a database function. Report and late-fee decisions check the admin role in both Express and PostgreSQL and write audit records.
- The overdue endpoint requires a server-side random `CRON_SECRET` checked with a timing-safe comparison. It is not enabled until configured. Scheduled reminders and late-fee rows are idempotent and never initiate a charge.
- Private listing images use short-lived signed URLs; uploads validate MIME declarations against file signatures.
- The payment mode is server-controlled; demo mode cannot create real charges, and Razorpay mode requires a test key ID with the `rzp_test_` prefix. Checkout HMACs use constant-time comparison, payments are fetched from Razorpay before confirmation, webhook HMACs use raw request bytes, and event IDs are deduplicated in the database. No card data or provider secret is stored in the browser.
- A captured booking cannot be cancelled through the ordinary booking transition. Refund requests are limited to the borrower and captured test deposits after return completion. Admin approval is audited; a provider `rfnd_` reference must be recorded before deposit status changes to refunded. Refund issuance itself is still an operator action in the Razorpay test dashboard.
- Local payment signature and route tests do not verify the database functions, provider credentials, webhook delivery, checkout capture settings, or refund issuance. Those checks still require an applied migration and a configured Razorpay test account.

## First administrator

After signup and email confirmation, connect only from an operator workstation with the Supabase SQL editor or a secured `psql` session. Verify the account email and then run a narrowly scoped statement replacing the UUID with the verified account ID:

```sql
update public.profiles
set role = 'admin'
where id = 'VERIFIED-USER-UUID'
  and email_verified_at is not null;
```

Check the affected row count. This is an operator action, not a public registration path. Never place the service-role key in browser variables or commit it.

## Before real student use

The event queue covers only the two signals listed above; it is not intrusion detection, real-time alerting, or a replacement for hosting/database monitoring. The project still needs a deployment-specific security review, Supabase-specific migration/RLS/Auth/Storage verification, end-to-end account and privacy tests, monitoring, approved retention/deletion periods, a configured scheduler, and provider credentials. Do not use real student data until these controls and the remaining workflows have been verified.
