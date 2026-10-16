-- Phase 2 / step 1: identities are Clerk user IDs. Doctor identity is env allowlisted
-- in the server; active secretary membership lives here. No RLS policies for clients.
create table clinic.staff_accounts (
  clerk_user_id text primary key check (clerk_user_id ~ '^user_[A-Za-z0-9]{8,}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  role text not null default 'secretary' check (role = 'secretary'),
  is_active boolean not null default true,
  created_by_clerk_user_id text not null,
  updated_by_clerk_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_staff_updated_at
  before update on clinic.staff_accounts
  for each row execute function clinic.set_updated_at();

create table clinic.staff_audit_log (
  id bigint generated always as identity primary key,
  actor_clerk_user_id text not null,
  target_clerk_user_id text not null,
  action text not null check (action in ('staff_added', 'staff_enabled', 'staff_disabled', 'staff_updated')),
  created_at timestamptz not null default now()
);

create function clinic.audit_staff_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into clinic.staff_audit_log(actor_clerk_user_id, target_clerk_user_id, action)
  values (
    new.updated_by_clerk_user_id,
    new.clerk_user_id,
    case
      when tg_op = 'INSERT' then 'staff_added'
      when new.is_active is distinct from old.is_active and new.is_active then 'staff_enabled'
      when new.is_active is distinct from old.is_active then 'staff_disabled'
      else 'staff_updated'
    end
  );
  return new;
end $$;
create trigger trg_staff_audit after insert or update on clinic.staff_accounts
  for each row execute function clinic.audit_staff_change();

alter table clinic.staff_accounts enable row level security;
alter table clinic.staff_audit_log enable row level security;
revoke all on clinic.staff_accounts, clinic.staff_audit_log from public, anon, authenticated;
revoke all on function clinic.audit_staff_change() from public, anon, authenticated;
grant usage on schema clinic to service_role;
grant select, insert, update, delete on clinic.staff_accounts to service_role;
grant select, insert on clinic.staff_audit_log to service_role;
grant usage, select on sequence clinic.staff_audit_log_id_seq to service_role;
grant execute on function clinic.audit_staff_change() to service_role;
notify pgrst, 'reload schema';
