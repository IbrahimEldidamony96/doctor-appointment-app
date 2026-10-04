-- ============================================================
-- Migration: enable RLS (deny-by-default) on all clinic tables
-- ============================================================
-- Access model: neither the doctor (Clerk) nor the patient (custom
-- WhatsApp OTP + JWT) uses a Supabase Auth session. All real data
-- access goes through Next.js Server Actions using the Supabase
-- service_role client, which bypasses RLS by design in Supabase.
--
-- Authorization is enforced in application code, not RLS:
--   - Doctor routes: Clerk session checked in the server action,
--     on top of middleware already protecting /dashboard.
--   - Patient routes: the custom JWT cookie is verified and its
--     patient_id scopes every query (e.g. `.eq('patient_id', id)`).
--
-- RLS here is a deny-by-default safety net: with RLS enabled and
-- no policies for anon/authenticated, direct client-side access
-- with the anon key is blocked entirely, even if that key is ever
-- exposed or misused. service_role always bypasses RLS.
-- ============================================================

alter table clinic.patients enable row level security;
alter table clinic.appointments enable row level security;
alter table clinic.availability enable row level security;
alter table clinic.blocked_dates enable row level security;
alter table clinic.payments enable row level security;
alter table clinic.reviews enable row level security;
alter table clinic.settings enable row level security;
alter table clinic.otp_codes enable row level security;
