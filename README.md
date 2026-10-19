# موعد | Arabic Doctor Appointment Platform

A responsive Arabic / RTL single-clinic appointment system built with Next.js 16 App Router, Tailwind CSS 4, Supabase, WhatsApp OTP and Paymob.

Patients, doctors, nurses and secretaries use the same WhatsApp sign-in at `/login`. Approved clinic staff reach `/dashboard`; patients reach `/book`. An explicit permitted destination is preserved. The public site includes a clinic dashboard shortcut for signed-in staff and a clinic entry link in the footer.

## Quick start

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`. Configure Supabase, independent `PATIENT_JWT_SECRET` and `OTP_HASH_SECRET` values of at least 32 bytes, and the WhatsApp credentials and approved authentication template. Configure the other integrations you need. Clerk keys and a Clerk doctor allowlist are no longer used.
3. Apply every SQL migration in `supabase/migrations/` in filename order, including [`20261018225747_whatsapp_staff_auth.sql`](supabase/migrations/20261018225747_whatsapp_staff_auth.sql). Expose the `clinic` schema in Supabase Data API settings. **For an existing installation, apply the migration before deploying the updated app.**
4. Register the first clinic owner from a private terminal with server-side Supabase credentials:

   ```sh
   npm run bootstrap:doctor -- +201xxxxxxxxx "Doctor name"
   ```

   This loads `.env.local` and uses the private `bootstrap_clinic_owner(p_phone, p_display_name)` RPC. Creation is serialized and allows one initial owner; it refuses to run again once an owner exists. Bootstrap approves a number but does not sign anyone in.

5. Run `npm run dev` and visit `http://localhost:3000/login`. The owner must verify that same WhatsApp number with an OTP.
6. At `/dashboard/staff`, add approved doctors, nurses and secretaries by name, WhatsApp number and role. Every team member signs in at `/login` with their own number.

See [WhatsApp authentication and migration setup](docs/WHATSAPP_AUTH.md) for the complete transition procedure. No hosted database migration or deployment is implied by these source changes.

## Accounts and access

| Account | Access |
| --- | --- |
| Patient | Own profile, bookings, appointments, payments and reviews |
| Doctor | Clinic management, including staff, schedule, settings, reviews, statistics and patient management |
| Nurse | Reception permissions: dashboard, calendar, appointment viewing/confirmation/cancellation, manual booking, rescheduling and limited patient history |
| Secretary | The same reception permissions as a nurse |

The first doctor is the clinic owner. The owner account cannot be disabled through staff management. Other doctors can manage the team, while staff cannot disable their own account. Nurses and secretaries cannot mark visits completed/no-show, view financial statistics, manage staff/settings/schedules/reviews, or access doctor-only clinical detail controls.

All accounts share a 12-hour HttpOnly `clinic_session` cookie. The existing `PATIENT_JWT_SECRET` environment name is retained. The cookie proves identity; current role and activation state are read from the database for authorization. Old patient cookies and Clerk logins no longer authorize access. Legacy staff memberships are disabled and retained for audit history; re-add approved WhatsApp numbers through the dashboard.

## Routes

| URL | Purpose |
| --- | --- |
| `/` | Public clinic site |
| `/login`, `/verify` | Shared WhatsApp OTP sign-in and verification |
| `/sign-in` | Compatibility redirect to `/login?redirect=/dashboard` |
| `/book`, `/my-appointments`, `/profile`, `/payment` | Patient booking, appointments, account and checkout; sign-in required |
| `/dashboard` | Clinic dashboard; active staff membership required |
| `/dashboard/appointments`, `/dashboard/calendar` | Appointment management, manual booking and rescheduling |
| `/dashboard/patients` | Patient search and permitted history/management |
| `/dashboard/staff` | Doctor-managed team accounts |
| `/dashboard/availability`, `/dashboard/reviews`, `/dashboard/settings`, `/dashboard/stats`, `/dashboard/operations` | Doctor-only management pages |
| `/reviews`, `/about`, `/contact`, `/privacy` | Public information and feedback |

## Local checks

```sh
node scripts/check-env.mjs
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm test` uses the pinned `tsx` and `@electric-sql/pglite` development dependencies. These commands are the validation workflow; this documentation does not assert they have passed. Configuration checks do not verify live provider access.

## Integrations and project layout

- Supabase SQL lives in `supabase/migrations/`; the private service-role client is in `lib/supabase/server.ts`. Keep its key out of browser code.
- Shared identity, OTP, redirect rules and current staff permissions live in `lib/auth/`. `proxy.ts` checks identity; pages and server actions enforce current permissions.
- Patient pages live in `app/(patient)/`; clinic pages live in `app/(doctor)/dashboard/`. These route groups belong to the same application.
- WhatsApp uses approved authentication and utility templates configured in `.env.example`. Match the sender's template parameters when configuring Meta.
- Paymob handles checkout and webhooks. Verify the full sandbox payment/webhook flow before relying on payment status.
- Optional email notifications use Resend. Clinic contact details and the published privacy policy should match the actual clinic.

See [Phase 2 access implementation](docs/PHASE2_IMPLEMENTATION.md), [the UI changelog](CHANGELOG_UI.md) and [environment configuration](.env.example) for related details.
