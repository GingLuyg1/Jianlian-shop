-- Legal document versioning and order evidence baseline.
-- Execute manually in Supabase SQL Editor. Safe to rerun.

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('terms_of_service','privacy_policy','refund_policy','digital_delivery_policy','purchase_notice')),
  version text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  effective_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  publish_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, version)
);

create unique index if not exists legal_documents_current_published_idx
  on public.legal_documents(document_type)
  where status = 'published';

create index if not exists legal_documents_type_status_idx on public.legal_documents(document_type, status, effective_at desc);

create table if not exists public.order_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version_id uuid not null references public.legal_documents(id) on delete restrict,
  document_version text not null,
  content_hash text not null,
  accepted_at timestamptz not null default now(),
  acceptance_source text not null default 'checkout' check (acceptance_source in ('checkout','payment','admin_import')),
  ip_hash text,
  user_agent_summary text,
  request_id text,
  created_at timestamptz not null default now(),
  unique(order_id, document_type)
);

create index if not exists order_agreement_acceptances_order_idx on public.order_agreement_acceptances(order_id, created_at);
create index if not exists order_agreement_acceptances_user_idx on public.order_agreement_acceptances(user_id, created_at desc);

create table if not exists public.order_evidence_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  source text not null,
  title text not null,
  summary text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_evidence_events_order_idx on public.order_evidence_events(order_id, created_at);

alter table public.legal_documents enable row level security;
alter table public.order_agreement_acceptances enable row level security;
alter table public.order_evidence_events enable row level security;

drop policy if exists "public can read effective legal documents" on public.legal_documents;
create policy "public can read effective legal documents"
  on public.legal_documents for select
  using (status = 'published' and (effective_at is null or effective_at <= now()));

drop policy if exists "super admins can read legal documents" on public.legal_documents;
create policy "super admins can read legal documents"
  on public.legal_documents for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "super admins can manage legal documents" on public.legal_documents;
create policy "super admins can manage legal documents"
  on public.legal_documents for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "users can read own order agreement acceptances" on public.order_agreement_acceptances;
create policy "users can read own order agreement acceptances"
  on public.order_agreement_acceptances for select
  using (user_id = auth.uid());

drop policy if exists "admins can read order agreement acceptances" on public.order_agreement_acceptances;
create policy "admins can read order agreement acceptances"
  on public.order_agreement_acceptances for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "deny direct agreement writes" on public.order_agreement_acceptances;
create policy "deny direct agreement writes"
  on public.order_agreement_acceptances for insert
  with check (false);

drop policy if exists "users can read own order evidence events" on public.order_evidence_events;
create policy "users can read own order evidence events"
  on public.order_evidence_events for select
  using (user_id = auth.uid());

drop policy if exists "admins can read order evidence events" on public.order_evidence_events;
create policy "admins can read order evidence events"
  on public.order_evidence_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "deny direct evidence writes" on public.order_evidence_events;
create policy "deny direct evidence writes"
  on public.order_evidence_events for insert
  with check (false);


