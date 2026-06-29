-- Account recharge idempotency guard.
-- Execute manually in Supabase SQL Editor after the payment core migrations.
-- This migration does not create successful recharge data and does not credit balances.

alter table if exists public.account_recharges
  add column if not exists client_request_id text;

create unique index if not exists account_recharges_user_client_request_uidx
  on public.account_recharges(user_id, client_request_id)
  where client_request_id is not null and btrim(client_request_id) <> '';

create index if not exists account_recharges_user_status_created_idx
  on public.account_recharges(user_id, status, created_at desc);
