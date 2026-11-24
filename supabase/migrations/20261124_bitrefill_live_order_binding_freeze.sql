-- Enable Bitrefill live SKU order binding freeze & atomic SKU stock decrement in create_order_with_item.
-- Idempotent body-only extension; preserves existing KuajingZY, Daju, and local digital_inventory flows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $bitrefill_live$
declare
  target oid := to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)');
  original text;
  patched text;
begin
  if target is null then
    raise exception 'CREATE_ORDER_WITH_ITEM_NOT_FOUND';
  end if;

  select replace(pg_get_functiondef(target), E'\r\n', E'\n') into original;

  -- Idempotent: already applied
  if position('v_bitrefill_live_binding' in original) > 0 then
    return;
  end if;

  patched := original;

  -- 1. Declare v_bitrefill_live_binding
  if position('  v_kuajingzy_binding jsonb := null;' in patched) = 0 then
    raise exception 'BITREFILL_LIVE_ANCHOR_1_MISSING';
  end if;
  patched := replace(
    patched,
    '  v_kuajingzy_binding jsonb := null;',
    '  v_kuajingzy_binding jsonb := null;
  v_bitrefill_live_binding jsonb := null;'
  );

  -- 2. Recognize Bitrefill live SKUs before legacy bitrefill_pin_private check
  if position('  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and' in patched) = 0 then
    raise exception 'BITREFILL_LIVE_ANCHOR_2_MISSING';
  end if;
  patched := replace(
    patched,
    '  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and',
    $hook$  -- Bitrefill Live V1: server-side DB metadata binding freeze
  if v_kj_metadata->>'supplier' = 'bitrefill'
     and coalesce((v_kj_metadata->>'supplier_auto_purchase_enabled')::boolean, false) = true
     and p_sku_id is not null
     and v_auto_delivery
     and coalesce(v_kj_metadata->>'fulfillment_source', '') = 'supplier'
     and nullif(btrim(coalesce(v_kj_metadata->>'supplier_product_id', '')), '') is not null
     and nullif(btrim(coalesce(v_kj_metadata->>'supplier_sku', '')), '') is not null then
    v_bitrefill_live_binding := jsonb_build_object(
      'fulfillment_source', 'supplier',
      'supplier', 'bitrefill',
      'website_product_id', v_product.id,
      'website_sku_id', v_sku.id,
      'supplier_product_id', btrim(v_kj_metadata->>'supplier_product_id'),
      'supplier_sku', btrim(v_kj_metadata->>'supplier_sku'),
      'supplier_currency', coalesce(nullif(btrim(coalesce(v_kj_metadata->>'supplier_currency', '')), ''), 'USD'),
      'supplier_max_unit_cost', v_kj_metadata->'supplier_max_unit_cost',
      'supplier_auto_purchase_enabled', true
    );
    v_supplier_delivery := true;
  end if;

  if v_bitrefill_live_binding is null and exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and$hook$
  );

  -- 3. Decrement product_skus.stock atomically for Bitrefill live SKUs instead of requiring local digital_inventory
  if position('  if v_kuajingzy_binding is not null then' in patched) = 0 then
    raise exception 'BITREFILL_LIVE_ANCHOR_3_MISSING';
  end if;
  patched := replace(
    patched,
    '  if v_kuajingzy_binding is not null then',
    '  if v_kuajingzy_binding is not null or v_bitrefill_live_binding is not null then'
  );

  -- 4. Freeze supplier_binding onto order_items.product_snapshot
  if position('''supplier_binding'', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_gate is not null then' in patched) = 0 then
    raise exception 'BITREFILL_LIVE_ANCHOR_4_MISSING';
  end if;
  patched := replace(
    patched,
    '''supplier_binding'', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_gate is not null then',
    '''supplier_binding'', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_live_binding is not null then v_bitrefill_live_binding when v_bitrefill_gate is not null then'
  );

  execute patched;
end
$bitrefill_live$;

commit;
