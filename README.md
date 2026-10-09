# موعد | Arabic Doctor Appointment Platform

A responsive **Arabic / RTL** single-clinic appointment system built with Next.js 16 (App Router), Tailwind CSS 4, Supabase, Clerk, WhatsApp OTP and Paymob.

## Quick start

1. `npm ci`
2. Copy `.env.example` to `.env.local` and configure every integration you need. **Set `DOCTOR_CLERK_USER_IDS`** to the comma-separated Clerk IDs authorized to manage the clinic. No IDs means no doctor will be authorized.
3. Apply the SQL files in `supabase/migrations/` in order, and expose the `clinic` schema in Supabase Data API settings.
4. `npm run dev` → visit `http://localhost:3000`.
5. Visit `/login` for patient WhatsApp OTP. For the doctor use `/sign-in`, then `/dashboard` after adding the Clerk user ID to the allowlist.

## Patient routes

| URL | Purpose |
| --- | --- |
| `/` | Landing page |
| `/login`, `/verify` | Patient OTP sign-in and verification (also registration) |
| `/book` | Appointment booking (login required) |
| `/my-appointments` | Appointment management, cancellation, payment and post-visit review |
| `/profile` | Profile and logout (login required) |
| `/payment` | Start Paymob checkout for eligible appointments |
| `/reviews` | Published patient feedback |
| `/about`, `/contact`, `/privacy` | Informational pages |

## Doctor routes

`/sign-in` uses **Clerk** and is separate from patient OTP login. `/dashboard` and its `appointments`, `availability`, `reviews`, `settings` and `stats` subroutes require a doctor allowed via `DOCTOR_CLERK_USER_IDS` (user IDs, not email addresses). Doctor actions also enforce this allowlist.

See [CHANGELOG_UI.md](CHANGELOG_UI.md) for the UI update and [`.env.example`](.env.example) for environment configuration. API keys, credentials and service-role keys **must never be exposed to browser code**.

### Production notes

- The WhatsApp OTP sender must use an approved authentication message template for recipients outside WhatsApp's allowed service window. The current sender is a starting point, **not production-compliant as-is**.
- Verify Paymob intention/webhook fields with a live sandbox round trip. A successful redirect alone is not payment confirmation.
- Add real clinic contact information and finalize a privacy policy before launching publicly.
- Stripe/other gateways are not added; patient payment is wired to the existing Paymob integration.

---

## Original implementation documentation

# Doctor Appointment App — generated files

Everything built in this chat, organized to drop into a Next.js 16
(App Router) project. Paths below are **relative to your project
root** — this assumes a project **without** the `src/` folder. If
your project uses `src/`, move `actions/`, `app/`, `components/`,
`lib/`, and `middleware.ts` all under `src/`.

## File tree

```
supabase/migrations/
  001_init_clinic_schema.sql       8 tables: patients, availability,
                                    blocked_dates, appointments,
                                    payments, reviews, settings,
                                    otp_codes
  002_enable_rls.sql               RLS enabled, deny-by-default
                                    (service_role bypasses)
  003_patients_name_nullable.sql   patients.name no longer required
                                    at signup
  004_dashboard_stats_function.sql clinic.get_dashboard_stats() RPC
  005_notification_fields.sql      settings.doctor_notification_phone,
                                    appointments.reminder_sent_at
  006_settings_consultation_price.sql
                                    settings.consultation_price

lib/
  supabase/server.ts     service-role client (bypasses RLS)
  supabase/client.ts     anon-key client (browser-safe, currently
                          can't read/write anything — RLS default-denies)
  auth/otp.ts             generate/hash/verify OTP codes
  auth/patient-jwt.ts     sign/verify the patient session JWT (jose)
  auth/get-patient-session.ts   read + verify the session cookie
  availability.ts         computes open slots (availability −
                          blocked_dates − booked appointments)
  whatsapp.ts             WhatsApp Cloud API sender
  resend.ts               patient-facing transactional emails
  paymob.ts               Paymob Intention API + HMAC verification

actions/                 (all "use server")
  appointments.ts         createAppointment, cancelAppointment
  availability.ts         getAvailableSlotsAction (client-callable)
  doctor-appointments.ts  updateAppointmentStatus
  doctor-availability.ts  add/delete availability + blocked_dates
  doctor-settings.ts      updateSettings
  doctor-reviews.ts       toggleReviewPublished
  reviews.ts              submitReview
  payments.ts             initiatePayment (Paymob)

app/
  (patient)/login/page.tsx           phone entry
  (patient)/verify/page.tsx          OTP code entry
  (patient)/book/page.tsx            slot picker + booking form
  (patient)/my-appointments/page.tsx list + cancel + review + pay
  (doctor)/dashboard/layout.tsx      nav + Clerk UserButton
  (doctor)/dashboard/page.tsx        today's appointments
  (doctor)/dashboard/appointments/page.tsx   full list + status actions
  (doctor)/dashboard/availability/page.tsx   weekly hours + blocked dates
  (doctor)/dashboard/reviews/page.tsx        moderate reviews
  (doctor)/dashboard/settings/page.tsx       clinic settings
  (doctor)/dashboard/stats/page.tsx          aggregated metrics
  api/otp/send/route.ts
  api/otp/verify/route.ts
  api/webhooks/paymob/route.ts
  api/cron/reminders/route.ts

components/
  patient/  login-form, verify-form, booking-form, appointment-card
  doctor/   appointment-actions, availability-manager, settings-form,
            review-visibility-toggle

middleware.ts   Clerk for /dashboard, custom JWT check for patient routes
vercel.json     hourly cron → /api/cron/reminders
```

## Setup order

1. `npm install @supabase/supabase-js jose zod resend server-only`
2. `npx shadcn@latest add button input textarea label`
3. Run the migrations in `supabase/migrations/` **in numeric order**.
4. In Supabase Dashboard → Project Settings → API → Data API settings,
   add `clinic` to **Exposed schemas** (required for every query here
   to be reachable at all).
5. Fill in the env vars below.
6. In the doctor dashboard → Settings, set the consultation price and
   your WhatsApp notification number once the app is running.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=

PATIENT_JWT_SECRET=        # random string, separate from OTP_HASH_SECRET
OTP_HASH_SECRET=           # random string, separate from PATIENT_JWT_SECRET

WHATSAPP_CLOUD_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

RESEND_API_KEY=
RESEND_FROM_EMAIL=         # must be a verified domain in Resend

PAYMOB_SECRET_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_INTEGRATION_ID=
PAYMOB_HMAC_SECRET=

CRON_SECRET=                # Vercel Cron sends this automatically
                             # as Authorization: Bearer $CRON_SECRET
NEXT_PUBLIC_APP_URL=        # e.g. https://yourapp.vercel.app
```

## Known open items (flagged during the build)

- WhatsApp free-form text (`lib/whatsapp.ts`) only works for test
  numbers or within a 24h reply window. Production needs an approved
  "Authentication" template from Meta Business Manager.
- Paymob webhook: `obj.order.merchant_order_id` vs `obj.merchant_order_id`
  isn't 100% pinned down for the Intention API — verify against a real
  test transaction before going live.
