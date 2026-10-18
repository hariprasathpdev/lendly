# Operational readiness

Before release, name an operator for reviewing reports and disputes, checking overdue bookings, responding to security issues, and restoring database backups. Test a backup restore, define data-retention and account deletion, configure uptime/error monitoring that redacts secrets, and publish a support contact.

The app exposes `POST /api/v1/internal/overdue/run` for a daily external scheduler. Configure `CRON_SECRET` (at least 32 random characters) in the backend secret store and the scheduler, then set `OVERDUE_GRACE_DAYS` to the agreed policy. Send `Authorization: Bearer <CRON_SECRET>`. The endpoint requires the Supabase service-role connection and applies an idempotent database function. It sends in-app reminders and records separate daily late-fee calculations for review. It does not collect or charge late fees. Configure and verify the scheduler after the database migration is applied.
