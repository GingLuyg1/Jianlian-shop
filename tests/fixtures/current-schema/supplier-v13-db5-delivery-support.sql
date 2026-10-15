-- LOCAL TEST SUPPORT ONLY. Not authoritative Production schema or migration.
-- TEST_ONLY_STUB bodies for the transitive private-delivery helper boundary.
-- Their Production definitions/security/search_path are pending DB8 review.
-- The outcome RPC itself is extracted exactly from a repository migration.
-- No real order or secret rows.
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

-- These transitive private-delivery columns now live in the DB7 baseline.

create schema if not exists auth;
-- TEST_ONLY_STUB: synthetic local JWT role, not Supabase Auth implementation.
create function auth.role() returns text language sql stable
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$function$;
revoke all on function auth.role() from public, anon, authenticated;
grant usage on schema auth to service_role;
grant execute on function auth.role() to service_role;

-- TEST_ONLY_STUB: test log shape only, not authoritative current Production.
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

-- TEST_ONLY_STUB: test log shape only, not authoritative current Production.
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

-- TEST_ONLY_STUB: test fulfillment summary, not authoritative current Production.
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

-- Fixture-only least privilege: the repo outcome RPC runs as the fixture
-- owner, while application roles must not call these test helpers directly.
revoke all on function public.log_order_item_delivery_status(uuid,uuid,text,text,text,text),
  public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb),
  public.refresh_order_fulfillment_status(uuid)
  from public,anon,authenticated;
grant execute on function public.log_order_item_delivery_status(uuid,uuid,text,text,text,text),
  public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb),
  public.refresh_order_fulfillment_status(uuid) to service_role;

-- The shared local fixture loader installs the exact repository outcome RPC.
