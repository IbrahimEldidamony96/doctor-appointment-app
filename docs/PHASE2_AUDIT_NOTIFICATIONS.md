# Phase 2 — Step 6: Appointment Audit & Notification Outbox

**GitHub branch:** `feature/phase2-06-audit-notification-outbox`  
**Base:** `feature/phase2-05-patient-management` (stacked on PR #6 → #5 → #4 → #3 → #2 → #1).  
**State:** Source code pushed only; no live migration applied and no successful TypeScript/Next.js build or PGlite run observed.

> **Historical phase handoff:** Clerk and separate patient-session references below describe this phase's original identity model. Current sign-in uses shared WhatsApp OTP; legacy staff records and audit references are retained during migration. See [WhatsApp authentication setup](WHATSAPP_AUTH.md) for current setup and permissions.

## What this step delivers

- New migration `20261017130000_appointment_audit_outbox.sql` adds RLS-protected `clinic.appointment_audit_events` and `clinic.notification_outbox` (both service-role only; the audit table is insert-only for the application service role).
- A database AFTER INSERT/UPDATE trigger records every appointment creation, status transition, move, and soft deletion with old/new status/date/time. It holds no clinical notes, PII, email or phone in the audit ledger. Trusted staff/patient/Paymob flows set an actor label within their existing atomic RPC; direct legacy service-role edits are labeled `system:unattributed`.
- For booking/confirmation/cancellation/rescheduling events, the trigger creates a **transactional email outbox record** if the patient has an email address. The same database transaction commits the appointment change + audit + outbox. Old pending/retry events for that visit are marked `suppressed` when a later change supersedes them.
- Staff status changes are now made through service-role-only `clinic.update_staff_appointment_status` instead of directly updating the table. The pre-existing status transition trigger remains in force.
- Server actions call `tryDeliverAppointmentNotifications` **after commit**, so normal activity attempts immediate sending. Failures do not make the saved booking appear unsuccessful.
- Worker `lib/notification-outbox.ts` claims up to 4 jobs with atomic PostgreSQL leases and `FOR UPDATE SKIP LOCKED`, sends through Resend with a stable **idempotency key per outbox ID**, ACKs with matching lease token, and schedules exponential-backoff retries (up to 5 attempts). A crashed fifth attempt gets marked dead on the next claim call. Missing API key is an explicit failure, never a fake successful notification.
- New protected endpoint `/api/cron/outbox` uses `CRON_SECRET`; Vercel Hobby cron runs it once daily at approximately 05:30 UTC, in addition to the existing once-daily WhatsApp reminder route. The cron provides **recovery**, not prompt near-real-time retry guarantees.
- New doctor-only dashboard `/dashboard/operations` displays the last 50 appointment events and last 50 notification jobs/statuses, without exposing patient email addresses or private visit notes.
- Pure message HTML rendering and event freshness checks have tests; PGlite regression fixtures cover audit attribution, supression, lease tokens/retries, reschedules and deny-by-default RLS.

## Reliability contract & limitations

**At least once, not exactly once.** A provider request may succeed and the ACK may fail. Resend's idempotency key prevents duplicate delivery for the provider's roughly **24-hour retention window**, but does not guarantee de-duplication forever. https://resend.com/changelog/idempotency-keys

**No transactional outbox for WhatsApp reminders, OTP, doctor WhatsApp alerts or Paymob webhooks in this step.** Existing WhatsApp reminders use a separate atomic lease workflow, and are still governed by Vercel Hobby's daily schedule. The new outbox is for appointment-related **email** events only.

**Best-effort suppression.** A worker that has already claimed and started sending may race with a later appointment move. The worker re-reads the current appointment before sending to reduce stale notifications, but an in-flight provider request cannot be recalled.

**Email acceptance is not delivery/open/read confirmation.** `sent` means Resend accepted it. The outbox does not handle provider delivery/bounce webhooks or permanently invalid email addresses.

**Operational requirements:** Configure valid `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, and `CRON_SECRET`. Back up the audit and queue tables; consider retention policies for PII-containing email payloads. Restrict provider API keys and routinely review the doctor-only operations dashboard. The default five-attempt policy can leave dead jobs requiring manual reconciliation.

**DB privilege boundary:** Every RPC is `SECURITY INVOKER` with empty search path and explicit grants to service_role. Access checking happens in Next.js via Clerk/custom patient JWT; never leak `SUPABASE_SERVICE_ROLE_KEY` to a browser or untrusted API. `clinic.event_actor` labels originate from internal service-role RPC callers and are not themselves an authorization mechanism.

## Test & staging rollout requirements

1. Apply all earlier SQL migrations **in order**, then `20261017130000_appointment_audit_outbox.sql` on **staging**, not the live database. The migration replaces existing business RPC definitions without changing their call signatures; review the diff before applying.
2. Run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the newly committed PGlite/pure-function tests. Prior GitHub Actions job runners failed before provisioning, so no green execution is claimed here.
3. Verify all audit events and mail enqueues commit atomically; database rollback produces neither outbox nor ledger rows. Exercise two concurrent claims, stale/wrong ACK, provider failure, provider success/ACK timeout, expired lease, fifth attempt and suppression on reschedule.
4. Manually test fresh patient booking, staff booking, confirmation, cancellation, reschedule, payment provider confirmation, archived patient, unsubscribed/malformed email, staff deactivation and unrelated clinic settings updates. Test doctor-only `/dashboard/operations` and unauthenticated/secretary access denial.
5. Configure the second daily cron in Vercel. For guaranteed faster retries and reminders, use a more frequent independent scheduler or a Vercel tier that supports hourly/minutely cron. Hobby cannot deliver this guarantee.
6. Add monitoring for jobs stuck in `retry` or `dead`, plus alerting. No notification success must be inferred from HTTP 200 alone.

## End of Phase 2

Steps delivered in source (not deployed): Secretary RBAC, Manual Booking, Reschedule, Calendar, Patient Management, Appointment Audit + Email Outbox. Production readiness still depends on validated builds, tests, migration deployment, provider sandbox runs and security review.
