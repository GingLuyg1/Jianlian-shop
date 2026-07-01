-- Admin audit integrity extension.
-- Safe to run after 20260623_admin_audit_logs.sql. Do not execute automatically from Codex.

alter table if exists public.admin_audit_logs
  add column if not exists actor_type text not null default 'admin',
  add column if not exists actor_user_id uuid,
  add column if not exists actor_admin_id uuid,
  add column if not exists resource_type text,
  add column if not exists resource_id text,
  add column if not exists business_no text,
  add column if not exists reason text,
  add column if not exists ip_hash text,
  add column if not exists user_agent_summary text,
  add column if not exists previous_hash text,
  add column if not exists record_hash text,
  add column if not exists integrity_status text not null default 'unchecked';

update public.admin_audit_logs
set
  actor_type = coalesce(actor_type, case when admin_user_id is null then 'system' else 'admin' end),
  actor_admin_id = coalesce(actor_admin_id, admin_user_id),
  resource_type = coalesce(resource_type, target_type),
  resource_id = coalesce(resource_id, target_id),
  business_no = coalesce(business_no, target_label)
where actor_admin_id is null
   or resource_type is null
   or resource_id is null
   or business_no is null;

alter table if exists public.admin_audit_logs
  drop constraint if exists admin_audit_logs_result_check;

alter table if exists public.admin_audit_logs
  add constraint admin_audit_logs_result_check
  check (result in ('success', 'failed', 'denied', 'partial'));

alter table if exists public.admin_audit_logs
  drop constraint if exists admin_audit_logs_actor_type_check;

alter table if exists public.admin_audit_logs
  add constraint admin_audit_logs_actor_type_check
  check (actor_type in ('admin', 'system', 'user'));

alter table if exists public.admin_audit_logs
  drop constraint if exists admin_audit_logs_integrity_status_check;

alter table if exists public.admin_audit_logs
  add constraint admin_audit_logs_integrity_status_check
  check (integrity_status in ('unchecked', 'valid', 'broken', 'missing'));

alter table if exists public.admin_audit_logs
  drop constraint if exists admin_audit_logs_action_length_check;

alter table if exists public.admin_audit_logs
  add constraint admin_audit_logs_action_length_check
  check (char_length(action) between 2 and 120);

create index if not exists admin_audit_logs_actor_admin_created_idx
  on public.admin_audit_logs (actor_admin_id, created_at desc);

create index if not exists admin_audit_logs_actor_type_created_idx
  on public.admin_audit_logs (actor_type, created_at desc);

create index if not exists admin_audit_logs_resource_lookup_idx
  on public.admin_audit_logs (resource_type, resource_id);

create index if not exists admin_audit_logs_business_no_idx
  on public.admin_audit_logs (business_no);

create index if not exists admin_audit_logs_record_hash_idx
  on public.admin_audit_logs (record_hash);

create index if not exists admin_audit_logs_integrity_status_idx
  on public.admin_audit_logs (integrity_status);

alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_audit_logs from anon;
revoke insert, update, delete on public.admin_audit_logs from authenticated;
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;

-- Hash values are produced by the server-side audit service. Existing rows remain unchecked
-- until a controlled backfill job computes previous_hash / record_hash in chronological order.
