-- Payment reconciliation and exception recovery records for Jianlian Shop.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.

create table if not exists public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_no text unique not null,
  payment_session_id uuid,
  business_type text not null check (business_type in ('order','recharge')),
  business_id text,
  channel_code text,
  provider text,
  local_status text,
  provider_status text,
  local_amount numeric(18, 6) not null default 0,
  provider_amount numeric(18, 6),
  currency text not null default 'CNY',
  result text not null check (result in ('matched','mismatched','pending','query_failed','manual_review','resolved')),
  difference_type text check (
    difference_type is null or difference_type in (
      'provider_paid_local_unpaid',
      'local_paid_provider_unpaid',
      'amount_mismatch',
      'currency_mismatch',
      'transaction_id_conflict',
      'status_mismatch',
      'provider_not_found'
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

alter table if exists public.payment_reconciliations
  add column if not exists risk_level text not null default 'normal',
  add column if not exists provider_trade_no text,
  add column if not exists local_trade_no text,
  add column if not exists provider_summary jsonb not null default '{}'::jsonb,
  add column if not exists recovery_action text,
  add column if not exists recovery_status text,
  add column if not exists recovery_error text,
  add column if not exists dedupe_key text;

create unique index if not exists payment_reconciliations_no_unique on public.payment_reconciliations(reconciliation_no);
create unique index if not exists payment_reconciliations_dedupe_unique on public.payment_reconciliations(dedupe_key) where dedupe_key is not null;
create index if not exists payment_reconciliations_payment_idx on public.payment_reconciliations(payment_session_id, business_type);
create index if not exists payment_reconciliations_business_idx on public.payment_reconciliations(business_type, business_id);
create index if not exists payment_reconciliations_result_idx on public.payment_reconciliations(result);
create index if not exists payment_reconciliations_difference_idx on public.payment_reconciliations(difference_type);
create index if not exists payment_reconciliations_checked_at_idx on public.payment_reconciliations(checked_at desc);
create index if not exists payment_reconciliations_channel_idx on public.payment_reconciliations(channel_code);

create or replace function public.set_payment_reconciliations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_reconciliations_updated_at on public.payment_reconciliations;
create trigger trg_payment_reconciliations_updated_at
before update on public.payment_reconciliations
for each row execute function public.set_payment_reconciliations_updated_at();

alter table public.payment_reconciliations enable row level security;

drop policy if exists "Admins can read payment reconciliations" on public.payment_reconciliations;
create policy "Admins can read payment reconciliations"
on public.payment_reconciliations for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update payment reconciliations" on public.payment_reconciliations;
create policy "Admins can update payment reconciliations"
on public.payment_reconciliations for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Inserts and automated writes are intentionally left to trusted service-role server code only.
