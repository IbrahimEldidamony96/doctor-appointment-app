# Shared WhatsApp authentication

Patients and clinic staff use one sign-in flow: enter a WhatsApp number at `/login`, receive a six-digit OTP, and verify it at `/verify`. Clinic access comes from an active, approved phone membership in `clinic.staff_accounts`. A patient cannot select or grant a clinic role during sign-in.

## Configure the application

Install the repository dependencies with `npm ci` and copy `.env.example` to `.env.local`.

Configure these values for authentication:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server access, including the first-owner bootstrap |
| `PATIENT_JWT_SECRET` | Shared session signing secret; the existing variable name is retained |
| `OTP_HASH_SECRET` | Separate secret for hashing OTPs |
| `WHATSAPP_CLOUD_API_TOKEN` | WhatsApp Cloud API credential |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone-number ID |
| `WHATSAPP_AUTH_TEMPLATE_NAME` | Approved authentication template with the sender's code-copy parameters |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Approved template language; defaults to `ar` |

Use independent secrets of at least 32 bytes for `PATIENT_JWT_SECRET` and `OTP_HASH_SECRET`. Keep the service-role key and all secrets in server configuration. Clerk environment variables and `DOCTOR_CLERK_USER_IDS` are no longer part of authentication.

Configure the other values from `.env.example` for Paymob, optional email, scheduled work and WhatsApp utility notifications as needed. `node scripts/check-env.mjs` checks local configuration without contacting providers or printing credentials; it does not prove OTP delivery works.

## Apply the database migration before deployment

Apply the SQL files in `supabase/migrations/` in filename order, including [`20261018225747_whatsapp_staff_auth.sql`](../supabase/migrations/20261018225747_whatsapp_staff_auth.sql). For an existing installation, **complete this database migration before deploying the updated application**. Ensure `clinic` is exposed in Supabase Data API settings.

The new migration adds phone-based clinic membership and the protected first-owner bootstrap. It disables legacy staff memberships whose identity came from Clerk and retains those records and their audit references. Legacy rows without a phone are historical records and cannot be activated from staff management. Re-add approved employees with their WhatsApp numbers after the owner signs in; historical audit data remains attached to the original records.

The migration files and helper are source artifacts. Preparing them does not apply any changes to a hosted database or deploy the app.

## Register the first owner privately

Confirm the correct doctor's WhatsApp number in international format before running the bootstrap. From a private terminal with this project's server-side Supabase configuration available, run:

```sh
npm run bootstrap:doctor -- +201xxxxxxxxx "Doctor name"
```

The helper, [`scripts/bootstrap-doctor.mjs`](../scripts/bootstrap-doctor.mjs), loads local configuration with `@next/env`, including `.env.local`, and calls `clinic.bootstrap_clinic_owner(p_phone, p_display_name)` using the Supabase service role. The operation is serialized so concurrent attempts cannot create separate initial owners, and it refuses to run again once an owner exists. The RPC is unavailable to public/anonymous and ordinary authenticated clients. Do not place the service-role key in browser code or build a public bootstrap page.

Bootstrap approves the owner's number as a protected doctor account. It does not verify the number or create a signed-in browser session. The owner must then visit `/login` and complete WhatsApp OTP using that exact number.

The owner cannot be disabled through staff management. Bootstrap is an initial provisioning operation, rather than an account-reset command; once an owner exists, use the normal authorized team management flow for additional accounts.

## Add the clinic team

A doctor opens `/dashboard/staff` and adds an employee's name, WhatsApp number and role. The employee does not need an existing Clerk or application account: their approved phone membership is saved before they sign in, and OTP verification is still required.

| Role | Access |
| --- | --- |
| `doctor` | All clinic permissions, including staff administration |
| `nurse` | Dashboard, calendar, appointments, manual booking, rescheduling, confirmation/cancellation, patient search and limited history |
| `secretary` | The same restricted reception permissions as `nurse` |

Nurses and secretaries cannot mark visits completed/no-show, view financial statistics or operation logs, manage staff/schedules/reviews/settings, edit/export patient profiles, or access doctor-only clinical details. Permissions are enforced on server pages and actions.

Doctors can disable and reactivate other approved team accounts. The interface and server reject disabling the owner or the current account. Accounts without a phone cannot be activated. A disabled account loses clinic permissions on its next guarded server request; an otherwise valid shared identity can still access its own patient account.

## Login destinations and navigation

- Normal `/login` sends active staff to `/dashboard` and patients to `/book` after verification.
- A permitted explicit destination is preserved. For example, a staff member following `/login?redirect=/my-appointments` returns to their own appointments.
- A patient following a dashboard destination receives `/doctor-access-denied`; signing in does not grant a staff role.
- External URLs, protocol-relative URLs and paths outside the allowed patient/dashboard destinations are rejected.
- `/sign-in`, including its legacy catch-all paths, redirects to `/login?redirect=/dashboard`.
- The public site's header/mobile menu links signed-in staff back to the clinic dashboard, and its footer provides a clinic entry link. The dashboard links back to the public site.

## Session behavior

The HttpOnly `clinic_session` cookie is shared by patient and clinic pages and expires after 12 hours. It is scoped to `/`, uses `SameSite=Lax`, and is secure in production. Logout clears this shared session.

The signed token contains verified identity, not a trusted clinic role. `getClinicActor()` rereads the phone's current active membership, and every protected mutation applies permissions again. Login authorization never trusts a role supplied by a login form, public profile field or browser claim. Doctors assign staff roles through the guarded staff-management action.

The database advisor's informational [RLS enabled without policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for these service-only clinic tables. Anonymous and ordinary authenticated database clients have no table privileges; trusted server code applies the WhatsApp identity and membership checks before using the private service role.

The old `patient_session` cookie is ignored, and the new token issuer/audience and lifetime checks reject older session tokens. Previous Clerk logins no longer authorize access. Existing users must sign in again through WhatsApp after the update.

## Verification

Run the repository checks after installing dependencies:

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm test` uses the pinned `tsx` and `@electric-sql/pglite` development dependencies. These instructions do not assert that checks, a hosted migration or deployment have succeeded.

In staging, verify owner bootstrap is accepted exactly once; owner and staff can receive OTPs; normal and explicit login destinations behave as described; doctor, nurse and secretary permissions are enforced on direct URLs and actions; disabling another staff account removes access; and historical audits remain intact. Verify fresh sign-in is required for users with old cookies.
