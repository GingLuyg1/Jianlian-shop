-- Optional visitor analytics aggregate table.
-- Run manually in Supabase SQL Editor after 20260624_admin_visit_analytics.sql.
-- This file is safe to run more than once and does not delete existing visit events.

create table if not exists public.visitor_daily_stats (
  stat_date date primary key,
  visitor_count integer not null default 0,
  page_view_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists visitor_daily_stats_updated_at_idx
  on public.visitor_daily_stats(updated_at desc);

create index if not exists page_visit_events_visit_date_visitor_idx
  on public.page_visit_events(visit_date desc, visitor_key);

alter table public.visitor_daily_stats enable row level security;

drop policy if exists "Admins can read visitor daily stats" on public.visitor_daily_stats;
create policy "Admins can read visitor daily stats"
  on public.visitor_daily_stats
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "No direct client writes for visitor daily stats" on public.visitor_daily_stats;
create policy "No direct client writes for visitor daily stats"
  on public.visitor_daily_stats
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.visitor_daily_stats is 'Optional daily aggregate of privacy-safe visitor analytics. Keep raw visitor identifiers, full IP addresses, tokens, payment data, and inventory contents out of this table.';
