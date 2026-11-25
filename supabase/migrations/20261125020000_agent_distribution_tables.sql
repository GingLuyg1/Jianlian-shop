-- ============================================================================
-- Migration: 20261125020000_agent_distribution_tables.sql
-- Purpose (Idempotent):
--   [A-P0-10] Persist agent/API merchant applications and IP whitelists in
--   PostgreSQL instead of browser localStorage, with server-generated secrets.
-- ============================================================================

create table if not exists public.agent_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  merchant_name text not null,
  business_scenario text not null default '',
  server_ips jsonb not null default '[]'::jsonb,
  contact text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  app_id text unique,
  app_secret_hash text,
  app_secret_prefix text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_applications_status_created
  on public.agent_applications (status, created_at desc);

create index if not exists idx_agent_applications_email
  on public.agent_applications (lower(email));

create table if not exists public.agent_ip_whitelists (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.agent_applications(id) on delete cascade,
  email text not null,
  merchant_name text not null default '',
  app_id text not null default '',
  ip text not null,
  remark text not null default '',
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_ip_whitelists_app_id
  on public.agent_ip_whitelists (app_id, status);

create index if not exists idx_agent_ip_whitelists_email
  on public.agent_ip_whitelists (lower(email));

alter table public.agent_applications enable row level security;
alter table public.agent_ip_whitelists enable row level security;

drop policy if exists "users can read own agent applications" on public.agent_applications;
create policy "users can read own agent applications"
  on public.agent_applications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins can manage agent applications" on public.agent_applications;
create policy "admins can manage agent applications"
  on public.agent_applications for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage agent ip whitelists" on public.agent_ip_whitelists;
create policy "admins can manage agent ip whitelists"
  on public.agent_ip_whitelists for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.agent_applications from public, anon;
revoke all on public.agent_ip_whitelists from public, anon;
grant select on public.agent_applications to authenticated;
grant all on public.agent_applications to service_role;
grant all on public.agent_ip_whitelists to service_role;
