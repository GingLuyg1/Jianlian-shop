-- Payment readiness compatibility: balance transaction ledger.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.
-- It does not credit any balance by itself and does not integrate a real provider.

create extension if not exists pgcrypto;

create table if not exists public.balance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_no text not null unique,
  business_type text not null,
  business_id text not null,
  direction text not null,
  amount numeric(18, 6) not null,
  balance_before numeric(18, 6),
  balance_after numeric(18, 6),
  currency text not null default 'CNY',
  status text not null default 'completed',
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint balance_transactions_business_type_check
    check (business_type in ('account_recharge','order_payment','admin_adjustment','refund','promotion','system')),
  constraint balance_transactions_direction_check
    check (direction in ('credit','debit')),
  constraint balance_transactions_status_check
    check (status in ('pending','completed','failed','cancelled')),
  constraint balance_transactions_amount_positive_check
    check (amount > 0)
);

create unique index if not exists balance_transactions_business_unique
  on public.balance_transactions(business_type, business_id)
  where status = 'completed';

create index if not exists balance_transactions_user_created_idx
  on public.balance_transactions(user_id, created_at desc);

create index if not exists balance_transactions_business_idx
  on public.balance_transactions(business_type, business_id);

create or replace function public.set_balance_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_balance_transactions_updated_at on public.balance_transactions;
create trigger trg_balance_transactions_updated_at
before update on public.balance_transactions
for each row execute function public.set_balance_transactions_updated_at();

alter table public.balance_transactions enable row level security;

drop policy if exists "Users can read own balance transactions" on public.balance_transactions;
create policy "Users can read own balance transactions"
on public.balance_transactions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read all balance transactions" on public.balance_transactions;
create policy "Admins can read all balance transactions"
on public.balance_transactions for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Deny direct balance transaction writes" on public.balance_transactions;
create policy "Deny direct balance transaction writes"
on public.balance_transactions for all
to authenticated
using (false)
with check (false);

revoke all on table public.balance_transactions from anon;
revoke insert, update, delete on table public.balance_transactions from authenticated;
grant select on table public.balance_transactions to authenticated;
grant all on table public.balance_transactions to service_role;

create or replace function public.credit_account_recharge_balance(
  p_recharge_no text,
  p_provider_trade_no text,
  p_received_amount numeric,
  p_currency text default 'CNY'
)
returns public.balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.account_recharges;
  v_profile public.profiles;
  v_transaction public.balance_transactions;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_transaction_no text;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception '无权执行余额入账';
  end if;

  select * into v_recharge
  from public.account_recharges
  where recharge_no = p_recharge_no
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status in ('closed','expired','failed','refunded') then
    raise exception '充值单状态不允许入账';
  end if;

  if round(coalesce(p_received_amount, 0)::numeric, 6) <> round(coalesce(v_recharge.payable_amount, v_recharge.amount, 0)::numeric, 6) then
    raise exception '到账金额与应付金额不一致';
  end if;

  if upper(coalesce(p_currency, v_recharge.currency, 'CNY')) <> upper(coalesce(v_recharge.currency, 'CNY')) then
    raise exception '到账币种与充值单币种不一致';
  end if;

  select * into v_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = v_recharge.recharge_no
    and status = 'completed'
  limit 1;

  if found then
    return v_transaction;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_recharge.user_id
  for update;

  if not found then
    raise exception '用户资料不存在';
  end if;

  v_before := coalesce(v_profile.balance, 0);
  v_after := v_before + coalesce(v_recharge.amount, 0);
  v_transaction_no := 'BT' || to_char(now(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 8));

  update public.profiles
  set balance = v_after,
      updated_at = now()
  where id = v_recharge.user_id;

  update public.account_recharges
  set status = 'paid',
      provider_trade_no = coalesce(nullif(p_provider_trade_no, ''), provider_trade_no),
      received_amount = p_received_amount,
      credited_amount = v_recharge.amount,
      paid_at = coalesce(paid_at, now()),
      callback_status = 'success',
      updated_at = now()
  where id = v_recharge.id;

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_recharge.user_id, v_transaction_no, 'account_recharge', v_recharge.recharge_no, 'credit', v_recharge.amount,
    v_before, v_after, coalesce(v_recharge.currency, 'CNY'), 'completed', '账户充值入账',
    jsonb_build_object('provider_trade_no_present', nullif(p_provider_trade_no, '') is not null)
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.credit_account_recharge_balance(text,text,numeric,text) from public;
revoke execute on function public.credit_account_recharge_balance(text,text,numeric,text) from anon;
grant execute on function public.credit_account_recharge_balance(text,text,numeric,text) to service_role;
