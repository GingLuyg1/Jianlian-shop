-- Admin/super-admin model verification.
-- Sections 1-7 are read-only. The final section rolls back all test changes.

-- 1. Structure, constraints, indexes, and RLS.
select to_regclass('public.admin_users') as admin_users,
       to_regclass('public.admin_user_authorization_events') as authorization_events;

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('admin_users','admin_user_authorization_events');

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.admin_users'::regclass,'public.admin_user_authorization_events'::regclass)
order by table_name::text, conname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('admin_users','admin_user_authorization_events')
order by tablename,policyname;

-- 2. Current authorizations. No email or token is returned.
select user_id,admin_level,status,permissions,created_at,updated_at,reason
from public.admin_users order by created_at;

select count(*) filter (where admin_level='super_admin' and status='active')
  as active_super_admin_count,
       count(*) filter (where admin_level in ('admin','super_admin') and status='active')
  as active_admin_count
from public.admin_users;

-- 3. Function definitions, ownership, hardening, and hashes.
select p.oid::regprocedure as signature, pg_get_function_result(p.oid) as result,
       p.prosecdef as security_definer, p.proconfig,
       pg_get_userbyid(p.proowner) as owner, md5(pg_get_functiondef(p.oid)) as function_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'is_admin','is_super_admin','is_super_admin_user','manage_admin_user',
 'super_admin_update_user_account_status','super_admin_update_user_risk_status',
 'super_admin_adjust_user_balance','super_admin_process_refund_request',
 'super_admin_anonymize_user_account','protect_profile_sensitive_fields'
) order by p.proname,p.pronargs;

-- 4. No active function or policy may retain the historical email authorization.
select p.oid::regprocedure as unsafe_function
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and lower(pg_get_functiondef(p.oid)) like '%gac000189@gmail.com%';

select schemaname,tablename,policyname
from pg_policies
where schemaname='public'
  and lower(coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%gmail.com%';

-- 5. Grants. Expected: no anon access; authenticated can execute only gated wrappers.
select p.oid::regprocedure as signature,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like '%admin%'
order by p.proname,p.pronargs;

-- 6. Manual first-super-admin appointment template. Review and execute separately.
-- Replace REVIEWED_EXISTING_ADMIN_UUID with an existing active admin UUID.
-- Do not use an email address as authorization evidence.
--
-- begin;
-- update public.admin_users
-- set admin_level='super_admin', status='active', updated_by=null,
--     reason='Initial super_admin appointed by controlled production change', updated_at=now()
-- where user_id='REVIEWED_EXISTING_ADMIN_UUID'::uuid
--   and admin_level='admin' and status='active';
--
-- insert into public.admin_user_authorization_events(
--   operator_user_id,target_user_id,action,reason,before_state,after_state
-- ) values (
--   null,'REVIEWED_EXISTING_ADMIN_UUID'::uuid,'promoted',
--   'Initial super_admin appointed by controlled production change',
--   jsonb_build_object('admin_level','admin','status','active'),
--   jsonb_build_object('admin_level','super_admin','status','active')
-- );
-- commit;

-- 7. Test-only transaction checks. Set the switch true only in Jianlian-shop-test.
BEGIN;
DO $$
declare
  v_confirm_test_database boolean := false;
  v_super uuid;
  v_admin uuid;
  v_user uuid;
begin
  if not v_confirm_test_database then
    raise exception 'TEST DATABASE CONFIRMATION REQUIRED';
  end if;
  select user_id into v_super from public.admin_users
   where admin_level='super_admin' and status='active' order by created_at limit 1;
  select user_id into v_admin from public.admin_users
   where admin_level='admin' and status='active' order by created_at limit 1;
  select p.id into v_user from public.profiles p
   where p.role='user' and not exists(select 1 from public.admin_users a where a.user_id=p.id)
   order by p.created_at limit 1;
  if v_super is null or v_admin is null or v_user is null then
    raise exception 'Verification requires one super_admin, one admin, and one ordinary user';
  end if;

  if not public.is_admin(v_admin) or public.is_super_admin(v_admin) then
    raise exception 'ordinary admin predicate failed';
  end if;
  if not public.is_admin(v_super) or not public.is_super_admin(v_super) then
    raise exception 'super_admin predicate failed';
  end if;
  if public.is_admin(v_user) or public.is_super_admin(v_user) then
    raise exception 'ordinary user received administrator access';
  end if;
  raise notice 'PASS: role predicates';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  begin
    perform public.super_admin_adjust_user_balance(v_user,'other','credit',1,'verification denied','admin-model-test');
    raise exception 'ordinary admin balance adjustment was accepted';
  exception when others then
    if sqlerrm not like '%SUPER_ADMIN_REQUIRED%' then raise; end if;
  end;
  begin
    perform public.super_admin_process_refund_request(gen_random_uuid(),'reject',null,'verification denied',null,null,'admin-model-test');
    raise exception 'ordinary admin refund action was accepted';
  exception when others then
    if sqlerrm not like '%SUPER_ADMIN_REQUIRED%' then raise; end if;
  end;
  raise notice 'PASS: ordinary admin high-risk RPCs denied';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  begin
    perform public.manage_admin_user(v_super,'admin','active',null,'verification self demotion');
    raise exception 'last/current super_admin self-demotion was accepted';
  exception when others then
    if sqlerrm not like '%SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN%' then raise; end if;
  end;
  perform public.manage_admin_user(v_admin,'admin','disabled',null,'verification disable ordinary admin');
  if public.is_admin(v_admin) then raise exception 'disabled admin still passed is_admin'; end if;
  raise notice 'PASS: self-demotion protection and disabled-admin denial';
end;
$$;
ROLLBACK;
