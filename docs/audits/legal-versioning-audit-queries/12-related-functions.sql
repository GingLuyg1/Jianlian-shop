-- Query 12: related function signatures, definitions, attributes and effective EXECUTE grants.
with relevant_functions as (
  select p.*, n.nspname as schema_name
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ~* '(legal|agreement|evidence)'
      or exists (
        select 1
        from pg_catalog.pg_depend d
        join pg_catalog.pg_class c on c.oid = d.refobjid
        join pg_catalog.pg_namespace tn on tn.oid = c.relnamespace
        where d.classid = 'pg_catalog.pg_proc'::regclass
          and d.objid = p.oid
          and d.refclassid = 'pg_catalog.pg_class'::regclass
          and tn.nspname = 'public'
          and c.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
      )
    )
), rows as (
  select
    f.schema_name,
    f.proname as function_name,
    f.oid,
    pg_catalog.pg_get_function_identity_arguments(f.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(f.oid) as result_type,
    pg_catalog.pg_get_userbyid(f.proowner) as owner,
    f.prosecdef as security_definer,
    f.provolatile as volatility,
    f.proparallel as parallel_safety,
    f.proconfig,
    f.proacl,
    pg_catalog.pg_get_functiondef(f.oid) as function_definition,
    permissions.public_execute,
    permissions.anon_execute,
    permissions.authenticated_execute,
    permissions.service_role_execute
  from relevant_functions f
  cross join lateral (
    select
      coalesce(bool_or(acl.privilege_type = 'EXECUTE' and acl.grantee = 0), false) as public_execute,
      coalesce(bool_or(acl.privilege_type = 'EXECUTE' and (acl.grantee = 0 or grantee.rolname = 'anon')), false) as anon_execute,
      coalesce(bool_or(acl.privilege_type = 'EXECUTE' and (acl.grantee = 0 or grantee.rolname = 'authenticated')), false) as authenticated_execute,
      coalesce(bool_or(acl.privilege_type = 'EXECUTE' and (acl.grantee = 0 or grantee.rolname = 'service_role')), false) as service_role_execute
    from pg_catalog.aclexplode(
      coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
    ) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  ) permissions
)
select
  '12-related-functions'::text as query_id,
  'FOUND'::text as result_state,
  schema_name,
  function_name,
  oid,
  identity_arguments,
  result_type,
  owner,
  security_definer,
  volatility,
  parallel_safety,
  proconfig,
  proacl,
  function_definition,
  public_execute,
  anon_execute,
  authenticated_execute,
  service_role_execute
from rows
union all
select
  '12-related-functions'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::oid,
  null::text,
  null::text,
  null::name,
  null::boolean,
  null::char,
  null::char,
  null::text[],
  null::aclitem[],
  null::text,
  false,
  false,
  false,
  false
where not exists (select 1 from rows)
order by function_name nulls last, identity_arguments nulls last;
