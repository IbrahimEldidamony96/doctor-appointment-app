-- Doctor/receptionist-initiated bookings: strictly service-role RPC only.
-- Caller is authenticated & role-authorized in Next.js before passing actor ID.
create table clinic.manual_booking_audit (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references clinic.appointments(id) on delete restrict,
  patient_id uuid not null references clinic.patients(id) on delete restrict,
  actor_clerk_user_id text not null,
  created_at timestamptz not null default now()
);
create index idx_manual_booking_audit_appointment on clinic.manual_booking_audit(appointment_id);
alter table clinic.manual_booking_audit enable row level security;
revoke all on clinic.manual_booking_audit from public, anon, authenticated;
grant select, insert on clinic.manual_booking_audit to service_role;
grant usage, select on sequence clinic.manual_booking_audit_id_seq to service_role;

create function clinic.create_staff_appointment(
  p_actor_clerk_user_id text,
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
  if p_actor_clerk_user_id is null or p_actor_clerk_user_id !~ '^user_[A-Za-z0-9]{8,}$'
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

  insert into clinic.appointments(patient_id,appointment_date,start_time,end_time,reason_for_visit)
    values (v_patient_id,p_date,p_start_time,p_end_time,nullif(btrim(p_reason),''))
    returning id into v_appointment_id;
  insert into clinic.manual_booking_audit(appointment_id,patient_id,actor_clerk_user_id)
    values(v_appointment_id,v_patient_id,p_actor_clerk_user_id);
  return v_appointment_id;
end $$;
revoke all on function clinic.create_staff_appointment(text,text,text,date,time,time,text)
  from public, anon, authenticated;
grant execute on function clinic.create_staff_appointment(text,text,text,date,time,time,text)
  to service_role;
notify pgrst, 'reload schema';
