-- Risk event and manual review records.
-- Safe to run repeatedly. Do not store raw IP, tokens, payment callbacks, or inventory content.

create extension if not exists pgcrypto;

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  rule_code text not null,
  risk_level text not null default 'low',
  risk_score integer not null default 0,
  recommended_action text not null default 'allow',
  business_type text not null,
  business_id text,
  user_id uuid references public.profiles(id) on delete set null,
  request_id text,
  source_hash text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  resolved_at timestamptz,
  occurrences integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_events_level_check check (risk_level in ('low','medium','high','critical')),
  constraint risk_events_score_check check (risk_score between 0 and 100),
  constraint risk_events_action_check check (recommended_action in ('allow','allow_with_monitoring','require_review','temporarily_block','deny')),
  constraint risk_events_business_check check (business_type in ('account','login','order','inventory','payment','recharge','refund','delivery')),
  constraint risk_events_status_check check (status in ('open','pending','reviewing','monitoring','approved','rejected','resolved','expired','cancelled'))
);

create index if not exists risk_events_status_last_seen_idx on public.risk_events(status, last_seen_at desc);
create index if not exists risk_events_level_last_seen_idx on public.risk_events(risk_level, last_seen_at desc);
create index if not exists risk_events_business_idx on public.risk_events(business_type, business_id);
create index if not exists risk_events_user_idx on public.risk_events(user_id, last_seen_at desc);

create table if not exists public.risk_reviews (
  id uuid primary key default gen_random_uuid(),
  risk_event_id uuid not null references public.risk_events(id) on delete cascade,
  business_type text not null,
  business_id text,
  review_status text not null,
  decision text not null,
  reason text not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_reviews_status_check check (review_status in ('pending','reviewing','approved','rejected','expired','cancelled','monitoring','resolved')),
  constraint risk_reviews_decision_check check (decision in ('approve','reject','monitor','release'))
);

create index if not exists risk_reviews_event_idx on public.risk_reviews(risk_event_id, created_at desc);

create or replace function public.touch_risk_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists risk_events_touch_updated_at on public.risk_events;
create trigger risk_events_touch_updated_at
before update on public.risk_events
for each row execute function public.touch_risk_updated_at();

drop trigger if exists risk_reviews_touch_updated_at on public.risk_reviews;
create trigger risk_reviews_touch_updated_at
before update on public.risk_reviews
for each row execute function public.touch_risk_updated_at();

create or replace function public.risk_events_increment_occurrences()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.fingerprint = new.fingerprint then
    new.first_seen_at = old.first_seen_at;
    if new.last_seen_at is distinct from old.last_seen_at then
      new.occurrences = old.occurrences + 1;
    else
      new.occurrences = old.occurrences;
      new.last_seen_at = old.last_seen_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists risk_events_increment_occurrences on public.risk_events;
create trigger risk_events_increment_occurrences
before update on public.risk_events
for each row execute function public.risk_events_increment_occurrences();

alter table public.risk_events enable row level security;
alter table public.risk_reviews enable row level security;

drop policy if exists "admins can read risk events" on public.risk_events;
create policy "admins can read risk events"
on public.risk_events for select
using (public.is_admin(auth.uid()));

drop policy if exists "admins can write risk events" on public.risk_events;
create policy "admins can write risk events"
on public.risk_events for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admins can read risk reviews" on public.risk_reviews;
create policy "admins can read risk reviews"
on public.risk_reviews for select
using (public.is_admin(auth.uid()));

drop policy if exists "admins can write risk reviews" on public.risk_reviews;
create policy "admins can write risk reviews"
on public.risk_reviews for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
