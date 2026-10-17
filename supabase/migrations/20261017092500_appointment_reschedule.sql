-- Staff-authorized reschedule. These functions are service-role-only APIs.
-- This migration depends on BOTH secretary RBAC and manual booking migrations.
-- Keep PostgreSQL GiST exclusion constraint and shared schedule advisory lock.
create table clinic.appointment_reschedule_audit (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references clinic.appointments(id) on delete restrict,
  actor_clerk_user_id text not null,
  old_date date not null,
  old_start_time time not null,
  old_end_time time not null,
  new_date date not null,
  new_start_time time not null,
  new_end_time time not null,
  created_at timestamptz not null default now(),
  constraint reschedule_actual_change check (
    (old_date, old_start_time, old_end_time) is distinct from
    (new_date, new_start_time, new_end_time)
  )
);
create index idx_reschedule_audit_appointment
  on clinic.appointment_reschedule_audit(appointment_id, created_at desc);
alter table clinic.appointment_reschedule_audit enable row level security;
revoke all on clinic.appointment_reschedule_audit from public, anon, authenticated;
grant select, insert on clinic.appointment_reschedule_audit to service_role;
grant usage, select on sequence clinic.appointment_reschedule_audit_id_seq to service_role;

-- Rescheduling is the sole exception to the existing immutable slot rule.
-- Keep original INSERT and transition checks, and run the same
-- timezone/blocked-date/duration/schedule validation for changed intervals.
create or replace function clinic.validate_appointment()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_window integer;
begin
  if tg_op = 'UPDATE' then
    -- The patient is immutable even during a reschedule. Normal status updates
    -- retain the exact old behavior; ONLY a scoped transactional RPC may move
    -- the clock interval without changing status.
    if new.patient_id is distinct from old.patient_id then
      raise exception 'APPOINTMENT_DETAILS_IMMUTABLE' using errcode = '23514';
    end if;
    if (new.appointment_date, new.start_time, new.end_time)
       is distinct from (old.appointment_date, old.start_time, old.end_time) then
      if pg_catalog.current_setting('clinic.reschedule_appointment_id', true)
          is distinct from old.id::text
        or new.status is distinct from old.status
        or new.deleted_at is distinct from old.deleted_at
        or new.reason_for_visit is distinct from old.reason_for_visit
        or new.notes is distinct from old.notes
        or new.created_at is distinct from old.created_at
        or new.reminder_sent_at is not null
        or new.reminder_claimed_at is not null
        or new.reminder_claim_token is not null
        or old.status not in ('pending','confirmed') or old.deleted_at is not null then
        raise exception 'APPOINTMENT_DETAILS_IMMUTABLE' using errcode = '23514';
      end if;
      -- Validate new date/time against current availability and Cairo timezone
      -- using exactly the same checks as an insert, below.
    else
      if new.status <> old.status then
        if not ((old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
          or (old.status = 'confirmed' and new.status in ('cancelled', 'completed', 'no_show'))) then
          raise exception 'INVALID_APPOINTMENT_TRANSITION' using errcode = '23514';
        end if;
        if new.status in ('completed', 'no_show')
          and (new.appointment_date + new.start_time) at time zone 'Africa/Cairo' > now() then
          raise exception 'APPOINTMENT_HAS_NOT_STARTED' using errcode = '23514';
        end if;
      end if;
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(214732, 1);
  select s.booking_window_days into v_window from clinic.settings s;
  v_window := coalesce(v_window, 30);
  if (tg_op = 'INSERT' and new.status <> 'pending')
    or (tg_op = 'UPDATE' and new.status not in ('pending','confirmed'))
    or new.deleted_at is not null
    or new.appointment_date < v_today or new.appointment_date >= v_today + v_window
    or (new.appointment_date + new.start_time) at time zone 'Africa/Cairo' <= now() then
    raise exception 'INVALID_BOOKING_DATE' using errcode = '23514';
  end if;
  -- A local clock time in the spring DST gap does not denote an appointment.
  if ((new.appointment_date + new.start_time) at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'
      <> new.appointment_date + new.start_time
    or ((new.appointment_date + new.end_time) at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'
      <> new.appointment_date + new.end_time then
    raise exception 'INVALID_BOOKING_DATE' using errcode = '23514';
  end if;
  if not exists (select 1 from clinic.patients p where p.id = new.patient_id and p.deleted_at is null) then
    raise exception 'PATIENT_NOT_FOUND' using errcode = '23503';
  end if;
  if not exists (
    select 1 from clinic.availability a where a.is_active
      and a.day_of_week = extract(dow from new.appointment_date)
      and new.start_time >= a.start_time and new.end_time <= a.end_time
      and extract(epoch from (new.end_time - new.start_time)) = a.slot_duration_minutes * 60
      and mod(extract(epoch from (new.start_time - a.start_time)), a.slot_duration_minutes * 60) = 0
  ) then
    raise exception 'INVALID_BOOKING_SLOT' using errcode = '23514';
  end if;
  if exists (
    select 1 from clinic.blocked_dates b where b.date = new.appointment_date
      and (b.is_full_day or (new.start_time < b.end_time and new.end_time > b.start_time))
  ) then
    raise exception 'BOOKING_SLOT_BLOCKED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function clinic.reschedule_staff_appointment(
  p_appointment_id uuid, p_actor_clerk_user_id text,
  p_expected_date date, p_expected_start_time time, p_expected_end_time time,
  p_date date, p_start_time time, p_end_time time
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_current clinic.appointments%rowtype;
begin
  if p_appointment_id is null or
    p_actor_clerk_user_id is null or
    p_actor_clerk_user_id !~ '^user_[A-Za-z0-9]{8,}$' or
    p_expected_date is null or p_expected_start_time is null or p_expected_end_time is null or
    p_date is null or p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  -- Lock order matters: all schedule-dependent operations acquire advisory
  -- lock BEFORE touching appointments/patients, avoiding cyclic deadlocks.
  perform pg_catalog.pg_advisory_xact_lock(214732, 1);

  select * into v_current from clinic.appointments
    where id = p_appointment_id for update;
  if not found or v_current.deleted_at is not null then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_current.status not in ('pending','confirmed') or
      (v_current.appointment_date + v_current.start_time)
        at time zone 'Africa/Cairo' <= now() then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'not_reschedulable');
  end if;

  -- Compare-and-swap: a second browser / receptionist cannot silently overwrite
  -- the new slot selected by the first successful updater.
  if (v_current.appointment_date, v_current.start_time, v_current.end_time)
      is distinct from (p_expected_date, p_expected_start_time, p_expected_end_time) then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'stale');
  end if;
  if (v_current.appointment_date, v_current.start_time, v_current.end_time)
      is not distinct from (p_date, p_start_time, p_end_time) then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'same_slot');
  end if;

  -- A checkout under way has a provider-side callback that can race against
  -- a reschedule. Prevent moving until that pending payment settles/expires.
  if exists (
    select 1 from clinic.payments p
    where p.appointment_id = p_appointment_id and p.status = 'pending'
  ) then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'payment_in_progress');
  end if;

  -- Set a transaction-local guard for exactly this row. The BEFORE UPDATE
  -- trigger rejects direct interval mutation, status changes and identity swaps.
  perform pg_catalog.set_config('clinic.reschedule_appointment_id', p_appointment_id::text, true);
  update clinic.appointments
    set appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
        reminder_sent_at = null, reminder_claimed_at = null, reminder_claim_token = null
    where id = p_appointment_id;
  perform pg_catalog.set_config('clinic.reschedule_appointment_id', '', true);

  insert into clinic.appointment_reschedule_audit (
    appointment_id, actor_clerk_user_id,
    old_date, old_start_time, old_end_time, new_date, new_start_time, new_end_time
  ) values (
    p_appointment_id, p_actor_clerk_user_id,
    v_current.appointment_date, v_current.start_time, v_current.end_time,
    p_date, p_start_time, p_end_time
  );
  return pg_catalog.jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end $$;

revoke all on function clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time)
  from public, anon, authenticated;
grant execute on function clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time)
  to service_role;
notify pgrst, 'reload schema';
