-- Forward-only: add transactional local-inventory administration primitives.
-- Production execution requires separate authorization and a clean read-only precheck.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create extension if not exists pgcrypto;

do $precheck$
declare
  v_index_definition text;
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception using errcode = 'P0001', message = 'LOCAL_INVENTORY_PGCRYPTO_EXTENSION_CONTRACT_MISSING';
  end if;

  if to_regclass('public.products') is null
     or to_regclass('public.product_skus') is null
     or to_regclass('public.digital_inventory') is null
     or to_regclass('public.digital_inventory_batches') is null
     or to_regclass('public.order_deliveries') is null
     or to_regclass('public.admin_audit_logs') is null then
    raise exception using errcode = 'P0001', message = 'LOCAL_INVENTORY_REQUIRED_TABLE_MISSING';
  end if;

  if to_regprocedure('public.is_admin(uuid)') is null
     or to_regprocedure('public.normalize_order_item_delivery_type(text)') is null
     or to_regprocedure('public.mask_delivery_secret(text)') is null
     or to_regprocedure('public.sync_product_available_stock(uuid)') is null
     or to_regprocedure('public.refresh_digital_inventory_batch_counts(uuid)') is null then
    raise exception using errcode = 'P0001', message = 'LOCAL_INVENTORY_REQUIRED_FUNCTION_MISSING';
  end if;

  if exists (
    select 1
    from (values
      ('products', 'id'), ('products', 'name'), ('products', 'slug'),
      ('products', 'has_skus'), ('products', 'delivery_type'),
      ('product_skus', 'id'), ('product_skus', 'product_id'),
      ('product_skus', 'sku_code'), ('product_skus', 'sku_title'),
      ('product_skus', 'delivery_type'),
      ('digital_inventory', 'id'), ('digital_inventory', 'product_id'),
      ('digital_inventory', 'sku_id'), ('digital_inventory', 'content'),
      ('digital_inventory', 'content_hash'), ('digital_inventory', 'content_type'),
      ('digital_inventory', 'status'), ('digital_inventory', 'updated_at'),
      ('digital_inventory', 'order_id'), ('digital_inventory', 'reserved_order_id'),
      ('digital_inventory', 'reserved_order_item_id'), ('digital_inventory', 'reserved_user_id'),
      ('digital_inventory', 'reserved_at'), ('digital_inventory', 'delivered_order_id'),
      ('digital_inventory', 'delivered_order_item_id'), ('digital_inventory', 'delivered_user_id'),
      ('digital_inventory', 'delivered_at'), ('digital_inventory', 'expires_at'),
      ('digital_inventory', 'batch_id'), ('digital_inventory', 'batch_no'),
      ('digital_inventory', 'disabled_at'), ('digital_inventory', 'disabled_by'),
      ('digital_inventory', 'disabled_reason'), ('digital_inventory', 'created_at'),
      ('digital_inventory_batches', 'id'), ('digital_inventory_batches', 'batch_no'),
      ('digital_inventory_batches', 'product_id'), ('digital_inventory_batches', 'sku_id'),
      ('digital_inventory_batches', 'batch_name'), ('digital_inventory_batches', 'content_type'),
      ('digital_inventory_batches', 'total_count'), ('digital_inventory_batches', 'available_count'),
      ('digital_inventory_batches', 'reserved_count'), ('digital_inventory_batches', 'delivered_count'),
      ('digital_inventory_batches', 'invalid_count'), ('digital_inventory_batches', 'source_filename'),
      ('digital_inventory_batches', 'import_status'), ('digital_inventory_batches', 'created_by'),
      ('order_deliveries', 'inventory_id'),
      ('admin_audit_logs', 'admin_user_id'), ('admin_audit_logs', 'admin_email'),
      ('admin_audit_logs', 'action'), ('admin_audit_logs', 'module'),
      ('admin_audit_logs', 'target_type'), ('admin_audit_logs', 'target_id'),
      ('admin_audit_logs', 'request_id'), ('admin_audit_logs', 'result'),
      ('admin_audit_logs', 'metadata')
    ) as required(table_name, column_name)
    where not exists (
      select 1
      from information_schema.columns as columns
      where columns.table_schema = 'public'
        and columns.table_name = required.table_name
        and columns.column_name = required.column_name
    )
  ) then
    raise exception using errcode = 'P0001', message = 'LOCAL_INVENTORY_REQUIRED_COLUMN_MISSING';
  end if;

  select pg_catalog.pg_get_indexdef(indexes.indexrelid)
    into v_index_definition
  from pg_catalog.pg_index as indexes
  join pg_catalog.pg_class as index_class on index_class.oid = indexes.indexrelid
  join pg_catalog.pg_namespace as index_namespace on index_namespace.oid = index_class.relnamespace
  where index_namespace.nspname = 'public'
    and index_class.relname = 'digital_inventory_product_content_uidx'
    and indexes.indisunique;

  if v_index_definition is null
     or lower(regexp_replace(v_index_definition, '\s+', '', 'g'))
        not like '%(product_id,md5(content))%' then
    raise exception using errcode = 'P0001', message = 'LOCAL_INVENTORY_UNIQUE_CONTRACT_MISMATCH';
  end if;

  -- Do not silently repair historical ambiguity. These rows need a separate,
  -- evidence-backed remediation before this migration can be installed.
  if exists (
    select 1
    from public.digital_inventory as inventory
    where inventory.status in ('available', 'disabled')
      and (
        inventory.order_id is not null
        or inventory.reserved_order_id is not null
        or inventory.reserved_order_item_id is not null
        or inventory.reserved_user_id is not null
        or inventory.reserved_at is not null
        or inventory.delivered_order_id is not null
        or inventory.delivered_order_item_id is not null
        or inventory.delivered_user_id is not null
        or inventory.delivered_at is not null
        or exists (
          select 1
          from public.order_deliveries as delivery
          where delivery.inventory_id = inventory.id
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_STALE_RESERVATION_LINKS_REQUIRE_REMEDIATION';
  end if;
end
$precheck$;

create table if not exists public.admin_local_inventory_operations (
  request_id uuid primary key,
  actor_user_id uuid not null,
  operation_type text not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_local_inventory_operations_type_check
    check (operation_type in ('import', 'transition')),
  constraint admin_local_inventory_operations_payload_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_local_inventory_operations_result_check
    check (
      (result is null and completed_at is null)
      or (jsonb_typeof(result) = 'object' and completed_at is not null)
    )
);

alter table public.admin_local_inventory_operations enable row level security;
revoke all privileges on table public.admin_local_inventory_operations from public, anon, authenticated;
grant all privileges on table public.admin_local_inventory_operations to service_role;

create or replace function public.admin_import_local_inventory(
  p_product_id uuid,
  p_sku_id uuid,
  p_items jsonb,
  p_content_type text,
  p_batch_name text,
  p_source_filename text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := nullif(auth.jwt()->>'email', '');
  v_product_has_skus boolean;
  v_product_delivery_type text;
  v_sku_delivery_type text;
  v_effective_delivery_type text;
  v_item_count integer;
  v_distinct_count integer;
  v_contents text[];
  v_payload_hash text;
  v_existing_operation public.admin_local_inventory_operations%rowtype;
  v_batch_id uuid;
  v_batch_no text;
  v_created_count integer;
  v_result jsonb;
  v_constraint_name text;
begin
  if v_actor_id is null or not coalesce(public.is_admin(v_actor_id), false) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception using errcode = '22023', message = 'BATCH_LIMIT_EXCEEDED';
  end if;
  if coalesce(p_content_type, '') not in ('card_key', 'redeem_code', 'account_password', 'plain_text') then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'string'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;

  select product.has_skus, product.delivery_type
    into v_product_has_skus, v_product_delivery_type
  from public.products as product
  where product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVALID_PRODUCT';
  end if;

  if v_product_has_skus then
    if p_sku_id is null then
      raise exception using errcode = '22023', message = 'INVALID_SKU';
    end if;
    select sku.delivery_type
      into v_sku_delivery_type
    from public.product_skus as sku
    where sku.id = p_sku_id
      and sku.product_id = p_product_id
    for update;
    if not found then
      if exists (select 1 from public.product_skus as sku where sku.id = p_sku_id) then
        raise exception using errcode = 'P0001', message = 'SKU_PRODUCT_MISMATCH';
      end if;
      raise exception using errcode = 'P0002', message = 'INVALID_SKU';
    end if;
  elsif p_sku_id is not null then
    raise exception using errcode = '22023', message = 'INVALID_SKU';
  end if;

  v_effective_delivery_type := coalesce(nullif(v_sku_delivery_type, ''), v_product_delivery_type);
  if public.normalize_order_item_delivery_type(v_effective_delivery_type) <> 'auto_delivery' then
    raise exception using errcode = '22023', message = 'INVALID_DELIVERY_TYPE';
  end if;

  select count(*), count(distinct normalized.content), array_agg(normalized.content order by normalized.ordinality)
    into v_item_count, v_distinct_count, v_contents
  from (
    select
      item.ordinality,
      btrim(item.value #>> '{}', E' \t\n\r\f\v') as content
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  ) as normalized;

  if v_item_count = 0
     or exists (
       select 1 from unnest(v_contents) as content(value)
       where content.value = '' or length(content.value) > 4000
     ) then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;
  if v_item_count <> v_distinct_count then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_IN_REQUEST';
  end if;

  v_payload_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'product_id', p_product_id,
      'sku_id', p_sku_id,
      'content_type', p_content_type,
      'batch_name', nullif(btrim(coalesce(p_batch_name, '')), ''),
      'source_filename', nullif(btrim(coalesce(p_source_filename, '')), ''),
      'items', to_jsonb(v_contents)
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  select operation.* into v_existing_operation
  from public.admin_local_inventory_operations as operation
  where operation.request_id = p_request_id
  for update;
  if found then
    if v_existing_operation.actor_user_id <> v_actor_id
       or v_existing_operation.operation_type <> 'import'
       or v_existing_operation.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_existing_operation.result is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_INCOMPLETE';
    end if;
    return v_existing_operation.result;
  end if;

  insert into public.admin_local_inventory_operations (
    request_id, actor_user_id, operation_type, payload_hash
  ) values (p_request_id, v_actor_id, 'import', v_payload_hash);

  -- The historical unique expression is authoritative. A hash collision is
  -- deliberately treated as a duplicate and fails closed.
  if exists (
    select 1
    from public.digital_inventory as inventory
    where inventory.product_id = p_product_id
      and md5(inventory.content) = any(
        array(select md5(content.value) from unnest(v_contents) as content(value))
      )
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_EXISTING';
  end if;

  v_batch_id := extensions.gen_random_uuid();
  v_batch_no := 'INV' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
    || upper(substr(replace(v_batch_id::text, '-', ''), 1, 8));

  insert into public.digital_inventory_batches (
    id, batch_no, product_id, sku_id, batch_name, content_type,
    total_count, available_count, reserved_count, delivered_count,
    invalid_count, source_filename, import_status, created_by
  ) values (
    v_batch_id, v_batch_no, p_product_id, p_sku_id,
    coalesce(nullif(btrim(coalesce(p_batch_name, '')), ''), v_batch_no),
    p_content_type, v_item_count, v_item_count, 0, 0, 0,
    nullif(btrim(coalesce(p_source_filename, '')), ''), 'completed', v_actor_id
  );

  insert into public.digital_inventory (
    product_id, sku_id, batch_id, batch_no, content_type,
    content, content_hash, status
  )
  select
    p_product_id, p_sku_id, v_batch_id, v_batch_no, p_content_type,
    content.value,
    encode(extensions.digest(convert_to(content.value, 'UTF8'), 'sha256'), 'hex'),
    'available'
  from unnest(v_contents) with ordinality as content(value, ordinality)
  order by content.ordinality;
  get diagnostics v_created_count = row_count;
  if v_created_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'IMPORT_EXACT_COUNT_MISMATCH';
  end if;

  perform public.refresh_digital_inventory_batch_counts(v_batch_id);
  perform public.sync_product_available_stock(p_product_id);

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'LOCAL_INVENTORY_IMPORTED',
    'created_count', v_created_count,
    'request_id', p_request_id,
    'batch_id', v_batch_id,
    'batch_no', v_batch_no
  );

  insert into public.admin_audit_logs (
    admin_user_id, admin_email, action, module, target_type, target_id,
    request_id, result, metadata
  ) values (
    v_actor_id, v_actor_email, 'import_local_inventory', 'inventory',
    'digital_inventory_batch', v_batch_id::text, p_request_id::text, 'success',
    jsonb_build_object(
      'product_id', p_product_id,
      'sku_id', p_sku_id,
      'created_count', v_created_count,
      'batch_id', v_batch_id,
      'content_type', p_content_type
    )
  );

  update public.admin_local_inventory_operations
  set result = v_result, completed_at = now()
  where request_id = p_request_id;

  return v_result;
exception
  when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'admin_local_inventory_operations_pkey' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_constraint_name = 'digital_inventory_product_content_uidx' then
      raise exception using errcode = '23505', message = 'DUPLICATE_EXISTING';
    end if;
    raise;
end
$function$;

create or replace function public.admin_transition_local_inventory(
  p_product_id uuid,
  p_sku_id uuid,
  p_items jsonb,
  p_target_status text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := nullif(auth.jwt()->>'email', '');
  v_product_has_skus boolean;
  v_product_delivery_type text;
  v_sku_delivery_type text;
  v_selected_count integer;
  v_distinct_count integer;
  v_found_count integer;
  v_owned_count integer;
  v_stale_count integer;
  v_updated_count integer;
  v_inventory_ids uuid[];
  v_normalized_items jsonb;
  v_payload_hash text;
  v_existing_operation public.admin_local_inventory_operations%rowtype;
  v_result jsonb;
  v_batch_id uuid;
  v_constraint_name text;
begin
  if v_actor_id is null or not coalesce(public.is_admin(v_actor_id), false) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED';
  end if;
  if p_target_status not in ('disabled', 'available') then
    raise exception using errcode = '22023', message = 'INVALID_STATE';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception using errcode = '22023', message = 'BATCH_LIMIT_EXCEEDED';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ? 'inventory_id')
      or not (item.value ? 'expected_updated_at')
      or not (item.value ? 'expected_status')
      or exists (
        select 1 from jsonb_object_keys(item.value) as key(value)
        where key.value not in ('inventory_id', 'expected_updated_at', 'expected_status')
      )
      or jsonb_typeof(item.value->'inventory_id') <> 'string'
      or jsonb_typeof(item.value->'expected_updated_at') <> 'string'
      or jsonb_typeof(item.value->'expected_status') <> 'string'
      or (item.value->>'inventory_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (item.value->>'expected_updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or (item.value->>'expected_status') not in ('available', 'reserved', 'delivered', 'disabled', 'expired', 'invalid')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BATCH';
  end if;

  select product.has_skus, product.delivery_type
    into v_product_has_skus, v_product_delivery_type
  from public.products as product
  where product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVALID_PRODUCT';
  end if;

  if v_product_has_skus then
    if p_sku_id is null then
      raise exception using errcode = '22023', message = 'INVALID_SKU';
    end if;
    select sku.delivery_type
      into v_sku_delivery_type
    from public.product_skus as sku
    where sku.id = p_sku_id and sku.product_id = p_product_id
    for update;
    if not found then
      if exists (select 1 from public.product_skus as sku where sku.id = p_sku_id) then
        raise exception using errcode = 'P0001', message = 'SKU_PRODUCT_MISMATCH';
      end if;
      raise exception using errcode = 'P0002', message = 'INVALID_SKU';
    end if;
  elsif p_sku_id is not null then
    raise exception using errcode = '22023', message = 'INVALID_SKU';
  end if;

  if public.normalize_order_item_delivery_type(
    coalesce(nullif(v_sku_delivery_type, ''), v_product_delivery_type)
  ) <> 'auto_delivery' then
    raise exception using errcode = '22023', message = 'INVALID_DELIVERY_TYPE';
  end if;

  select
    count(*),
    count(distinct (item.value->>'inventory_id')::uuid),
    array_agg((item.value->>'inventory_id')::uuid order by (item.value->>'inventory_id')::uuid),
    jsonb_agg(
      jsonb_build_object(
        'inventory_id', (item.value->>'inventory_id')::uuid,
        'expected_updated_at', ((item.value->>'expected_updated_at')::timestamptz),
        'expected_status', item.value->>'expected_status'
      ) order by (item.value->>'inventory_id')::uuid
    )
  into v_selected_count, v_distinct_count, v_inventory_ids, v_normalized_items
  from jsonb_array_elements(p_items) as item(value);
  if v_selected_count <> v_distinct_count then
    raise exception using errcode = '22023', message = 'DUPLICATE_IN_REQUEST';
  end if;

  -- Deterministic row locking: product, SKU, then every requested inventory row by UUID.
  perform inventory.id
  from public.digital_inventory as inventory
  where inventory.id = any(v_inventory_ids)
  order by inventory.id
  for update;

  select count(*) into v_found_count
  from public.digital_inventory as inventory
  where inventory.id = any(v_inventory_ids);
  if v_found_count <> v_selected_count then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;

  select count(*) into v_owned_count
  from public.digital_inventory as inventory
  where inventory.id = any(v_inventory_ids)
    and inventory.product_id = p_product_id
    and ((p_sku_id is null and inventory.sku_id is null) or inventory.sku_id = p_sku_id);
  if v_owned_count <> v_selected_count then
    raise exception using errcode = 'P0001', message = 'INVENTORY_OWNERSHIP_MISMATCH';
  end if;

  v_payload_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'product_id', p_product_id,
      'sku_id', p_sku_id,
      'items', v_normalized_items,
      'target_status', p_target_status,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  select operation.* into v_existing_operation
  from public.admin_local_inventory_operations as operation
  where operation.request_id = p_request_id
  for update;
  if found then
    if v_existing_operation.actor_user_id <> v_actor_id
       or v_existing_operation.operation_type <> 'transition'
       or v_existing_operation.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_existing_operation.result is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_INCOMPLETE';
    end if;
    return v_existing_operation.result;
  end if;

  insert into public.admin_local_inventory_operations (
    request_id, actor_user_id, operation_type, payload_hash
  ) values (p_request_id, v_actor_id, 'transition', v_payload_hash);

  select count(*) into v_stale_count
  from public.digital_inventory as inventory
  join jsonb_to_recordset(v_normalized_items) as expected(
    inventory_id uuid,
    expected_updated_at timestamptz,
    expected_status text
  ) on expected.inventory_id = inventory.id
  where inventory.status is distinct from expected.expected_status
     or inventory.updated_at is distinct from expected.expected_updated_at;
  if v_stale_count > 0 then
    raise exception using errcode = '40001', message = 'STALE_STATE';
  end if;

  if p_target_status = 'disabled' then
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status = 'reserved'
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_HAS_RESERVATION';
    end if;
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status = 'delivered'
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_DELIVERED';
    end if;
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status <> 'available'
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_STATE';
    end if;
  else
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status = 'reserved'
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_HAS_RESERVATION';
    end if;
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status = 'delivered'
    ) then
      raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_DELIVERED';
    end if;
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids) and inventory.status <> 'disabled'
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_STATE';
    end if;
    if exists (
      select 1 from public.digital_inventory as inventory
      where inventory.id = any(v_inventory_ids)
        and inventory.expires_at is not null
        and inventory.expires_at <= now()
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_STATE';
    end if;
  end if;

  if exists (
    select 1
    from public.digital_inventory as inventory
    where inventory.id = any(v_inventory_ids)
      and (
        inventory.order_id is not null
        or inventory.reserved_order_id is not null
        or inventory.reserved_order_item_id is not null
        or inventory.reserved_user_id is not null
        or inventory.reserved_at is not null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_HAS_RESERVATION';
  end if;
  if exists (
    select 1
    from public.digital_inventory as inventory
    where inventory.id = any(v_inventory_ids)
      and (
        inventory.delivered_order_id is not null
        or inventory.delivered_order_item_id is not null
        or inventory.delivered_user_id is not null
        or inventory.delivered_at is not null
        or exists (
          select 1 from public.order_deliveries as delivery
          where delivery.inventory_id = inventory.id
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_DELIVERED';
  end if;

  if p_target_status = 'disabled' then
    update public.digital_inventory as inventory
    set status = 'disabled',
        disabled_at = now(),
        disabled_by = v_actor_id,
        disabled_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where inventory.id = any(v_inventory_ids)
      and inventory.status = 'available';
  else
    update public.digital_inventory as inventory
    set status = 'available',
        disabled_at = null,
        disabled_by = null,
        disabled_reason = null
    where inventory.id = any(v_inventory_ids)
      and inventory.status = 'disabled';
  end if;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_selected_count then
    raise exception using errcode = '40001', message = 'STALE_STATE';
  end if;

  for v_batch_id in
    select distinct inventory.batch_id
    from public.digital_inventory as inventory
    where inventory.id = any(v_inventory_ids) and inventory.batch_id is not null
    order by inventory.batch_id
  loop
    perform public.refresh_digital_inventory_batch_counts(v_batch_id);
  end loop;
  perform public.sync_product_available_stock(p_product_id);

  v_result := jsonb_build_object(
    'ok', true,
    'code', 'LOCAL_INVENTORY_TRANSITIONED',
    'updated_count', v_updated_count,
    'target_status', p_target_status,
    'request_id', p_request_id
  );

  insert into public.admin_audit_logs (
    admin_user_id, admin_email, action, module, target_type, target_id,
    request_id, result, metadata
  ) values (
    v_actor_id, v_actor_email, 'transition_local_inventory', 'inventory',
    'digital_inventory', p_product_id::text, p_request_id::text, 'success',
    jsonb_build_object(
      'product_id', p_product_id,
      'sku_id', p_sku_id,
      'inventory_ids', to_jsonb(v_inventory_ids),
      'inventory_count', v_updated_count,
      'from_status', case when p_target_status = 'disabled' then 'available' else 'disabled' end,
      'to_status', p_target_status
    )
  );

  update public.admin_local_inventory_operations
  set result = v_result, completed_at = now()
  where request_id = p_request_id;

  return v_result;
exception
  when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'admin_local_inventory_operations_pkey' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    raise;
end
$function$;

create or replace function public.admin_list_digital_inventory_items_v2(
  p_product_id uuid,
  p_sku_id uuid default null,
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  sku_id uuid,
  sku_code text,
  sku_title text,
  masked_content text,
  content_type text,
  status text,
  batch_no text,
  has_order_link boolean,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
begin
  if auth.uid() is null or not coalesce(public.is_admin(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT';
  end if;
  if v_status not in ('all', 'available', 'reserved', 'delivered', 'disabled', 'expired', 'invalid') then
    raise exception using errcode = '22023', message = 'INVALID_STATE';
  end if;

  return query
  with filtered as (
    select
      inventory.id,
      inventory.product_id,
      product.name as product_name,
      product.slug as product_slug,
      inventory.sku_id,
      sku.sku_code,
      sku.sku_title,
      public.mask_delivery_secret(inventory.content) as masked_content,
      inventory.content_type,
      inventory.status,
      inventory.batch_no,
      (
        inventory.order_id is not null
        or inventory.reserved_order_id is not null
        or inventory.delivered_order_id is not null
      ) as has_order_link,
      inventory.expires_at,
      inventory.created_at,
      inventory.updated_at
    from public.digital_inventory as inventory
    join public.products as product on product.id = inventory.product_id
    left join public.product_skus as sku on sku.id = inventory.sku_id
    where inventory.product_id = p_product_id
      and (p_sku_id is null or inventory.sku_id = p_sku_id)
      and (v_status = 'all' or inventory.status = v_status)
  )
  select
    filtered.id, filtered.product_id, filtered.product_name, filtered.product_slug,
    filtered.sku_id, filtered.sku_code, filtered.sku_title, filtered.masked_content,
    filtered.content_type, filtered.status, filtered.batch_no, filtered.has_order_link,
    filtered.expires_at, filtered.created_at, filtered.updated_at,
    count(*) over() as total_rows
  from filtered
  order by filtered.updated_at desc, filtered.id
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end
$function$;

revoke all on function public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid) from public;
revoke all on function public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid) from anon;
revoke all on function public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid) from authenticated;
grant execute on function public.admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid) to authenticated;

revoke all on function public.admin_transition_local_inventory(uuid,uuid,jsonb,text,text,uuid) from public;
revoke all on function public.admin_transition_local_inventory(uuid,uuid,jsonb,text,text,uuid) from anon;
revoke all on function public.admin_transition_local_inventory(uuid,uuid,jsonb,text,text,uuid) from authenticated;
grant execute on function public.admin_transition_local_inventory(uuid,uuid,jsonb,text,text,uuid) to authenticated;

revoke all on function public.admin_list_digital_inventory_items_v2(uuid,uuid,text,integer,integer) from public;
revoke all on function public.admin_list_digital_inventory_items_v2(uuid,uuid,text,integer,integer) from anon;
revoke all on function public.admin_list_digital_inventory_items_v2(uuid,uuid,text,integer,integer) from authenticated;
grant execute on function public.admin_list_digital_inventory_items_v2(uuid,uuid,text,integer,integer) to authenticated;

commit;
