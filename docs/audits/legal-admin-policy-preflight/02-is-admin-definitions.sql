-- Query 02: full definitions for both exact public.is_admin overloads.
with expected(expected_signature, procedure_name) as (
  values
    ('public.is_admin()', 'public.is_admin()'),
    ('public.is_admin(uuid)', 'public.is_admin(uuid)')
), resolved as (
  select
    e.expected_signature,
    pg_catalog.to_regprocedure(e.procedure_name) as function_oid
  from expected e
)
select
  '02-is-admin-definitions'::text as query_id,
  r.expected_signature,
  (p.oid is not null) as function_exists,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
left join pg_catalog.pg_namespace n on n.oid = p.pronamespace
order by r.expected_signature;
