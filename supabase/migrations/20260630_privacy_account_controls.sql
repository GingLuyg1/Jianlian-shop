-- Privacy requests, personal data export, and account deletion controls.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists anonymized_at timestamptz;
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  request_type text not null check (request_type in ('data_export', 'account_deletion')),
  status text not null default 'requested' check (status in ('requested', 'verifying', 'blocked', 'approved', 'processing', 'completed', 'cancelled', 'failed')),
  reason_detail text,
  block_reasons jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  client_request_id text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  cooldown_until timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists privacy_requests_client_request_uidx
  on public.privacy_requests(user_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists privacy_requests_active_deletion_uidx
  on public.privacy_requests(user_id)
  where request_type = 'account_deletion'
    and status in ('requested', 'verifying', 'blocked', 'approved', 'processing');

create index if not exists privacy_requests_user_created_idx on public.privacy_requests(user_id, created_at desc);
create index if not exists privacy_requests_status_idx on public.privacy_requests(status, created_at desc);
create index if not exists privacy_requests_type_idx on public.privacy_requests(request_type, created_at desc);

create table if not exists public.privacy_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.privacy_requests(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('user', 'admin', 'system')),
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists privacy_request_events_request_idx on public.privacy_request_events(request_id, created_at desc);
create index if not exists privacy_request_events_user_idx on public.privacy_request_events(user_id, created_at desc);

create or replace function public.set_privacy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_privacy_requests_updated_at on public.privacy_requests;
create trigger trg_privacy_requests_updated_at
before update on public.privacy_requests
for each row execute function public.set_privacy_updated_at();

create or replace function public.anonymize_user_account(
  p_request_id uuid,
  p_admin_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.privacy_requests%rowtype;
  v_marker text;
begin
  select * into v_request
  from public.privacy_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'PRIVACY_REQUEST_NOT_FOUND';
  end if;

  if v_request.request_type <> 'account_deletion' then
    raise exception 'PRIVACY_REQUEST_TYPE_INVALID';
  end if;

  if v_request.status not in ('approved', 'processing') then
    raise exception 'PRIVACY_REQUEST_STATUS_INVALID';
  end if;

  if v_request.user_id is null then
    raise exception 'PRIVACY_REQUEST_USER_MISSING';
  end if;

  v_marker := 'deleted-' || replace(v_request.user_id::text, '-', '') || '@anonymous.invalid';

  update public.profiles
  set
    email = v_marker,
    display_name = '已注销用户',
    phone = null,
    avatar_url = null,
    country = null,
    recipient_name = null,
    shipping_address = null,
    account_status = 'disabled',
    deleted_at = now(),
    anonymized_at = now(),
    deletion_requested_at = coalesce(deletion_requested_at, v_request.created_at),
    updated_at = now()
  where id = v_request.user_id;

  update public.privacy_requests
  set status = 'completed', completed_at = now(), reviewed_by = p_admin_id,
      reviewed_at = coalesce(reviewed_at, now()), review_note = coalesce(p_reason, review_note), updated_at = now()
  where id = p_request_id;

  insert into public.privacy_request_events(request_id, user_id, actor_type, actor_id, event_type, message, metadata)
  values (p_request_id, v_request.user_id, 'admin', p_admin_id, 'account_anonymized', '账号资料已匿名化，历史订单和资金记录按规则保留。', jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'user_id', v_request.user_id, 'anonymous_email', v_marker);
end;
$$;

alter table public.privacy_requests enable row level security;
alter table public.privacy_request_events enable row level security;

drop policy if exists "Users can read own privacy requests" on public.privacy_requests;
create policy "Users can read own privacy requests" on public.privacy_requests
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can manage privacy requests" on public.privacy_requests;
create policy "Admins can manage privacy requests" on public.privacy_requests
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can read own privacy request events" on public.privacy_request_events;
create policy "Users can read own privacy request events" on public.privacy_request_events
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can manage privacy request events" on public.privacy_request_events;
create policy "Admins can manage privacy request events" on public.privacy_request_events
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Keep audit-log module constraint compatible with privacy operations.
alter table if exists public.admin_audit_logs drop constraint if exists admin_audit_logs_module_check;
alter table if exists public.admin_audit_logs
  add constraint admin_audit_logs_module_check check (
    module in ('payments','recharges','orders','users','products','categories','inventory','delivery','settings','system','privacy')
  );
