-- Business compensation tasks for failed cross-system operations.
-- Safe to run repeatedly. This file is not executed automatically by Codex.

create table if not exists public.business_compensation_tasks (
  id uuid primary key default gen_random_uuid(),
  business_type text not null,
  business_id text not null,
  business_no text,
  operation text not null,
  failure_stage text not null,
  status text not null default 'pending',
  retryable boolean not null default false,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz,
  error_code text,
  error_summary text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_compensation_tasks_type_check check (
    business_type in ('product','order','payment','recharge','refund','balance','delivery','inventory','system')
  ),
  constraint business_compensation_tasks_status_check check (
    status in ('pending','retrying','manual_review','resolved','cancelled')
  ),
  constraint business_compensation_tasks_attempts_check check (attempts >= 0 and max_attempts >= 0),
  constraint business_compensation_tasks_error_summary_check check (error_summary is null or length(error_summary) <= 800),
  constraint business_compensation_tasks_resolution_note_check check (resolution_note is null or length(resolution_note) <= 500)
);

create unique index if not exists business_compensation_idempotency_idx
  on public.business_compensation_tasks (business_type, business_id, operation, failure_stage)
  where status in ('pending','retrying','manual_review');

create index if not exists business_compensation_status_created_idx
  on public.business_compensation_tasks (status, created_at desc);

create index if not exists business_compensation_type_created_idx
  on public.business_compensation_tasks (business_type, created_at desc);

create index if not exists business_compensation_request_id_idx
  on public.business_compensation_tasks (request_id)
  where request_id is not null;

create index if not exists business_compensation_business_no_idx
  on public.business_compensation_tasks (business_no)
  where business_no is not null;

alter table public.business_compensation_tasks enable row level security;

drop policy if exists "super admin can read compensation tasks" on public.business_compensation_tasks;
create policy "super admin can read compensation tasks"
  on public.business_compensation_tasks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and lower(coalesce(p.email, '')) = 'gac000189@gmail.com'
    )
  );

drop policy if exists "users cannot write compensation tasks" on public.business_compensation_tasks;
create policy "users cannot write compensation tasks"
  on public.business_compensation_tasks
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on public.business_compensation_tasks from anon;
revoke insert, update, delete on public.business_compensation_tasks from authenticated;
grant select on public.business_compensation_tasks to authenticated;

create or replace function public.set_business_compensation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_compensation_set_updated_at on public.business_compensation_tasks;
create trigger business_compensation_set_updated_at
before update on public.business_compensation_tasks
for each row execute function public.set_business_compensation_updated_at();

create or replace function public.record_business_compensation_task(
  p_business_type text,
  p_business_id text,
  p_business_no text,
  p_operation text,
  p_failure_stage text,
  p_retryable boolean,
  p_error_code text,
  p_error_summary text,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.business_compensation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.business_compensation_tasks;
begin
  select * into v_task
  from public.business_compensation_tasks
  where business_type = p_business_type
    and business_id = p_business_id
    and operation = p_operation
    and failure_stage = p_failure_stage
    and status in ('pending','retrying','manual_review')
  order by created_at desc
  limit 1;

  if v_task.id is not null then
    return v_task;
  end if;

  insert into public.business_compensation_tasks (
    business_type,
    business_id,
    business_no,
    operation,
    failure_stage,
    retryable,
    error_code,
    error_summary,
    request_id,
    metadata
  )
  values (
    p_business_type,
    p_business_id,
    nullif(trim(coalesce(p_business_no, '')), ''),
    p_operation,
    p_failure_stage,
    coalesce(p_retryable, false),
    nullif(trim(coalesce(p_error_code, '')), ''),
    left(nullif(trim(coalesce(p_error_summary, '')), ''), 800),
    nullif(trim(coalesce(p_request_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.record_business_compensation_task(text,text,text,text,text,boolean,text,text,text,jsonb) from anon;
revoke all on function public.record_business_compensation_task(text,text,text,text,text,boolean,text,text,text,jsonb) from authenticated;
