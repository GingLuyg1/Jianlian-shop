-- Payment reconciliation run records and per-run logs.
-- Safe to execute repeatedly. Does not modify existing payment data.

create table if not exists public.payment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_no text not null unique,
  trigger_source text not null default 'internal_api',
  dry_run boolean not null default false,
  status text not null default 'running',
  batch_size integer,
  processed integer not null default 0,
  matched integer not null default 0,
  mismatched integer not null default 0,
  pending integer not null default 0,
  query_failed integer not null default 0,
  manual_review integer not null default 0,
  resolved integer not null default 0,
  skipped integer not null default 0,
  error_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_reconciliation_runs_status_check
    check (status in ('running', 'completed', 'failed')),
  constraint payment_reconciliation_runs_trigger_source_check
    check (trigger_source in ('internal_api', 'admin_retry', 'cron', 'manual'))
);

create table if not exists public.payment_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.payment_reconciliation_runs(id) on delete cascade,
  payment_session_id uuid references public.payment_sessions(id) on delete set null,
  reconciliation_id uuid references public.payment_reconciliations(id) on delete set null,
  level text not null default 'info',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_reconciliation_logs_level_check
    check (level in ('info', 'warn', 'error'))
);

create index if not exists payment_reconciliation_runs_started_idx
  on public.payment_reconciliation_runs(started_at desc);

create index if not exists payment_reconciliation_runs_status_idx
  on public.payment_reconciliation_runs(status, started_at desc);

create index if not exists payment_reconciliation_logs_run_idx
  on public.payment_reconciliation_logs(run_id, created_at desc);

create index if not exists payment_reconciliation_logs_session_idx
  on public.payment_reconciliation_logs(payment_session_id, created_at desc);

alter table public.payment_reconciliation_runs enable row level security;
alter table public.payment_reconciliation_logs enable row level security;

drop policy if exists "Admins can read payment reconciliation runs" on public.payment_reconciliation_runs;
create policy "Admins can read payment reconciliation runs"
  on public.payment_reconciliation_runs
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Admins can read payment reconciliation logs" on public.payment_reconciliation_logs;
create policy "Admins can read payment reconciliation logs"
  on public.payment_reconciliation_logs
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Service role manages payment reconciliation runs" on public.payment_reconciliation_runs;
create policy "Service role manages payment reconciliation runs"
  on public.payment_reconciliation_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages payment reconciliation logs" on public.payment_reconciliation_logs;
create policy "Service role manages payment reconciliation logs"
  on public.payment_reconciliation_logs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.payment_reconciliation_runs from anon;
revoke all on public.payment_reconciliation_logs from anon;
grant select on public.payment_reconciliation_runs to authenticated;
grant select on public.payment_reconciliation_logs to authenticated;
grant all on public.payment_reconciliation_runs to service_role;
grant all on public.payment_reconciliation_logs to service_role;
