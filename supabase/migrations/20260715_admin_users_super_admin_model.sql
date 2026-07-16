-- Durable administrator authorization model.
-- This migration does not appoint a super administrator. After applying it,
-- use the reviewed UUID-only statement in docs/admin-users-super-admin-verification.sql.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'admin_users model requires public.profiles';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'admin_users model requires auth.users';
  end if;
  if to_regprocedure('public.admin_update_user_account_status(uuid,text,text,text)') is null
     or to_regprocedure('public.admin_update_user_risk_status(uuid,text,text,text)') is null
     or to_regprocedure('public.admin_adjust_user_balance(uuid,text,text,numeric,text,text)') is null
     or to_regprocedure('public.admin_process_refund_request(uuid,text,numeric,text,text,text,text)') is null
     or to_regprocedure('public.anonymize_user_account(uuid,uuid,text)') is null then
    raise exception 'admin_users model requires the current user-control, refund, and privacy RPCs';
  end if;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  admin_level text not null,
  status text not null default 'active',
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reason text not null,
  constraint admin_users_level_check check (admin_level in ('admin','super_admin')),
  constraint admin_users_status_check check (status in ('active','disabled')),
  constraint admin_users_permissions_object_check check (jsonb_typeof(permissions) = 'object'),
  constraint admin_users_reason_check check (length(btrim(reason)) between 1 and 500)
);

create table if not exists public.admin_user_authorization_events (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  reason text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  constraint admin_user_authorization_events_action_check check (
    action in ('migrated_admin','created','updated','promoted','demoted','disabled','restored')
  ),
  constraint admin_user_authorization_events_reason_check check (length(btrim(reason)) between 1 and 500)
);

create index if not exists admin_users_level_status_idx
  on public.admin_users(admin_level, status);
create index if not exists admin_user_authorization_events_target_created_idx
  on public.admin_user_authorization_events(target_user_id, created_at desc);
create index if not exists admin_user_authorization_events_operator_created_idx
  on public.admin_user_authorization_events(operator_user_id, created_at desc);

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_admin_users_updated_at();

-- Existing profile administrators become ordinary active administrators only.
-- Existing admin_users rows are never overwritten.
do $$
declare
  v_profile_admin_count bigint;
  v_inserted_count bigint;
begin
  select count(*) into v_profile_admin_count
  from public.profiles where role = 'admin';

  with inserted as (
    insert into public.admin_users(user_id, admin_level, status, permissions, reason)
    select p.id, 'admin', 'active', '{}'::jsonb, 'Migrated from profiles.role=admin'
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'admin'
    on conflict (user_id) do nothing
    returning user_id
  )
  select count(*) into v_inserted_count from inserted;

  insert into public.admin_user_authorization_events(
    operator_user_id, target_user_id, action, reason, before_state, after_state
  )
  select null, au.user_id, 'migrated_admin', 'Migrated from profiles.role=admin',
         null, jsonb_build_object('admin_level', au.admin_level, 'status', au.status)
  from public.admin_users au
  where au.reason = 'Migrated from profiles.role=admin'
    and not exists (
      select 1 from public.admin_user_authorization_events e
      where e.target_user_id = au.user_id and e.action = 'migrated_admin'
    );

  raise notice 'profiles.role=admin rows: %, newly migrated admin_users rows: %',
    v_profile_admin_count, v_inserted_count;
  raise notice 'No super_admin was appointed. Manually appoint one reviewed existing admin by UUID.';
end;
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select $1 is not null and (
    exists (
      select 1 from public.admin_users au
      where au.user_id = $1
        and au.status = 'active'
        and au.admin_level in ('admin','super_admin')
    )
    or (
      not exists (select 1 from public.admin_users au where au.user_id = $1)
      and exists (select 1 from public.profiles p where p.id = $1 and p.role = 'admin')
    )
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_admin(auth.uid()); $$;

create or replace function public.is_super_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select $1 is not null and exists (
    select 1 from public.admin_users au
    where au.user_id = $1
      and au.status = 'active'
      and au.admin_level = 'super_admin'
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_super_admin(auth.uid()); $$;

-- Compatibility name used by historical email-notification policies.
create or replace function public.is_super_admin_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_super_admin($1); $$;

-- Remove the historical email-to-role authorization path without changing its signature.
create or replace function public.role_for_email(input_email text)
returns text
language sql
stable
set search_path = public
as $$
  select 'user'::text
  from (values ($1)) as ignored(input_value);
$$;

alter table public.admin_users enable row level security;
alter table public.admin_user_authorization_events enable row level security;

drop policy if exists "active admins can read own authorization" on public.admin_users;
create policy "active admins can read own authorization"
on public.admin_users for select to authenticated
using (user_id = auth.uid() and status = 'active');

drop policy if exists "super admins can read all authorizations" on public.admin_users;
create policy "super admins can read all authorizations"
on public.admin_users for select to authenticated
using (public.is_super_admin());

drop policy if exists "super admins can read authorization events" on public.admin_user_authorization_events;
create policy "super admins can read authorization events"
on public.admin_user_authorization_events for select to authenticated
using (public.is_super_admin());

revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.admin_user_authorization_events from public, anon, authenticated;
grant select on public.admin_users to authenticated;
grant select on public.admin_user_authorization_events to authenticated;
grant all on public.admin_users to service_role;
grant all on public.admin_user_authorization_events to service_role;

revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_super_admin(uuid) from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_super_admin_user(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_super_admin(uuid) to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.is_super_admin_user(uuid) to authenticated, service_role;

create or replace function public.manage_admin_user(
  p_target_user_id uuid,
  p_admin_level text,
  p_status text,
  p_permissions jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator_id uuid := auth.uid();
  v_before public.admin_users%rowtype;
  v_after public.admin_users%rowtype;
  v_level text;
  v_status text;
  v_permissions jsonb;
  v_action text;
  v_active_super_admins bigint;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin(v_operator_id) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  if p_target_user_id is null or not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'ADMIN_TARGET_USER_NOT_FOUND';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'ADMIN_CHANGE_REASON_REQUIRED';
  end if;
  if p_permissions is not null and jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'ADMIN_PERMISSIONS_MUST_BE_OBJECT';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_users_super_admin_management'));
  select * into v_before from public.admin_users where user_id = p_target_user_id for update;

  v_level := coalesce(nullif(btrim(p_admin_level), ''), v_before.admin_level, 'admin');
  v_status := coalesce(nullif(btrim(p_status), ''), v_before.status, 'active');
  v_permissions := coalesce(p_permissions, v_before.permissions, '{}'::jsonb);
  if v_level not in ('admin','super_admin') then raise exception 'ADMIN_LEVEL_INVALID'; end if;
  if v_status not in ('active','disabled') then raise exception 'ADMIN_STATUS_INVALID'; end if;

  if v_operator_id is not null and p_target_user_id = v_operator_id
     and (v_status = 'disabled' or v_level <> 'super_admin') then
    raise exception 'SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN';
  end if;

  if v_before.user_id is not null and v_before.admin_level = 'super_admin' and v_before.status = 'active'
     and (v_level <> 'super_admin' or v_status <> 'active') then
    select count(*) into v_active_super_admins
    from public.admin_users where admin_level = 'super_admin' and status = 'active';
    if v_active_super_admins <= 1 then
      raise exception 'LAST_ACTIVE_SUPER_ADMIN_REQUIRED';
    end if;
  end if;

  insert into public.admin_users(
    user_id, admin_level, status, permissions, created_by, updated_by, reason
  ) values (
    p_target_user_id, v_level, v_status, v_permissions, v_operator_id, v_operator_id, btrim(p_reason)
  )
  on conflict (user_id) do update set
    admin_level = excluded.admin_level,
    status = excluded.status,
    permissions = excluded.permissions,
    updated_by = excluded.updated_by,
    reason = excluded.reason
  returning * into v_after;

  v_action := case
    when v_before.user_id is null then 'created'
    when v_before.admin_level <> v_after.admin_level and v_after.admin_level = 'super_admin' then 'promoted'
    when v_before.admin_level <> v_after.admin_level then 'demoted'
    when v_before.status <> v_after.status and v_after.status = 'disabled' then 'disabled'
    when v_before.status <> v_after.status then 'restored'
    else 'updated'
  end;

  insert into public.admin_user_authorization_events(
    operator_user_id, target_user_id, action, reason, before_state, after_state
  ) values (
    v_operator_id, p_target_user_id, v_action, btrim(p_reason),
    case when v_before.user_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)
  );

  return jsonb_build_object(
    'user_id', v_after.user_id,
    'admin_level', v_after.admin_level,
    'status', v_after.status,
    'permissions', v_after.permissions,
    'action', v_action
  );
end;
$$;

revoke all on function public.manage_admin_user(uuid,text,text,jsonb,text) from public, anon;
grant execute on function public.manage_admin_user(uuid,text,text,jsonb,text) to authenticated, service_role;

-- Database-level super-admin gates for existing high-risk RPCs. Direct grants
-- on the original functions are removed; only the gated wrappers are exposed.
create or replace function public.super_admin_update_user_account_status(uuid,text,text,text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return public.admin_update_user_account_status($1,$2,$3,$4);
end; $$;

create or replace function public.super_admin_update_user_risk_status(uuid,text,text,text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return public.admin_update_user_risk_status($1,$2,$3,$4);
end; $$;

create or replace function public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return public.admin_adjust_user_balance($1,$2,$3,$4,$5,$6);
end; $$;

create or replace function public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return public.admin_process_refund_request($1,$2,$3,$4,$5,$6,$7);
end; $$;

create or replace function public.super_admin_anonymize_user_account(uuid,uuid,text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin($2) then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return public.anonymize_user_account($1,$2,$3);
end; $$;

revoke execute on function public.admin_update_user_account_status(uuid,text,text,text) from authenticated, service_role;
revoke execute on function public.admin_update_user_risk_status(uuid,text,text,text) from authenticated, service_role;
revoke execute on function public.admin_adjust_user_balance(uuid,text,text,numeric,text,text) from authenticated, service_role;
revoke execute on function public.admin_process_refund_request(uuid,text,numeric,text,text,text,text) from authenticated, service_role;
revoke all on function public.anonymize_user_account(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.super_admin_update_user_account_status(uuid,text,text,text) from public, anon;
revoke all on function public.super_admin_update_user_risk_status(uuid,text,text,text) from public, anon;
revoke all on function public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text) from public, anon;
revoke all on function public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text) from public, anon;
revoke all on function public.super_admin_anonymize_user_account(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.super_admin_update_user_account_status(uuid,text,text,text) to authenticated;
grant execute on function public.super_admin_update_user_risk_status(uuid,text,text,text) to authenticated;
grant execute on function public.super_admin_adjust_user_balance(uuid,text,text,numeric,text,text) to authenticated;
grant execute on function public.super_admin_process_refund_request(uuid,text,numeric,text,text,text,text) to authenticated;
grant execute on function public.super_admin_anonymize_user_account(uuid,uuid,text) to service_role;

-- Sensitive profile fields are no longer writable by an ordinary administrator,
-- even when an older broad profiles UPDATE policy is still present.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_super_admin(auth.uid()) then
    return new;
  end if;
  if new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.balance is distinct from old.balance
    or new.promotion_balance is distinct from old.promotion_balance
    or new.invite_code is distinct from old.invite_code
    or new.referred_by is distinct from old.referred_by
    or new.account_status is distinct from old.account_status
    or new.risk_status is distinct from old.risk_status
    or new.status_reason is distinct from old.status_reason
    or new.risk_reason is distinct from old.risk_reason
    or new.last_login_at is distinct from old.last_login_at
  then
    raise exception 'PROFILE_SENSITIVE_FIELD_UPDATE_REQUIRES_SUPER_ADMIN';
  end if;
  return new;
end;
$$;

revoke insert, update, delete on public.refund_requests from authenticated;

-- Replace historical fixed-email policies with the durable predicate.
do $$
begin
  if to_regclass('public.admin_audit_logs') is not null then
    execute 'drop policy if exists "super admin can read audit logs" on public.admin_audit_logs';
    execute 'create policy "super admin can read audit logs" on public.admin_audit_logs for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.business_compensation_tasks') is not null then
    execute 'drop policy if exists "super admin can read compensation tasks" on public.business_compensation_tasks';
    execute 'create policy "super admin can read compensation tasks" on public.business_compensation_tasks for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.privacy_requests') is not null then
    execute 'drop policy if exists "Admins can manage privacy requests" on public.privacy_requests';
    execute 'drop policy if exists "Super admins can manage privacy requests" on public.privacy_requests';
    execute 'create policy "Super admins can manage privacy requests" on public.privacy_requests for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;
  if to_regclass('public.privacy_request_events') is not null then
    execute 'drop policy if exists "Admins can manage privacy request events" on public.privacy_request_events';
    execute 'drop policy if exists "Super admins can manage privacy request events" on public.privacy_request_events';
    execute 'create policy "Super admins can manage privacy request events" on public.privacy_request_events for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())';
  end if;
  if to_regclass('public.email_templates') is not null then
    execute 'drop policy if exists "super admin can read email templates" on public.email_templates';
    execute 'create policy "super admin can read email templates" on public.email_templates for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.email_delivery_jobs') is not null then
    execute 'drop policy if exists "super admin can read email jobs" on public.email_delivery_jobs';
    execute 'create policy "super admin can read email jobs" on public.email_delivery_jobs for select to authenticated using (public.is_super_admin())';
  end if;
  if to_regclass('public.email_delivery_attempts') is not null then
    execute 'drop policy if exists "super admin can read email attempts" on public.email_delivery_attempts';
    execute 'create policy "super admin can read email attempts" on public.email_delivery_attempts for select to authenticated using (public.is_super_admin())';
  end if;
end;
$$;
