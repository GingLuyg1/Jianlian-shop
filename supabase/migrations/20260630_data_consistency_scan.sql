-- Data consistency read-only scan records.
-- Execute manually in Supabase SQL Editor after prerequisite business tables exist.

create table if not exists public.data_consistency_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'manual',
  status text not null default 'running' check (status in ('running', 'completed', 'partial_failed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  checked_rules integer not null default 0,
  issue_count integer not null default 0,
  critical_count integer not null default 0,
  error_summary jsonb not null default '[]'::jsonb,
  triggered_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.data_consistency_issues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.data_consistency_runs(id) on delete set null,
  fingerprint text not null,
  rule_code text not null,
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  entity_type text not null,
  entity_id text,
  related_entities jsonb not null default '{}'::jsonb,
  title text not null,
  summary text not null,
  suggestion text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'ignored')),
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);

create index if not exists data_consistency_runs_created_at_idx on public.data_consistency_runs(created_at desc);
create index if not exists data_consistency_issues_rule_idx on public.data_consistency_issues(rule_code);
create index if not exists data_consistency_issues_severity_idx on public.data_consistency_issues(severity);
create index if not exists data_consistency_issues_status_idx on public.data_consistency_issues(status);
create index if not exists data_consistency_issues_last_seen_idx on public.data_consistency_issues(last_seen_at desc);

create or replace function public.set_data_consistency_issue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_data_consistency_issue_updated_at on public.data_consistency_issues;
create trigger set_data_consistency_issue_updated_at
before update on public.data_consistency_issues
for each row execute function public.set_data_consistency_issue_updated_at();

alter table public.data_consistency_runs enable row level security;
alter table public.data_consistency_issues enable row level security;

drop policy if exists "Admins can read consistency runs" on public.data_consistency_runs;
create policy "Admins can read consistency runs"
on public.data_consistency_runs
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins can read consistency issues" on public.data_consistency_issues;
create policy "Admins can read consistency issues"
on public.data_consistency_issues
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Inserts and updates are intentionally not granted through RLS policies.
-- Server-side service role APIs write scan records and status updates after super-admin checks.
