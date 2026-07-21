-- Production page_visit_events read-only audit
--
-- Before running any block, manually confirm the Supabase project is:
--   Project name: Jianlian-shop
--   Project ref:  qvbovrvybirscaurwuov
-- Run each numbered SELECT independently. Do not use Run all.
-- These queries never output raw IPs, hash values, full referrers, full user
-- agents, user contact details, cookies, tokens, or request bodies.

-- Query 01: table and column contract.
select
  '01_table_columns'::text as query_id,
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns as c
where c.table_schema = 'public'
  and c.table_name = 'page_visit_events'
order by c.ordinal_position;

-- Query 02: primary key, foreign key, and CHECK constraints.
select
  '02_constraints'::text as query_id,
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(c.oid, true) as constraint_definition
from pg_catalog.pg_constraint as c
where c.conrelid = to_regclass('public.page_visit_events')
order by c.contype, c.conname;

-- Query 03: index definitions.
select
  '03_indexes'::text as query_id,
  i.indexname,
  i.indexdef
from pg_catalog.pg_indexes as i
where i.schemaname = 'public'
  and i.tablename = 'page_visit_events'
order by i.indexname;

-- Query 04: RLS state and policies. Returns one row even when the table is absent.
select
  '04_rls_policies'::text as query_id,
  to_regclass('public.page_visit_events') is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced,
  coalesce(p.policyname, 'NO_POLICY') as policy_name,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual as using_expression,
  p.with_check as with_check_expression
from (values (1)) as seed(n)
left join pg_catalog.pg_class as c
  on c.oid = to_regclass('public.page_visit_events')
left join pg_catalog.pg_policies as p
  on p.schemaname = 'public'
 and p.tablename = 'page_visit_events'
order by policy_name;

-- Query 05: explicit table privileges and explicit column ACL summary.
with roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
), table_acls as (
  select
    case when acl.grantee = 0 then 'PUBLIC' else r.rolname end as role_name,
    acl.privilege_type
  from pg_catalog.pg_class as c
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) as acl
  left join pg_catalog.pg_roles as r on r.oid = acl.grantee
  where c.oid = to_regclass('public.page_visit_events')
), columns as (
  select count(*)::integer as explicit_column_acl_count
  from pg_catalog.pg_attribute as a
  where a.attrelid = to_regclass('public.page_visit_events')
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and cardinality(a.attacl) > 0
)
select
  '05_acl_summary'::text as query_id,
  r.role_name,
  coalesce(bool_or(a.privilege_type = 'SELECT'), false) as has_select,
  coalesce(bool_or(a.privilege_type = 'INSERT'), false) as has_insert,
  coalesce(bool_or(a.privilege_type = 'UPDATE'), false) as has_update,
  coalesce(bool_or(a.privilege_type = 'DELETE'), false) as has_delete,
  coalesce(bool_or(a.privilege_type = 'TRUNCATE'), false) as has_truncate,
  coalesce(bool_or(a.privilege_type = 'REFERENCES'), false) as has_references,
  coalesce(bool_or(a.privilege_type = 'TRIGGER'), false) as has_trigger,
  c.explicit_column_acl_count
from roles as r
cross join columns as c
left join table_acls as a on a.role_name = r.role_name
group by r.role_name, c.explicit_column_acl_count
order by r.role_name;

-- Query 06: privacy-safe recent aggregate. It does not expose any event key,
-- user identifier, hash, referrer, user agent, IP, or metadata payload.
select
  '06_recent_safe_summary'::text as query_id,
  date_trunc('day', e.visit_date) as visit_day,
  split_part(e.page_path, '?', 1) as pathname,
  coalesce(e.metadata ->> 'page_type', 'unknown') as page_type,
  count(*)::bigint as page_view_count,
  count(distinct e.visitor_key)::bigint as distinct_visitor_count
from public.page_visit_events as e
where e.visit_date >= now() - interval '7 days'
group by
  date_trunc('day', e.visit_date),
  split_part(e.page_path, '?', 1),
  coalesce(e.metadata ->> 'page_type', 'unknown')
order by visit_day desc, page_view_count desc, pathname;
