-- Forward-only: add an atomic, service-role-only SKU bulk status RPC. Do not execute without separate Production authorization.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_bulk_update_product_sku_status(
  p_product_id uuid,
  p_sku_ids uuid[],
  p_target_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_selected_count integer;
  v_matched_count integer;
  v_updated_count integer;
  v_total_sku_count integer;
  v_active_stock bigint;
  v_active_min_price numeric;
  v_product_price numeric;
  v_selected_ids uuid[];
  v_updated_ids uuid[];
  v_unchanged_ids uuid[];
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
  select count(*), count(distinct value), array_agg(value order by value)
    into v_selected_count, v_matched_count, v_selected_ids
  from unnest(p_sku_ids) as requested(value);
  if v_selected_count <> v_matched_count then
    raise exception using errcode = '22023', message = 'DUPLICATE_SKU_ID';
  end if;
  if p_target_status not in ('draft', 'sold_out') then
    raise exception using errcode = '22023', message = 'BULK_STATUS_TARGET_NOT_ALLOWED';
  end if;

  select price into v_product_price
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  -- Lock the complete SKU set in a stable order. This serializes summary recomputation
  -- with inserts/deletes (the product row lock also conflicts with FK checks).
  perform id
  from public.product_skus
  where product_id = p_product_id
  order by id
  for update;

  select count(*) into v_matched_count
  from public.product_skus
  where product_id = p_product_id
    and id = any(p_sku_ids);
  if v_matched_count <> v_selected_count then
    raise exception using errcode = 'P0001', message = 'BULK_SKU_OWNERSHIP_MISMATCH';
  end if;

  with changed as (
    update public.product_skus
    set status = p_target_status
    where product_id = p_product_id
      and id = any(p_sku_ids)
      and status is distinct from p_target_status
    returning id
  )
  select count(*), coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_updated_count, v_updated_ids
  from changed;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_unchanged_ids
  from public.product_skus
  where product_id = p_product_id
    and id = any(p_sku_ids)
    and status = p_target_status
    and not (id = any(v_updated_ids));

  select
    count(*),
    coalesce(sum(stock) filter (where status = 'active'), 0),
    min(price) filter (where status = 'active')
  into v_total_sku_count, v_active_stock, v_active_min_price
  from public.product_skus
  where product_id = p_product_id;

  update public.products
  set has_skus = v_total_sku_count > 0,
      stock = v_active_stock,
      price = coalesce(v_active_min_price, v_product_price)
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'target_status', p_target_status,
    'selected_count', v_selected_count,
    'updated_count', v_updated_count,
    'no_change_count', v_selected_count - v_updated_count,
    'selected_sku_ids', to_jsonb(v_selected_ids),
    'updated_sku_ids', to_jsonb(v_updated_ids),
    'unchanged_sku_ids', to_jsonb(v_unchanged_ids),
    'product_summary', jsonb_build_object(
      'has_skus', v_total_sku_count > 0,
      'stock', v_active_stock,
      'price', coalesce(v_active_min_price, v_product_price)
    )
  );
end;
$$;

revoke all on function public.admin_bulk_update_product_sku_status(uuid, uuid[], text) from public;
revoke all on function public.admin_bulk_update_product_sku_status(uuid, uuid[], text) from anon;
revoke all on function public.admin_bulk_update_product_sku_status(uuid, uuid[], text) from authenticated;
grant execute on function public.admin_bulk_update_product_sku_status(uuid, uuid[], text) to service_role;

commit;
