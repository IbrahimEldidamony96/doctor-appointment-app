-- The hosted project's API currently exposes api, public and graphql_public.
-- Preserve a role override if one exists. On fresh/local databases, retain only
-- the observed default schemas that exist, then add the server-only clinic API.
-- Role configuration takes precedence over future Dashboard exposure changes.
do $configuration$
declare
  v_schemas text;
begin
  select substring(setting from length('pgrst.db_schemas=') + 1) into v_schemas
  from pg_roles r cross join lateral unnest(r.rolconfig) setting
  where r.rolname = 'authenticator' and setting like 'pgrst.db_schemas=%';

  if v_schemas is null then
    select string_agg(default_schema.name, ', ' order by default_schema.position) into v_schemas
    from unnest(array['api', 'public', 'graphql_public']) with ordinality as default_schema(name, position)
    where exists(select 1 from pg_namespace n where n.nspname = default_schema.name);
  end if;
  if not exists (
    select 1 from unnest(string_to_array(coalesce(v_schemas, ''), ',')) exposed_schema
    where btrim(exposed_schema) = 'clinic'
  ) then
    v_schemas := concat_ws(', ', nullif(v_schemas, ''), 'clinic');
  end if;
  execute format('alter role authenticator set pgrst.db_schemas = %L', v_schemas);
end $configuration$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
