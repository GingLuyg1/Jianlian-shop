-- Query 03: effective EXECUTE permission for both overloads and four role classes.
with expected_functions(expected_signature, procedure_name) as (
  values
    ('public.is_admin()', 'public.is_admin()'),
    ('public.is_admin(uuid)', 'public.is_admin(uuid)')
), resolved as (
  select
    e.expected_signature,
    pg_catalog.to_regprocedure(e.procedure_name) as function_oid
  from expected_functions e
), audited_roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
)
select
  '03-is-admin-permissions'::text as query_id,
  f.expected_signature,
  (p.oid is not null) as function_exists,
  r.role_name,
  case
    when p.oid is null then false
    when r.role_name = 'PUBLIC' then exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    else pg_catalog.has_function_privilege(r.role_name, p.oid, 'EXECUTE')
  end as has_execute
from resolved f
cross join audited_roles r
left join pg_catalog.pg_proc p on p.oid = f.function_oid
order by f.expected_signature, r.role_name;
