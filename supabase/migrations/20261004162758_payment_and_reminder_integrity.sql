-- Callbacks correlate with the HMAC-signed Paymob order id. Merchant references are unsigned.
alter table clinic.settings add constraint settings_consultation_price
  check (consultation_price is null or consultation_price between 0 and 100000);
alter table clinic.payments add constraint payments_positive_amount check (amount > 0);
alter table clinic.payments
  add column provider_order_id text,
  add column intention_id text,
  add column checkout_url text;
create unique index uq_payments_provider_order on clinic.payments(provider, provider_order_id)
  where provider_order_id is not null;
-- Legacy transaction_id held intention ids. Leave them for manual reconciliation.
create unique index uq_payments_transaction on clinic.payments(provider, transaction_id)
  where transaction_id is not null;

alter table clinic.appointments
  add column reminder_claimed_at timestamptz,
  add column reminder_claim_token uuid;
create index idx_appointments_reminder_queue on clinic.appointments(appointment_date,start_time)
  where status = 'confirmed' and deleted_at is null and reminder_sent_at is null;

create or replace function clinic.begin_payment_attempt(p_appointment_id uuid, p_patient_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  appt clinic.appointments%rowtype;
  payment clinic.payments%rowtype;
  price numeric;
begin
  select * into appt from clinic.appointments where id = p_appointment_id for update;
  if not found or appt.patient_id <> p_patient_id or appt.deleted_at is not null then
    return jsonb_build_object('success', false, 'reason', 'not_your_appointment');
  end if;
  if appt.status not in ('pending', 'confirmed') or
     (appt.appointment_date + appt.start_time) at time zone 'Africa/Cairo' <= now() then
    return jsonb_build_object('success', false, 'reason', 'not_payable');
  end if;
  if exists(select 1 from clinic.payments where appointment_id = appt.id and status = 'paid') then
    return jsonb_build_object('success', false, 'reason', 'already_paid');
  end if;
  -- The checkout expires in one hour; retain its order id so a delayed callback can be reconciled.
  update clinic.payments set status = 'failed'
    where appointment_id = appt.id and status = 'pending' and created_at < now() - interval '65 minutes';
  select * into payment from clinic.payments where appointment_id = appt.id and status = 'pending'
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('success', true, 'existing', true, 'payment', to_jsonb(payment));
  end if;
  select consultation_price into price from clinic.settings limit 1;
  if price is null or price <= 0 then
    return jsonb_build_object('success', false, 'reason', 'no_price_configured');
  end if;
  insert into clinic.payments(appointment_id, amount) values(appt.id, price) returning * into payment;
  return jsonb_build_object('success', true, 'existing', false, 'payment', to_jsonb(payment));
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
    update clinic.appointments set status = 'confirmed'
      where id = appt_id and status = 'pending' and deleted_at is null;
    confirmed := found;
  end if;
  return jsonb_build_object('success', true, 'confirmed', confirmed, 'appointment_id', appt_id);
end $$;

revoke all on function clinic.begin_payment_attempt(uuid,uuid) from public, anon, authenticated;
revoke all on function clinic.apply_paymob_transaction(text,text,bigint,boolean) from public, anon, authenticated;
grant execute on function clinic.begin_payment_attempt(uuid,uuid) to service_role;
grant execute on function clinic.apply_paymob_transaction(text,text,bigint,boolean) to service_role;
create or replace function clinic.claim_appointment_reminders()
returns table(id uuid, appointment_date date, start_time time, patient_name text, phone text, claim_token uuid)
language sql security invoker set search_path = '' as $$
  with candidates as (
    select a.id from clinic.appointments a
    join clinic.patients p on p.id = a.patient_id and p.deleted_at is null
    where a.status = 'confirmed' and a.deleted_at is null and a.reminder_sent_at is null
      and (a.reminder_claimed_at is null or a.reminder_claimed_at < now() - interval '15 minutes')
      and (a.appointment_date + a.start_time) at time zone 'Africa/Cairo' > now()
      and (a.appointment_date + a.start_time) at time zone 'Africa/Cairo' <= now() + interval '24 hours'
    order by a.appointment_date, a.start_time limit 12 for update of a skip locked
  ), claimed as (
    update clinic.appointments a set reminder_claimed_at = now(), reminder_claim_token = gen_random_uuid()
    from candidates c where a.id = c.id
    returning a.id, a.patient_id, a.appointment_date, a.start_time, a.reminder_claim_token
  )
  select c.id, c.appointment_date, c.start_time, p.name, p.phone, c.reminder_claim_token
    from claimed c join clinic.patients p on p.id = c.patient_id;
$$;
revoke all on function clinic.claim_appointment_reminders() from public, anon, authenticated;
grant execute on function clinic.claim_appointment_reminders() to service_role;
notify pgrst, 'reload schema';
