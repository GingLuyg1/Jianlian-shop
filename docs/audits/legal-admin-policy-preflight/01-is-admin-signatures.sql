-- Query 01: exact metadata for public.is_admin() and public.is_admin(uuid).
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
  '01-is-admin-signatures'::text as query_id,
  r.expected_signature,
  (p.oid is not null) as function_exists,
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  l.lanname as language,
  p.prosecdef as security_definer,
  (
    select setting
    from unnest(p.proconfig) as setting
    where setting like 'search_path=%'
    limit 1
  ) as search_path_setting,
  p.proconfig,
  case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' when 'v' then 'VOLATILE' end as volatility,
  case p.proparallel when 's' then 'SAFE' when 'r' then 'RESTRICTED' when 'u' then 'UNSAFE' end as parallel_safety
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
left join pg_catalog.pg_namespace n on n.oid = p.pronamespace
left join pg_catalog.pg_language l on l.oid = p.prolang
order by r.expected_signature;
