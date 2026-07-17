-- Production list RPC postcheck (read-only metadata audit).
--
-- Target project (confirm manually in Supabase Dashboard before every query):
-- - Project name: Jianlian-shop
-- - Project ref: qvbovrvybirscaurwuov
--
-- Safety:
-- - Use only after separately authorized manual execution of the exact Migration.
-- - Every numbered block is a standalone system-metadata SELECT.
-- - Run one block at a time, retain all results, and do not click Run all.
-- - This file does not call the business RPC or read any business data.
-- - A postcheck failure is a stop condition; do not continue to dry-run.

-- 1. Verify the exact function signature, return type, owner, security mode,
-- language, volatility, parallel mode, and configured search_path.
-- Expected: exactly one row; identity argument is p_limit integer; return type is
-- TABLE(order_id uuid); security_definer is true; proconfig contains search_path=public.
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as return_type,
  r.rolname as owner,
  l.lanname as language_name,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proparallel as parallel_mode,
  p.proconfig
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
join pg_catalog.pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname = 'list_expirable_unpaid_orders'
  and p.pronargs = 1
  and p.proargtypes = '23'::pg_catalog.oidvector;

-- 2. Return the complete definition of the exact integer overload for comparison
-- with the approved Migration file.
-- Expected: exactly one row and an exact semantic match to the approved definition.
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'list_expirable_unpaid_orders'
  and p.pronargs = 1
  and p.proargtypes = '23'::pg_catalog.oidvector;

-- 3. Verify effective EXECUTE privileges for anon, authenticated, service_role,
-- and the PUBLIC pseudo-role on the exact integer overload.
-- Expected: service_role = true; anon/authenticated/public = false.
with target_function as (
  select p.oid, p.proowner, p.proacl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'list_expirable_unpaid_orders'
    and p.pronargs = 1
    and p.proargtypes = '23'::pg_catalog.oidvector
), expected_role(role_name) as (
  values
    ('anon'::text),
    ('authenticated'),
    ('public'),
    ('service_role')
)
select
  e.role_name,
  case
    when f.oid is null then null
    when e.role_name = 'public' then exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    when r.oid is null then null
    else pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE')
  end as has_execute_privilege,
  r.oid is not null or e.role_name = 'public' as role_or_public_exists
from expected_role e
cross join target_function f
left join pg_catalog.pg_roles r on r.rolname = e.role_name
order by e.role_name;
