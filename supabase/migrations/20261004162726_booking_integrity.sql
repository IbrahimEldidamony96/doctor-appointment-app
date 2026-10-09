-- Server-only data model: Clerk and patient cookies are authorized by Next.js,
-- never by the Supabase anon/authenticated roles.
grant usage on schema clinic to service_role;
grant all on all tables in schema clinic to service_role;
grant all on all sequences in schema clinic to service_role;
revoke all on schema clinic from public, anon, authenticated;
revoke all on all tables in schema clinic from public, anon, authenticated;
revoke all on all sequences in schema clinic from public, anon, authenticated;
revoke execute on all functions in schema clinic from public, anon, authenticated;
grant execute on all functions in schema clinic to service_role;
alter default privileges in schema clinic revoke execute on functions from public;
alter default privileges in schema clinic grant execute on functions to service_role;
alter default privileges in schema clinic grant all on tables to service_role;
alter default privileges in schema clinic grant all on sequences to service_role;

create or replace function clinic.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table clinic.availability
  add constraint availability_slot_duration check (slot_duration_minutes between 5 and 240),
  add constraint availability_whole_minutes check (
    extract(second from start_time) = 0 and extract(second from end_time) = 0
    and end_time < time '24:00'
    and extract(epoch from (end_time - start_time)) >= slot_duration_minutes * 60
  );
alter table clinic.blocked_dates
  add constraint blocked_dates_whole_minutes check (
    (is_full_day and start_time is null and end_time is null)
    or (not is_full_day and start_time is not null and end_time is not null
      and start_time < end_time and end_time < time '24:00'
      and extract(second from start_time) = 0 and extract(second from end_time) = 0)
  );
alter table clinic.settings
  add constraint settings_booking_window check (booking_window_days between 1 and 365),
  add constraint settings_cancellation_notice check (cancellation_notice_hours between 0 and 168),
  add constraint settings_slot_minutes check (default_slot_minutes between 5 and 240);
alter table clinic.appointments
  add constraint appointments_whole_minutes check (
    extract(second from start_time) = 0 and extract(second from end_time) = 0 and end_time < time '24:00'
  ),
  add constraint appointments_reason_length check (char_length(reason_for_visit) <= 500),
  add constraint appointments_no_active_overlap exclude using gist (
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)') with &&
  ) where (status in ('pending', 'confirmed') and deleted_at is null);
alter table clinic.reviews add constraint reviews_comment_length check (char_length(comment) <= 500);
create index idx_reviews_patient on clinic.reviews(patient_id);

-- Serialize schedule edits with booking validation, avoiding check-then-insert races.
create function clinic.lock_schedule_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(214732, 1);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_settings_schedule_lock before insert or update or delete on clinic.settings
  for each row execute function clinic.lock_schedule_change();
create trigger trg_blocked_dates_schedule_lock before insert or update or delete on clinic.blocked_dates
  for each row execute function clinic.lock_schedule_change();

create function clinic.validate_availability()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(214732, 1);
  if tg_op = 'DELETE' then return old; end if;
  if new.is_active and exists (
    select 1 from clinic.availability a
    where a.is_active and a.day_of_week = new.day_of_week and a.id <> new.id
      and new.start_time < a.end_time and new.end_time > a.start_time
  ) then
    raise exception 'AVAILABILITY_OVERLAP' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger trg_availability_validate before insert or update or delete on clinic.availability
  for each row execute function clinic.validate_availability();

create function clinic.validate_appointment()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_window integer;
begin
  if tg_op = 'UPDATE' then
    if (new.patient_id, new.appointment_date, new.start_time, new.end_time)
      is distinct from (old.patient_id, old.appointment_date, old.start_time, old.end_time) then
      raise exception 'APPOINTMENT_DETAILS_IMMUTABLE' using errcode = '23514';
    end if;
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

  perform pg_advisory_xact_lock(214732, 1);
  select s.booking_window_days into v_window from clinic.settings s;
  v_window := coalesce(v_window, 30);
  if new.status <> 'pending' or new.deleted_at is not null
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
create trigger trg_appointments_validate before insert or update on clinic.appointments
  for each row execute function clinic.validate_appointment();

create function clinic.create_patient_appointment(
  p_patient_id uuid, p_date date, p_start_time time, p_end_time time,
  p_reason text default null, p_patient_name text default null, p_patient_email text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  -- Same lock order as other schedule-dependent operations.
  perform pg_advisory_xact_lock(214732, 1);
  update clinic.patients set
    name = coalesce(nullif(btrim(p_patient_name), ''), name),
    email = coalesce(nullif(btrim(p_patient_email), ''), email)
  where id = p_patient_id and deleted_at is null;
  if not found then raise exception 'PATIENT_NOT_FOUND' using errcode = '23503'; end if;
  if not exists (select 1 from clinic.patients p where p.id = p_patient_id
    and char_length(btrim(p.name)) between 2 and 100) then
    raise exception 'INVALID_PATIENT_NAME' using errcode = '23514';
  end if;
  insert into clinic.appointments (patient_id, appointment_date, start_time, end_time, reason_for_visit)
    values (p_patient_id, p_date, p_start_time, p_end_time, p_reason) returning id into v_id;
  return v_id;
end;
$$;

create function clinic.cancel_patient_appointment(p_appointment_id uuid, p_patient_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_appointment clinic.appointments%rowtype;
  v_notice integer;
begin
  select * into v_appointment from clinic.appointments a where a.id = p_appointment_id
    and a.patient_id = p_patient_id and a.deleted_at is null for update;
  if not found then return 'not_your_appointment'; end if;
  if v_appointment.status not in ('pending', 'confirmed') then return 'not_cancellable'; end if;
  select cancellation_notice_hours into v_notice from clinic.settings;
  if (v_appointment.appointment_date + v_appointment.start_time) at time zone 'Africa/Cairo'
    < now() + make_interval(hours => coalesce(v_notice, 24)) then return 'too_late_to_cancel'; end if;
  update clinic.appointments set status = 'cancelled' where id = v_appointment.id;
  return 'cancelled';
end;
$$;

create function clinic.validate_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from clinic.appointments a join clinic.patients p on p.id = a.patient_id
    where a.id = new.appointment_id and a.patient_id = new.patient_id and a.status = 'completed'
      and a.deleted_at is null and p.deleted_at is null) then
    raise exception 'REVIEW_REQUIRES_COMPLETED_OWN_APPOINTMENT' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_reviews_validate before insert or update on clinic.reviews
  for each row execute function clinic.validate_review();

create or replace function clinic.get_dashboard_stats()
returns table (
  total_appointments bigint, completed_appointments bigint, cancelled_appointments bigint,
  no_show_appointments bigint, cancellation_rate numeric, total_revenue numeric,
  revenue_this_month numeric, average_rating numeric, reviews_count bigint
) language sql stable security invoker set search_path = '' as $$
  select count(*), count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'), count(*) filter (where status = 'no_show'),
    coalesce(round(100.0 * count(*) filter (where status = 'cancelled') / nullif(count(*), 0), 1), 0),
    (select coalesce(sum(amount), 0) from clinic.payments where status = 'paid'),
    (select coalesce(sum(amount), 0) from clinic.payments where status = 'paid'
      and paid_at >= date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'),
    (select round(avg(r.rating), 1) from clinic.reviews r join clinic.appointments a on a.id = r.appointment_id
      where a.deleted_at is null),
    (select count(*) from clinic.reviews r join clinic.appointments a on a.id = r.appointment_id
      where a.deleted_at is null)
  from clinic.appointments where deleted_at is null;
$$;

revoke execute on all functions in schema clinic from public, anon, authenticated;
grant execute on all functions in schema clinic to service_role;
