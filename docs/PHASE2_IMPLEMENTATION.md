# Phase 2 — Clinic team accounts and permissions

The current implementation uses shared WhatsApp OTP authentication for patients and clinic staff. The original Phase 2 secretary implementation used Clerk IDs and a doctor allowlist; those instructions are historical and must not be used to configure the current app.

## Current identity and authorization

- Everyone signs in at `/login` and verifies the code at `/verify`. `/sign-in` redirects to the shared login with `/dashboard` as the requested destination.
- The shared `clinic_session` cookie lasts 12 hours and carries verified identity, not a staff role. The environment variable remains `PATIENT_JWT_SECRET`.
- `getClinicActor()` reads active membership by verified WhatsApp number on server requests. Pages and every mutation check current permissions; hiding a link is not authorization. Disabling an account removes its clinic access on the next guarded server request.
- `proxy.ts` checks signed identity for clinic and protected patient routes. Dashboard layouts, individual page loaders and server actions apply role authorization. A patient session alone never grants clinic permissions.
- Without an explicit permitted target, approved staff go to `/dashboard` and patients to `/book`. Permitted patient targets remain available to staff. A patient requesting a dashboard target reaches the access-denied page.

## Roles

| Role | Permissions |
| --- | --- |
| Doctor | All clinic permissions, including adding staff and managing activation |
| Nurse | Dashboard, appointments, calendar, patient search and limited history, manual booking, rescheduling, appointment confirmation and cancellation |
| Secretary | The same restricted reception permissions as a nurse |

Nurses and secretaries cannot mark completed/no-show visits, manage schedules/reviews/settings/staff, view statistics or operation logs, edit/export patient profiles, or view doctor-only clinical details.

The first doctor is the protected owner. Doctors can add team members by WhatsApp number and select `doctor`, `nurse` or `secretary` at `/dashboard/staff`. Owner accounts and the current account cannot be disabled through staff management. Legacy accounts without a WhatsApp number cannot be activated.

## Migration and first owner

Apply all SQL files in `supabase/migrations/` in order, including [`20261018225747_whatsapp_staff_auth.sql`](../supabase/migrations/20261018225747_whatsapp_staff_auth.sql), **before deploying this app version**. The source changes do not apply a hosted database migration or deploy the app.

The migration disables legacy staff records and retains their old identity references and audit history. They are not automatically trusted by phone number. After the owner signs in, re-add approved staff with their WhatsApp numbers at `/dashboard/staff`.

Create the first owner from a private terminal:

```sh
npm run bootstrap:doctor -- +201xxxxxxxxx "Doctor name"
```

The helper calls the service-role-only `clinic.bootstrap_clinic_owner(p_phone, p_display_name)` RPC. The first-owner operation is serialized and refuses to create another owner once one exists. It approves the number; the owner still has to complete WhatsApp OTP sign-in. There is no public owner-registration page or role selection at login.

See [WhatsApp authentication setup](WHATSAPP_AUTH.md) for required environment variables, migration order, bootstrap and migration verification.

## Implementation map

- `lib/auth/clinic-actor.ts`: verified identity to current active membership.
- `lib/auth/permissions.ts`: doctor, nurse and secretary permission policy.
- `lib/auth/patient-jwt.ts`, `get-patient-session.ts`, `constants.ts`: shared signed identity and cookie.
- `lib/auth/safe-redirect.ts`: permitted destinations and role defaults.
- `app/api/otp/verify/route.ts`: verified OTP, shared session and server-selected destination.
- `actions/staff.ts`: private staff creation and activation mutations.
- `app/(doctor)/dashboard/staff/page.tsx`, `components/doctor/staff-manager.tsx`: doctor team management.
- `lib/supabase/database.types.ts` and `supabase/migrations/`: database structure, owner bootstrap and audit compatibility.

The historical `20261016180000_clinic_staff_rbac.sql` remains part of migration order. Its Clerk identity columns describe the original storage format; the later WhatsApp migration defines current membership behavior. Keep historical migrations and audits intact.

## Verification workflow

Install dependencies with `npm ci`, then run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`. The test command uses pinned `tsx` and PGlite development dependencies. No successful check or deployment is asserted here.

In a migrated staging environment, verify first-owner bootstrap, separate doctor/nurse/secretary OTP sign-in, normal patient sign-in, safe return destinations, restricted actions and direct routes, owner protection, and loss of clinic access after disabling a staff member. Confirm old sessions require a fresh OTP and historical staff/appointment audits remain available to authorized doctors.
