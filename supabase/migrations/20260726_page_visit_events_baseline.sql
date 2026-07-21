-- Privacy-minimized page-view event storage used by the service-role ingest
-- route and the authenticated administrator dashboard.

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
    raise exception 'PAGE_VISIT_EVENTS_PREFLIGHT_ROLES_MISSING: %', v_missing_roles;
  end if;

  if to_regprocedure('public.is_admin(uuid)') is null then
    raise exception 'PAGE_VISIT_EVENTS_PREFLIGHT_IS_ADMIN_MISSING';
  end if;

  if to_regprocedure('gen_random_uuid()') is null then
    raise exception 'PAGE_VISIT_EVENTS_PREFLIGHT_UUID_FUNCTION_MISSING';
  end if;
end;
$$;

create table if not exists public.page_visit_events (
  id uuid primary key default gen_random_uuid(),
  visit_date timestamptz not null default now(),
  page_path text not null,
  referrer_path text,
  visitor_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_key text,
  user_agent_hash text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_page_path_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_page_path_check
      check (
        char_length(page_path) between 1 and 512
        and left(page_path, 1) = '/'
        and page_path !~ '[[:cntrl:]]'
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_referrer_path_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_referrer_path_check
      check (
        referrer_path is null
        or (
          char_length(referrer_path) between 1 and 120
          and referrer_path !~ '[[:space:]/]'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_visitor_key_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_visitor_key_check
      check (visitor_key ~ '^anon:[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_session_key_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_session_key_check
      check (session_key is null or session_key ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_user_agent_hash_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_user_agent_hash_check
      check (user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_ip_hash_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_ip_hash_check
      check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.page_visit_events'::regclass
      and conname = 'page_visit_events_metadata_check'
  ) then
    alter table public.page_visit_events
      add constraint page_visit_events_metadata_check
      check (
        jsonb_typeof(metadata) = 'object'
        and octet_length(metadata::text) <= 2048
      );
  end if;
end;
$$;

create index if not exists page_visit_events_visit_date_idx
  on public.page_visit_events(visit_date desc);

create index if not exists page_visit_events_visitor_path_date_idx
  on public.page_visit_events(visitor_key, page_path, visit_date desc);

create index if not exists page_visit_events_path_date_idx
  on public.page_visit_events(page_path, visit_date desc);

alter table public.page_visit_events enable row level security;

drop policy if exists "Admins can read page visit events" on public.page_visit_events;
create policy "Admins can read page visit events"
on public.page_visit_events
for select
to authenticated
using (public.is_admin(auth.uid()));

revoke all privileges on table public.page_visit_events from public, anon, authenticated, service_role;

do $$
declare
  v_column_list text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_column_list
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'public.page_visit_events'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if nullif(v_column_list, '') is null then
    raise exception 'PAGE_VISIT_EVENTS_COLUMN_ACL_RESET_NO_COLUMNS';
  end if;

  execute format(
    'revoke select (%s) on table public.page_visit_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke insert (%s) on table public.page_visit_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke update (%s) on table public.page_visit_events from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke references (%s) on table public.page_visit_events from public, anon, authenticated, service_role',
    v_column_list
  );
end;
$$;

grant select on table public.page_visit_events to authenticated;
grant select, insert on table public.page_visit_events to service_role;

comment on table public.page_visit_events is
  'Privacy-minimized page-view events. Retain detailed rows for up to 90 days after an approved retention job exists; this migration performs no deletion.';
comment on column public.page_visit_events.page_path is
  'Sanitized relative page path. Sensitive query keys and oversized query values are removed by the ingest route.';
comment on column public.page_visit_events.referrer_path is
  'Referrer hostname only, never a full URL.';
comment on column public.page_visit_events.visitor_key is
  'Server-side SHA-256 digest of the browser visitor key, prefixed with anon:.';
comment on column public.page_visit_events.user_agent_hash is
  'SHA-256 digest only; raw User-Agent values are not stored.';
comment on column public.page_visit_events.ip_hash is
  'SHA-256 digest only; raw IP addresses are not stored.';

do $$
declare
  v_missing_columns text[];
  v_constraint_count integer;
  v_index_count integer;
  v_rls boolean;
  v_admin_policy_count integer;
begin
  select array_agg(v.column_name order by v.column_name)
    into v_missing_columns
  from (
    values
      ('id'), ('visit_date'), ('page_path'), ('referrer_path'), ('visitor_key'),
      ('user_id'), ('session_key'), ('user_agent_hash'), ('ip_hash'),
      ('metadata'), ('created_at')
  ) as v(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'page_visit_events'
      and c.column_name = v.column_name
  );

  select count(*)
    into v_constraint_count
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.page_visit_events'::regclass
    and c.conname in (
      'page_visit_events_page_path_check',
      'page_visit_events_referrer_path_check',
      'page_visit_events_visitor_key_check',
      'page_visit_events_session_key_check',
      'page_visit_events_user_agent_hash_check',
      'page_visit_events_ip_hash_check',
      'page_visit_events_metadata_check'
    );

  select count(*)
    into v_index_count
  from pg_catalog.pg_indexes as i
  where i.schemaname = 'public'
    and i.tablename = 'page_visit_events'
    and i.indexname in (
      'page_visit_events_visit_date_idx',
      'page_visit_events_visitor_path_date_idx',
      'page_visit_events_path_date_idx'
    );

  select c.relrowsecurity
    into v_rls
  from pg_catalog.pg_class as c
  where c.oid = 'public.page_visit_events'::regclass;

  select count(*)
    into v_admin_policy_count
  from pg_catalog.pg_policies as p
  where p.schemaname = 'public'
    and p.tablename = 'page_visit_events'
    and p.policyname = 'Admins can read page visit events'
    and p.cmd = 'SELECT'
    and p.roles = array['authenticated']::name[]
    and coalesce(p.qual, '') ~ 'is_admin';

  if coalesce(cardinality(v_missing_columns), 0) > 0
     or v_constraint_count <> 7
     or v_index_count <> 3
     or not v_rls
     or v_admin_policy_count <> 1 then
    raise exception 'PAGE_VISIT_EVENTS_POSTCHECK_CONTRACT_FAILED: missing_columns=%, constraints=%, indexes=%, rls=%, admin_policies=%',
      v_missing_columns, v_constraint_count, v_index_count, v_rls, v_admin_policy_count;
  end if;

  if has_table_privilege('anon', 'public.page_visit_events', 'SELECT')
     or has_table_privilege('anon', 'public.page_visit_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.page_visit_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.page_visit_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.page_visit_events', 'DELETE')
     or not has_table_privilege('service_role', 'public.page_visit_events', 'SELECT')
     or not has_table_privilege('service_role', 'public.page_visit_events', 'INSERT')
     or has_table_privilege('service_role', 'public.page_visit_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.page_visit_events', 'DELETE') then
    raise exception 'PAGE_VISIT_EVENTS_POSTCHECK_TABLE_PRIVILEGES_FAILED';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    left join pg_catalog.pg_roles as r on r.oid = acl.grantee
    where c.oid = 'public.page_visit_events'::regclass
      and (
        acl.grantee = 0
        or r.rolname = 'anon'
        or (r.rolname = 'authenticated' and acl.privilege_type <> 'SELECT')
        or (r.rolname = 'service_role' and acl.privilege_type not in ('SELECT','INSERT'))
      )
  ) then
    raise exception 'PAGE_VISIT_EVENTS_POSTCHECK_UNEXPECTED_TABLE_ACL';
  end if;

  if exists (
    with explicit_column_acls as materialized (
      select a.attacl
      from pg_catalog.pg_attribute as a
      where a.attrelid = 'public.page_visit_events'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and a.attacl is not null
        and cardinality(a.attacl) > 0
    )
    select 1
    from explicit_column_acls as a
    cross join lateral pg_catalog.aclexplode(a.attacl) as acl
  ) then
    raise exception 'PAGE_VISIT_EVENTS_POSTCHECK_UNEXPECTED_COLUMN_ACL';
  end if;
end;
$$;

commit;

-- Manual rollback (do not run automatically):
-- revoke all privileges on table public.page_visit_events from public, anon, authenticated, service_role;
-- drop table if exists public.page_visit_events;
-- Only drop the table if it was absent before this migration and any collected
-- aggregate evidence has been exported. This migration never deletes rows.
