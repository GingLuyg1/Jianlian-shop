-- Production monitoring: aggregated system error events.
-- Execute manually in Supabase SQL Editor.
-- This migration is idempotent and does not delete existing logs.

create extension if not exists pgcrypto;

create table if not exists public.system_error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  level text not null,
  category text not null,
  error_code text,
  title text not null,
  message text not null,
  route text,
  request_id text,
  user_id uuid,
  admin_id uuid,
  order_id uuid,
  payment_id uuid,
  product_id uuid,
  sku_id uuid,
  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open',
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_error_events_level_check
    check (level in ('debug','info','warn','error','critical')),
  constraint system_error_events_status_check
    check (status in ('open','investigating','resolved','ignored'))
);

create index if not exists system_error_events_level_idx
  on public.system_error_events(level);

create index if not exists system_error_events_category_idx
  on public.system_error_events(category);

create index if not exists system_error_events_status_idx
  on public.system_error_events(status);

create index if not exists system_error_events_last_seen_idx
  on public.system_error_events(last_seen_at desc);

create index if not exists system_error_events_request_id_idx
  on public.system_error_events(request_id)
  where request_id is not null;

create index if not exists system_error_events_order_id_idx
  on public.system_error_events(order_id)
  where order_id is not null;

create index if not exists system_error_events_payment_id_idx
  on public.system_error_events(payment_id)
  where payment_id is not null;

create or replace function public.set_system_error_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_error_events_updated_at on public.system_error_events;
create trigger trg_system_error_events_updated_at
before update on public.system_error_events
for each row execute function public.set_system_error_events_updated_at();

create or replace function public.upsert_system_error_event(p_event jsonb)
returns public.system_error_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.system_error_events;
begin
  insert into public.system_error_events (
    fingerprint,
    level,
    category,
    error_code,
    title,
    message,
    route,
    request_id,
    user_id,
    admin_id,
    order_id,
    payment_id,
    product_id,
    sku_id,
    status,
    metadata
  )
  values (
    p_event->>'fingerprint',
    coalesce(nullif(p_event->>'level', ''), 'error'),
    coalesce(nullif(p_event->>'category', ''), 'system'),
    nullif(p_event->>'error_code', ''),
    coalesce(nullif(p_event->>'title', ''), 'System error'),
    coalesce(nullif(p_event->>'message', ''), 'No message'),
    nullif(p_event->>'route', ''),
    nullif(p_event->>'request_id', ''),
    nullif(p_event->>'user_id', '')::uuid,
    nullif(p_event->>'admin_id', '')::uuid,
    nullif(p_event->>'order_id', '')::uuid,
    nullif(p_event->>'payment_id', '')::uuid,
    nullif(p_event->>'product_id', '')::uuid,
    nullif(p_event->>'sku_id', '')::uuid,
    coalesce(nullif(p_event->>'status', ''), 'open'),
    coalesce(p_event->'metadata', '{}'::jsonb)
  )
  on conflict (fingerprint)
  do update set
    occurrences = public.system_error_events.occurrences + 1,
    last_seen_at = now(),
    level = excluded.level,
    message = excluded.message,
    route = coalesce(excluded.route, public.system_error_events.route),
    request_id = coalesce(excluded.request_id, public.system_error_events.request_id),
    user_id = coalesce(excluded.user_id, public.system_error_events.user_id),
    admin_id = coalesce(excluded.admin_id, public.system_error_events.admin_id),
    order_id = coalesce(excluded.order_id, public.system_error_events.order_id),
    payment_id = coalesce(excluded.payment_id, public.system_error_events.payment_id),
    product_id = coalesce(excluded.product_id, public.system_error_events.product_id),
    sku_id = coalesce(excluded.sku_id, public.system_error_events.sku_id),
    metadata = public.system_error_events.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_event;

  return v_event;
end;
$$;

alter table public.system_error_events enable row level security;

drop policy if exists "admins can read system error events" on public.system_error_events;
create policy "admins can read system error events"
on public.system_error_events
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "admins can update system error event status" on public.system_error_events;
create policy "admins can update system error event status"
on public.system_error_events
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "deny direct system error inserts" on public.system_error_events;
create policy "deny direct system error inserts"
on public.system_error_events
for insert
to authenticated
with check (false);

revoke all on table public.system_error_events from anon;
grant select, update on table public.system_error_events to authenticated;
grant all on table public.system_error_events to service_role;

revoke execute on function public.upsert_system_error_event(jsonb) from public;
revoke execute on function public.upsert_system_error_event(jsonb) from anon;
grant execute on function public.upsert_system_error_event(jsonb) to service_role;
