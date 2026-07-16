-- Recharge proof submission, review history, and idempotent manual settlement support.
-- Run manually after payment provider core and balance transaction migrations.

alter table if exists public.account_recharges
  add column if not exists client_request_id text,
  add column if not exists payment_method text,
  add column if not exists review_mode text not null default 'provider',
  add column if not exists customer_note text,
  add column if not exists payment_time timestamptz,
  add column if not exists payer_account_summary text,
  add column if not exists transaction_reference text,
  add column if not exists proof_paths jsonb not null default '[]'::jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewing_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_reason text;

alter table if exists public.account_recharges drop constraint if exists account_recharges_status_check;
alter table if exists public.account_recharges add constraint account_recharges_status_check check (
  status in ('pending','waiting_payment','submitted','reviewing','approved','processing','succeeded','failed','rejected','cancelled','expired','paid','closed','refunded')
);

create unique index if not exists account_recharges_user_client_request_uidx
  on public.account_recharges(user_id, client_request_id)
  where client_request_id is not null and client_request_id <> '';
create unique index if not exists account_recharges_provider_trade_no_unique
  on public.account_recharges(provider_trade_no)
  where provider_trade_no is not null and provider_trade_no <> '';

create table if not exists public.recharge_review_events (
  id uuid primary key default gen_random_uuid(),
  recharge_id uuid not null references public.account_recharges(id) on delete restrict,
  recharge_no text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user','admin','provider','system')),
  action text not null,
  from_status text,
  to_status text,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists recharge_review_events_recharge_created_idx on public.recharge_review_events(recharge_id, created_at desc);
alter table public.recharge_review_events enable row level security;
drop policy if exists "Users can read own recharge review events" on public.recharge_review_events;
create policy "Users can read own recharge review events" on public.recharge_review_events for select to authenticated
using (exists (select 1 from public.account_recharges recharge where recharge.id = recharge_review_events.recharge_id and recharge.user_id = auth.uid()));
drop policy if exists "Admins can read recharge review events" on public.recharge_review_events;
create policy "Admins can read recharge review events" on public.recharge_review_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.recharge_review_events from anon, authenticated;

-- Existing private payment-proofs bucket paths:
-- <user-id>/recharges/<recharge-id>/<safe-file-name>
