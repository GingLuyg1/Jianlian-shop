-- Jianlian Shop backup run metadata.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.
-- It stores metadata only. Do not store backup passwords, database URLs, or raw dump content here.

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null,
  environment text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  file_name text,
  file_size bigint,
  checksum text,
  storage_location text,
  retention_until timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint backup_runs_status_check
    check (status in ('running', 'succeeded', 'failed', 'verified', 'expired')),
  constraint backup_runs_type_check
    check (backup_type in ('database_full', 'database_key_tables', 'database_schema', 'storage_public', 'storage_private', 'digital_inventory', 'restore_drill'))
);

create index if not exists backup_runs_environment_started_at_idx
  on public.backup_runs (environment, started_at desc);

create index if not exists backup_runs_status_started_at_idx
  on public.backup_runs (status, started_at desc);

create index if not exists backup_runs_type_started_at_idx
  on public.backup_runs (backup_type, started_at desc);

alter table public.backup_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'backup_runs'
      and policyname = 'backup_runs_admin_select'
  ) then
    create policy backup_runs_admin_select
      on public.backup_runs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'backup_runs'
      and policyname = 'backup_runs_admin_insert'
  ) then
    create policy backup_runs_admin_insert
      on public.backup_runs
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'backup_runs'
      and policyname = 'backup_runs_admin_update'
  ) then
    create policy backup_runs_admin_update
      on public.backup_runs
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;
end $$;

revoke all on public.backup_runs from anon;
grant select, insert, update on public.backup_runs to authenticated;
