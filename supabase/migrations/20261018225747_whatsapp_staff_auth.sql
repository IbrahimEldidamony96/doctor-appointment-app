-- WhatsApp is the only sign-in identity. Keep historic opaque IDs and audit history.
alter table clinic.staff_accounts rename column clerk_user_id to id;
alter table clinic.staff_accounts rename column created_by_clerk_user_id to created_by;
alter table clinic.staff_accounts rename column updated_by_clerk_user_id to updated_by;
alter table clinic.staff_accounts drop constraint staff_accounts_clerk_user_id_check;
alter table clinic.staff_accounts drop constraint staff_accounts_role_check;
alter table clinic.staff_accounts alter column id set default gen_random_uuid()::text;
alter table clinic.staff_accounts add column phone text unique;
alter table clinic.staff_accounts add column is_owner boolean not null default false;
alter table clinic.staff_accounts add constraint staff_accounts_role_check
  check (role in ('doctor', 'nurse', 'secretary'));

alter table clinic.staff_audit_log rename column actor_clerk_user_id to actor_id;
alter table clinic.staff_audit_log rename column target_clerk_user_id to target_id;
alter table clinic.manual_booking_audit rename column actor_clerk_user_id to actor_id;
alter table clinic.appointment_reschedule_audit rename column actor_clerk_user_id to actor_id;
alter table clinic.patient_management_audit rename column actor_clerk_user_id to actor_id;

-- Keep patient audit lookup/foreign-key checks indexed alongside the existing
-- appointment and staff audit indexes.
create index if not exists idx_manual_booking_audit_patient
  on clinic.manual_booking_audit(patient_id);
create index if not exists idx_appointment_audit_events_patient
  on clinic.appointment_audit_events(patient_id);

create or replace function clinic.audit_staff_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into clinic.staff_audit_log(actor_id, target_id, action)
  values (new.updated_by, new.id,
    case
      when tg_op = 'INSERT' then 'staff_added'
      when new.is_active is distinct from old.is_active and new.is_active then 'staff_enabled'
      when new.is_active is distinct from old.is_active then 'staff_disabled'
      else 'staff_updated'
    end);
  return new;
end $$;

-- Clerk identities have no verified WhatsApp mapping. Explicit approval must link
-- a phone before they regain access; changing IDs would sever historical audits.
update clinic.staff_accounts set is_active = false where phone is null;
alter table clinic.staff_accounts add constraint staff_accounts_phone_check
  check ((phone is not null and phone ~ '^\+[1-9][0-9]{7,14}$')
    or (phone is null and not is_active and not is_owner));
alter table clinic.staff_accounts add constraint staff_accounts_owner_check
  check (not is_owner or (role = 'doctor' and is_active and phone is not null));
create unique index staff_accounts_single_owner on clinic.staff_accounts(is_owner)
  where is_owner;

create function clinic.protect_staff_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner then raise exception 'CLINIC_OWNER_PROTECTED' using errcode = '23514'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.phone is null then raise exception 'STAFF_PHONE_REQUIRED' using errcode = '23514'; end if;
  else
    if new.id is distinct from old.id then
      raise exception 'STAFF_ID_IMMUTABLE' using errcode = '23514';
    end if;
    if old.is_owner and (not new.is_owner or not new.is_active or new.role <> 'doctor') then
      raise exception 'CLINIC_OWNER_PROTECTED' using errcode = '23514';
    end if;
    if new.phone is null and old.phone is not null then
      raise exception 'STAFF_PHONE_REQUIRED' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trg_protect_staff_identity before insert or update or delete
  on clinic.staff_accounts for each row execute function clinic.protect_staff_identity();
revoke all on function clinic.protect_staff_identity() from public, anon, authenticated;
grant execute on function clinic.protect_staff_identity() to service_role;

-- Bootstrap is an operator-only action, never a registration path. The lock and
-- unique index protect against concurrent first-owner setup requests.
create function clinic.bootstrap_clinic_owner(p_phone text, p_display_name text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_id text;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 100 then
    raise exception 'INVALID_OWNER_INPUT' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(214732, 2);
  if exists (select 1 from clinic.staff_accounts where is_owner) then
    raise exception 'CLINIC_OWNER_ALREADY_EXISTS' using errcode = '23505';
  end if;
  select id into v_id from clinic.staff_accounts where phone = p_phone for update;
  if found then
    update clinic.staff_accounts set display_name = btrim(p_display_name),
      role = 'doctor', is_owner = true, is_active = true, updated_by = v_id
      where id = v_id;
  else
    v_id := gen_random_uuid()::text;
    insert into clinic.staff_accounts(id, phone, display_name, role, is_owner, created_by, updated_by)
      values (v_id, p_phone, btrim(p_display_name), 'doctor', true, v_id, v_id);
  end if;
  return v_id;
end $$;
revoke all on function clinic.bootstrap_clinic_owner(text, text) from public, anon, authenticated;
grant execute on function clinic.bootstrap_clinic_owner(text, text) to service_role;

-- Renaming input parameters requires DROP/CREATE, preserving all existing
-- business guards and atomic audit/outbox operations in the replacement RPCs.
drop function clinic.update_staff_appointment_status(uuid,text,text);
drop function clinic.create_staff_appointment(text,text,text,date,time,time,text);
drop function clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time);
drop function clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text);

create function clinic.update_staff_appointment_status(
  p_appointment_id uuid, p_actor_id text, p_status text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_status clinic.appointment_status;
begin
  if p_appointment_id is null
    or p_actor_id is null
    or not exists (select 1 from clinic.staff_accounts s
      where s.id = p_actor_id and s.is_active and s.phone is not null)
    or p_status is null
    or p_status not in ('confirmed','cancelled','completed','no_show') then
    return 'invalid_input';
  end if;
  if p_status in ('completed', 'no_show') and not exists (
    select 1 from clinic.staff_accounts s where s.id = p_actor_id and s.role = 'doctor'
  ) then return 'invalid_input'; end if;
  select status into v_status from clinic.appointments
    where id=p_appointment_id and deleted_at is null for update;
  if not found then return 'invalid_transition'; end if;
  if not (
    (v_status='pending' and p_status in ('confirmed','cancelled'))
    or (v_status='confirmed' and p_status in ('cancelled','completed','no_show'))
  ) then return 'invalid_transition'; end if;
  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_id, true);
  update clinic.appointments
    set status=p_status::clinic.appointment_status
    where id=p_appointment_id;
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return 'updated';
end $$;

create function clinic.create_staff_appointment(
  p_actor_id text,
  p_phone text,
  p_patient_name text,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_patient_id uuid;
  v_deleted_at timestamptz;
  v_appointment_id uuid;
begin
  if p_actor_id is null or not exists (select 1 from clinic.staff_accounts s
      where s.id = p_actor_id and s.is_active and s.phone is not null)
    or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_patient_name is null or char_length(btrim(p_patient_name)) not between 2 and 100
    or (p_reason is not null and char_length(p_reason) > 500) then
    raise exception 'INVALID_MANUAL_BOOKING_INPUT' using errcode = '22023';
  end if;
  -- Shares the advisory schedule lock with patient booking and schedule edits.
  perform pg_catalog.pg_advisory_xact_lock(214732, 1);

  -- Existing patients retain their verified profile data. Never silently revive
  -- a soft-deleted patient. First-time visitors get a record without WhatsApp OTP.
  insert into clinic.patients(phone, name) values (p_phone, btrim(p_patient_name))
    on conflict (phone) do nothing returning id into v_patient_id;

  if v_patient_id is null then
    select id, deleted_at into v_patient_id, v_deleted_at
    from clinic.patients where phone = p_phone for update;
    if v_patient_id is null or v_deleted_at is not null then
      raise exception 'PATIENT_INACTIVE' using errcode = '23503';
    end if;
  end if;

  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_id,true);
  insert into clinic.appointments(patient_id,appointment_date,start_time,end_time,reason_for_visit)
    values (v_patient_id,p_date,p_start_time,p_end_time,nullif(btrim(p_reason),''))
    returning id into v_appointment_id;
  insert into clinic.manual_booking_audit(appointment_id,patient_id,actor_id)
    values(v_appointment_id,v_patient_id,p_actor_id);
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return v_appointment_id;
end $$;

create function clinic.reschedule_staff_appointment(
  p_appointment_id uuid, p_actor_id text,
  p_expected_date date, p_expected_start_time time, p_expected_end_time time,
  p_date date, p_start_time time, p_end_time time
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_current clinic.appointments%rowtype;
begin
  if p_appointment_id is null or
    p_actor_id is null or
    not exists (select 1 from clinic.staff_accounts s
      where s.id = p_actor_id and s.is_active and s.phone is not null) or
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
  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_id,true);
  update clinic.appointments
    set appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
        reminder_sent_at = null, reminder_claimed_at = null, reminder_claim_token = null
    where id = p_appointment_id;
  perform pg_catalog.set_config('clinic.reschedule_appointment_id', '', true);
  perform pg_catalog.set_config('clinic.event_actor','',true);

  insert into clinic.appointment_reschedule_audit (
    appointment_id, actor_id,
    old_date, old_start_time, old_end_time, new_date, new_start_time, new_end_time
  ) values (
    p_appointment_id, p_actor_id,
    v_current.appointment_date, v_current.start_time, v_current.end_time,
    p_date, p_start_time, p_end_time
  );
  return pg_catalog.jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end $$;

create function clinic.update_staff_patient_profile(
  p_actor_id text, p_patient_id uuid,
  p_expected_updated_at timestamptz, p_name text, p_email text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_patient clinic.patients%rowtype;
  v_updated_at timestamptz;
  v_email text;
begin
  v_email := nullif(btrim(p_email), '');
  if p_actor_id is null or
     not exists (select 1 from clinic.staff_accounts s
      where s.id = p_actor_id and s.is_active and s.phone is not null and s.role = 'doctor')
     or p_patient_id is null or p_expected_updated_at is null
     or p_name is null or char_length(btrim(p_name)) not between 2 and 100
     or (v_email is not null and
       (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  select * into v_patient from clinic.patients
    where id = p_patient_id and deleted_at is null for update;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_patient.updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'stale');
  end if;
  if (v_patient.name, v_patient.email) is not distinct from (btrim(p_name), v_email) then
    return pg_catalog.jsonb_build_object('success', true,
      'updated_at', v_patient.updated_at);
  end if;

  update clinic.patients
    set name = btrim(p_name), email = v_email
    where id = p_patient_id returning updated_at into v_updated_at;
  insert into clinic.patient_management_audit
    (patient_id, actor_id, action)
    values (p_patient_id, p_actor_id, 'profile_updated');
  return pg_catalog.jsonb_build_object('success', true, 'updated_at', v_updated_at);
end $$;

revoke all on function clinic.update_staff_appointment_status(uuid,text,text) from public,anon,authenticated;
revoke all on function clinic.create_staff_appointment(text,text,text,date,time,time,text) from public,anon,authenticated;
revoke all on function clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time) from public,anon,authenticated;
revoke all on function clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function clinic.update_staff_appointment_status(uuid,text,text) to service_role;
grant execute on function clinic.create_staff_appointment(text,text,text,date,time,time,text) to service_role;
grant execute on function clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time) to service_role;
grant execute on function clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text) to service_role;
notify pgrst, 'reload schema';
