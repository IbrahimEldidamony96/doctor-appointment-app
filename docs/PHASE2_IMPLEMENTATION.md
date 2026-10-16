# Phase 2 implementation log

## Step 1 — Secretary Accounts & RBAC

**Branch:** `feature/phase2-01-secretary-rbac`  
**Base:** Phase 1 `fix/phase-1-backend-integrity` (not `main`; PR #1 must be resolved first).  
**Status:** Implemented in source code; not deployed or build-verified.

### Security design

- Clerk authenticates staff users. Authorized *doctor* identities still come from the pre-existing `DOCTOR_CLERK_USER_IDS` server allowlist; never grant `doctor` through a user-editable token, public metadata or the staff table.
- A doctor authorizes an **existing** Clerk account by copying its `user_...` ID from Clerk Dashboard → Users and creating an active secretary membership at `/dashboard/staff`. No shared doctor credentials and no direct email/password collection in this app.
- New `clinic.staff_accounts` table holds `clerk_user_id`, display name, fixed role `secretary`, activation state and provenance. All membership changes are recorded via a PostgreSQL trigger in `clinic.staff_audit_log`.
- `clinic.staff_accounts` and `clinic.staff_audit_log` have RLS enabled; no anon/authenticated access. Only server-side Supabase service role is granted table privileges.
- `getClinicActor()` checks the signed-in Clerk user on every server request, gives priority to the fixed doctor allowlist, and queries current active membership for non-doctor staff. It **fails closed** when the DB cannot be read; disabled users lose server access without waiting for a JWT refresh.
- Secretary permissions: view dashboard and appointments; confirm/cancel appointments. They cannot mark visits completed/no-show, manage schedule, see revenue/stats, edit settings, moderate reviews or manage staff. These decisions are enforced in server actions/pages, **not only through hidden links**.
- `proxy.ts` authenticates Clerk dashboard requests. Dashboard server layout and individual actions/pages perform role authorization. Doctor-only pages retain the existing allowlist guards.

### Key changed files

`supabase/migrations/20261016180000_clinic_staff_rbac.sql`,
`lib/auth/clinic-actor.ts`, `lib/auth/permissions.ts`,
`actions/staff.ts`, `actions/doctor-appointments.ts`,
`app/(doctor)/dashboard/staff/page.tsx`,
`components/doctor/staff-manager.tsx`,
`components/doctor/dashboard-nav.tsx`,
`app/(doctor)/dashboard/layout.tsx`,
`lib/supabase/database.types.ts`,
`tests/rbac.test.ts`, `tests/staff-database.test.ts`.

### Before using in a clinic

1. Apply all previous migrations followed by `20261016180000_clinic_staff_rbac.sql` to a staging database. The assistant **has not** modified your hosted DB.
2. Ensure Clerk doctor allowlist and Clerk instance configuration are correct; keep the Clerk secret key private.
3. Create separate Clerk logins for staff, then add the existing Clerk User IDs at `/dashboard/staff`.
4. Manually verify staff can view/confirm/cancel bookings but cannot access `/dashboard/settings`, `/dashboard/stats`, `/dashboard/availability`, `/dashboard/staff` or call doctor-only server actions.
5. Disable an active secretary account while logged in on another browser; assert the next server request is rejected.
6. Run `npm ci`, `npx tsc --noEmit`, `npm run build`; run PGlite tests using installed `tsx` and `@electric-sql/pglite` dev tools. The GitHub Actions runner has previously failed before starting any step, so no successful runtime verification is asserted.
7. Enable MFA for doctor/staff in Clerk; audit privileges, limit personal data displayed at reception, and ensure medical data privacy controls.

### Next step

**Step 2 — Manual Booking:** create staff-only service actions to locate/register patients by E.164 mobile number and book through the same serialized availability checks, with doctor and secretary role guards, audit trail, and a mobile-friendly dashboard booking form. No manual-booking code is represented as done in this step.
