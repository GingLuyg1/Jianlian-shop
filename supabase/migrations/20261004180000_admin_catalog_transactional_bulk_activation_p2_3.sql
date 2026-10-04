-- Forward-only: add service-role-only transactional SKU bulk activation. Do not execute without separate Production authorization.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_evaluate_product_sku_activation(
  p_product_delivery_type text,
  p_sku_delivery_type text,
  p_stock integer,
  p_metadata jsonb,
  p_local_available_count bigint
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
  v_effective_delivery_type text := coalesce(nullif(p_sku_delivery_type, ''), nullif(p_product_delivery_type, ''), 'manual');
  v_supplier_requested boolean;
  v_binding_complete boolean := false;
  v_snapshot bigint;
  v_snapshot_valid boolean := false;
  v_last_success_valid boolean := false;
  v_supplier_ready boolean := false;
  v_exact_supplier_ready boolean := false;
  v_local_inventory_ready boolean := false;
  v_trusted_source boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_mapping jsonb;
  v_cost_text text;
  v_snapshot_text text;
  v_product_id_valid boolean := false;
  v_supplier_sku_valid boolean := false;
  v_mapping_valid boolean := false;
  v_cost_valid boolean := false;
begin
  if v_effective_delivery_type <> 'automatic' then
    return jsonb_build_object(
      'ready', true,
      'reasons', '[]'::jsonb,
      'source', 'not_required',
      'stock', greatest(coalesce(p_stock, 0), 0),
      'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
      'inventory_state', v_metadata->>'inventory_state'
    );
  end if;

  v_supplier_requested := coalesce(v_metadata->>'fulfillment_source', '') = 'supplier';
  v_mapping := case
    when not (v_metadata ? 'supplier_inputs_mapping') then '{}'::jsonb
    else v_metadata->'supplier_inputs_mapping'
  end;
  v_cost_text := btrim(coalesce(v_metadata->>'supplier_max_unit_cost', ''));

  if jsonb_typeof(v_metadata->'supplier_product_id') = 'number'
     and (v_metadata->>'supplier_product_id') ~ '^[1-9][0-9]*$' then
    v_product_id_valid := (v_metadata->>'supplier_product_id')::numeric <= 9007199254740991;
  end if;
  v_supplier_sku_valid :=
    not (v_metadata ? 'supplier_sku')
    or jsonb_typeof(v_metadata->'supplier_sku') = 'null'
    or (
      jsonb_typeof(v_metadata->'supplier_sku') = 'string'
      and length(btrim(v_metadata->>'supplier_sku')) between 1 and 200
    );
  if jsonb_typeof(v_mapping) = 'object' then
    v_mapping_valid := not exists (
      select 1
      from jsonb_each(v_mapping) as mapping_entry(key, value)
      where mapping_entry.key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,79}$'
        or jsonb_typeof(mapping_entry.value) <> 'string'
        or mapping_entry.value #>> '{}' not in ('customer_email', 'customer_name', 'customer_phone', 'customer_note')
    );
  end if;
  if v_cost_text ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' then
    v_cost_valid := v_cost_text::numeric > 0;
  end if;

  v_binding_complete :=
    v_supplier_requested
    and coalesce(v_metadata->>'supplier', '') = 'daju'
    and v_product_id_valid
    and v_supplier_sku_valid
    and v_mapping_valid
    and v_cost_valid;

  v_snapshot_text := btrim(coalesce(v_metadata->>'supplier_stock_snapshot', ''));
  if v_snapshot_text ~ '^[0-9]+$' then
    if v_snapshot_text::numeric between 1 and 9007199254740991 then
      v_snapshot := v_snapshot_text::bigint;
      v_snapshot_valid := true;
    end if;
  end if;

  if coalesce(v_metadata->>'supplier_stock_last_success_at', '') <> '' then
    begin
      perform (v_metadata->>'supplier_stock_last_success_at')::timestamptz;
      v_last_success_valid := true;
    exception when others then
      v_last_success_valid := false;
    end;
  end if;

  v_supplier_ready :=
    v_binding_complete
    and v_snapshot_valid
    and coalesce(v_metadata->>'supplier_stock_sync_status', '') = 'synced'
    and v_last_success_valid
    and coalesce(v_metadata->'supplier_stock_stale', 'false'::jsonb) <> 'true'::jsonb;
  v_exact_supplier_ready := v_supplier_ready and v_snapshot = coalesce(p_stock, 0);
  v_local_inventory_ready := not v_supplier_requested and coalesce(p_local_available_count, 0) > 0;
  v_trusted_source := v_exact_supplier_ready or v_local_inventory_ready;

  if coalesce(p_stock, 0) <= 0 then v_reasons := v_reasons || '"ZERO_STOCK"'::jsonb; end if;
  if v_supplier_requested then
    if not v_binding_complete then
      v_reasons := v_reasons || '"SUPPLIER_BINDING_INCOMPLETE"'::jsonb;
    elsif not v_exact_supplier_ready then
      v_reasons := v_reasons || '"SUPPLIER_STOCK_UNVERIFIED"'::jsonb;
    end if;
  elsif not v_local_inventory_ready then
    v_reasons := v_reasons || '"LOCAL_INVENTORY_EMPTY"'::jsonb;
  end if;
  if not v_trusted_source then v_reasons := v_reasons || '"NO_FULFILLMENT_SOURCE"'::jsonb; end if;
  if coalesce(v_metadata->>'inventory_state', '') = 'requires_verification' and not v_trusted_source then
    v_reasons := v_reasons || '"INVENTORY_REQUIRES_VERIFICATION"'::jsonb;
  end if;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_reasons) = 0,
    'reasons', v_reasons,
    'source', case when v_exact_supplier_ready then 'supplier' when v_local_inventory_ready then 'local_inventory' else 'none' end,
    'stock', greatest(coalesce(p_stock, 0), 0),
    'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
    'inventory_state', v_metadata->>'inventory_state'
  );
end;
$$;

create or replace function public.admin_bulk_activate_product_skus(
  p_product_id uuid,
  p_sku_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_product_delivery_type text;
  v_product_price numeric;
  v_selected_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_updated_count integer;
  v_no_change_count integer;
  v_blocked_count integer;
  v_total_sku_count integer;
  v_active_stock bigint;
  v_active_min_price numeric;
  v_selected_ids uuid[];
  v_updated_ids uuid[] := '{}'::uuid[];
  v_unchanged_ids uuid[] := '{}'::uuid[];
  v_blocked_items jsonb := '[]'::jsonb;
begin
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'BULK_SKU_PRODUCT_ID_REQUIRED';
  end if;
  if p_sku_ids is null or coalesce(array_length(p_sku_ids, 1), 0) = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_SKU_SELECTION';
  end if;
  if array_length(p_sku_ids, 1) > 100 then
    raise exception using errcode = '22023', message = 'SKU_BATCH_LIMIT_EXCEEDED';
  end if;
  if array_position(p_sku_ids, null) is not null then
    raise exception using errcode = '22023', message = 'NULL_SKU_ID';
  end if;
  select count(*), count(distinct requested.value), array_agg(requested.value order by requested.value)
    into v_selected_count, v_distinct_count, v_selected_ids
  from unnest(p_sku_ids) as requested(value);
  if v_selected_count <> v_distinct_count then
    raise exception using errcode = '22023', message = 'DUPLICATE_SKU_ID';
  end if;

  -- Deterministic lock order: product, complete SKU set, then exact local inventory rows.
  select delivery_type, price
    into v_product_delivery_type, v_product_price
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  perform sku.id
  from public.product_skus as sku
  where sku.product_id = p_product_id
  order by sku.id
  for update;

  select count(*) into v_matched_count
  from public.product_skus as sku
  where sku.product_id = p_product_id
    and sku.id = any(p_sku_ids);
  if v_matched_count <> v_selected_count then
    raise exception using errcode = 'P0001', message = 'BULK_SKU_OWNERSHIP_MISMATCH';
  end if;

  perform inventory.id
  from public.digital_inventory as inventory
  where inventory.product_id = p_product_id
    and inventory.sku_id = any(p_sku_ids)
  order by inventory.id
  for update;

  with selected as (
    select
      sku.id,
      sku.sku_code,
      sku.status,
      public.admin_evaluate_product_sku_activation(
        v_product_delivery_type,
        sku.delivery_type,
        sku.stock,
        sku.metadata,
        (
          select count(*)
          from public.digital_inventory as inventory
          where inventory.product_id = p_product_id
            and inventory.sku_id = sku.id
            and inventory.status = 'available'
        )
      ) as readiness
    from public.product_skus as sku
    where sku.product_id = p_product_id
      and sku.id = any(p_sku_ids)
  ), blocked as (
    select id, sku_code, readiness
    from selected
    where status <> 'active'
      and coalesce((readiness->>'ready')::boolean, false) is not true
  )
  select
    count(*),
    coalesce(jsonb_agg(
      jsonb_build_object('sku_id', id, 'sku_code', sku_code, 'reasons', readiness->'reasons')
      order by id
    ), '[]'::jsonb)
  into v_blocked_count, v_blocked_items
  from blocked;

  select count(*), coalesce(array_agg(sku.id order by sku.id), '{}'::uuid[])
    into v_no_change_count, v_unchanged_ids
  from public.product_skus as sku
  where sku.product_id = p_product_id
    and sku.id = any(p_sku_ids)
    and sku.status = 'active';

  if v_blocked_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'BULK_ACTIVATION_NOT_READY',
      'product_id', p_product_id,
      'selected_count', v_selected_count,
      'updated_count', 0,
      'no_change_count', v_no_change_count,
      'blocked_count', v_blocked_count,
      'selected_sku_ids', to_jsonb(v_selected_ids),
      'updated_sku_ids', '[]'::jsonb,
      'unchanged_sku_ids', to_jsonb(v_unchanged_ids),
      'blocked_items', v_blocked_items
    );
  end if;

  with changed as (
    update public.product_skus as sku
    set status = 'active'
    where sku.product_id = p_product_id
      and sku.id = any(p_sku_ids)
      and sku.status is distinct from 'active'
    returning sku.id
  )
  select count(*), coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_updated_count, v_updated_ids
  from changed;

  select
    count(*),
    coalesce(sum(sku.stock) filter (where sku.status = 'active'), 0),
    min(sku.price) filter (where sku.status = 'active')
  into v_total_sku_count, v_active_stock, v_active_min_price
  from public.product_skus as sku
  where sku.product_id = p_product_id;

  update public.products
  set has_skus = v_total_sku_count > 0,
      stock = v_active_stock,
      price = coalesce(v_active_min_price, v_product_price)
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'BULK_ACTIVATION_COMPLETED',
    'product_id', p_product_id,
    'selected_count', v_selected_count,
    'updated_count', v_updated_count,
    'no_change_count', v_no_change_count,
    'blocked_count', 0,
    'selected_sku_ids', to_jsonb(v_selected_ids),
    'updated_sku_ids', to_jsonb(v_updated_ids),
    'unchanged_sku_ids', to_jsonb(v_unchanged_ids),
    'blocked_items', '[]'::jsonb,
    'product_summary', jsonb_build_object(
      'has_skus', v_total_sku_count > 0,
      'stock', v_active_stock,
      'price', coalesce(v_active_min_price, v_product_price)
    )
  );
end;
$$;

revoke all on function public.admin_evaluate_product_sku_activation(text, text, integer, jsonb, bigint) from public;
revoke all on function public.admin_evaluate_product_sku_activation(text, text, integer, jsonb, bigint) from anon;
revoke all on function public.admin_evaluate_product_sku_activation(text, text, integer, jsonb, bigint) from authenticated;
grant execute on function public.admin_evaluate_product_sku_activation(text, text, integer, jsonb, bigint) to service_role;

revoke all on function public.admin_bulk_activate_product_skus(uuid, uuid[]) from public;
revoke all on function public.admin_bulk_activate_product_skus(uuid, uuid[]) from anon;
revoke all on function public.admin_bulk_activate_product_skus(uuid, uuid[]) from authenticated;
grant execute on function public.admin_bulk_activate_product_skus(uuid, uuid[]) to service_role;

commit;
