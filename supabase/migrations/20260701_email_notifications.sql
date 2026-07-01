-- Jianlian Shop email notification templates and delivery queue.
-- Safe to run repeatedly. This migration does not configure a real email provider.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  version integer not null default 1,
  name text,
  subject_template text not null,
  html_template text not null,
  text_template text,
  variables_schema jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  is_current boolean not null default false,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_status_check check (status in ('draft','published','archived')),
  constraint email_templates_code_format_check check (template_code ~ '^[a-z0-9_]{3,80}$'),
  constraint email_templates_version_positive_check check (version > 0),
  constraint email_templates_code_version_unique unique (template_code, version)
);

create unique index if not exists email_templates_current_published_unique
  on public.email_templates(template_code)
  where status = 'published' and is_current = true;

create index if not exists email_templates_code_status_idx on public.email_templates(template_code, status, is_current);
create index if not exists email_templates_updated_at_idx on public.email_templates(updated_at desc);

create table if not exists public.email_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  template_code text not null,
  template_version integer,
  recipient_summary text not null,
  recipient_hash text not null,
  recipient_encrypted_or_reference text,
  subject_rendered text not null,
  html_rendered text not null,
  text_rendered text,
  business_type text,
  business_id text,
  business_no text,
  idempotency_key text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz,
  provider text,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  locked_by text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_delivery_jobs_status_check check (status in ('pending','processing','sent','retrying','failed','cancelled')),
  constraint email_delivery_jobs_attempts_check check (attempts >= 0 and max_attempts > 0),
  constraint email_delivery_jobs_idempotency_unique unique (idempotency_key)
);

create index if not exists email_delivery_jobs_status_retry_idx on public.email_delivery_jobs(status, next_retry_at, created_at);
create index if not exists email_delivery_jobs_template_idx on public.email_delivery_jobs(template_code, template_version);
create index if not exists email_delivery_jobs_business_idx on public.email_delivery_jobs(business_type, business_id, business_no);
create index if not exists email_delivery_jobs_user_idx on public.email_delivery_jobs(user_id, created_at desc);
create index if not exists email_delivery_jobs_recipient_hash_idx on public.email_delivery_jobs(recipient_hash);

create table if not exists public.email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_delivery_jobs(id) on delete cascade,
  attempt_no integer not null,
  provider text,
  status text not null,
  provider_message_id text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint email_delivery_attempts_attempt_positive_check check (attempt_no > 0)
);

create unique index if not exists email_delivery_attempts_job_attempt_unique on public.email_delivery_attempts(job_id, attempt_no);
create index if not exists email_delivery_attempts_created_at_idx on public.email_delivery_attempts(created_at desc);

create table if not exists public.user_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transactional_enabled boolean not null default true,
  security_enabled boolean not null default true,
  order_enabled boolean not null default true,
  recharge_enabled boolean not null default true,
  refund_enabled boolean not null default true,
  marketing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.email_delivery_jobs enable row level security;
alter table public.email_delivery_attempts enable row level security;
alter table public.user_email_preferences enable row level security;

create or replace function public.is_super_admin_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
      and lower(coalesce(p.email, '')) = 'gac000189@gmail.com'
  );
$$;

create or replace function public.set_email_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_email_updated_at();

drop trigger if exists set_email_delivery_jobs_updated_at on public.email_delivery_jobs;
create trigger set_email_delivery_jobs_updated_at
  before update on public.email_delivery_jobs
  for each row execute function public.set_email_updated_at();

drop trigger if exists set_user_email_preferences_updated_at on public.user_email_preferences;
create trigger set_user_email_preferences_updated_at
  before update on public.user_email_preferences
  for each row execute function public.set_email_updated_at();

drop policy if exists "super admin can read email templates" on public.email_templates;
create policy "super admin can read email templates"
  on public.email_templates for select
  to authenticated
  using (public.is_super_admin_user(auth.uid()));

drop policy if exists "super admin can read email jobs" on public.email_delivery_jobs;
create policy "super admin can read email jobs"
  on public.email_delivery_jobs for select
  to authenticated
  using (public.is_super_admin_user(auth.uid()));

drop policy if exists "super admin can read email attempts" on public.email_delivery_attempts;
create policy "super admin can read email attempts"
  on public.email_delivery_attempts for select
  to authenticated
  using (public.is_super_admin_user(auth.uid()));

drop policy if exists "users can read own email preferences" on public.user_email_preferences;
create policy "users can read own email preferences"
  on public.user_email_preferences for select
  to authenticated
  using (user_id = auth.uid() or public.is_super_admin_user(auth.uid()));

drop policy if exists "users can update own email preferences" on public.user_email_preferences;
create policy "users can update own email preferences"
  on public.user_email_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.email_templates from anon;
revoke all on public.email_delivery_jobs from anon;
revoke all on public.email_delivery_attempts from anon;
revoke all on public.user_email_preferences from anon;
revoke insert, update, delete on public.email_templates from authenticated;
revoke insert, update, delete on public.email_delivery_jobs from authenticated;
revoke insert, update, delete on public.email_delivery_attempts from authenticated;
grant select on public.email_templates to authenticated;
grant select on public.email_delivery_jobs to authenticated;
grant select on public.email_delivery_attempts to authenticated;
grant select, update on public.user_email_preferences to authenticated;
grant all on public.email_templates to service_role;
grant all on public.email_delivery_jobs to service_role;
grant all on public.email_delivery_attempts to service_role;
grant all on public.user_email_preferences to service_role;

-- Allow audit logs to classify email notification operations.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'admin_audit_logs'
      and constraint_name = 'admin_audit_logs_module_check'
  ) then
    alter table public.admin_audit_logs drop constraint admin_audit_logs_module_check;
    alter table public.admin_audit_logs add constraint admin_audit_logs_module_check check (
      module in ('payments','recharges','orders','users','products','categories','inventory','delivery','settings','system','privacy','notifications')
    );
  end if;
end $$;
