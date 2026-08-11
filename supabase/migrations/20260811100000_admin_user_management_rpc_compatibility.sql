-- Forward-only compatibility for the production admin user-management module.
-- Restores PostgREST named-argument metadata on the three RPCs used by the
-- admin user actions API. No business rows are read or modified by this migration.

begin;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.admin_users') is null
     or to_regprocedure('public.is_super_admin(uuid)') is null
     or to_regprocedure('public.admin_update_user_account_status(uuid,text,text,text)') is null
     or to_regprocedure('public.admin_update_user_risk_status(uuid,text,text,text)') is null
     or to_regprocedure('public.admin_adjust_user_balance(uuid,text,text,numeric,text,text)') is null then
    raise exception 'ADMIN_USER_MANAGEMENT_COMPATIBILITY_PREREQUISITES_MISSING';
  end if;
end;
$$;

create or replace function public.super_admin_update_user_account_status(
  p_user_id uuid,
  p_next_status text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return public.admin_update_user_account_status(p_user_id, p_next_status, p_reason, p_request_id);
end;
$$;

create or replace function public.super_admin_update_user_risk_status(
  p_user_id uuid,
  p_next_status text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return public.admin_update_user_risk_status(p_user_id, p_next_status, p_reason, p_request_id);
end;
$$;

create or replace function public.super_admin_adjust_user_balance(
  p_user_id uuid,
  p_adjustment_type text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return public.admin_adjust_user_balance(
    p_user_id,
    p_adjustment_type,
    p_direction,
    p_amount,
    p_reason,
    p_request_id
  );
end;
$$;

revoke all on function public.super_admin_update_user_account_status(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.super_admin_update_user_risk_status(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text) from public, anon, authenticated, service_role;

-- The server route intentionally forwards the authenticated super-admin JWT,
-- so the database can independently enforce is_super_admin(auth.uid()).
grant execute on function public.super_admin_update_user_account_status(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.super_admin_update_user_risk_status(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text) to authenticated, service_role;

create or replace function public.get_admin_user_management_compatibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_column_blockers integer;
  v_admin_user_column_blockers integer;
  v_rpc_blockers integer;
  v_blocker_count integer;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  with required(column_name) as (
    values
      ('id'), ('email'), ('role'), ('balance'), ('created_at'), ('updated_at'),
      ('account_status'), ('risk_status'), ('status_reason'), ('risk_reason'), ('last_login_at')
  )
  select count(*)::integer into v_profile_column_blockers
  from required r
  where not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.profiles'::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped
  );

  with required(column_name) as (
    values
      ('user_id'), ('admin_level'), ('status'), ('permissions'),
      ('created_by'), ('updated_by'), ('created_at'), ('updated_at'), ('reason')
  )
  select count(*)::integer into v_admin_user_column_blockers
  from required r
  where not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.admin_users'::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped
  );

  with required(signature, argument_names, required_search_path) as (
    values
      ('public.super_admin_update_user_account_status(uuid,text,text,text)', array['p_user_id','p_next_status','p_reason','p_request_id']::text[], 'search_path=public'),
      ('public.super_admin_update_user_risk_status(uuid,text,text,text)', array['p_user_id','p_next_status','p_reason','p_request_id']::text[], 'search_path=public'),
      ('public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text)', array['p_user_id','p_adjustment_type','p_direction','p_amount','p_reason','p_request_id']::text[], 'search_path=public'),
      ('public.manage_admin_user(uuid,text,text,jsonb,text)', array['p_target_user_id','p_admin_level','p_status','p_permissions','p_reason']::text[], 'search_path=public')
  )
  select count(*)::integer into v_rpc_blockers
  from required r
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(r.signature)
  where p.oid is null
     or p.proargnames is distinct from r.argument_names
     or not p.prosecdef
     or not coalesce(p.proconfig @> array[r.required_search_path]::text[], false)
     or exists (
       select 1
       from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
       where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE');

  v_blocker_count := v_profile_column_blockers + v_admin_user_column_blockers + v_rpc_blockers;
  return jsonb_build_object(
    'schemaReady', v_blocker_count = 0,
    'blockerCount', v_blocker_count,
    'profileColumnBlockerCount', v_profile_column_blockers,
    'adminUserColumnBlockerCount', v_admin_user_column_blockers,
    'rpcBlockerCount', v_rpc_blockers
  );
end;
$$;

revoke all on function public.get_admin_user_management_compatibility() from public, anon, authenticated, service_role;
grant execute on function public.get_admin_user_management_compatibility() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
