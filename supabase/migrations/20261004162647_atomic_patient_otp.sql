-- Serialize issuance and verification per phone, including the first send.
-- Retain consumed codes as rate-limit history; never fall back to an older code.
alter table clinic.otp_codes add column consumed_at timestamptz;
create index idx_otp_codes_phone_created_at on clinic.otp_codes (phone, created_at desc);

create or replace function clinic.issue_otp(p_phone text, p_code_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_latest timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_id uuid;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid OTP input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic.otp:' || p_phone, 0));
  v_now := pg_catalog.clock_timestamp();
  select max(created_at) into v_latest from clinic.otp_codes where phone = p_phone;
  if v_latest > v_now - interval '60 seconds' then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'too_many_requests',
      'retry_after', greatest(1, ceil(extract(epoch from v_latest + interval '60 seconds' - v_now))::integer));
  end if;
  select count(*), min(created_at) into v_count, v_oldest
    from clinic.otp_codes where phone = p_phone and created_at > v_now - interval '1 hour';
  if v_count >= 5 then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'too_many_requests',
      'retry_after', greatest(1, ceil(extract(epoch from v_oldest + interval '1 hour' - v_now))::integer));
  end if;
  select count(*), min(created_at) into v_count, v_oldest
    from clinic.otp_codes where phone = p_phone and created_at > v_now - interval '1 day';
  if v_count >= 12 then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'too_many_requests',
      'retry_after', greatest(1, ceil(extract(epoch from v_oldest + interval '1 day' - v_now))::integer));
  end if;

  update clinic.otp_codes set consumed_at = v_now
    where phone = p_phone and consumed_at is null;
  insert into clinic.otp_codes (phone, code_hash, expires_at, created_at)
    values (p_phone, p_code_hash, v_now + interval '5 minutes', v_now) returning id into v_id;
  return pg_catalog.jsonb_build_object('success', true, 'id', v_id);
end;
$$;

create or replace function clinic.verify_otp(p_phone text, p_code_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_otp clinic.otp_codes%rowtype;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid OTP input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('clinic.otp:' || p_phone, 0));
  v_now := pg_catalog.clock_timestamp();
  select * into v_otp from clinic.otp_codes where phone = p_phone
    order by created_at desc, id desc limit 1 for update;
  if not found or v_otp.consumed_at is not null then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_otp.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'expired');
  end if;
  if v_otp.attempts >= 5 then
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'too_many_attempts');
  end if;
  if v_otp.code_hash <> p_code_hash then
    update clinic.otp_codes set attempts = attempts + 1 where id = v_otp.id;
    return pg_catalog.jsonb_build_object('success', false, 'reason', 'invalid_code');
  end if;

  update clinic.otp_codes set consumed_at = v_now where id = v_otp.id;
  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

-- Application sessions are Clerk/custom JWTs. Only the server service role may
-- call OTP RPCs; they must not be exposed to anon/authenticated via PUBLIC.
revoke all on function clinic.issue_otp(text, text) from public, anon, authenticated;
revoke all on function clinic.verify_otp(text, text) from public, anon, authenticated;
grant usage on schema clinic to service_role;
grant select, insert, update on clinic.otp_codes to service_role;
grant execute on function clinic.issue_otp(text, text) to service_role;
grant execute on function clinic.verify_otp(text, text) to service_role;
