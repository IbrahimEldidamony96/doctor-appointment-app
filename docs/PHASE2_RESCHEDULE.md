# Phase 2 / Step 3 — Appointment Rescheduling

**Branch:** `feature/phase2-03-appointment-reschedule`  
**Base:** `feature/phase2-02-manual-booking` (stacked on PR #3 → PR #2 → PR #1).  
**Status:** Source changes committed to GitHub. **Not built, tested or deployed** in a runnable environment; no live SQL changes.

> **Historical phase handoff:** Clerk identity references below describe the original implementation. Current staff rescheduling uses shared WhatsApp OTP and active doctor, nurse or secretary permissions. See [WhatsApp authentication setup](WHATSAPP_AUTH.md) for current migration, setup and authorization behavior.

## Scope

This iteration implements rescheduling by an authenticated **doctor or active receptionist**. Patient self-service rescheduling, external notifications/outbox and direct WhatsApp changes are separate future work.

### Flow
- Staff opens `/dashboard/appointments` and selects **تغيير الموعد** for a pending/confirmed booking.
- Route `/dashboard/appointments/[appointmentId]/reschedule` validates current role, loads original appointment and availability.
- Client chooses new displayed slot and submits original date/start/end + new date/start/end as an optimistic compare-and-swap token.
- `actions/reschedule-appointments.ts` re-reads Clerk identity and *current* DB membership; only `appointments:reschedule` role permission can invoke privileged SQL.
- `clinic.reschedule_staff_appointment` locks the **schedule advisory lock first**, then appointment row `FOR UPDATE`, validates state and expected original slot, blocks pending Paymob attempts, and updates the *same appointment ID*. Its transaction-local guard opens a narrow exception to the pre-existing immutable-details trigger **for the slot fields only**; existing PostgreSQL validation checks (availability, duration, blocked dates, Cairo time/DST and booking window) run again. Existing GiST exclusion constraint prevents all overlapping active appointments.
- Reminder claimed/sent fields are reset so the moved visit can be reminded again; the audit log records actor + old/new dates and times in the same transaction.
- Existing status, patient association, payment records and visit notes are preserved. A best-effort HTML-escaped email is sent to the patient after commit; a provider failure does not change booking success.

### Concurrency and payment behavior
- Two receptionists selecting the original slot: first succeeds, second receives `stale`; refreshing the page avoids silent lost updates.
- Two distinct visits cannot be moved to overlapping time ranges: the exclusion constraint rejects one with `23P01`.
- A pending Paymob payment prevents moving the booking until the payment is settled/reconciled; even expired pending attempts must be explicitly reconciled. A paid appointment can be moved without charging twice.
- If a WhatsApp reminder was already accepted by Meta before the move, we cannot recall it; provider delivery and idempotency remain follow-up reliability work.
- The existing `clinic` Data API remains service-role-only (never expose these RPCs to anon/authenticated). Doctor/receptionist RBAC is enforced on trusted server actions with Clerk sessions.

### Before rollout
1. Merge or deploy the stacked source branches in dependency order.
2. Apply previously shipped SQL migrations first, then `20261017092500_appointment_reschedule.sql` to an isolated staging DB.
3. Run PGlite migration/database tests in `tests/reschedule-database.test.ts`, role-policy tests, `npx tsc --noEmit`, `npm run build` and lint. GitHub runner has historically failed before any steps executed; none of these checks are represented as passing.
4. Manual tests: two clients attempt to move the same visit; overlapping appointments; blocked schedule; inactive staff; past visit; same slot; pending payment; paid visit; email failure; DST spring gap/fall repeated hour.
5. Check new `clinic.appointment_reschedule_audit` table has RLS and no public grants; configure backups and monitoring for failed notifications.

### Known limitations
- Secretary reschedule requires current active Clerk account. Patients cannot use this staff endpoint.
- Available dates are capped by the existing booking window and slot-generation bounds. A stale booking may require a page refresh.
- No transactional outbox; emails are best effort.
