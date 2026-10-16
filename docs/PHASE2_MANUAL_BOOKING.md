# Phase 2 / Step 2 — Manual Appointment Booking

Branch: `feature/phase2-02-manual-booking` (based on `feature/phase2-01-secretary-rbac`).
**Implemented in source control only; no live database migrated and no production build verification.**

## Flow
1. Authenticated doctor/active secretary enters `/dashboard/appointments/new`.
2. Server component checks current RBAC permission `appointments:create_manual` and renders two weeks of Cairo-aware availability.
3. Staff supplies a patient's **E.164 mobile** and name, picks a slot and submits a server action.
4. Server action re-checks Clerk identity and role against current DB membership, then calls `clinic.create_staff_appointment`.
5. The RPC takes the schedule transaction lock, inserts a new patient (or reuses an active existing phone without overwriting identity), inserts a **pending** appointment using the *same database validation and exclusion constraint* as public booking, and writes immutable booking audit attribution, all in one transaction.
6. Patient OTP is not required for a visit booked by authenticated clinic staff; patient accounts still require OTP before accessing their own visit details.

## Safety and operational behavior
- Two simultaneous bookings for overlapping intervals cannot both be inserted; the DB overlap constraint rejects the second one.
- No soft-deleted patient account is silently reactivated.
- The patient phone is unique; concurrent creation uses `on conflict do nothing` before reading the existing row.
- No additional role is granted to the public; service-role RPC calls happen only from an authorized server action.
- A database timeout or API error returns failure; do not assume a booking succeeded until an appointment ID is returned.
- Neither this feature nor prior RBAC changes has passed end-to-end tests, CI build or live staging validation.

## Staging checks
1. Apply `20261016180000_clinic_staff_rbac.sql` followed by `20261016181000_staff_manual_booking.sql`, after Phase 1 migrations.
2. Test existing and new mobile numbers, duplicate/overlapping slots, disabled staff, non-doctor/non-secretary, dates outside booking window, blocked hours, Cairo DST transitions and audit attribution.
3. Run `npm ci`, `npx tsc --noEmit`, `npm run build`, then PGlite tests with dev test dependencies.
4. Verify `staff_audit_log` and `manual_booking_audit` are denied to anonymous clients.
