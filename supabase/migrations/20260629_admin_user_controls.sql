-- Admin user controls, account status, risk records, balance adjustment and guards.
-- Execute manually in Supabase SQL Editor. This migration is additive and idempotent.
-- It does not delete user, order, recharge, balance or delivery data.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists risk_status text not null default 'normal',
  add column if not exists status_reason text,
  add column if not exists risk_reason text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by uuid,
  add column if not exists risk_updated_at timestamptz,
  add column if not exists risk_updated_by uuid,
  add column if not exists last_login_at timestamptz;

alter table if exists public.profiles drop constraint if exists profiles_account_status_check;
alter table if exists public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active','restricted','suspended','disabled'));

alter table if exists public.profiles drop constraint if exists profiles_risk_status_check;
alter table if exists public.profiles
  add constraint profiles_risk_status_check
  check (risk_status in ('normal','watch','high_risk','blocked'));

create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_risk_status_idx on public.profiles(risk_status);
create index if not exists profiles_created_at_idx on public.profiles(created_at desc);

create table if not exists public.user_account_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text not null,
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  constraint user_account_status_history_new_status_check
    check (new_status in ('active','restricted','suspended','disabled')),
  constraint user_account_status_history_old_status_check
    check (old_status is null or old_status in ('active','restricted','suspended','disabled')),
  constraint user_account_status_history_reason_check check (length(btrim(reason)) > 0)
);

create table if not exists public.user_risk_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_risk_status text,
  new_risk_status text not null,
  reason text not null,
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  constraint user_risk_records_new_status_check
    check (new_risk_status in ('normal','watch','high_risk','blocked')),
  constraint user_risk_records_old_status_check
    check (old_risk_status is null or old_risk_status in ('normal','watch','high_risk','blocked')),
  constraint user_risk_records_reason_check check (length(btrim(reason)) > 0)
);

create table if not exists public.balance_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  adjustment_type text not null,
  direction text not null,
  amount numeric(18, 6) not null,
  currency text not null default 'CNY',
  balance_before numeric(18, 6) not null,
  balance_after numeric(18, 6) not null,
  reason text not null,
  transaction_id uuid references public.balance_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint balance_adjustment_requests_type_check
    check (adjustment_type in ('increase','decrease','compensation','refund','correction','other')),
  constraint balance_adjustment_requests_direction_check check (direction in ('credit','debit')),
  constraint balance_adjustment_requests_amount_check check (amount > 0),
  constraint balance_adjustment_requests_reason_check check (length(btrim(reason)) > 0)
);

create index if not exists user_account_status_history_user_created_idx
  on public.user_account_status_history(user_id, created_at desc);
create index if not exists user_account_status_history_admin_created_idx
  on public.user_account_status_history(admin_id, created_at desc);
create index if not exists user_risk_records_user_created_idx
  on public.user_risk_records(user_id, created_at desc);
create index if not exists user_risk_records_admin_created_idx
  on public.user_risk_records(admin_id, created_at desc);
create index if not exists balance_adjustment_requests_user_created_idx
  on public.balance_adjustment_requests(user_id, created_at desc);
create index if not exists balance_adjustment_requests_admin_created_idx
  on public.balance_adjustment_requests(admin_id, created_at desc);

alter table public.user_account_status_history enable row level security;
alter table public.user_risk_records enable row level security;
alter table public.balance_adjustment_requests enable row level security;

drop policy if exists "admins read account status history" on public.user_account_status_history;
create policy "admins read account status history"
  on public.user_account_status_history for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read risk records" on public.user_risk_records;
create policy "admins read risk records"
  on public.user_risk_records for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "admins read balance adjustment requests" on public.balance_adjustment_requests;
create policy "admins read balance adjustment requests"
  on public.balance_adjustment_requests for select
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on public.user_account_status_history from anon;
revoke all on public.user_risk_records from anon;
revoke all on public.balance_adjustment_requests from anon;
grant select on public.user_account_status_history to authenticated;
grant select on public.user_risk_records to authenticated;
grant select on public.balance_adjustment_requests to authenticated;
grant all on public.user_account_status_history to service_role;
grant all on public.user_risk_records to service_role;
grant all on public.balance_adjustment_requests to service_role;

create or replace function public.current_admin_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(email, '') from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.admin_user_controls_assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception '无后台用户管理权限';
  end if;
end;
$$;

create or replace function public.admin_update_user_account_status(
  p_user_id uuid,
  p_next_status text,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_existing public.user_account_status_history;
  v_admin_id uuid := auth.uid();
  v_admin_email text := public.current_admin_email();
begin
  perform public.admin_user_controls_assert_admin();

  if p_next_status not in ('active','restricted','suspended','disabled') then
    raise exception '账户状态不合法';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception '请填写账户状态变更原因';
  end if;

  select * into v_existing from public.user_account_status_history where request_id = v_request_id limit 1;
  if found then
    return jsonb_build_object('request_id', v_existing.request_id, 'user_id', v_existing.user_id, 'account_status', v_existing.new_status, 'reused', true);
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '用户不存在';
  end if;

  insert into public.user_account_status_history(
    user_id, old_status, new_status, reason, admin_id, admin_email, request_id
  ) values (
    p_user_id, coalesce(v_profile.account_status, 'active'), p_next_status, btrim(p_reason), v_admin_id, v_admin_email, v_request_id
  );

  update public.profiles
  set account_status = p_next_status,
      status_reason = btrim(p_reason),
      status_updated_at = now(),
      status_updated_by = v_admin_id,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'user_id', p_user_id,
    'old_status', coalesce(v_profile.account_status, 'active'),
    'account_status', p_next_status,
    'reused', false
  );
end;
$$;

create or replace function public.admin_update_user_risk_status(
  p_user_id uuid,
  p_next_status text,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_existing public.user_risk_records;
  v_admin_id uuid := auth.uid();
  v_admin_email text := public.current_admin_email();
begin
  perform public.admin_user_controls_assert_admin();

  if p_next_status not in ('normal','watch','high_risk','blocked') then
    raise exception '风险状态不合法';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception '请填写风险标记原因';
  end if;

  select * into v_existing from public.user_risk_records where request_id = v_request_id limit 1;
  if found then
    return jsonb_build_object('request_id', v_existing.request_id, 'user_id', v_existing.user_id, 'risk_status', v_existing.new_risk_status, 'reused', true);
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '用户不存在';
  end if;

  insert into public.user_risk_records(
    user_id, old_risk_status, new_risk_status, reason, admin_id, admin_email, request_id
  ) values (
    p_user_id, coalesce(v_profile.risk_status, 'normal'), p_next_status, btrim(p_reason), v_admin_id, v_admin_email, v_request_id
  );

  update public.profiles
  set risk_status = p_next_status,
      risk_reason = btrim(p_reason),
      risk_updated_at = now(),
      risk_updated_by = v_admin_id,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'user_id', p_user_id,
    'old_risk_status', coalesce(v_profile.risk_status, 'normal'),
    'risk_status', p_next_status,
    'reused', false
  );
end;
$$;

create or replace function public.admin_adjust_user_balance(
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
declare
  v_profile public.profiles;
  v_existing public.balance_adjustment_requests;
  v_request_id text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_admin_id uuid := auth.uid();
  v_admin_email text := public.current_admin_email();
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_amount numeric(18, 6) := round(coalesce(p_amount, 0)::numeric, 6);
  v_transaction public.balance_transactions;
  v_transaction_no text;
begin
  perform public.admin_user_controls_assert_admin();

  if v_request_id is null then
    raise exception '缺少幂等请求编号';
  end if;
  if p_adjustment_type not in ('increase','decrease','compensation','refund','correction','other') then
    raise exception '调整类型不合法';
  end if;
  if p_direction not in ('credit','debit') then
    raise exception '调整方向不合法';
  end if;
  if v_amount <= 0 then
    raise exception '调整金额必须大于 0';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception '请填写余额调整原因';
  end if;

  select * into v_existing from public.balance_adjustment_requests where request_id = v_request_id limit 1;
  if found then
    return jsonb_build_object(
      'request_id', v_existing.request_id,
      'user_id', v_existing.user_id,
      'balance_before', v_existing.balance_before,
      'balance_after', v_existing.balance_after,
      'transaction_id', v_existing.transaction_id,
      'reused', true
    );
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '用户不存在';
  end if;

  v_before := coalesce(v_profile.balance, 0);
  if p_direction = 'credit' then
    v_after := v_before + v_amount;
  else
    v_after := v_before - v_amount;
  end if;

  if v_after < 0 then
    raise exception '扣减后余额不能小于 0';
  end if;

  update public.profiles
  set balance = v_after,
      updated_at = now()
  where id = p_user_id;

  v_transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(v_request_id || random()::text), 1, 8));

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    p_user_id, v_transaction_no, 'admin_adjustment', v_request_id, p_direction, v_amount,
    v_before, v_after, 'CNY', 'completed', btrim(p_reason),
    jsonb_build_object(
      'adjustment_type', p_adjustment_type,
      'admin_id', v_admin_id,
      'admin_email', v_admin_email,
      'request_id', v_request_id
    )
  ) returning * into v_transaction;

  insert into public.balance_adjustment_requests (
    request_id, user_id, admin_id, admin_email, adjustment_type, direction, amount,
    currency, balance_before, balance_after, reason, transaction_id
  ) values (
    v_request_id, p_user_id, v_admin_id, v_admin_email, p_adjustment_type, p_direction, v_amount,
    'CNY', v_before, v_after, btrim(p_reason), v_transaction.id
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'user_id', p_user_id,
    'balance_before', v_before,
    'balance_after', v_after,
    'transaction_no', v_transaction.transaction_no,
    'transaction_id', v_transaction.id,
    'reused', false
  );
end;
$$;

create or replace function public.check_user_business_allowed(
  p_user_id uuid,
  p_action text default 'generic'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_action text := coalesce(nullif(btrim(p_action), ''), 'generic');
  v_allowed boolean := true;
  v_reason text := null;
begin
  select * into v_profile from public.profiles where id = p_user_id limit 1;
  if not found then
    return jsonb_build_object('allowed', false, 'code', 'profile_missing', 'message', '账户资料不存在，请联系客服。');
  end if;

  if coalesce(v_profile.account_status, 'active') = 'disabled' then
    v_allowed := false;
    v_reason := '账户已被禁用，请联系客服。';
  elsif coalesce(v_profile.account_status, 'active') = 'suspended' and v_action in ('create_order','create_recharge','create_payment') then
    v_allowed := false;
    v_reason := '账户当前暂停相关操作，请联系客服。';
  elsif coalesce(v_profile.risk_status, 'normal') = 'blocked' and v_action in ('create_order','create_recharge','create_payment') then
    v_allowed := false;
    v_reason := '账户当前暂不能执行该操作，请联系客服。';
  elsif coalesce(v_profile.account_status, 'active') = 'restricted' and v_action in ('create_order','create_recharge','create_payment','update_profile') then
    v_allowed := false;
    v_reason := '账户当前受限，请联系客服处理。';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'account_status', coalesce(v_profile.account_status, 'active'),
    'risk_status', coalesce(v_profile.risk_status, 'normal'),
    'message', coalesce(v_reason, 'allowed')
  );
end;
$$;

revoke execute on function public.admin_update_user_account_status(uuid,text,text,text) from public, anon;
revoke execute on function public.admin_update_user_risk_status(uuid,text,text,text) from public, anon;
revoke execute on function public.admin_adjust_user_balance(uuid,text,text,numeric,text,text) from public, anon;
revoke execute on function public.check_user_business_allowed(uuid,text) from anon;
grant execute on function public.admin_update_user_account_status(uuid,text,text,text) to authenticated;
grant execute on function public.admin_update_user_risk_status(uuid,text,text,text) to authenticated;
grant execute on function public.admin_adjust_user_balance(uuid,text,text,numeric,text,text) to authenticated;
grant execute on function public.check_user_business_allowed(uuid,text) to authenticated, service_role;
