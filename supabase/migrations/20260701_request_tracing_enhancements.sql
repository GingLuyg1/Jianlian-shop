-- Request tracing enhancements for aggregated runtime diagnostics.
-- Execute manually in Supabase SQL Editor. Safe to run repeatedly.

alter table if exists public.system_error_events
  add column if not exists parent_request_id text,
  add column if not exists operation text,
  add column if not exists business_type text,
  add column if not exists business_id text,
  add column if not exists duration_ms integer,
  add column if not exists severity text default 'medium';

create index if not exists system_error_events_parent_request_id_idx
  on public.system_error_events(parent_request_id)
  where parent_request_id is not null;

create index if not exists system_error_events_operation_idx
  on public.system_error_events(operation)
  where operation is not null;

create index if not exists system_error_events_business_idx
  on public.system_error_events(business_type, business_id)
  where business_type is not null and business_id is not null;

create index if not exists system_error_events_route_idx
  on public.system_error_events(route)
  where route is not null;

create index if not exists admin_audit_logs_request_id_idx
  on public.admin_audit_logs(request_id)
  where request_id is not null;

create index if not exists payment_events_request_id_idx
  on public.payment_events(request_id)
  where request_id is not null;
