-- Phase 2 / Step 6: audit all appointment creations/transitions/reschedules
-- and persist email notifications in the SAME transaction as the change.
-- Depends on migrations from phases 1 and 2 (staff, manual booking, reschedule).
-- No publicly executable RPCs and no public table access.

create table clinic.appointment_audit_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references clinic.appointments(id) on delete restrict,
  patient_id uuid not null references clinic.patients(id) on delete restrict,
  actor text not null check (length(actor) between 1 and 160),
  event_type text not null check (event_type in ('created','status_changed','rescheduled','soft_deleted')),
  old_status text, new_status text,
  old_date date, new_date date,
  old_start_time time, new_start_time time,
  old_end_time time, new_end_time time,
  created_at timestamptz not null default now()
);
create index idx_appointment_audit_visit on clinic.appointment_audit_events
  (appointment_id, id desc);

create table clinic.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  audit_event_id bigint not null unique references clinic.appointment_audit_events(id) on delete restrict,
  appointment_id uuid not null references clinic.appointments(id) on delete restrict,
  event_type text not null check (event_type in ('booked','confirmed','cancelled','rescheduled')),
  destination_email text not null,
  payload jsonb not null,
  state text not null default 'pending'
    check (state in ('pending','processing','retry','sent','dead','suppressed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now()
);
create index idx_outbox_ready on clinic.notification_outbox
  (next_attempt_at,created_at) where state in ('pending','retry');
create index idx_outbox_lease on clinic.notification_outbox
  (claimed_at) where state = 'processing';
create index idx_outbox_appointment on clinic.notification_outbox
  (appointment_id,created_at desc);

alter table clinic.appointment_audit_events enable row level security;
alter table clinic.notification_outbox enable row level security;
revoke all on clinic.appointment_audit_events, clinic.notification_outbox
  from public, anon, authenticated;
-- Earlier migrations grant ALL default table privileges to service_role.
-- Explicitly revoke writes on every append-only audit table after creation.
revoke update,delete,truncate,references,trigger on
  clinic.appointment_audit_events,
  clinic.staff_audit_log,
  clinic.manual_booking_audit,
  clinic.appointment_reschedule_audit,
  clinic.patient_management_audit from service_role;
revoke delete,truncate,references,trigger on clinic.notification_outbox from service_role;
grant select, insert on clinic.appointment_audit_events to service_role;
grant select, insert, update on clinic.notification_outbox to service_role;
grant usage,select on sequence clinic.appointment_audit_events_id_seq to service_role;

create function clinic.capture_appointment_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event text;
  v_message text;
  v_event_id bigint;
  v_email text;
  v_name text;
  v_actor text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
    v_message := 'booked';
  elsif new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then
    v_event := 'soft_deleted';
  elsif new.status is distinct from old.status then
    v_event := 'status_changed';
    if new.status = 'confirmed' then v_message := 'confirmed'; end if;
    if new.status = 'cancelled' then v_message := 'cancelled'; end if;
  elsif (new.appointment_date,new.start_time,new.end_time)
    is distinct from (old.appointment_date,old.start_time,old.end_time) then
    v_event := 'rescheduled';
    v_message := 'rescheduled';
  else
    return new;
  end if;

  v_actor := nullif(pg_catalog.current_setting('clinic.event_actor',true),'');
  v_actor := coalesce(v_actor, 'system:unattributed');
  insert into clinic.appointment_audit_events(
    appointment_id,patient_id,actor,event_type,old_status,new_status,
    old_date,new_date,old_start_time,new_start_time,old_end_time,new_end_time
  ) values (
    new.id,new.patient_id,v_actor,v_event,
    case when tg_op = 'INSERT' then null else old.status::text end,new.status::text,
    case when tg_op = 'INSERT' then null else old.appointment_date end,new.appointment_date,
    case when tg_op = 'INSERT' then null else old.start_time end,new.start_time,
    case when tg_op = 'INSERT' then null else old.end_time end,new.end_time
  ) returning id into v_event_id;

  -- Prior unsent jobs become obsolete after a later change.
  update clinic.notification_outbox set state='suppressed', claim_token=null,claimed_at=null
    where appointment_id=new.id and state in ('pending','retry');

  if v_message is null then return new; end if;
  select p.name,p.email into v_name,v_email from clinic.patients p
    where p.id=new.patient_id and p.deleted_at is null;
  if nullif(btrim(v_email),'') is null then return new; end if;

  insert into clinic.notification_outbox(
    audit_event_id,appointment_id,event_type,destination_email,payload
  ) values (
    v_event_id,new.id,v_message,v_email,
    pg_catalog.jsonb_build_object(
      'name',coalesce(v_name,''),'date',new.appointment_date::text,
      'time',to_char(new.start_time,'HH24:MI'),
      'status',new.status::text,
      'previous_date',case when tg_op = 'INSERT' then null else old.appointment_date::text end,
      'previous_time',case when tg_op = 'INSERT' then null else to_char(old.start_time,'HH24:MI') end
    )
  );
  return new;
end $$;
create trigger trg_appointment_event
  after insert or update on clinic.appointments
  for each row execute function clinic.capture_appointment_event();

-- Staff status changes use a narrow service-role RPC so a trusted actor can
-- be stamped inside the same transaction as the event/audit/outbox.
create function clinic.update_staff_appointment_status(
  p_appointment_id uuid, p_actor_clerk_user_id text, p_status text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_status clinic.appointment_status;
begin
  if p_appointment_id is null
    or p_actor_clerk_user_id is null
    or p_actor_clerk_user_id !~ '^user_[A-Za-z0-9]{8,}$'
    or p_status not in ('confirmed','cancelled','completed','no_show') then
    return 'invalid_input';
  end if;
  select status into v_status from clinic.appointments
    where id=p_appointment_id and deleted_at is null for update;
  if not found then return 'invalid_transition'; end if;
  if not (
    (v_status='pending' and p_status in ('confirmed','cancelled'))
    or (v_status='confirmed' and p_status in ('cancelled','completed','no_show'))
  ) then return 'invalid_transition'; end if;
  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_clerk_user_id, true);
  update clinic.appointments
    set status=p_status::clinic.appointment_status
    where id=p_appointment_id;
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return 'updated';
end $$;

-- Claim is atomic and skips rows leased to another invocation. Reclaimed jobs
-- reuse the same idempotency key and retain attempt counts.
create function clinic.claim_notification_outbox(p_limit integer default 4,p_appointment_id uuid default null)
returns table (
  id uuid,claim_token uuid,event_type text,destination_email text,
  payload jsonb,appointment_id uuid,attempts integer
) language plpgsql security invoker set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'INVALID_OUTBOX_LIMIT' using errcode='22023';
  end if;
  -- A worker can crash after its fifth claim; expire its final lease
  -- instead of leaving the job processing forever.
  update clinic.notification_outbox o
    set state='dead',claimed_at=null,claim_token=null,
      last_error='final_worker_lease_expired'
    where o.state='processing' and o.attempts>=5
      and o.claimed_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select o.id from clinic.notification_outbox o
    where ((o.state in ('pending','retry') and o.next_attempt_at <= now())
       or (o.state = 'processing' and o.claimed_at < now() - interval '5 minutes'))
      and o.attempts < 5
      and (p_appointment_id is null or o.appointment_id = p_appointment_id)
    order by o.next_attempt_at,o.created_at,o.id
    limit p_limit for update skip locked
  ), leased as (
    update clinic.notification_outbox o
      set state='processing',claimed_at=now(),claim_token=gen_random_uuid(),attempts=o.attempts+1
      from candidates c where o.id=c.id
      returning o.id,o.claim_token,o.event_type,o.destination_email,o.payload,o.appointment_id,o.attempts
  )
  select l.id,l.claim_token,l.event_type,l.destination_email,l.payload,l.appointment_id,l.attempts
    from leased l;
end $$;

-- Acknowledge only with the current lease token. Retried failures have
-- exponential backoff. Treat a superseded event as final, without sending.
create function clinic.finish_notification_outbox(
  p_id uuid,p_claim_token uuid,p_result text,
  p_provider_message_id text default null,p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_result not in ('sent','retry','suppressed') then
    raise exception 'INVALID_OUTBOX_RESULT' using errcode='22023';
  end if;
  update clinic.notification_outbox o set
    state = case
      when p_result='sent' then 'sent'
      when p_result='suppressed' then 'suppressed'
      when o.attempts >= 5 then 'dead'
      else 'retry' end,
    delivered_at = case when p_result='sent' then now() else null end,
    provider_message_id = case when p_result='sent' then left(p_provider_message_id,200) else null end,
    last_error = case when p_result='retry' then left(coalesce(p_error,'delivery_failed'),200) else null end,
    next_attempt_at = case when p_result='retry'
      then now() + make_interval(secs => least(21600,300*power(2,least(o.attempts-1,6)))::integer)
      else o.next_attempt_at end,
    claimed_at=null,claim_token=null
    where o.id=p_id and o.claim_token=p_claim_token and o.state='processing';
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;

revoke all on function clinic.capture_appointment_event()
  from public,anon,authenticated;
revoke all on function clinic.update_staff_appointment_status(uuid,text,text)
  from public,anon,authenticated;
revoke all on function clinic.claim_notification_outbox(integer,uuid)
  from public,anon,authenticated;
revoke all on function clinic.finish_notification_outbox(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function clinic.capture_appointment_event() to service_role;
grant execute on function clinic.update_staff_appointment_status(uuid,text,text) to service_role;
grant execute on function clinic.claim_notification_outbox(integer,uuid) to service_role;
grant execute on function clinic.finish_notification_outbox(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';

-- Attach trusted event actors to existing server-only business RPCs, retaining
-- all original guards, locks, and return contracts. Session settings are local
-- to the request's database transaction and cleared after each mutation.

create or replace function clinic.create_patient_appointment(
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
  perform pg_catalog.set_config('clinic.event_actor', 'patient:' || p_patient_id::text,true);
  insert into clinic.appointments (patient_id, appointment_date, start_time, end_time, reason_for_visit)
    values (p_patient_id, p_date, p_start_time, p_end_time, p_reason) returning id into v_id;
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return v_id;
end;
$$;

create or replace function clinic.cancel_patient_appointment(p_appointment_id uuid, p_patient_id uuid)
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
  perform pg_catalog.set_config('clinic.event_actor', 'patient:' || p_patient_id::text,true);
  update clinic.appointments set status = 'cancelled' where id = v_appointment.id;
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return 'cancelled';
end;
$$;

create or replace function clinic.create_staff_appointment(
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

  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_clerk_user_id,true);
  insert into clinic.appointments(patient_id,appointment_date,start_time,end_time,reason_for_visit)
    values (v_patient_id,p_date,p_start_time,p_end_time,nullif(btrim(p_reason),''))
    returning id into v_appointment_id;
  insert into clinic.manual_booking_audit(appointment_id,patient_id,actor_clerk_user_id)
    values(v_appointment_id,v_patient_id,p_actor_clerk_user_id);
  perform pg_catalog.set_config('clinic.event_actor','',true);
  return v_appointment_id;
end $$;

create or replace function clinic.reschedule_staff_appointment(
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
  perform pg_catalog.set_config('clinic.event_actor', 'staff:' || p_actor_clerk_user_id,true);
  update clinic.appointments
    set appointment_date = p_date, start_time = p_start_time, end_time = p_end_time,
        reminder_sent_at = null, reminder_claimed_at = null, reminder_claim_token = null
    where id = p_appointment_id;
  perform pg_catalog.set_config('clinic.reschedule_appointment_id', '', true);
  perform pg_catalog.set_config('clinic.event_actor','',true);

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

create or replace function clinic.apply_paymob_transaction(
  p_order_id text, p_transaction_id text, p_amount_cents bigint, p_success boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  payment clinic.payments%rowtype;
  appt_id uuid;
  confirmed boolean := false;
begin
  if p_order_id is null or p_order_id = '' or p_transaction_id is null or p_transaction_id = ''
    or p_amount_cents is null or p_amount_cents <= 0 or p_success is null then
    return jsonb_build_object('success', false, 'reason', 'invalid_transaction');
  end if;
  select appointment_id into appt_id from clinic.payments
    where provider = 'paymob' and provider_order_id = p_order_id;
  if not found then return jsonb_build_object('success', false, 'reason', 'unknown_order'); end if;
  -- Take locks in the same order as begin_payment_attempt to avoid deadlocks.
  perform 1 from clinic.appointments where id = appt_id for update;
  select * into payment from clinic.payments
    where provider = 'paymob' and provider_order_id = p_order_id for update;
  if not found then return jsonb_build_object('success', false, 'reason', 'unknown_order'); end if;
  if payment.currency <> 'EGP' or payment.amount * 100 <> p_amount_cents then
    return jsonb_build_object('success', false, 'reason', 'amount_mismatch');
  end if;
  if payment.status in ('paid', 'refunded') then
    return jsonb_build_object('success', true, 'duplicate', true, 'confirmed', false);
  end if;
  if exists(select 1 from clinic.payments where provider = 'paymob' and transaction_id = p_transaction_id and id <> payment.id) then
    return jsonb_build_object('success', false, 'reason', 'transaction_conflict');
  end if;
  if not p_success and payment.status <> 'pending' then
    return jsonb_build_object('success', true, 'duplicate', true, 'confirmed', false);
  end if;
  update clinic.payments set status = case when p_success then 'paid'::clinic.payment_status else 'failed'::clinic.payment_status end,
    transaction_id = p_transaction_id, paid_at = case when p_success then now() else null end
    where id = payment.id;
  if p_success then
    perform pg_catalog.set_config('clinic.event_actor','provider:paymob',true);
    update clinic.appointments set status = 'confirmed'
      where id = appt_id and status = 'pending' and deleted_at is null;
    confirmed := found;
    perform pg_catalog.set_config('clinic.event_actor','',true);
  end if;
  return jsonb_build_object('success', true, 'confirmed', confirmed, 'appointment_id', appt_id);
end $$;
notify pgrst,'reload schema';
