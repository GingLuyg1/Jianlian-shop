-- Candidate only. Do not execute without separate TEST database authorization.
-- Narrow compatibility repair for recharge review schema prerequisites.
-- Purpose: restore the historical submitted_at column and recharge_review_events table only.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.account_recharges') is null then
    raise exception 'account_recharges prerequisite is missing';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'is_admin prerequisite is missing';
  end if;
end $$;

alter table public.account_recharges
  add column if not exists submitted_at timestamptz;

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

create index if not exists recharge_review_events_recharge_created_idx
  on public.recharge_review_events(recharge_id, created_at desc);

alter table public.recharge_review_events enable row level security;

drop policy if exists "Users can read own recharge review events"
  on public.recharge_review_events;
create policy "Users can read own recharge review events"
  on public.recharge_review_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.account_recharges recharge
      where recharge.id = recharge_review_events.recharge_id
        and recharge.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can read recharge review events"
  on public.recharge_review_events;
create policy "Admins can read recharge review events"
  on public.recharge_review_events
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.recharge_review_events from public, anon;
revoke insert, update, delete on table public.recharge_review_events from authenticated;
grant select on table public.recharge_review_events to authenticated;
grant all on table public.recharge_review_events to service_role;

commit;
