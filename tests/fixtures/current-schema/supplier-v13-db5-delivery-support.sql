-- LOCAL TEST SUPPORT ONLY. Not authoritative Production schema or migration.
-- Adds the minimal helper boundary required by the repository's existing
-- record_supplier_fulfillment_outcome RPC. No real order or secret rows.
\set ON_ERROR_STOP on

do $guard$
begin
  if current_database() !~ '^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$'
     or inet_server_addr() is distinct from '127.0.0.1'::inet
     or nullif(current_setting('v13.expected_data_directory', true), '') is null
     or replace(current_setting('data_directory'), '\', '/') <>
        replace(current_setting('v13.expected_data_directory', true), '\', '/') then
    raise exception 'V13_DB5_LOCAL_DELIVERY_GUARD_FAILED';
  end if;
end
$guard$;

alter table public.order_items add column sku_id uuid;
alter table public.order_items add column delivery_failure_reason text;
alter table public.order_items add column delivery_started_at timestamptz;

create schema if not exists auth;
create function auth.role() returns text language sql stable
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$function$;
revoke all on function auth.role() from public, anon, authenticated;
grant usage on schema auth to service_role;
grant execute on function auth.role() to service_role;

create function public.log_order_item_delivery_status(
  p_order_id uuid, p_order_item_id uuid, p_previous text,
  p_current text, p_source text, p_message text
) returns void language plpgsql security invoker set search_path = pg_catalog
as $function$
begin
  insert into public.delivery_logs(message,detail)
  values(left(p_message,200),jsonb_build_object(
    'order_id',p_order_id,'order_item_id',p_order_item_id,
    'from',p_previous,'to',p_current,'source',p_source));
end
$function$;

create function public.write_delivery_log(
  p_order_id uuid, p_order_item_id uuid, p_delivery_id uuid,
  p_source text, p_event text, p_message text, p_detail jsonb
) returns void language plpgsql security invoker set search_path = pg_catalog
as $function$
begin
  insert into public.delivery_logs(message,detail)
  values(left(p_message,200),jsonb_build_object(
    'order_id',p_order_id,'order_item_id',p_order_item_id,
    'delivery_id',p_delivery_id,'source',p_source,'event',p_event,
    'detail',coalesce(p_detail,'{}'::jsonb)));
end
$function$;

create function public.refresh_order_fulfillment_status(p_order_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog
as $function$
begin
  update public.orders o
  set fulfillment_status = case
    when not exists (select 1 from public.order_items i
      where i.order_id=p_order_id and coalesce(i.delivery_status,'pending') <> 'delivered')
      then 'delivered'
    else 'processing' end
  where o.id=p_order_id;
end
$function$;

-- The exact record_supplier_fulfillment_outcome function from
-- 20260826190000_supplier_fulfillment_core_v1.sql is installed by the runner.
