create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  module text not null,
  target_type text,
  target_id text,
  target_label text,
  request_id text not null,
  ip_address text,
  user_agent text,
  result text not null,
  error_code text,
  error_message text,
  before_summary jsonb,
  after_summary jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_module_check check (
    module in (
      'payments',
      'recharges',
      'orders',
      'users',
      'products',
      'categories',
      'inventory',
      'delivery',
      'settings',
      'system'
    )
  ),
  constraint admin_audit_logs_result_check check (
    result in ('success', 'failed', 'denied')
  )
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_admin_email_idx
  on public.admin_audit_logs (admin_email);

create index if not exists admin_audit_logs_module_idx
  on public.admin_audit_logs (module);

create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);

create index if not exists admin_audit_logs_result_idx
  on public.admin_audit_logs (result);

create index if not exists admin_audit_logs_target_id_idx
  on public.admin_audit_logs (target_id);

create index if not exists admin_audit_logs_request_id_idx
  on public.admin_audit_logs (request_id);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "super admin can read audit logs" on public.admin_audit_logs;
create policy "super admin can read audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and lower(coalesce(p.email, '')) = 'gac000189@gmail.com'
    )
  );

revoke all on public.admin_audit_logs from anon;
grant select on public.admin_audit_logs to authenticated;
