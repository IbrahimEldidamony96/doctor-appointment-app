-- ============================================================
-- Migration: init clinic schema
-- Doctor Appointment App — single-doctor clinic booking system
-- Run in the Supabase SQL editor, or via:
--   supabase migration new init_clinic_schema
--   (paste this content into the generated file, then `supabase db push`)
-- ============================================================

create schema if not exists clinic;

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ------------------------------------------------------------
-- shared trigger: keep updated_at fresh
-- ------------------------------------------------------------
create or replace function clinic.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- patients
-- ------------------------------------------------------------
create table clinic.patients (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  email text,
  date_of_birth date,
  gender text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_patients_phone on clinic.patients (phone) where deleted_at is null;

create trigger trg_patients_updated_at
  before update on clinic.patients
  for each row execute function clinic.set_updated_at();

-- ------------------------------------------------------------
-- availability (weekly recurring template)
-- ------------------------------------------------------------
create table clinic.availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- ------------------------------------------------------------
-- blocked_dates (one-off exceptions: holidays, days off, etc.)
-- ------------------------------------------------------------
create table clinic.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  is_full_day boolean not null default true,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  check (is_full_day or (start_time is not null and end_time is not null and end_time > start_time))
);

create index idx_blocked_dates_date on clinic.blocked_dates (date);

-- ------------------------------------------------------------
-- appointments
-- ------------------------------------------------------------
create type clinic.appointment_status as enum (
  'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
);

create table clinic.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinic.patients (id) on delete restrict,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status clinic.appointment_status not null default 'pending',
  reason_for_visit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_time > start_time)
);

create index idx_appointments_patient on clinic.appointments (patient_id);
create index idx_appointments_date on clinic.appointments (appointment_date);

-- Prevent double-booking: only one active (pending/confirmed) appointment
-- per date + start_time slot.
create unique index uq_appointments_active_slot
  on clinic.appointments (appointment_date, start_time)
  where status in ('pending', 'confirmed') and deleted_at is null;

create trigger trg_appointments_updated_at
  before update on clinic.appointments
  for each row execute function clinic.set_updated_at();

-- ------------------------------------------------------------
-- payments (1:N — an appointment can have multiple payment attempts)
-- ------------------------------------------------------------
create type clinic.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table clinic.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references clinic.appointments (id) on delete cascade,
  amount numeric(10, 2) not null,
  currency text not null default 'EGP',
  provider text not null default 'paymob',
  status clinic.payment_status not null default 'pending',
  transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_payments_appointment on clinic.payments (appointment_id);

-- ------------------------------------------------------------
-- reviews (one per appointment)
-- ------------------------------------------------------------
create table clinic.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references clinic.appointments (id) on delete cascade,
  patient_id uuid not null references clinic.patients (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- settings (singleton row — clinic-wide config)
-- ------------------------------------------------------------
create table clinic.settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null,
  booking_window_days integer not null default 30,
  cancellation_notice_hours integer not null default 24,
  default_slot_minutes integer not null default 30,
  updated_at timestamptz not null default now()
);

-- enforce a single row
create unique index uq_settings_singleton on clinic.settings ((true));

create trigger trg_settings_updated_at
  before update on clinic.settings
  for each row execute function clinic.set_updated_at();

-- ------------------------------------------------------------
-- otp_codes (WhatsApp OTP verification, short-lived)
-- ------------------------------------------------------------
create table clinic.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_otp_codes_phone on clinic.otp_codes (phone);

-- Optional cleanup: delete expired rows periodically, e.g. via pg_cron
-- or a scheduled Next.js route:
--   delete from clinic.otp_codes where expires_at < now() - interval '1 day';

-- ============================================================
-- NOTE: Row Level Security (RLS) policies are intentionally left
-- out of this migration — they belong to the "data layer" phase,
-- since the doctor goes through a service-role client and the
-- patient goes through a custom JWT (not Supabase Auth), which
-- changes how RLS policies need to be written.
-- ============================================================
