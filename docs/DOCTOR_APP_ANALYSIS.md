# Doctor Appointment App — codebase analysis and permanent handoff

> Reviewed: **2026-10-16**. Source: `IbrahimEldidamony96/doctor-appointment-app`, branch `main`, commit **`111c04bf7a9c91ca2149c8b912f39b0a2767e6e0`** (2026-10-09, "styled app").
> **Scope:** Static source-code review through GitHub connector; files and migrations inspected. **No build, runtime, provider sandbox, or database migration execution was performed.** Findings must be retested against a deployed environment and any newer commit.
> **Purpose:** Stable reference for future ChatGPT/Codex sessions; do not treat this file as executable truth after the source commit changes. No application logic was changed by this report.

> **Historical authentication snapshot:** This report describes the source commit above, including Clerk and the old patient cookie. Current sign-in uses WhatsApp OTP for patients and approved clinic staff. Use [WhatsApp authentication setup](WHATSAPP_AUTH.md) for migration, owner provisioning, sessions and permissions; do not follow this report's old authentication setup.

## Executive summary

A single-clinic Arabic/RTL scheduling application ("موعد") with separate doctor and patient authentication. It contains working application surface area for patients to log in using WhatsApp OTP, view/book/cancel appointments, initiate Paymob payment, update a profile and submit reviews, plus a Clerk-based doctor dashboard for status/availability/settings/review moderation/stats. The database migrations demonstrate a more mature, transactional design than the current runtime integrations: important atomic SQL functions are **present but not invoked** by the corresponding server actions and routes.

**Release assessment: NOT PRODUCTION READY** for patient payments/OTP until critical integration, webhook correlation, and booking/reminder issues are addressed. This is a code review verdict, not a live exploit or passed/failed build result.

## 1. Stack and project map

- Next.js **16.3.6**, React **19.2.8**, TypeScript, App Router and Server Actions, Tailwind CSS 4, shadcn-style local UI components, `lucide-react`, `zod`.
- Database: Supabase Postgres, custom `clinic` schema, service-role access only on server, RLS deny-by-default for anon/authenticated.
- Doctor login: Clerk `/sign-in`; `proxy.ts` protects `/dashboard*`, plus Clerk user-ID allowlist `DOCTOR_CLERK_USER_IDS` checked again in doctor actions and pages.
- Patient login: `/login` -> `/api/otp/send` -> `/verify` -> `/api/otp/verify` -> signed 30-day HttpOnly `patient_session` cookie.
- External: WhatsApp Cloud API for OTP and notifications; Resend for email; Paymob Intention API and webhook; `/api/cron/reminders` for appointment reminders.
- Important paths:
  - `app/(patient)/*`: public/patient pages. `app/(doctor)/dashboard/*`: doctor pages.
  - `actions/appointments.ts`, `actions/payments.ts`, `actions/reviews.ts`, `actions/doctor-*.ts`: business mutations.
  - `app/api/otp/*`, `app/api/webhooks/paymob/route.ts`, `app/api/cron/reminders/route.ts`: backend endpoints.
  - `lib/auth/*`, `lib/availability.ts`, `lib/availability-slots.ts`, `lib/clinic-time.ts`, `lib/paymob.ts`, `lib/supabase/*`: cross-cutting logic.
  - `supabase/migrations/*`: database contract, RLS, constraints and atomic RPCs.
  - `tests/*`: unit/database tests expressing a **newer desired contract** than much of the runtime code.

## 2. Domain model / trust boundaries

Tables: `patients` (phone identity), `otp_codes`, `availability` (weekly templates), `blocked_dates` (exceptions), `appointments` (patient/date/interval/status), `payments` (many attempts per appointment), `reviews`, and singleton `settings`.

Appointment status: `pending -> confirmed -> completed | no_show`; `pending|confirmed -> cancelled`. SQL trigger enforces allowed transitions and prevents completion/no-show before the visit starts. An active-slot unique index and PostgreSQL GiST exclusion constraint prevent conflicting pending/confirmed appointment intervals. Reviews have one-per-appointment uniqueness plus a DB trigger requiring a completed appointment belonging to the reviewing patient.

All application writes use a **service-role Supabase client** (`lib/supabase/server.ts`), so **RLS is not the authorization layer for server-side requests**. Every server action / route handler must independently check identity and scope access. Patient session is a signed custom JWT, doctor identity comes from Clerk. A compromised server key bypasses RLS; it must never reach client bundles.

## 3. Actual end-to-end flows

### Patient OTP
1. `components/patient/login-form.tsx` posts an E.164 phone to `app/api/otp/send/route.ts`.
2. Route looks up recent OTP row and applies a 60s non-atomic cooldown, then calls `lib/auth/otp.ts::sendOtp`.
3. `sendOtp` inserts an HMAC-SHA256 code hash, then sends free-form WhatsApp text.
4. `components/patient/verify-form.tsx` posts phone and six digits to `app/api/otp/verify/route.ts`.
5. `verifyOtp` fetches the latest row, checks expiry/attempts, increments attempts or deletes row, then route fetches/creates patient and issues a `jose` JWT cookie.
6. `proxy.ts` protects `/book`, `/my-appointments`, `/payment`, `/profile`; server actions independently call `getPatientSession`.

**Intended but unused:** `clinic.issue_otp` and `clinic.verify_otp` in `20261004162647_atomic_patient_otp.sql` use transaction-level advisory locks, consumed codes and send budgets, and prevent concurrent double consumption.

### Booking / cancellation
1. `app/(patient)/book/page.tsx` calls `lib/availability.ts::getAvailableSlots` and supplies results to `BookingForm`.
2. `BookingForm` calls `actions/appointments.ts::createAppointment` with date/start/end/name/email/reason.
3. Action validates Zod shape and patient cookie, directly `insert`s appointment, then separately updates patient profile and sends best-effort notifications.
4. PostgreSQL `validate_appointment` trigger independently rejects invalid windows/schedules/blocked dates/overlaps.
5. `cancelAppointment` checks a locally computed notice period, then directly changes the row.

**Intended but unused:** `clinic.create_patient_appointment` (atomic profile + booking + validated patient name) and `clinic.cancel_patient_appointment` (row lock + database-time Cairo cancellation check) in `20261004162726_booking_integrity.sql`.

### Doctor
Clerk `auth()` + `isAuthorizedDoctor` protect pages and doctor mutations. Dashboard can view today/upcoming appointments, change statuses, manage availability and blocked dates, publish/hide reviews, update clinic settings, and read `get_dashboard_stats` RPC.

### Payment
1. `actions/payments.ts::initiatePayment` checks patient ownership and a prior paid row, inserts a **new pending** payment, requests a Paymob Intention, stores its intention ID in `payments.transaction_id`, returns checkout URL.
2. `app/api/webhooks/paymob/route.ts` verifies Paymob HMAC and looks up the payment via `obj.order?.merchant_order_id ?? obj.merchant_order_id`. It directly overwrites payment status and optionally confirms a pending appointment.

**Intended but unused:** `clinic.begin_payment_attempt` serializes attempts, and `clinic.apply_paymob_transaction` correlates via **signed provider order ID**, checks amount/currency and handles replay/idempotency in `20261004162758_payment_and_reminder_integrity.sql`.

### Reminder
`/api/cron/reminders` checks `Authorization: Bearer CRON_SECRET`, scans confirmed appointments, sends text, then separately marks `reminder_sent_at`. A newer `clinic.claim_appointment_reminders` leasing RPC exists but is not used.

## 4. Prioritized findings and evidence

| ID | Severity | Evidence | Finding / impact |
| --- | --- | --- | --- |
| **P0-01** | Critical | `app/api/webhooks/paymob/route.ts`, `lib/paymob.ts`; SQL `apply_paymob_transaction` | **Webhook correlation relies on a merchant reference not among the HMAC-signed 20 fields.** A valid signed transaction's unsigned merchant reference may be substituted/replayed, potentially crediting another payment. Never use unsigned merchant reference as authority; correlate signed `obj.order.id` against persisted `provider_order_id`, verify expected amount/currency, and invoke atomic settlement RPC. Reproduce against Paymob sandbox before launch. |
| **P0-02** | Critical | `lib/auth/otp.ts`, `app/api/otp/send/route.ts`, `app/api/otp/verify/route.ts`; SQL `issue_otp`, `verify_otp` | Runtime OTP increments attempts and consumes rows through separate read/update/delete operations. Concurrent verifications can pass the same code or race attempt limits. Deletion loses cooldown history; the route's read-before-insert cooldown can race. Wire atomic OTP RPCs; handle issuance/send failures and platform-level abuse limits. |
| **P1-01** | High | `actions/payments.ts`; `app/api/webhooks/paymob/route.ts`; SQL `begin_payment_attempt` | Payment initiation has a check-then-insert race creating multiple pending attempts. Webhook unconditionally updates status, so delayed failure can downgrade a paid payment; doesn't check signed amount/currency or settled status. Wire both payment RPCs and enforce unique signed order binding. |
| **P1-02** | High | `actions/appointments.ts::cancelAppointment`, SQL `cancel_patient_appointment` | Cancellation uses `new Date('YYYY-MM-DDTHH:mm:ss')` interpreted in **server-local time**, not necessarily `Africa/Cairo`. Its prior read and later direct update are non-atomic. This can allow/deny cancellations incorrectly, especially near DST/deadline. Use Cairo-aware transactional cancellation RPC. |
| **P1-03** | High | `lib/availability.ts`, `actions/availability.ts`, `lib/availability-slots.ts`, `lib/clinic-time.ts` | The live slot generator uses mixed UTC ISO dates and local times, checks only matching start times (not interval overlap) and accepts unbounded `days`/arbitrary dates via a public Server Action. A better Cairo/DST-aware `generateAvailableSlots` exists but is unused. Cap horizon, validate input, use the shared generator and overlap checks. |
| **P1-04** | High | `app/api/cron/reminders/route.ts`; SQL `claim_appointment_reminders` | Reminder sends are not leased: overlapping cron runs can send duplicates. Date/time handling again depends on UTC/server local timezone; marking the reminder is not conditioned on a claim token and update failures are ignored. Use claim/lease RPC and atomic acknowledgement, plus a compliant WhatsApp reminder template. |
| **P1-05** | High | `lib/whatsapp.ts`, `README.md` | OTP and reminders use WhatsApp free-form text. The repository itself says approved authentication templates are required outside allowed service windows; production login may fail. Implement approved templates, delivery handling and retry policy. |
| **P1-06** | High | `lib/auth/doctor.ts`, `lib/auth/doctor-access.ts`; `tests/auth.test.ts` | `doctor.ts` imports **`isDoctorUser`** but `doctor-access.ts` only exports **`isAuthorizedDoctor`**; tests also import the missing name. This is a concrete TypeScript module mismatch; build/typecheck is expected to fail. |
| **P1-07** | High | `tests/auth.test.ts`, `tests/paymob.test.ts`, `tests/configuration.test.ts`, `lib/auth/patient-jwt.ts`, `lib/paymob.ts`, `lib/resend.ts`, `lib/supabase/client.ts` | Tests target absent APIs: `isDoctorUser`, `isPaymobConfigured`, `isSettledPayment`, `escapeHtml`; JWT tests require `iss/aud/iat/exp` rules not implemented; client tests expect browser key validation not implemented. Tests and runtime are on **different revisions/contracts**. |
| **P2-01** | Medium | `types/database.ts`, `lib/supabase/database.types.ts`, `lib/supabase/server.ts` | **Two database type definitions.** Active Supabase clients import older `types/database.ts`, which omits newer migration columns and RPCs even though `lib/supabase/database.types.ts` contains them. Standardize and regenerate types from deployed schema. |
| **P2-02** | Medium | `package.json`, `tests/helpers/database.ts` | Repository has `tests/*.test.ts`, but no `test` script or explicit `@electric-sql/pglite` dev dependency. Tests cannot be assumed runnable via `npm test`. Add a documented TS test runner and dependencies. |
| **P2-03** | Medium | `app/api/otp/send/route.ts`, `app/api/otp/verify/route.ts`; `tests/auth.test.ts` | `await req.json()` is not guarded for invalid JSON/content-type. Tests expect HTTP 400/415 but current implementation does not explicitly produce them. Handle malformed/unsupported content types and do not leak service errors. |
| **P2-04** | Medium | `lib/resend.ts`; `tests/paymob.test.ts` | Name is interpolated into email HTML without escaping. Tests expect an `escapeHtml` helper that does not exist. Escape untrusted text in HTML email templates. |
| **P2-05** | Medium | `actions/doctor-appointments.ts`, `components/doctor/appointment-actions.tsx`, `actions/doctor-availability.ts` | Some status/availability mutations do not surface database errors properly to UI; some do not validate UUIDs or affected row count. DB triggers protect transitions, but user feedback and reconciliation are weak. |
| **P2-06** | Medium | `README.md`, repository tree | README refers to `vercel.json` cron schedule, but the inspected tree contains **no `vercel.json`**. The reminder handler exists, yet deployment scheduling is not evidenced here. |
| **P2-07** | Medium | `lib/auth/patient-jwt.ts`, `tests/auth.test.ts` | Token verification checks signature/algorithm and basic string fields, but does not enforce a fixed issuer/audience, mandatory issued-at, bounded lifetime, strict phone/UUID shape or a minimum 32-byte secret. Session revocation is not represented (30-day stateless cookie). Harden the JWT contract before launch. |
| **P2-08** | Medium | `app/(patient)/book/page.tsx`, `actions/appointments.ts`, SQL `create_patient_appointment` | App updates the patient name/email **after** booking, rather than in the same transaction; a direct Server Action caller can omit the UI-required patient name, bypassing the name guard implemented in the unused booking RPC. |
| **P3-01** | Low | `app/(doctor)/dashboard/appointments/page.tsx`, `app/(patient)/my-appointments/page.tsx` | Upcoming/appointment listing is unpaginated and one page calculates today using UTC; add paging/filtering and consistently use clinic local date. |

**Severity is risk-based and based on source inspection, not demonstrated production exploitation.** For all webhooks, verify actual Paymob event shape and signature details in an isolated sandbox.

## 5. Architectural strengths

1. Clear separation of doctor (Clerk) vs patient (signed JWT) identities, with explicit doctor allowlist; authorization rechecked in doctor server actions.
2. Supabase schema deny-by-default RLS for public clients and `server-only` service-role module.
3. Domain-level PostgreSQL checks, exclusion constraint for overlapping appointments, valid transition trigger and review ownership guard.
4. Existing SQL RPCs for serialized OTP issuance/verification, booking, cancellation and Paymob settlement are a solid foundation **if wired into the runtime**.
5. Cairo-specific date/DST helper and pure slot generator already exist; unit tests cover DST and interval collision cases.
6. Best-effort notifications decouple a completed booking from email/WhatsApp availability, though delivery observability needs improvement.
7. Patient interface in Arabic/RTL and shared doctor dashboard navigation; Zod validation present across several mutations.

## 6. Immediate remediation plan (order matters)

**Phase A — stop unsafe production flows**
1. Freeze real payment and OTP launch until sandbox verification. Keep secrets server-side and rotate any accidentally shared credential.
2. Fix `isDoctorUser`/`isAuthorizedDoctor` import mismatch; reconcile test/runtime module exports; resolve actual `tsc`/ESLint output.
3. Align `lib/supabase/server.ts` + browser client to one generated type file reflecting *all* migrations.
4. Wire OTP routes to `clinic.issue_otp` / `clinic.verify_otp`, add JSON validation, bounded rate limits (phone+IP/abuse control), and Meta-approved OTP templates.
5. Wire `initiatePayment` to `clinic.begin_payment_attempt`; persist Paymob `provider_order_id` **from the provider**, `intention_id` and `checkout_url` separately. Ensure retries reuse a valid attempt.
6. In callback, validate HMAC + success/settled flags and **signed order ID**, ensure signed amount/currency match, call `clinic.apply_paymob_transaction`, make retries idempotent and log correlation IDs without sensitive data.

**Phase B — booking/time correctness**
7. Wire `createAppointment` to `clinic.create_patient_appointment` and `cancelAppointment` to `clinic.cancel_patient_appointment`. Map SQL constraint errors to API outcomes (invalid slot, blocked, stale, outside window).
8. Replace live `lib/availability.ts` ad-hoc calculation with the tested `generateAvailableSlots`, with Cairo date handling, overlapping-interval logic, normalized input, and bounded window.
9. Adopt `clinic.claim_appointment_reminders` and token-based acknowledgement of sends; define failure/retry/max-attempt behavior. Set up scheduling through the chosen host.
10. Make doctor status actions return meaningful transition errors; add pagination and filtered date ranges.

**Phase C — production hardening**
11. Escape email HTML, normalize/validate all user input, centralize audit/error logging and provider request timeouts.
12. Add approved WhatsApp reminder/doctor notification templates and webhook delivery telemetry.
13. Reconcile test dependencies and test runner; add integration tests that call **live route/action boundaries** (not only SQL functions).
14. Validate prod env with `node scripts/check-env.mjs --production`; confirm schema migrations, exposed schema, role grants, billing webhook and cron secrets.
15. Add a deploy runbook (environment, migrations, rollback, webhooks, retries, backups, monitoring, GDPR/local data policies appropriate to patient information).

## 7. Testing matrix to run after fixes

- **Auth:** malformed JSON/content-type, invalid phone, OTP cooldown/hour/day budget, simultaneous right/wrong OTPs, replay, expired OTP, failed WhatsApp delivery, JWT expiration/issuer/audience, patient soft-deletion, doctor allowlist denial, CSRF/cookie policies.
- **Appointments:** two concurrent bookings of identical/partially overlapping slots, schedule edits during booking, blocked full/partial dates, invalid date/time/length, concurrent cancellation vs confirmation, clinic-time deadline and DST changes.
- **Payments:** replay of signed callback, altered merchant reference, altered signed order ID/amount, two simultaneous starts, delayed failure after success, captured vs pending/voided/refunded, cancelled appointment charged, mismatched currency, retries/timeouts, no duplicate appointment confirmation.
- **Reminders:** concurrent workers, delayed WhatsApp request, DB acknowledgment failure, lease expiry/claim retries, Cairo DST and 24h cutoff, 429/retry behavior.
- **Ops:** `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, configured test runner; migration up/down in a scratch database. These were **not run during this analysis**.

## 8. How to resume without rereading the whole repo

Use this handoff for orientation, **but verify the exact files touched since the recorded commit**:

> Open `docs/DOCTOR_APP_ANALYSIS.md`. Baseline commit: `111c04bf7a9c91ca2149c8b912f39b0a2767e6e0`. Compare HEAD to baseline and inspect only the changed or relevant source files. Tell me which findings remain, then help with the specific feature/fix. Do not assume report findings are current if code changed.

Suggested future tasks:
- "Fix P0-01 Paymob webhook correlation and add replay tests."
- "Trace patient login/OTP end-to-end with actual code, SQL locks, threat models."
- "Update this analysis report after comparing main against the baseline SHA."
- "Explain the doctor and patient authorization boundaries at advanced backend level."

### Reference entry points
- Repository: https://github.com/IbrahimEldidamony96/doctor-appointment-app
- Source snapshot: https://github.com/IbrahimEldidamony96/doctor-appointment-app/commit/111c04bf7a9c91ca2149c8b912f39b0a2767e6e0
- Migrations: https://github.com/IbrahimEldidamony96/doctor-appointment-app/tree/main/supabase/migrations
- Auth: https://github.com/IbrahimEldidamony96/doctor-appointment-app/tree/main/lib/auth
- Actions: https://github.com/IbrahimEldidamony96/doctor-appointment-app/tree/main/actions
- Tests: https://github.com/IbrahimEldidamony96/doctor-appointment-app/tree/main/tests

**Maintenance policy:** Whenever significant source changes land, update the review date, baseline SHA, resolved finding IDs, new risks and test status. Keep this file free of credentials and patient data.
