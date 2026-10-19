# Operational readiness

Before release, assign an operator for student reports, disputes, overdue bookings, security events, account-closure requests, and backup recovery. Publish a monitored campus support contact and response hours. Draft legal pages are not a substitute for these operating decisions.

## Backups and recovery

- Confirm the selected Supabase plan's backup frequency, retention, point-in-time recovery availability, and restore procedure in the provider dashboard.
- Restrict backup access to named operators and store any exports in an approved, encrypted location with access logging.
- Before a migration or material release, record the current migration revision and confirm a recent backup is available.
- Test a restore into a separate non-production project. Verify login, profile and listing reads, booking and payment references, private-photo access, and RLS behavior before treating the restore as usable.
- Record the test date, restored revision, checks performed, failures, and operator. Do not test by resetting or overwriting production data.

## Incident handling

1. Record the time, affected service, observed impact, and person responding in the restricted incident log. Do not copy secrets, tokens, or unnecessary student data into incident notes.
2. For suspected account or credential compromise, contain access through the relevant provider controls, revoke affected sessions where appropriate, and rotate server-side secrets using the provider's supported process.
3. Preserve the minimal logs and database records needed to investigate. Restrict access while the incident is open.
4. If data integrity or availability is affected, follow the tested restore procedure and verify the restored application before reopening affected workflows.
5. Have the campus privacy/legal contact decide any student, college, provider, or authority notifications and their timing under the applicable policy.
6. Document the cause, impact, containment, recovery, follow-up owner, and completion date. Review the follow-up before closing the incident.

The security event queue detects only denied admin API access by verified students and failed checkout signature checks. It is not a monitoring or alerting service. Configure uptime and error monitoring separately, redact authorization headers and request bodies, and assign a person to review alerts and the admin security queue.

## Data retention

Complete the category-specific periods, deletion owner, and account-closure workflow in [data-retention.md](data-retention.md) with the college before collecting real student data. The current app does not automatically delete or anonymize records.

## Overdue scheduler

The Render Blueprint provisions a daily Cron job for `POST /api/v1/internal/overdue/run`. It uses a generated `CRON_SECRET` shared with the API over the same-region private network. For other hosts, configure the same secret (at least 32 random characters) in the backend and scheduler. The endpoint requires the Supabase service-role connection and applies an idempotent database function. It sends in-app reminders and records separate daily late-fee calculations for review. It does not collect or charge late fees. Deploy and verify the scheduler only after the database migration is applied.
