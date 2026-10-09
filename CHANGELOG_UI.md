# UI & client flow update

## Pages added / redesigned

- `/` — Arabic RTL landing page with responsive hero, feature highlights, booking CTA
- `/login` — mobile-friendly E.164 WhatsApp sign-in with inline validation and loading/error states
- `/verify` — OTP verification, resend and retry states; redirects are restricted to safe internal patient routes
- `/book` — day/time selection, patient information, error/empty/success states
- `/my-appointments` — active/past bookings, Paymob payment launch, cancellation and reviews
- `/profile` — patient name/email management and sign out
- `/reviews` — public published reviews only
- `/payment` — payment access for eligible appointments; uses existing Paymob server action
- `/about`, `/contact`, `/privacy` — supporting public content
- `/sign-in` — doctor's Clerk sign-in, separate from patient OTP login
- `/doctor-access-denied` — restricted admin access explanation
- `/dashboard/*` — shared responsive sidebar, overview and refreshed visual layout

## Important integration notes

- No fake users, bookings, payments, or reviews are inserted. Pages use the existing Supabase/Clerk/WhatsApp/Paymob integrations.
- **Set `DOCTOR_CLERK_USER_IDS`** to the Clerk user IDs allowed to access the admin dashboard. Signing into Clerk alone does not authorize access.
- Configure `.env.local` from `.env.example`; do not commit any secrets.
- Apply the included Supabase migrations to the `clinic` schema and expose `clinic` in the Supabase Data API.
- WhatsApp OTP delivery requires working Meta credentials and a correctly configured approved authentication template for production; see README.
- Paymob checkout and callback need verification with real sandbox transactions before production usage.
- The contact page deliberately does not invent clinic contact details; add real support details before launch.
- Review the `/privacy` text with the clinic before publishing as a legal policy.
