-- Job-local PostgreSQL fixture for the CURRENT canonical payment completion RPCs.
-- Deliberately excludes catalog, delivery, fulfillment, and historical data.
-- The primary/unique keys below retain the real payment and ledger idempotency contract.
create extension if not exists pgcrypto;

-- A destructive-test safety identity checked by payment-watcher-real-db.sh.
-- This table must exist only in the job-local database built from this fixture.
create table public.ci_payment_watcher_database_identity (
  singleton boolean primary key default true check (singleton),
  identity_token text not null unique
);
insert into public.ci_payment_watcher_database_identity(singleton, identity_token)
values (true, 'jianlian-payment-watcher-ephemeral-v1');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin','support','finance')),
  balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Needed to compile the canonical is_admin(uuid) dependency. No CI user is an admin.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null,
  admin_level text not null
);

create table public.account_recharges (
  id uuid primary key default gen_random_uuid(),
  recharge_no text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  channel_code text,
  provider text,
  currency text not null default 'CNY',
  amount numeric(18,6) not null default 0,
  requested_amount numeric(18,6) not null default 0,
  fee_amount numeric(18,6) not null default 0,
  payable_amount numeric(18,6) not null default 0,
  received_amount numeric(18,6) not null default 0,
  credited_amount numeric(18,6) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','expired','closed','refunded')),
  provider_trade_no text,
  callback_status text,
  expires_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index account_recharges_provider_trade_no_unique
  on public.account_recharges(provider_trade_no)
  where provider_trade_no is not null and provider_trade_no <> '';

create table public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  session_no text not null unique,
  business_type text not null check (business_type in ('order','recharge','account_recharge')),
  business_id uuid not null,
  business_no text,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_code text not null,
  provider text,
  currency text not null default 'CNY',
  requested_amount numeric(18,6) not null default 0,
  fee_amount numeric(18,6) not null default 0,
  payable_amount numeric(18,6) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','expired','closed')),
  provider_order_no text,
  provider_transaction_id text,
  expires_at timestamptz,
  paid_at timestamptz,
  last_synced_at timestamptz,
  reconcile_status text not null default 'unchecked'
    check (reconcile_status in ('unchecked','matched','provider_paid_local_unpaid','local_paid_provider_unpaid','amount_mismatch','query_failed')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sessions_amounts_non_negative_check
    check (requested_amount >= 0 and fee_amount >= 0 and payable_amount >= 0)
);
create unique index payment_sessions_active_business_unique
  on public.payment_sessions(business_type,business_id)
  where status in ('pending','processing');
create unique index payment_sessions_provider_order_unique
  on public.payment_sessions(provider_order_no)
  where provider_order_no is not null and provider_order_no <> '';
create unique index payment_sessions_provider_transaction_unique
  on public.payment_sessions(provider_transaction_id)
  where provider_transaction_id is not null and provider_transaction_id <> '';

create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_no text not null unique,
  payment_session_id uuid,
  business_type text not null check (business_type in ('order','recharge')),
  business_id text,
  channel_code text,
  provider text,
  local_status text,
  provider_status text,
  local_amount numeric(18,6) not null default 0,
  provider_amount numeric(18,6),
  currency text not null default 'CNY',
  result text not null check (result in ('matched','mismatched','pending','query_failed','manual_review','resolved')),
  difference_type text check (
    difference_type is null or difference_type in (
      'provider_paid_local_unpaid','local_paid_provider_unpaid','amount_mismatch',
      'currency_mismatch','transaction_id_conflict','status_mismatch','provider_not_found'
    )
  ),
  error_code text,
  error_message text,
  checked_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  risk_level text not null default 'normal' check (risk_level in ('normal','medium','high')),
  provider_trade_no text,
  local_trade_no text,
  provider_summary jsonb not null default '{}'::jsonb,
  recovery_action text,
  recovery_status text,
  recovery_error text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payment_reconciliations_dedupe_unique
  on public.payment_reconciliations(dedupe_key);

create table public.balance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_no text not null unique,
  business_type text not null check (business_type in ('account_recharge','order_payment','admin_adjustment','refund','promotion','system')),
  business_id text not null,
  direction text not null check (direction in ('credit','debit')),
  amount numeric(18,6) not null check (amount > 0),
  balance_before numeric(18,6),
  balance_after numeric(18,6),
  currency text not null default 'CNY',
  status text not null default 'completed'
    check (status in ('pending','completed','failed','cancelled')),
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index balance_transactions_business_unique
  on public.balance_transactions(business_type,business_id)
  where status='completed';

-- The order branch is not exercised, but the canonical session RPC declares
-- public.orders as a row type and includes public.order_payments SQL.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  payment_status text,
  total_amount numeric(18,6),
  currency text
);
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text unique,
  amount numeric(18,6),
  currency text,
  business_amount numeric(18,6),
  payable_amount numeric(18,6),
  order_amount numeric(18,6),
  order_currency text,
  received_amount numeric(18,6),
  received_currency text,
  paid_at timestamptz,
  callback_status text,
  updated_at timestamptz
);
