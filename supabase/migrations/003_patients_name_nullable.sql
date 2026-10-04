-- ============================================================
-- Migration: allow patients.name to be filled in later
-- ============================================================
-- Discovered while wiring the OTP verify route: on first login we
-- only have a phone number. Forcing `name` at signup means either
-- an extra step before the session exists, or a NOT NULL violation
-- on insert. Simplest fix: make it nullable, and collect it during
-- the booking flow instead (where we already ask for a reason for
-- visit anyway).
-- ============================================================

alter table clinic.patients alter column name drop not null;
