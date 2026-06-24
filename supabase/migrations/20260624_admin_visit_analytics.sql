-- Optional visitor analytics foundation for the admin business dashboard.
-- Run manually in Supabase SQL Editor when you are ready to collect frontend page views.
-- This migration only creates a privacy-safe event table. It does not enable tracking by itself.

create extension if not exists pgcrypto;

create table if not exists public.page_visit_events (
  id uuid primary key default gen_random_uuid(),
  visit_date timestamptz not null default now(),
  page_path text not null,
  referrer_path text,
  visitor_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_key text,
  user_agent_hash text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists page_visit_events_visit_date_idx
  on public.page_visit_events(visit_date desc);

create index if not exists page_visit_events_page_path_idx
  on public.page_visit_events(page_path);

create index if not exists page_visit_events_visitor_date_idx
  on public.page_visit_events(visitor_key, visit_date desc);

create index if not exists page_visit_events_user_date_idx
  on public.page_visit_events(user_id, visit_date desc)
  where user_id is not null;

alter table public.page_visit_events enable row level security;

drop policy if exists "Admins can read page visit events" on public.page_visit_events;
create policy "Admins can read page visit events"
  on public.page_visit_events
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "No direct client inserts for page visit events" on public.page_visit_events;
create policy "No direct client inserts for page visit events"
  on public.page_visit_events
  for insert
  to authenticated
  with check (false);

comment on table public.page_visit_events is 'Privacy-safe page visit events used by the admin dashboard. Do not store raw IP, tokens, passwords, payment data, or sensitive URL query strings.';
comment on column public.page_visit_events.visitor_key is 'Anonymous visitor identifier hash. Do not store raw browser identifiers.';
comment on column public.page_visit_events.ip_hash is 'Optional truncated or salted IP hash. Never store full raw IP.';
comment on column public.page_visit_events.user_agent_hash is 'Optional user-agent hash for coarse diagnostics.';
