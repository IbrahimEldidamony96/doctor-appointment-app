-- Doctor-only patient profile edits & controlled per-patient CSV export audit.
-- Cover scoped, latest-first visit history without scanning unrelated patients.
create index if not exists idx_appointments_patient_history
  on clinic.appointments(patient_id, appointment_date desc, start_time desc, id desc)
  where deleted_at is null;

-- The application authorizes current Clerk role before using the service-role RPC.
create table clinic.patient_management_audit (
  id bigint generated always as identity primary key,
  patient_id uuid not null references clinic.patients(id) on delete restrict,
  actor_clerk_user_id text not null,
  action text not null check (action in ('profile_updated', 'history_exported')),
  created_at timestamptz not null default now()
);
create index idx_patient_management_audit_patient
  on clinic.patient_management_audit(patient_id, created_at desc);
alter table clinic.patient_management_audit enable row level security;
revoke all on clinic.patient_management_audit from public, anon, authenticated;
grant select, insert on clinic.patient_management_audit to service_role;
grant usage, select on sequence clinic.patient_management_audit_id_seq to service_role;

-- The row update and the audit event must commit/roll back together.
-- A client-supplied stale timestamp is checked while holding a row lock.
create function clinic.update_staff_patient_profile(
  p_actor_clerk_user_id text, p_patient_id uuid,
  p_expected_updated_at timestamptz, p_name text, p_email text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_patient clinic.patients%rowtype;
  v_updated_at timestamptz;
  v_email text;
begin
  v_email := nullif(btrim(p_email), '');
  if p_actor_clerk_user_id is null or
     p_actor_clerk_user_id !~ '^user_[A-Za-z0-9]{8,}$'
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
    (patient_id, actor_clerk_user_id, action)
    values (p_patient_id, p_actor_clerk_user_id, 'profile_updated');
  return pg_catalog.jsonb_build_object('success', true, 'updated_at', v_updated_at);
end $$;

revoke all on function clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text)
  to service_role;
notify pgrst, 'reload schema';
