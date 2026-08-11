begin;
set transaction read only;

with
required_profile_columns(column_name) as (
  values
    ('id'), ('email'), ('role'), ('balance'), ('created_at'), ('updated_at'),
    ('account_status'), ('risk_status'), ('status_reason'), ('risk_reason'), ('last_login_at')
),
required_admin_user_columns(column_name) as (
  values
    ('user_id'), ('admin_level'), ('status'), ('permissions'),
    ('created_by'), ('updated_by'), ('created_at'), ('updated_at'), ('reason')
),
required_rpcs(signature, argument_names, required_search_path) as (
  values
    ('public.super_admin_update_user_account_status(uuid,text,text,text)', array['p_user_id','p_next_status','p_reason','p_request_id']::text[], 'search_path=public'),
    ('public.super_admin_update_user_risk_status(uuid,text,text,text)', array['p_user_id','p_next_status','p_reason','p_request_id']::text[], 'search_path=public'),
    ('public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text)', array['p_user_id','p_adjustment_type','p_direction','p_amount','p_reason','p_request_id']::text[], 'search_path=public'),
    ('public.manage_admin_user(uuid,text,text,jsonb,text)', array['p_target_user_id','p_admin_level','p_status','p_permissions','p_reason']::text[], 'search_path=public')
),
profile_state as (
  select count(*)::integer as blocker_count
  from required_profile_columns r
  where to_regclass('public.profiles') is null
     or not exists (
       select 1 from pg_catalog.pg_attribute a
       where a.attrelid = to_regclass('public.profiles')
         and a.attname = r.column_name and a.attnum > 0 and not a.attisdropped
     )
),
admin_user_state as (
  select count(*)::integer as blocker_count
  from required_admin_user_columns r
  where to_regclass('public.admin_users') is null
     or not exists (
       select 1 from pg_catalog.pg_attribute a
       where a.attrelid = to_regclass('public.admin_users')
         and a.attname = r.column_name and a.attnum > 0 and not a.attisdropped
     )
),
rpc_evidence as (
  select
    r.signature,
    p.proargnames as actual_argument_names,
    r.argument_names as expected_argument_names,
    p.prosecdef as security_definer,
    p.proconfig,
    owner_role.rolname as owner_name,
    case when p.oid is null then false else exists (
      select 1
      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) end as public_execute,
    case when p.oid is null then false else pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
    case when p.oid is null then false else pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
    case when p.oid is null then false else pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_role_execute,
    case
      when p.oid is null
        or p.proargnames is distinct from r.argument_names
        or not p.prosecdef
        or not coalesce(p.proconfig @> array[r.required_search_path]::text[], false)
        or owner_role.rolname in ('anon','authenticated','service_role')
        or exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        )
        or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      then 1 else 0
    end as blocker_count
  from required_rpcs r
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(r.signature)
  left join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
),
compatibility_rpc as (
  select
    p.prosecdef as security_definer,
    p.proconfig,
    owner_role.rolname as owner_name,
    case
      when p.oid is null
        or not p.prosecdef
        or not coalesce(p.proconfig @> array['search_path=pg_catalog, public']::text[], false)
        or owner_role.rolname in ('anon','authenticated','service_role')
        or exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        )
        or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      then 1 else 0
    end as blocker_count
  from (values (to_regprocedure('public.get_admin_user_management_compatibility()'))) v(oid)
  left join pg_catalog.pg_proc p on p.oid = v.oid
  left join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
),
summary as (
  select
    profile_state.blocker_count as profile_column_blocker_count,
    admin_user_state.blocker_count as admin_user_column_blocker_count,
    (select coalesce(sum(blocker_count), 0)::integer from rpc_evidence) as rpc_blocker_count,
    compatibility_rpc.blocker_count as compatibility_rpc_blocker_count,
    (select jsonb_agg(to_jsonb(rpc_evidence) order by signature) from rpc_evidence) as rpc_evidence
  from profile_state, admin_user_state, compatibility_rpc
)
select
  *,
  profile_column_blocker_count + admin_user_column_blocker_count + rpc_blocker_count + compatibility_rpc_blocker_count as blocker_count,
  case
    when profile_column_blocker_count + admin_user_column_blocker_count + rpc_blocker_count + compatibility_rpc_blocker_count = 0
      then 'PASS'
    else 'FAIL'
  end as assessment
from summary;

rollback;
