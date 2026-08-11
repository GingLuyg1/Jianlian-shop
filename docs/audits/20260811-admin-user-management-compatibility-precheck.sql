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
required_base_rpcs(signature) as (
  values
    ('public.is_super_admin(uuid)'),
    ('public.admin_update_user_account_status(uuid,text,text,text)'),
    ('public.admin_update_user_risk_status(uuid,text,text,text)'),
    ('public.admin_adjust_user_balance(uuid,text,text,numeric,text,text)'),
    ('public.manage_admin_user(uuid,text,text,jsonb,text)')
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
base_rpc_state as (
  select count(*)::integer as blocker_count
  from required_base_rpcs r
  where to_regprocedure(r.signature) is null
),
wrapper_requirements(signature, expected_argument_names, expected_search_path, repair_target) as (
  values
    (
      'public.super_admin_update_user_account_status(uuid,text,text,text)',
      array['p_user_id','p_next_status','p_reason','p_request_id']::text[],
      'search_path=public',
      true
    ),
    (
      'public.super_admin_update_user_risk_status(uuid,text,text,text)',
      array['p_user_id','p_next_status','p_reason','p_request_id']::text[],
      'search_path=public',
      true
    ),
    (
      'public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text)',
      array['p_user_id','p_adjustment_type','p_direction','p_amount','p_reason','p_request_id']::text[],
      'search_path=public',
      true
    ),
    (
      'public.manage_admin_user(uuid,text,text,jsonb,text)',
      array['p_target_user_id','p_admin_level','p_status','p_permissions','p_reason']::text[],
      'search_path=public',
      false
    )
),
wrapper_evidence as (
  select
    r.signature,
    r.repair_target,
    p.oid is not null as function_exists,
    r.expected_argument_names,
    r.expected_search_path,
    p.proargnames as actual_argument_names,
    p.prosecdef as security_definer,
    p.proconfig,
    owner_role.rolname as owner_name,
    case when p.oid is null then false
         else owner_role.rolname not in ('anon','authenticated','service_role') end as owner_safe,
    case when p.oid is null then false else coalesce((
      select bool_or(e.grantee = 0 and e.privilege_type = 'EXECUTE')
      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) e
    ), false) end as public_execute,
    case when p.oid is null then false
         else pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
    case when p.oid is null then false
         else pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
    case when p.oid is null then false
         else pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_role_execute,
    case
      when p.oid is null then 1
      when owner_role.rolname is null or owner_role.rolname in ('anon','authenticated','service_role') then 1
      when not r.repair_target and p.proargnames is distinct from r.expected_argument_names then 1
      when not r.repair_target and not p.prosecdef then 1
      when not r.repair_target and not (r.expected_search_path = any(coalesce(p.proconfig, array[]::text[]))) then 1
      when not r.repair_target and coalesce((
        select bool_or(e.grantee = 0 and e.privilege_type = 'EXECUTE')
        from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) e
      ), false) then 1
      when not r.repair_target and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') then 1
      when not r.repair_target and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') then 1
      when not r.repair_target and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') then 1
      else 0
    end as blocker_count
  from wrapper_requirements r
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(r.signature)
  left join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
),
wrapper_state as (
  select
    coalesce(sum(blocker_count), 0)::integer as blocker_count,
    jsonb_agg(to_jsonb(wrapper_evidence) order by signature) as evidence
  from wrapper_evidence
),
summary as (
  select
    profile_state.blocker_count as profile_column_blocker_count,
    admin_user_state.blocker_count as admin_user_column_blocker_count,
    base_rpc_state.blocker_count as base_rpc_blocker_count,
    wrapper_state.blocker_count as wrapper_blocker_count,
    wrapper_state.evidence as wrapper_evidence
  from profile_state, admin_user_state, base_rpc_state, wrapper_state
)
select
  *,
  profile_column_blocker_count + admin_user_column_blocker_count + base_rpc_blocker_count + wrapper_blocker_count as blocker_count,
  case
    when profile_column_blocker_count + admin_user_column_blocker_count + base_rpc_blocker_count + wrapper_blocker_count = 0
      then 'READY_FOR_ADMIN_USER_MANAGEMENT_COMPATIBILITY'
    else 'BLOCKED'
  end as assessment
from summary;

rollback;
