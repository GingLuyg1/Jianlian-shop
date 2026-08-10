-- Daju supplier fulfillment V1: consume a complete local digital-inventory set
-- before supplier fallback. Partial local + supplier delivery is deliberately
-- not supported: a supplier-bound item is reserved locally only when every
-- remaining unit can be locked in the same transaction.

begin;

do $$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.order_deliveries') is null
     or to_regclass('public.digital_inventory') is null
     or to_regclass('public.supplier_fulfillment_requests') is null then
    raise exception 'DAJU_LOCAL_PRIORITY_TABLES_MISSING';
  end if;
  if to_regprocedure('public.deliver_digital_order(uuid,text)') is null then
    raise exception 'DAJU_LOCAL_PRIORITY_DELIVERY_RPC_MISSING';
  end if;
end;
$$;

create or replace function public.reserve_local_inventory_for_daju_order(
  p_order_id uuid,
  p_trigger_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_inventory_ids uuid[];
  v_required integer;
  v_delivered integer;
  v_reserved integer;
  v_local_ready_count integer := 0;
  v_supplier_fallback_count integer := 0;
  v_blocked_count integer := 0;
  v_updated_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'DAJU_LOCAL_PRIORITY_SERVICE_ROLE_REQUIRED';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;
  if not found then raise exception 'DAJU_LOCAL_PRIORITY_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'DAJU_LOCAL_PRIORITY_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then
    raise exception 'DAJU_LOCAL_PRIORITY_ORDER_STATE_BLOCKED';
  end if;

  for v_item in
    select oi.*
    from public.order_items as oi
    where oi.order_id = p_order_id
      and public.normalize_order_item_delivery_type(oi.delivery_type) = 'auto_delivery'
      and coalesce(oi.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
      and coalesce(oi.product_snapshot->'supplier_binding'->>'supplier', '') = 'daju'
      and coalesce(oi.delivery_status, 'pending') <> 'delivered'
    order by oi.created_at asc
    for update
  loop
    if exists (
      select 1 from public.supplier_fulfillment_requests as sfr
      where sfr.order_item_id = v_item.id
    ) then
      v_supplier_fallback_count := v_supplier_fallback_count + 1;
      continue;
    end if;

    select count(*)::integer
      into v_delivered
    from public.order_deliveries as od
    where od.order_item_id = v_item.id
      and od.delivery_status = 'delivered';
    if v_delivered > 0 and v_delivered < coalesce(v_item.quantity, 1) then
      v_blocked_count := v_blocked_count + 1;
      continue;
    end if;
    v_required := greatest(coalesce(v_item.quantity, 1) - v_delivered, 0);
    if v_required = 0 then
      continue;
    end if;

    select count(*)::integer into v_reserved
    from public.digital_inventory as di
    where di.product_id = v_item.product_id
      and ((v_item.sku_id is null and di.sku_id is null) or di.sku_id = v_item.sku_id)
      and di.status = 'reserved'
      and coalesce(di.reserved_order_id, di.order_id) = p_order_id
      and di.reserved_order_item_id = v_item.id
      and (di.expires_at is null or di.expires_at > v_now);

    if v_reserved = v_required then
      v_local_ready_count := v_local_ready_count + 1;
      continue;
    end if;
    if v_reserved > 0 then
      -- Unknown partial state must never fall through to supplier purchase.
      v_blocked_count := v_blocked_count + 1;
      continue;
    end if;

    select array_agg(candidate.id order by candidate.created_at asc)
      into v_inventory_ids
    from (
      select di.id, di.created_at
      from public.digital_inventory as di
      where di.product_id = v_item.product_id
        and ((v_item.sku_id is null and di.sku_id is null) or di.sku_id = v_item.sku_id)
        and di.status = 'available'
        and di.order_id is null
        and di.reserved_order_id is null
        and di.reserved_order_item_id is null
        and di.delivered_order_id is null
        and di.delivered_order_item_id is null
        and (di.expires_at is null or di.expires_at > v_now)
      order by di.created_at asc
      limit v_required
      for update skip locked
    ) as candidate;

    if coalesce(cardinality(v_inventory_ids), 0) <> v_required then
      v_supplier_fallback_count := v_supplier_fallback_count + 1;
      v_inventory_ids := null;
      continue;
    end if;

    update public.digital_inventory as di
       set status = 'reserved',
           order_id = p_order_id,
           reserved_order_id = p_order_id,
           reserved_order_item_id = v_item.id,
           reserved_user_id = v_order.user_id,
           reserved_at = v_now,
           updated_at = v_now
     where di.id = any(v_inventory_ids)
       and di.status = 'available';
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> v_required then
      raise exception 'DAJU_LOCAL_PRIORITY_RESERVATION_STATE_CHANGED';
    end if;
    v_local_ready_count := v_local_ready_count + 1;
    v_inventory_ids := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'local_ready_count', v_local_ready_count,
    'supplier_fallback_count', v_supplier_fallback_count,
    'blocked_count', v_blocked_count,
    'trigger_source', left(coalesce(nullif(btrim(p_trigger_source), ''), 'system'), 80)
  );
end
$function$;

-- Replace only the exact supplier exclusion installed by
-- 20260810120000_daju_supplier_fulfillment_v1.sql. Supplier items become local
-- candidates only after the function above has atomically reserved the entire
-- remaining quantity and before any supplier request exists.
do $patch_local_delivery$
declare
  v_definition text;
  v_patched text;
  v_old text := $old$and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
      and not (
        coalesce(order_items.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
        and coalesce(order_items.product_snapshot->'supplier_binding'->>'supplier', '') = 'daju'
      )$old$;
  v_new text := $new$and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
      and (
        not (
          coalesce(order_items.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
          and coalesce(order_items.product_snapshot->'supplier_binding'->>'supplier', '') = 'daju'
        )
        or (
          not exists (
            select 1 from public.supplier_fulfillment_requests as local_sfr
            where local_sfr.order_item_id = order_items.id
          )
          and (
            select count(*)::integer
            from public.digital_inventory as local_di
            where local_di.product_id = order_items.product_id
              and ((order_items.sku_id is null and local_di.sku_id is null) or local_di.sku_id = order_items.sku_id)
              and local_di.status = 'reserved'
              and coalesce(local_di.reserved_order_id, local_di.order_id) = order_items.order_id
              and local_di.reserved_order_item_id = order_items.id
          ) >= greatest(
            coalesce(order_items.quantity, 1) - (
              select count(*)::integer from public.order_deliveries as local_od
              where local_od.order_item_id = order_items.id
                and local_od.delivery_status = 'delivered'
            ),
            0
          )
        )
      )$new$;
begin
  select pg_catalog.pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'DAJU_LOCAL_PRIORITY_DELIVERY_CONTRACT_DRIFT';
  end if;
  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition or position(v_old in v_patched) > 0 then
    raise exception 'DAJU_LOCAL_PRIORITY_DELIVERY_PATCH_FAILED';
  end if;
  execute v_patched;
end
$patch_local_delivery$;

revoke all on function public.reserve_local_inventory_for_daju_order(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_local_inventory_for_daju_order(uuid,text) to service_role;

commit;
