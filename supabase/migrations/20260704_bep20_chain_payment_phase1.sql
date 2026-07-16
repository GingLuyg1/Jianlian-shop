-- BEP20 chain payment phase 1 for Jianlian Shop.
-- Fixed receive address + user submitted TxHash + server-side BSC RPC verification.
-- Execute manually. This migration does not store private keys or seed phrases.

create extension if not exists pgcrypto;

create table if not exists public.chain_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payment_sessions(id) on delete set null,
  payment_method text not null default 'usdt_bep20',
  network text not null default 'BEP20',
  chain_id integer not null default 56,
  asset text not null default 'USDT',
  token_contract text not null,
  token_decimals integer not null default 18,
  expected_amount numeric(36, 18) not null,
  expected_raw_amount numeric(78, 0) not null,
  receive_address text not null,
  status text not null default 'waiting_payment',
  expires_at timestamptz not null,
  submitted_tx_hash text,
  confirmed_amount numeric(36, 18),
  confirmed_raw_amount numeric(78, 0),
  confirmed_at timestamptz,
  last_checked_at timestamptz,
  failure_reason text,
  manual_review_reason text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chain_payment_sessions_method_check check (payment_method = 'usdt_bep20'),
  constraint chain_payment_sessions_status_check check (
    status in (
      'waiting_payment',
      'submitted',
      'confirming',
      'paid',
      'underpaid',
      'overpaid',
      'expired',
      'manual_review',
      'failed'
    )
  ),
  constraint chain_payment_sessions_amount_check check (expected_amount > 0 and expected_raw_amount > 0),
  constraint chain_payment_sessions_chain_check check (chain_id = 56),
  constraint chain_payment_sessions_address_format_check check (
    receive_address ~* '^0x[0-9a-f]{40}$'
    and token_contract ~* '^0x[0-9a-f]{40}$'
  ),
  constraint chain_payment_sessions_tx_hash_format_check check (
    submitted_tx_hash is null or submitted_tx_hash ~* '^0x[0-9a-f]{64}$'
  )
);

create unique index if not exists chain_payment_sessions_active_order_unique
  on public.chain_payment_sessions(order_id, payment_method)
  where status in ('waiting_payment', 'submitted', 'confirming');

create index if not exists chain_payment_sessions_order_idx
  on public.chain_payment_sessions(order_id, created_at desc);

create index if not exists chain_payment_sessions_payment_idx
  on public.chain_payment_sessions(payment_id)
  where payment_id is not null;

create index if not exists chain_payment_sessions_status_idx
  on public.chain_payment_sessions(status, expires_at);

create table if not exists public.chain_transactions (
  id uuid primary key default gen_random_uuid(),
  chain_payment_session_id uuid references public.chain_payment_sessions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  chain_id integer not null default 56,
  tx_hash text not null,
  log_index integer not null,
  block_number numeric(30, 0),
  block_hash text,
  token_contract text not null,
  from_address text,
  to_address text not null,
  raw_amount numeric(78, 0) not null,
  normalized_amount numeric(36, 18) not null,
  confirmation_count integer not null default 0,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chain_transactions_chain_check check (chain_id = 56),
  constraint chain_transactions_status_check check (
    status in ('submitted', 'confirming', 'paid', 'underpaid', 'overpaid', 'manual_review', 'failed')
  ),
  constraint chain_transactions_hash_format_check check (tx_hash ~* '^0x[0-9a-f]{64}$'),
  constraint chain_transactions_address_format_check check (
    token_contract ~* '^0x[0-9a-f]{40}$'
    and to_address ~* '^0x[0-9a-f]{40}$'
    and (from_address is null or from_address ~* '^0x[0-9a-f]{40}$')
  )
);

create unique index if not exists chain_transactions_unique_log
  on public.chain_transactions(chain_id, tx_hash, log_index);

create index if not exists chain_transactions_order_idx
  on public.chain_transactions(order_id, created_at desc)
  where order_id is not null;

create or replace function public.set_chain_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chain_payment_sessions_updated_at on public.chain_payment_sessions;
create trigger trg_chain_payment_sessions_updated_at
before update on public.chain_payment_sessions
for each row execute function public.set_chain_payment_updated_at();

drop trigger if exists trg_chain_transactions_updated_at on public.chain_transactions;
create trigger trg_chain_transactions_updated_at
before update on public.chain_transactions
for each row execute function public.set_chain_payment_updated_at();

alter table public.chain_payment_sessions enable row level security;
alter table public.chain_transactions enable row level security;

drop policy if exists "Users can read own chain payment sessions" on public.chain_payment_sessions;
create policy "Users can read own chain payment sessions"
on public.chain_payment_sessions for select
using (exists (
  select 1 from public.orders o
  where o.id = chain_payment_sessions.order_id
    and o.user_id = auth.uid()
));

drop policy if exists "Admins can read all chain payment sessions" on public.chain_payment_sessions;
create policy "Admins can read all chain payment sessions"
on public.chain_payment_sessions for select
using (public.is_admin());

drop policy if exists "Users can read own chain transactions" on public.chain_transactions;
create policy "Users can read own chain transactions"
on public.chain_transactions for select
using (exists (
  select 1 from public.orders o
  where o.id = chain_transactions.order_id
    and o.user_id = auth.uid()
));

drop policy if exists "Admins can read all chain transactions" on public.chain_transactions;
create policy "Admins can read all chain transactions"
on public.chain_transactions for select
using (public.is_admin());

drop policy if exists "Deny direct chain payment session writes" on public.chain_payment_sessions;
create policy "Deny direct chain payment session writes"
on public.chain_payment_sessions for all
using (false)
with check (false);

drop policy if exists "Deny direct chain transaction writes" on public.chain_transactions;
create policy "Deny direct chain transaction writes"
on public.chain_transactions for all
using (false)
with check (false);

revoke all on table public.chain_payment_sessions from anon;
revoke insert, update, delete on table public.chain_payment_sessions from authenticated;
grant select on table public.chain_payment_sessions to authenticated;
grant all on table public.chain_payment_sessions to service_role;

revoke all on table public.chain_transactions from anon;
revoke insert, update, delete on table public.chain_transactions from authenticated;
grant select on table public.chain_transactions to authenticated;
grant all on table public.chain_transactions to service_role;

-- Pricing snapshot fields for BEP20 phase 1. Safe to run after the original table creation.
alter table public.chain_payment_sessions
  add column if not exists order_currency text,
  add column if not exists order_amount numeric(36, 18),
  add column if not exists payment_currency text not null default 'USDT',
  add column if not exists exchange_rate numeric(36, 18),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_fetched_at timestamptz,
  add column if not exists exchange_rate_expires_at timestamptz,
  add column if not exists pricing_status text not null default 'frozen';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chain_payment_sessions_payment_currency_check'
      and conrelid = 'public.chain_payment_sessions'::regclass
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_payment_currency_check check (payment_currency = 'USDT');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chain_payment_sessions_pricing_status_check'
      and conrelid = 'public.chain_payment_sessions'::regclass
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_pricing_status_check check (pricing_status in ('frozen', 'invalid', 'manual_review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chain_payment_sessions_exchange_rate_check'
      and conrelid = 'public.chain_payment_sessions'::regclass
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_exchange_rate_check check (exchange_rate is null or exchange_rate > 0);
  end if;
end $$;

create index if not exists chain_payment_sessions_pricing_idx
  on public.chain_payment_sessions(payment_currency, pricing_status, exchange_rate_expires_at);
