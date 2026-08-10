-- Read-only postcheck for
-- 20260811090000_deliver_digital_order_service_role_auth_compatibility.sql.

begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '120s';

with function_state as (
  select
    p.oid,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]) as proconfig,
    coalesce(pg_catalog.pg_get_functiondef(p.oid), '') as definition,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_can_execute,
    coalesce(pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('anon'), p.oid, 'EXECUTE'
    ), false) as anon_can_execute,
    coalesce(pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('authenticated'), p.oid, 'EXECUTE'
    ), false) as authenticated_can_execute,
    coalesce(pg_catalog.has_function_privilege(
      pg_catalog.to_regrole('service_role'), p.oid, 'EXECUTE'
    ), false) as service_role_can_execute
  from (values (
    pg_catalog.to_regprocedure('public.deliver_digital_order(uuid,text)')
  )) as target(function_oid)
  left join pg_catalog.pg_proc as p on p.oid = target.function_oid
), summary as (
  select
    case when oid is not null then 0 else 1 end as function_blocker_count,
    case when definition like '%coalesce(auth.role(), '''')%'
               and definition not like '%request.jwt.claim.role%'
      then 0 else 1 end as auth_guard_blocker_count,
    case when definition like '%and not public.is_admin()%'
      then 0 else 1 end as admin_fallback_blocker_count,
    case when prosecdef
               and proconfig @> array['search_path=public']
      then 0 else 1 end as security_contract_blocker_count,
    case when not public_can_execute
               and not anon_can_execute
               and not authenticated_can_execute
               and service_role_can_execute
      then 0 else 1 end as acl_blocker_count,
    case when definition like '%payment_status <> ''paid''%'
               and definition like '%digital_delivery_secrets%'
               and definition like '%status = ''reserved''%'
               and definition like '%supplier_fulfillment_requests as local_sfr%'
      then 0 else 1 end as delivery_contract_blocker_count
  from function_state
)
select
  summary.*,
  case when function_blocker_count = 0
          and auth_guard_blocker_count = 0
          and admin_fallback_blocker_count = 0
          and security_contract_blocker_count = 0
          and acl_blocker_count = 0
          and delivery_contract_blocker_count = 0
    then 'PASS'
    else 'BLOCKED'
  end as assessment
from summary;

rollback;
