-- Query 06: public.admin_users RLS state and complete policy definitions.
with table_status as (
  select
    'RLS_STATUS'::text as row_kind,
    'public'::text as schema_name,
    'admin_users'::text as table_name,
    null::text as policy_name,
    null::text as permissive,
    null::text as roles,
    null::text as command,
    null::text as using_expression,
    null::text as with_check_expression,
    (c.oid is not null) as table_exists,
    pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from (values ('public', 'admin_users')) expected(schema_name, table_name)
  left join pg_catalog.pg_namespace n on n.nspname = expected.schema_name
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = expected.table_name
), policy_rows as (
  select
    'POLICY'::text as row_kind,
    p.schemaname::text as schema_name,
    p.tablename::text as table_name,
    p.policyname::text as policy_name,
    p.permissive::text,
    p.roles::text,
    p.cmd::text as command,
    p.qual::text as using_expression,
    p.with_check::text as with_check_expression,
    true as table_exists,
    null::text as owner,
    null::boolean as rls_enabled,
    null::boolean as rls_forced
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'admin_users'
)
select
  '06-admin-users-rls-policies'::text as query_id,
  row_kind,
  schema_name,
  table_name,
  policy_name,
  permissive,
  roles,
  command,
  using_expression,
  with_check_expression,
  table_exists,
  owner,
  rls_enabled,
  rls_forced
from table_status
union all
select
  '06-admin-users-rls-policies'::text,
  row_kind,
  schema_name,
  table_name,
  policy_name,
  permissive,
  roles,
  command,
  using_expression,
  with_check_expression,
  table_exists,
  owner,
  rls_enabled,
  rls_forced
from policy_rows
order by row_kind, policy_name nulls first;
