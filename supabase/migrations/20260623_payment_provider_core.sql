-- Core payment provider readiness compatibility for Jianlian Shop.
-- Execute manually in Supabase SQL Editor before connecting a real payment Provider.
-- This migration does not integrate a real Provider and does not simulate paid callbacks.

create extension if not exists pgcrypto;

create table if not exists public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  session_no text not null unique,
  business_type text not null,
  business_id uuid not null,
  business_no text,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_code text not null,
  provider text,
  currency text not null default 'CNY',
  network text,
  requested_amount numeric(18, 6) not null default 0,
  fee_amount numeric(18, 6) not null default 0,
  payable_amount numeric(18, 6) not null default 0,
  status text not null default 'pending',
  payment_type text not null default 'redirect',
  payment_url text,
  qr_code_url text,
  wallet_address text,
  provider_order_no text,
  provider_transaction_id text,
  expires_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  last_synced_at timestamptz,
  reconcile_status text not null default 'unchecked',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sessions_business_type_check
    check (business_type in ('order','recharge','account_recharge')),
  constraint payment_sessions_status_check
    check (status in ('pending','processing','paid','failed','expired','closed')),
  constraint payment_sessions_payment_type_check
    check (payment_type in ('redirect','qrcode','address')),
  constraint payment_sessions_reconcile_status_check
    check (reconcile_status in ('unchecked','matched','provider_paid_local_unpaid','local_paid_provider_unpaid','amount_mismatch','query_failed')),
  constraint payment_sessions_amounts_non_negative_check
    check (requested_amount >= 0 and fee_amount >= 0 and payable_amount >= 0)
);

alter table if exists public.payment_sessions
  add column if not exists business_no text,
  add column if not exists provider text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists reconcile_status text not null default 'unchecked',
  add column if not exists last_error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists payment_sessions_session_no_unique
  on public.payment_sessions(session_no);

create unique index if not exists payment_sessions_active_business_unique
  on public.payment_sessions(business_type, business_id)
  where status in ('pending','processing');

create unique index if not exists payment_sessions_provider_order_unique
  on public.payment_sessions(provider_order_no)
  where provider_order_no is not null and provider_order_no <> '';

create unique index if not exists payment_sessions_provider_transaction_unique
  on public.payment_sessions(provider_transaction_id)
  where provider_transaction_id is not null and provider_transaction_id <> '';

create index if not exists payment_sessions_user_created_idx
  on public.payment_sessions(user_id, created_at desc);

create index if not exists payment_sessions_status_idx
  on public.payment_sessions(status);

create index if not exists payment_sessions_business_idx
  on public.payment_sessions(business_type, business_id);

create or replace function public.set_payment_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_sessions_updated_at on public.payment_sessions;
create trigger trg_payment_sessions_updated_at
before update on public.payment_sessions
for each row execute function public.set_payment_sessions_updated_at();

alter table public.payment_sessions enable row level security;

drop policy if exists "Users can read own payment sessions" on public.payment_sessions;
create policy "Users can read own payment sessions"
on public.payment_sessions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read all payment sessions" on public.payment_sessions;
create policy "Admins can read all payment sessions"
on public.payment_sessions for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Deny direct payment session writes" on public.payment_sessions;
create policy "Deny direct payment session writes"
on public.payment_sessions for all
to authenticated
using (false)
with check (false);

revoke all on table public.payment_sessions from anon;
revoke insert, update, delete on table public.payment_sessions from authenticated;
grant select on table public.payment_sessions to authenticated;
grant all on table public.payment_sessions to service_role;

alter table if exists public.payment_channels
  add column if not exists provider_config jsonb not null default '{}'::jsonb,
  add column if not exists public_config jsonb not null default '{}'::jsonb,
  add column if not exists secret_config jsonb not null default '{}'::jsonb,
  add column if not exists configured boolean not null default false;

update public.payment_channels
set configured = coalesce(configured, false)
where configured is null;

create or replace function public.complete_account_recharge(
  p_recharge_id uuid,
  p_provider_transaction_id text,
  p_paid_amount numeric,
  p_currency text default 'CNY'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.account_recharges;
  v_transaction public.balance_transactions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_account_recharge can only be called by trusted server role';
  end if;

  select * into v_recharge
  from public.account_recharges
  where id = p_recharge_id
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status = 'paid' then
    select * into v_transaction
    from public.balance_transactions
    where business_type = 'account_recharge'
      and business_id = v_recharge.recharge_no
      and status = 'completed'
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'alreadyCompleted', true,
      'rechargeNo', v_recharge.recharge_no,
      'transactionNo', v_transaction.transaction_no
    );
  end if;

  if v_recharge.status in ('closed','expired','failed','refunded') then
    raise exception '充值单状态不允许入账';
  end if;

  if exists (
    select 1
    from public.account_recharges ar
    where ar.provider_trade_no = nullif(p_provider_transaction_id, '')
      and ar.id <> v_recharge.id
  ) then
    raise exception '渠道交易号已被其他充值单使用';
  end if;

  select * into v_transaction
  from public.credit_account_recharge_balance(
    v_recharge.recharge_no,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'rechargeNo', v_recharge.recharge_no,
    'transactionNo', v_transaction.transaction_no,
    'balanceAfter', v_transaction.balance_after
  );
end;
$$;

revoke execute on function public.complete_account_recharge(uuid,text,numeric,text) from public;
revoke execute on function public.complete_account_recharge(uuid,text,numeric,text) from anon;
revoke execute on function public.complete_account_recharge(uuid,text,numeric,text) from authenticated;
grant execute on function public.complete_account_recharge(uuid,text,numeric,text) to service_role;

-- RLS inspection SQL after execution:
-- select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('payment_sessions','payment_channels','account_recharges','balance_transactions');
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('payment_sessions','payment_channels','account_recharges','balance_transactions') order by tablename, policyname;
