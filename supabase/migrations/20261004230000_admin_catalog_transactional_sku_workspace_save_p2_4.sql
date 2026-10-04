-- Forward-only: add service-role-only transactional SKU workspace save. Do not execute without separate Production authorization.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_save_product_sku_workspace(
  p_product_id uuid,
  p_operations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_product_delivery_type text;
  v_product_price numeric;
  v_operation jsonb;
  v_payload jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_type text;
  v_client_id text;
  v_sku_id uuid;
  v_expected_updated_at timestamptz;
  v_existing record;
  v_seen_client_ids text[] := '{}'::text[];
  v_seen_sku_ids uuid[] := '{}'::uuid[];
  v_operation_count integer;
  v_created_count integer := 0;
  v_update_count integer := 0;
  v_updated_count integer := 0;
  v_no_change_count integer := 0;
  v_total_sku_count integer;
  v_active_stock bigint;
  v_active_min_price numeric;
  v_blocked_items jsonb := '[]'::jsonb;
  v_skus jsonb;
  v_created_mappings jsonb;
  v_title text;
  v_code text;
  v_normalized_code text;
  v_status text;
  v_delivery_type text;
  v_image_url text;
  v_price numeric;
  v_original_price numeric;
  v_stock integer;
  v_sort_order integer;
begin
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'PRODUCT_ID_REQUIRED';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'OPERATIONS_MUST_BE_ARRAY';
  end if;
  v_operation_count := jsonb_array_length(p_operations);
  if v_operation_count = 0 then
    raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'OPERATIONS_REQUIRED';
  end if;
  if v_operation_count > 100 then
    raise exception using errcode = '22023', message = 'SKU_BATCH_LIMIT_EXCEEDED';
  end if;

  -- Match P2.2/P2.3: product first, complete SKU set second, exact inventory rows third.
  select product.delivery_type, product.price
    into v_product_delivery_type, v_product_price
  from public.products as product
  where product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  perform sku.id
  from public.product_skus as sku
  where sku.product_id = p_product_id
  order by sku.id
  for update;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'OPERATION_MUST_BE_OBJECT';
    end if;
    v_type := v_operation->>'type';
    if v_type is null or v_type not in ('create', 'update') then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'OPERATION_TYPE_INVALID';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_operation) as key
      where (v_type = 'create' and key not in ('type', 'client_id', 'payload'))
         or (v_type = 'update' and key not in ('type', 'sku_id', 'expected_updated_at', 'payload'))
    ) then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'UNKNOWN_OPERATION_FIELD';
    end if;

    v_payload := v_operation->'payload';
    if jsonb_typeof(v_payload) is distinct from 'object'
       or not (v_payload ?& array['sku_title','sku_code','price','original_price','stock','status','delivery_type','image_url','sort_order']) then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'PAYLOAD_FIELDS_REQUIRED';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_payload) as key
      where key not in ('sku_title','sku_code','price','original_price','stock','status','delivery_type','image_url','sort_order')
    ) then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'UNKNOWN_PAYLOAD_FIELD';
    end if;

    v_title := btrim(coalesce(v_payload->>'sku_title', ''));
    v_code := btrim(coalesce(v_payload->>'sku_code', ''));
    v_normalized_code := lower(v_code);
    if length(v_title) not between 1 and 200 or length(v_code) not between 1 and 200 then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'SKU_TEXT_INVALID';
    end if;
    if jsonb_typeof(v_payload->'price') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'PRICE_INVALID';
    end if;
    begin
      v_price := (v_payload->>'price')::numeric;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'PRICE_INVALID';
    end;
    if v_price < 0 then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'PRICE_INVALID';
    end if;
    if jsonb_typeof(v_payload->'original_price') = 'null' then
      v_original_price := null;
    elsif jsonb_typeof(v_payload->'original_price') = 'number' then
      begin
        v_original_price := (v_payload->>'original_price')::numeric;
      exception when others then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'ORIGINAL_PRICE_INVALID';
      end;
      if v_original_price < 0 then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'ORIGINAL_PRICE_INVALID';
      end if;
    else
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'ORIGINAL_PRICE_INVALID';
    end if;
    if jsonb_typeof(v_payload->'stock') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'STOCK_INVALID';
    end if;
    begin
      if (v_payload->>'stock')::numeric < 0
         or trunc((v_payload->>'stock')::numeric) <> (v_payload->>'stock')::numeric
         or (v_payload->>'stock')::numeric > 2147483647 then
        raise exception 'invalid';
      end if;
      v_stock := (v_payload->>'stock')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'STOCK_INVALID';
    end;
    if jsonb_typeof(v_payload->'sort_order') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'SORT_ORDER_INVALID';
    end if;
    begin
      if (v_payload->>'sort_order')::numeric < 0
         or trunc((v_payload->>'sort_order')::numeric) <> (v_payload->>'sort_order')::numeric
         or (v_payload->>'sort_order')::numeric > 2147483647 then
        raise exception 'invalid';
      end if;
      v_sort_order := (v_payload->>'sort_order')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'SORT_ORDER_INVALID';
    end;
    v_status := v_payload->>'status';
    if jsonb_typeof(v_payload->'status') is distinct from 'string'
       or v_status is null
       or v_status not in ('active','inactive','sold_out','draft') then
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'STATUS_INVALID';
    end if;
    if jsonb_typeof(v_payload->'delivery_type') = 'null' then
      v_delivery_type := null;
    else
      v_delivery_type := v_payload->>'delivery_type';
      if jsonb_typeof(v_payload->'delivery_type') is distinct from 'string'
         or v_delivery_type is null
         or v_delivery_type not in ('manual','automatic','shipping') then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'DELIVERY_TYPE_INVALID';
      end if;
    end if;
    if jsonb_typeof(v_payload->'image_url') = 'null' then
      v_image_url := null;
    elsif jsonb_typeof(v_payload->'image_url') = 'string'
          and length(btrim(v_payload->>'image_url')) between 1 and 2000 then
      v_image_url := btrim(v_payload->>'image_url');
    else
      raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'IMAGE_URL_INVALID';
    end if;

    if v_type = 'create' then
      v_client_id := btrim(coalesce(v_operation->>'client_id', ''));
      if length(v_client_id) not between 1 and 200 then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'CLIENT_ID_INVALID';
      end if;
      if v_client_id = any(v_seen_client_ids) then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'DUPLICATE_CLIENT_ID';
      end if;
      v_seen_client_ids := array_append(v_seen_client_ids, v_client_id);
      v_sku_id := pg_catalog.gen_random_uuid();
      v_created_count := v_created_count + 1;
      v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
        'type','create','client_id',v_client_id,'sku_id',v_sku_id,'sku_title',v_title,
        'sku_code',v_code,'normalized_code',v_normalized_code,'price',v_price,
        'original_price',v_original_price,'stock',v_stock,'status',v_status,
        'delivery_type',v_delivery_type,'image_url',v_image_url,'sort_order',v_sort_order,
        'metadata','{}'::jsonb
      ));
    else
      if jsonb_typeof(v_operation->'sku_id') is distinct from 'string'
         or (v_operation->>'sku_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'SKU_ID_INVALID';
      end if;
      v_sku_id := (v_operation->>'sku_id')::uuid;
      if v_sku_id = any(v_seen_sku_ids) then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'DUPLICATE_SKU_ID';
      end if;
      v_seen_sku_ids := array_append(v_seen_sku_ids, v_sku_id);
      begin
        if jsonb_typeof(v_operation->'expected_updated_at') is distinct from 'string' then raise exception 'invalid'; end if;
        v_expected_updated_at := (v_operation->>'expected_updated_at')::timestamptz;
      exception when others then
        raise exception using errcode = '22023', message = 'INVALID_SKU_WORKSPACE', detail = 'EXPECTED_UPDATED_AT_INVALID';
      end;
      select sku.product_id, sku.updated_at, sku.metadata, sku.sku_title, sku.sku_code,
             sku.price, sku.original_price, sku.stock, sku.status, sku.delivery_type,
             sku.image_url, sku.sort_order
        into v_existing
      from public.product_skus as sku
      where sku.id = v_sku_id;
      if not found or v_existing.product_id <> p_product_id then
        raise exception using errcode = 'P0001', message = 'SKU_OWNERSHIP_MISMATCH', detail = v_sku_id::text;
      end if;
      if v_existing.updated_at is distinct from v_expected_updated_at then
        raise exception using errcode = '40001', message = 'SKU_WORKSPACE_STALE', detail = v_sku_id::text;
      end if;
      v_update_count := v_update_count + 1;
      v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
        'type','update','sku_id',v_sku_id,'sku_title',v_title,'sku_code',v_code,
        'normalized_code',v_normalized_code,'price',v_price,'original_price',v_original_price,
        'stock',v_stock,'status',v_status,'delivery_type',v_delivery_type,
        'image_url',v_image_url,'sort_order',v_sort_order,'metadata',coalesce(v_existing.metadata,'{}'::jsonb)
      ));
    end if;
  end loop;

  -- Swapping codes is intentionally unsupported: reject deterministically before writes.
  if exists (
    with proposed as (
      select (op->>'sku_id')::uuid as sku_id, op->>'normalized_code' as normalized_code
      from jsonb_array_elements(v_normalized) as op
    )
    select 1
    from proposed p
    join public.product_skus existing
      on existing.product_id = p_product_id
     and existing.id <> p.sku_id
     and (
       lower(btrim(existing.sku_code)) = p.normalized_code
       or existing.combination_key = p.normalized_code
     )
  ) or exists (
    select 1
    from jsonb_array_elements(v_normalized) as op
    group by op->>'normalized_code'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'SKU_CODE_CONFLICT';
  end if;

  perform inventory.id
  from public.digital_inventory as inventory
  where inventory.product_id = p_product_id
    and inventory.sku_id = any(v_seen_sku_ids)
  order by inventory.id
  for update;

  with proposed as (
    select op
    from jsonb_array_elements(v_normalized) as op
    where op->>'status' = 'active'
      and coalesce(nullif(op->>'delivery_type',''), nullif(v_product_delivery_type,''), 'manual') = 'automatic'
  ), readiness as (
    select
      op->>'sku_id' as sku_id,
      op->>'sku_code' as sku_code,
      public.admin_evaluate_product_sku_activation(
        v_product_delivery_type,
        op->>'delivery_type',
        (op->>'stock')::integer,
        op->'metadata',
        case when op->>'type' = 'create' then 0 else (
          select count(*) from public.digital_inventory inventory
          where inventory.product_id = p_product_id
            and inventory.sku_id = (op->>'sku_id')::uuid
            and inventory.status = 'available'
        ) end
      ) as value
    from proposed
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'sku_id',sku_id,'sku_code',sku_code,'reasons',value->'reasons'
    ) order by sku_id), '[]'::jsonb)
    into v_blocked_items
  from readiness
  where coalesce((value->>'ready')::boolean,false) is not true;
  if jsonb_array_length(v_blocked_items) > 0 then
    raise exception using errcode = 'P0001', message = 'SKU_ACTIVATION_NOT_READY', detail = v_blocked_items::text;
  end if;

  insert into public.product_skus(
    id, product_id, sku_title, sku_code, combination_key, price, original_price,
    stock, status, delivery_type, image_url, sort_order, metadata
  )
  select
    (op->>'sku_id')::uuid, p_product_id, op->>'sku_title', op->>'sku_code',
    op->>'normalized_code', (op->>'price')::numeric,
    case when jsonb_typeof(op->'original_price') = 'null' then null else (op->>'original_price')::numeric end,
    (op->>'stock')::integer, op->>'status',
    case when jsonb_typeof(op->'delivery_type') = 'null' then null else op->>'delivery_type' end,
    case when jsonb_typeof(op->'image_url') = 'null' then null else op->>'image_url' end,
    (op->>'sort_order')::integer, '{}'::jsonb
  from jsonb_array_elements(v_normalized) as op
  where op->>'type' = 'create';

  with proposed as (
    select op from jsonb_array_elements(v_normalized) as op where op->>'type' = 'update'
  ), changed as (
    update public.product_skus as sku
    set sku_title = op->>'sku_title',
        sku_code = op->>'sku_code',
        combination_key = op->>'normalized_code',
        price = (op->>'price')::numeric,
        original_price = case when jsonb_typeof(op->'original_price') = 'null' then null else (op->>'original_price')::numeric end,
        stock = (op->>'stock')::integer,
        status = op->>'status',
        delivery_type = case when jsonb_typeof(op->'delivery_type') = 'null' then null else op->>'delivery_type' end,
        image_url = case when jsonb_typeof(op->'image_url') = 'null' then null else op->>'image_url' end,
        sort_order = (op->>'sort_order')::integer
    from proposed
    where sku.id = (op->>'sku_id')::uuid
      and sku.product_id = p_product_id
      and row(sku.sku_title,sku.sku_code,sku.price,sku.original_price,sku.stock,sku.status,
              sku.delivery_type,sku.image_url,sku.sort_order)
          is distinct from
          row(op->>'sku_title',op->>'sku_code',(op->>'price')::numeric,
              case when jsonb_typeof(op->'original_price')='null' then null else (op->>'original_price')::numeric end,
              (op->>'stock')::integer,op->>'status',
              case when jsonb_typeof(op->'delivery_type')='null' then null else op->>'delivery_type' end,
              case when jsonb_typeof(op->'image_url')='null' then null else op->>'image_url' end,
              (op->>'sort_order')::integer)
    returning sku.id
  )
  select count(*) into v_updated_count from changed;
  v_no_change_count := v_update_count - v_updated_count;

  select count(*),
         coalesce(sum(sku.stock) filter (where sku.status = 'active'),0),
         min(sku.price) filter (where sku.status = 'active')
    into v_total_sku_count, v_active_stock, v_active_min_price
  from public.product_skus as sku
  where sku.product_id = p_product_id;

  update public.products
  set has_skus = v_total_sku_count > 0,
      stock = v_active_stock,
      price = coalesce(v_active_min_price, v_product_price)
  where id = p_product_id;

  select coalesce(jsonb_agg(to_jsonb(sku) order by sku.sort_order, sku.created_at, sku.id),'[]'::jsonb)
    into v_skus
  from public.product_skus as sku
  where sku.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object('client_id',op->>'client_id','sku_id',op->>'sku_id') order by op->>'client_id'),'[]'::jsonb)
    into v_created_mappings
  from jsonb_array_elements(v_normalized) as op
  where op->>'type' = 'create';

  return jsonb_build_object(
    'ok',true,
    'code','SKU_WORKSPACE_SAVED',
    'product_id',p_product_id,
    'created_count',v_created_count,
    'updated_count',v_updated_count,
    'no_change_count',v_no_change_count,
    'created_mappings',v_created_mappings,
    'skus',v_skus,
    'product_summary',jsonb_build_object(
      'has_skus',v_total_sku_count > 0,
      'stock',v_active_stock,
      'price',coalesce(v_active_min_price,v_product_price)
    )
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'SKU_CODE_CONFLICT';
end;
$$;

revoke all on function public.admin_save_product_sku_workspace(uuid, jsonb) from public;
revoke all on function public.admin_save_product_sku_workspace(uuid, jsonb) from anon;
revoke all on function public.admin_save_product_sku_workspace(uuid, jsonb) from authenticated;
grant execute on function public.admin_save_product_sku_workspace(uuid, jsonb) to service_role;

commit;
