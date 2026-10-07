-- Extension of payment-watcher-minimal-schema.sql for THIS isolated test only.
-- Mirrors 20260704_recharge_review_flow.sql; not applied to any hosted project.
alter table public.account_recharges drop constraint account_recharges_status_check;
alter table public.account_recharges add constraint account_recharges_status_check check (
  status in ('pending','waiting_payment','submitted','reviewing','approved','processing','succeeded',
    'failed','rejected','cancelled','expired','paid','closed','refunded')
);
alter table public.account_recharges
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_reason text,
  add column exception_type text;
create table public.recharge_review_events (
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
create index recharge_review_events_recharge_created_idx
  on public.recharge_review_events(recharge_id,created_at desc);
alter table public.recharge_review_events enable row level security;
revoke all on public.recharge_review_events from public,anon,authenticated;
grant select on public.recharge_review_events to authenticated;
grant all on public.recharge_review_events to service_role;
