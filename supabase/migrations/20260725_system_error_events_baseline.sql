-- Production-compatible, privacy-bounded system error aggregation baseline.

begin;

do $$
declare
  v_missing_roles text[];
begin
  select array_agg(v.role_name order by v.role_name)
    into v_missing_roles
  from (values ('anon'), ('authenticated'), ('service_role')) as v(role_name)
  where not exists (
    select 1 from pg_catalog.pg_roles as r where r.rolname = v.role_name
  );

  if coalesce(cardinality(v_missing_roles), 0) > 0 then
    raise exception 'SYSTEM_ERROR_EVENTS_PREFLIGHT_ROLES_MISSING: %', v_missing_roles;
  end if;

  if to_regprocedure('public.is_admin(uuid)') is null then
    raise exception 'SYSTEM_ERROR_EVENTS_PREFLIGHT_IS_ADMIN_MISSING';
  end if;

  if to_regprocedure('gen_random_uuid()') is null then
    raise exception 'SYSTEM_ERROR_EVENTS_PREFLIGHT_UUID_FUNCTION_MISSING';
  end if;
end;
$$;

create table if not exists public.system_error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  level text not null,
  category text not null,
  error_code text,
  title text not null,
  message text not null,
  route text,
  http_method text,
  http_status integer,
  environment text,
  request_id text,
  user_id uuid,
  admin_id uuid,
  order_id uuid,
  payment_id uuid,
  product_id uuid,
  sku_id uuid,
  occurrences bigint not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open',
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_error_events_level_check
    check (level in ('debug','info','warn','error','critical')),
  constraint system_error_events_status_check
    check (status in ('open','investigating','resolved','ignored')),
  constraint system_error_events_occurrences_check
    check (occurrences > 0),
  constraint system_error_events_http_status_check
    check (http_status is null or http_status between 100 and 599)
);

alter table public.system_error_events
  add column if not exists http_method text,
  add column if not exists http_status integer,
  add column if not exists environment text;

create unique index if not exists system_error_events_fingerprint_uidx
  on public.system_error_events(fingerprint);
create index if not exists system_error_events_status_last_seen_idx
  on public.system_error_events(status, last_seen_at desc);
create index if not exists system_error_events_category_last_seen_idx
  on public.system_error_events(category, last_seen_at desc);
create index if not exists system_error_events_request_id_idx
  on public.system_error_events(request_id)
  where request_id is not null;

alter table public.system_error_events enable row level security;

drop policy if exists "admins can read system error events" on public.system_error_events;
create policy "admins can read system error events"
on public.system_error_events
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "admins can update system error event status" on public.system_error_events;
create policy "admins can update system error event status"
on public.system_error_events
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.upsert_system_error_event(p_event jsonb)
returns public.system_error_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.system_error_events;
  v_role text;
  v_fingerprint text;
  v_metadata jsonb;
  v_message text;
begin
  v_role := nullif(auth.role(), '');
  if v_role is null then
    v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  end if;
  if v_role <> 'service_role' then
    raise exception 'SYSTEM_ERROR_EVENT_SERVICE_ROLE_REQUIRED';
  end if;

  v_fingerprint := lower(coalesce(p_event->>'fingerprint', ''));
  if v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'SYSTEM_ERROR_EVENT_FINGERPRINT_INVALID';
  end if;

  v_message := left(coalesce(nullif(btrim(p_event->>'message'), ''), 'No message'), 800);
  v_message := regexp_replace(v_message, '(Bearer[[:space:]]+)[A-Za-z0-9._-]+', '\1[redacted]', 'gi');
  v_message := regexp_replace(v_message, '(key|token|secret|signature)=([^&[:space:]]+)', '\1=[redacted]', 'gi');
  v_message := regexp_replace(v_message, '0x[0-9A-Fa-f]{40,64}', '[redacted-chain-value]', 'g');

  v_metadata := coalesce(p_event->'metadata', '{}'::jsonb);
  if jsonb_typeof(v_metadata) <> 'object' then
    v_metadata := '{}'::jsonb;
  end if;
  v_metadata := v_metadata - array[
    'password', 'token', 'access_token', 'refresh_token', 'secret',
    'authorization', 'cookie', 'private_key', 'tx_hash', 'delivery_content',
    'encrypted_content', 'request_body', 'connection_string', 'environment_variables'
  ]::text[];
  if octet_length(v_metadata::text) > 8192 then
    v_metadata := jsonb_build_object('truncated', true);
  end if;

  insert into public.system_error_events (
    fingerprint, level, category, error_code, title, message, route,
    http_method, http_status, environment, request_id,
    user_id, admin_id, order_id, payment_id, product_id, sku_id,
    status, metadata
  )
  values (
    v_fingerprint,
    case when p_event->>'level' in ('debug','info','warn','error','critical') then p_event->>'level' else 'error' end,
    left(coalesce(nullif(btrim(p_event->>'category'), ''), 'system'), 80),
    left(nullif(btrim(p_event->>'error_code'), ''), 80),
    left(coalesce(nullif(btrim(p_event->>'title'), ''), 'System error'), 160),
    v_message,
    left(nullif(btrim(p_event->>'route'), ''), 512),
    left(upper(nullif(btrim(p_event->>'http_method'), '')), 16),
    case when (p_event->>'http_status') ~ '^[0-9]{3}$' then (p_event->>'http_status')::integer else null end,
    left(nullif(btrim(p_event->>'environment'), ''), 40),
    left(nullif(btrim(p_event->>'request_id'), ''), 160),
    case when (p_event->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'user_id')::uuid else null end,
    case when (p_event->>'admin_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'admin_id')::uuid else null end,
    case when (p_event->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'order_id')::uuid else null end,
    case when (p_event->>'payment_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'payment_id')::uuid else null end,
    case when (p_event->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'product_id')::uuid else null end,
    case when (p_event->>'sku_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_event->>'sku_id')::uuid else null end,
    case when p_event->>'status' in ('open','investigating','resolved','ignored') then p_event->>'status' else 'open' end,
    v_metadata
  )
  on conflict (fingerprint)
  do update set
    occurrences = public.system_error_events.occurrences + 1,
    last_seen_at = now(),
    level = excluded.level,
    error_code = coalesce(excluded.error_code, public.system_error_events.error_code),
    message = excluded.message,
    route = coalesce(excluded.route, public.system_error_events.route),
    http_method = coalesce(excluded.http_method, public.system_error_events.http_method),
    http_status = coalesce(excluded.http_status, public.system_error_events.http_status),
    environment = coalesce(excluded.environment, public.system_error_events.environment),
    request_id = coalesce(excluded.request_id, public.system_error_events.request_id),
    user_id = coalesce(excluded.user_id, public.system_error_events.user_id),
    admin_id = coalesce(excluded.admin_id, public.system_error_events.admin_id),
    order_id = coalesce(excluded.order_id, public.system_error_events.order_id),
    payment_id = coalesce(excluded.payment_id, public.system_error_events.payment_id),
    product_id = coalesce(excluded.product_id, public.system_error_events.product_id),
    sku_id = coalesce(excluded.sku_id, public.system_error_events.sku_id),
    metadata = public.system_error_events.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_event;

  return v_event;
end;
$$;

revoke all privileges on table public.system_error_events from public, anon, authenticated, service_role;

do $$
declare
  v_column_list text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_column_list
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'public.system_error_events'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if nullif(v_column_list, '') is null then
    raise exception 'SYSTEM_ERROR_EVENTS_COLUMN_ACL_RESET_NO_COLUMNS';
  end if;

  execute format(
    'revoke select (%s) on table public.system_error_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke insert (%s) on table public.system_error_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke update (%s) on table public.system_error_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke references (%s) on table public.system_error_events from public, anon, authenticated, service_role',
    v_column_list
  );
end;
$$;

grant select on table public.system_error_events to authenticated;
grant update (status, resolution_note, updated_at) on table public.system_error_events to authenticated;
grant select, insert, update, delete on table public.system_error_events to service_role;

revoke execute on function public.upsert_system_error_event(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_system_error_event(jsonb) to service_role;

do $$
declare
  v_definition text;
  v_config text[];
  v_security_definer boolean;
  v_rls boolean;
  v_missing_columns text[];
begin
  select p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid)
    into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'upsert_system_error_event'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_event jsonb';

  select c.relrowsecurity
    into v_rls
  from pg_catalog.pg_class as c
  where c.oid = 'public.system_error_events'::regclass;

  select array_agg(v.column_name order by v.column_name)
    into v_missing_columns
  from (
    values
      ('id'), ('fingerprint'), ('level'), ('category'), ('error_code'),
      ('title'), ('message'), ('route'), ('http_method'), ('http_status'),
      ('environment'), ('request_id'), ('user_id'), ('admin_id'), ('order_id'),
      ('payment_id'), ('product_id'), ('sku_id'), ('occurrences'),
      ('first_seen_at'), ('last_seen_at'), ('status'), ('resolution_note'),
      ('metadata'), ('created_at'), ('updated_at')
  ) as v(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'system_error_events'
      and c.column_name = v.column_name
  );

  if v_definition is null
     or not v_security_definer
     or not ('search_path=public' = any(coalesce(v_config, array[]::text[])))
     or position('occurrences = public.system_error_events.occurrences + 1' in v_definition) = 0
     or not v_rls
     or coalesce(cardinality(v_missing_columns), 0) > 0 then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_CONTRACT_FAILED';
  end if;

  if has_function_privilege('anon', 'public.upsert_system_error_event(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.upsert_system_error_event(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.upsert_system_error_event(jsonb)', 'EXECUTE') then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_RPC_PRIVILEGES_FAILED';
  end if;

  if has_table_privilege('anon', 'public.system_error_events', 'SELECT')
     or has_table_privilege('anon', 'public.system_error_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.system_error_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.system_error_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.system_error_events', 'TRUNCATE') then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_TABLE_PRIVILEGES_FAILED';
  end if;

  if not has_table_privilege('service_role', 'public.system_error_events', 'SELECT')
     or not has_table_privilege('service_role', 'public.system_error_events', 'INSERT')
     or not has_table_privilege('service_role', 'public.system_error_events', 'UPDATE')
     or not has_table_privilege('service_role', 'public.system_error_events', 'DELETE') then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_SERVICE_ROLE_CRUD_MISSING';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    left join pg_catalog.pg_roles as r on r.oid = acl.grantee
    where c.oid = 'public.system_error_events'::regclass
      and (
        acl.grantee = 0
        or r.rolname = 'anon'
        or (r.rolname = 'authenticated' and acl.privilege_type <> 'SELECT')
        or (r.rolname = 'service_role' and acl.privilege_type not in ('SELECT','INSERT','UPDATE','DELETE'))
      )
  ) then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_UNEXPECTED_TABLE_ACL';
  end if;

  if not has_column_privilege('authenticated', 'public.system_error_events', 'status', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.system_error_events', 'resolution_note', 'UPDATE')
     or has_column_privilege('authenticated', 'public.system_error_events', 'message', 'UPDATE')
     or has_column_privilege('authenticated', 'public.system_error_events', 'metadata', 'UPDATE') then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_ADMIN_COLUMN_PRIVILEGES_FAILED';
  end if;

  if exists (
    with explicit_column_acls as materialized (
      select a.attname, a.attacl
      from pg_catalog.pg_attribute as a
      where a.attrelid = 'public.system_error_events'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and a.attacl is not null
        and cardinality(a.attacl) > 0
    )
    select 1
    from explicit_column_acls as a
    cross join lateral pg_catalog.aclexplode(a.attacl) as acl
    left join pg_catalog.pg_roles as r on r.oid = acl.grantee
    where acl.grantee = 0
       or r.rolname in ('anon', 'service_role')
       or (
         r.rolname = 'authenticated'
         and (acl.privilege_type <> 'UPDATE' or a.attname not in ('status','resolution_note','updated_at'))
       )
  ) then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_UNEXPECTED_COLUMN_ACL';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'system_error_events'
      and policyname = 'admins can read system error events'
      and cmd = 'SELECT'
  ) then
    raise exception 'SYSTEM_ERROR_EVENTS_POSTCHECK_ADMIN_POLICY_MISSING';
  end if;
end;
$$;

commit;

-- Manual rollback (do not run automatically):
-- revoke execute on function public.upsert_system_error_event(jsonb) from service_role;
-- drop function if exists public.upsert_system_error_event(jsonb);
-- drop table if exists public.system_error_events;
-- Only drop the table after exporting any operational evidence created after rollout.
