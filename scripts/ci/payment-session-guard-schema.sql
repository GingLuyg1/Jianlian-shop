-- Disposable CI PostgreSQL fixture ONLY. Not a Production migration.
create schema auth;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create role anon;
create role authenticated;
create role service_role;
create table auth.users (id uuid primary key);
create table public.guard_ci_identity (identity text primary key check(identity='payment-session-guard-ci-only'));
insert into public.guard_ci_identity values ('payment-session-guard-ci-only');
create table public.account_recharges (
  id uuid primary key default gen_random_uuid(), recharge_no text unique not null,
  user_id uuid not null references auth.users(id), status text not null,
  provider text, channel_code text, currency text, amount numeric,
  requested_amount numeric, fee_amount numeric, payable_amount numeric, credited_amount numeric,
  expires_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  client_request_id text unique, metadata jsonb default '{}'
);
-- Production payment_sessions definition is loaded verbatim by the runner;
-- no status/index semantics are approximated here.
create table public.profiles (id uuid primary key references auth.users(id), balance numeric not null);
create table public.balance_transactions (id uuid primary key, metadata jsonb);
create table public.payment_reconciliations (id uuid primary key, metadata jsonb);
create table public.payment_channels (id uuid primary key default gen_random_uuid(), channel text,
  code text, provider text, provider_name text, currency text, enabled boolean, configured boolean,
  minimum_amount numeric, min_amount numeric, fee_rate numeric, public_config jsonb, sort_order integer);
create table public.orders (id uuid primary key, order_no text, user_id uuid, status text,
  payment_status text, total_amount numeric, currency text);
