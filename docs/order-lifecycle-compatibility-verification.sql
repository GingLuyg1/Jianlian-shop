-- Order lifecycle compatibility verification.
--
-- Sections 1-4 are read-only checks.
-- Section 5 is a transaction rollback scenario test for Jianlian-shop-test.
-- It creates its own product, SKU, and digital inventory fixtures inside the
-- transaction. Do not run in production.

-- 1. Required lifecycle columns.
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and (
    (c.table_name = 'orders' and c.column_name in ('expired_at','payment_expires_at','reservation_released_at','cancelled_at'))
    or (c.table_name = 'order_items' and c.column_name in ('order_id','product_id','sku_id','quantity','delivery_type'))
  )
order by c.table_name, c.column_name;

select
  required.column_name as lifecycle_column,
  case when c.column_name is null then 'missing' else 'ok' end as check_result
from (
  values
    ('payment_expires_at'),
    ('reservation_released_at'),
    ('expired_at')
) as required(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'orders'
 and c.column_name = required.column_name
order by required.column_name;

-- 2. Lifecycle RPC signatures and security posture.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  md5(pg_get_functiondef(p.oid)) as function_hash
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('release_order_inventory','cancel_unpaid_order','expire_unpaid_order')
order by p.proname, pg_get_function_identity_arguments(p.oid);

select
  'cancel_unpaid_order calls release_order_inventory(uuid,text)' as check_name,
  case
    when pg_get_functiondef('public.cancel_unpaid_order(uuid,text)'::regprocedure) ~
      'release_order_inventory\s*\(\s*p_order_id\s*,\s*''cancel:'
    then 'ok'
    else 'missing'
  end as check_result;

select
  'expire_unpaid_order calls release_order_inventory(uuid,text)' as check_name,
  case
    when pg_get_functiondef('public.expire_unpaid_order(uuid,text)'::regprocedure) ~
      'release_order_inventory\s*\(\s*p_order_id\s*,\s*''expired:'
    then 'ok'
    else 'missing'
  end as check_result;

-- 3. Grants for lifecycle RPCs.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  coalesce(array_to_string(p.proacl, E'\n'), '<default>') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('release_order_inventory','cancel_unpaid_order','expire_unpaid_order')
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 4. Function hashes that must not change when this compatibility migration is applied.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  md5(pg_get_functiondef(p.oid)) as function_hash
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'complete_order_payment',
    'create_order_with_item',
    'deliver_digital_order',
    'admin_update_order_status'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 5. Transaction rollback verification.
-- Before running in Jianlian-shop-test, manually change:
--   v_confirm_test_database boolean := false;
-- The only fixed IDs are the two known test accounts.
BEGIN;

DO $$
declare
  v_confirm_test_database boolean := false;
  v_user_id uuid := 'b0a56264-aa77-4409-b91e-74a1442cf60e'::uuid; -- TEST_USER_UUID
  v_admin_id uuid := 'd26b5042-d124-40f1-82ea-e00da7ad2ce4'::uuid; -- TEST_ADMIN_UUID
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_category_id uuid;
  v_category_name text;
  v_normal_product_id uuid;
  v_sku_product_id uuid;
  v_sku_id uuid;
  v_option_group_id uuid;
  v_option_value_id uuid;
  v_digital_product_id uuid;
  v_order_id uuid;
  v_item_id uuid;
  v_result jsonb;
  v_missing_columns text[];
  v_before integer;
  v_parent_before integer;
  v_after integer;
  v_reserved_before integer;
  v_reserved_after integer;
begin
  if not v_confirm_test_database then
    raise exception 'TEST DATABASE CONFIRMATION REQUIRED: set v_confirm_test_database to true only in Jianlian-shop-test';
  end if;

  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'FIXTURE_USER_READY failed: TEST_USER_UUID does not exist in auth.users';
  end if;
  if not exists (select 1 from public.profiles where id = v_admin_id and role = 'admin') then
    raise exception 'FIXTURE_ADMIN_READY failed: TEST_ADMIN_UUID must exist in profiles with role admin';
  end if;

  select array_agg(required.column_name order by required.column_name)
    into v_missing_columns
  from (
    values
      ('order_id'),
      ('product_id'),
      ('product_name'),
      ('sku_id'),
      ('sku_code'),
      ('sku_title'),
      ('option_snapshot'),
      ('quantity'),
      ('unit_price'),
      ('line_total'),
      ('delivery_type')
  ) as required(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'order_items'
   and c.column_name = required.column_name
  where c.column_name is null;
  if coalesce(array_length(v_missing_columns, 1), 0) > 0 then
    raise exception 'ORDER_ITEMS_FIXTURE_PREFLIGHT failed: missing columns %', v_missing_columns;
  end if;
  raise notice 'PASS: ORDER_ITEMS_FIXTURE_PREFLIGHT';
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'currency'
  ) then
    raise notice 'PASS: ORDER_ITEMS_CURRENCY_COLUMN_PRESENT';
  else
    raise notice 'PASS: ORDER_ITEMS_CURRENCY_COLUMN_ABSENT_USING_ORDER_CURRENCY';
  end if;

  select c.id, c.name
    into v_category_id, v_category_name
  from public.categories c
  where c.status = 'active'
    and c.is_active = true
  order by c.level, c.sort_order, c.created_at
  limit 1;
  if v_category_id is null then
    raise exception 'FIXTURE_CATEGORY_READY failed: no active category exists';
  end if;
  raise notice 'PASS: FIXTURE_CATEGORY_READY';

  insert into public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  values (
    v_category_id,
    'verification normal product ' || v_run_id,
    'verification-normal-' || v_run_id,
    'verification normal fixture',
    'verification normal fixture',
    null,
    '{}'::text[],
    10.00,
    null,
    10,
    'manual',
    'active',
    0,
    false,
    jsonb_build_object('verification', true, 'run_id', v_run_id),
    now(),
    now()
  )
  returning id into v_normal_product_id;
  raise notice 'PASS: FIXTURE_NORMAL_PRODUCT_CREATED %', v_normal_product_id;

  insert into public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  values (
    v_category_id,
    'verification sku parent product ' || v_run_id,
    'verification-sku-parent-' || v_run_id,
    'verification sku parent fixture',
    'verification sku parent fixture',
    null,
    '{}'::text[],
    20.00,
    null,
    10,
    'manual',
    'active',
    0,
    true,
    jsonb_build_object('verification', true, 'run_id', v_run_id),
    now(),
    now()
  )
  returning id into v_sku_product_id;
  raise notice 'PASS: FIXTURE_SKU_PRODUCT_CREATED %', v_sku_product_id;

  insert into public.product_option_groups(product_id, name, sort_order, is_active, created_at, updated_at)
  values (v_sku_product_id, 'verification-size-' || v_run_id, 0, true, now(), now())
  returning id into v_option_group_id;

  insert into public.product_option_values(product_id, group_id, name, value_code, sort_order, is_active, created_at, updated_at)
  values (v_sku_product_id, v_option_group_id, 'verification-value-' || v_run_id, 'verification-value-' || v_run_id, 0, true, now(), now())
  returning id into v_option_value_id;

  insert into public.product_skus(
    product_id, sku_code, sku_title, combination_key, price, original_price, stock,
    status, delivery_type, image_url, sort_order, note, metadata, created_at, updated_at
  )
  values (
    v_sku_product_id,
    'verification-sku-' || v_run_id,
    'verification SKU ' || v_run_id,
    'verification-combination-' || v_run_id,
    21.00,
    null,
    10,
    'active',
    'manual',
    null,
    0,
    'verification fixture',
    jsonb_build_object('verification', true, 'run_id', v_run_id),
    now(),
    now()
  )
  returning id into v_sku_id;

  insert into public.product_sku_values(sku_id, product_id, group_id, value_id, sort_order, created_at)
  values (v_sku_id, v_sku_product_id, v_option_group_id, v_option_value_id, 0, now());
  raise notice 'PASS: FIXTURE_SKU_CREATED %', v_sku_id;

  insert into public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  values (
    v_category_id,
    'verification digital product ' || v_run_id,
    'verification-digital-' || v_run_id,
    'verification digital fixture',
    'verification digital fixture',
    null,
    '{}'::text[],
    30.00,
    null,
    2,
    'automatic',
    'active',
    0,
    false,
    jsonb_build_object('verification', true, 'run_id', v_run_id),
    now(),
    now()
  )
  returning id into v_digital_product_id;
  raise notice 'PASS: FIXTURE_DIGITAL_PRODUCT_CREATED %', v_digital_product_id;

  insert into public.digital_inventory(product_id, content, status, batch_no, remark, created_at, updated_at)
  values
    (v_digital_product_id, 'verification-nonsecret-content-' || v_run_id || '-1', 'available', 'verification-' || v_run_id, 'verification test content only', now(), now()),
    (v_digital_product_id, 'verification-nonsecret-content-' || v_run_id || '-2', 'available', 'verification-' || v_run_id, 'verification test content only', now(), now());
  raise notice 'PASS: FIXTURE_DIGITAL_INVENTORY_CREATED';

  -- Normal product cancellation releases stock once.
  select stock into v_before from public.products where id = v_normal_product_id for update;
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-NORMAL-CANCEL-' || left(v_run_id, 12), v_user_id, 'pending_payment', 'unpaid', 1, 'CNY', now() + interval '30 minutes', now(), now())
  returning id into v_order_id;
  insert into public.order_items(
    id, order_id, product_id, product_name, quantity, unit_price, line_total,
    delivery_type
  )
  values (
    gen_random_uuid(), v_order_id, v_normal_product_id,
    'verification normal product ' || v_run_id,
    1, 1, 1, 'manual'
  );
  raise notice 'PASS: FIXTURE_NORMAL_ORDER_ITEM_CREATED';
  update public.products set stock = stock - 1 where id = v_normal_product_id;

  v_result := public.cancel_unpaid_order(v_order_id, 'verification-normal-cancel');
  if v_result->>'code' <> 'CANCELLED' then
    raise exception 'normal cancel failed: %', v_result;
  end if;
  v_result := public.cancel_unpaid_order(v_order_id, 'verification-normal-cancel-repeat');
  if v_result->>'code' <> 'ALREADY_CANCELLED' then
    raise exception 'repeat normal cancel was not idempotent: %', v_result;
  end if;
  select stock into v_after from public.products where id = v_normal_product_id;
  if v_after <> v_before then
    raise exception 'normal stock was not restored exactly once: before %, after %', v_before, v_after;
  end if;
  raise notice 'PASS: normal unpaid order cancellation releases stock once';

  -- SKU cancellation restores SKU stock only.
  select stock into v_before from public.product_skus where id = v_sku_id for update;
  select stock into v_parent_before from public.products where id = v_sku_product_id for update;
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-SKU-CANCEL-' || left(v_run_id, 12), v_user_id, 'pending_payment', 'unpaid', 1, 'CNY', now() + interval '30 minutes', now(), now())
  returning id into v_order_id;
  insert into public.order_items(
    id, order_id, product_id, sku_id, sku_code, sku_title, option_snapshot,
    product_name, quantity, unit_price, line_total, delivery_type
  )
  values (
    gen_random_uuid(), v_order_id, v_sku_product_id, v_sku_id,
    'verification-sku-' || v_run_id,
    'verification SKU ' || v_run_id,
    jsonb_build_array(jsonb_build_object('group', 'verification-size-' || v_run_id, 'value', 'verification-value-' || v_run_id)),
    'verification sku parent product ' || v_run_id,
    1, 1, 1, 'manual'
  );
  raise notice 'PASS: FIXTURE_SKU_ORDER_ITEM_CREATED';
  update public.product_skus set stock = stock - 1 where id = v_sku_id;
  v_result := public.cancel_unpaid_order(v_order_id, 'verification-sku-cancel');
  if v_result->>'code' <> 'CANCELLED' then
    raise exception 'SKU cancel failed: %', v_result;
  end if;
  if (select stock from public.product_skus where id = v_sku_id) <> v_before then
    raise exception 'SKU stock was not restored exactly once';
  end if;
  if (select stock from public.products where id = v_sku_product_id) <> v_parent_before then
    raise exception 'SKU cancellation changed parent product stock';
  end if;
  raise notice 'PASS: SKU unpaid order cancellation restores SKU stock only';

  -- Digital reservation cancellation restores reserved inventory to available.
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-DIGITAL-CANCEL-' || left(v_run_id, 12), v_user_id, 'pending_payment', 'unpaid', 1, 'CNY', now() + interval '30 minutes', now(), now())
  returning id into v_order_id;
  insert into public.order_items(
    id, order_id, product_id, product_name, quantity, unit_price, line_total,
    delivery_type
  )
  values (
    gen_random_uuid(), v_order_id, v_digital_product_id,
    'verification digital product ' || v_run_id,
    1, 1, 1, 'automatic'
  )
  returning id into v_item_id;
  raise notice 'PASS: FIXTURE_DIGITAL_ORDER_ITEM_CREATED';
  update public.digital_inventory
     set status = 'reserved', reserved_order_id = v_order_id, reserved_order_item_id = v_item_id, order_id = v_order_id
   where id = (
     select id from public.digital_inventory
     where product_id = v_digital_product_id and status = 'available'
     order by created_at asc
     limit 1
   );
  get diagnostics v_reserved_before = row_count;
  if v_reserved_before <> 1 then
    raise exception 'digital test could not reserve one inventory row';
  end if;
  v_result := public.cancel_unpaid_order(v_order_id, 'verification-digital-cancel');
  if v_result->>'code' <> 'CANCELLED' then
    raise exception 'digital cancel failed: %', v_result;
  end if;
  select count(*) into v_reserved_after
  from public.digital_inventory
  where coalesce(reserved_order_id, order_id) = v_order_id and status = 'reserved';
  if v_reserved_after <> 0 then
    raise exception 'digital reserved inventory was not released';
  end if;
  raise notice 'PASS: digital reserved inventory cancellation restores available state';

  -- Paid orders cannot release inventory.
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-PAID-NO-RELEASE-' || left(v_run_id, 12), v_user_id, 'paid', 'paid', 1, 'CNY', now() - interval '1 minute', now(), now())
  returning id into v_order_id;
  v_result := public.release_order_inventory(v_order_id, 'verification-paid-no-release');
  if v_result->>'code' <> 'ORDER_NOT_RELEASABLE' then
    raise exception 'paid order release was not rejected: %', v_result;
  end if;
  raise notice 'PASS: paid order cannot release inventory';

  -- Not-yet-due orders cannot expire.
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-NOT-DUE-' || left(v_run_id, 12), v_user_id, 'pending_payment', 'unpaid', 1, 'CNY', now() + interval '30 minutes', now(), now())
  returning id into v_order_id;
  v_result := public.expire_unpaid_order(v_order_id, 'verification-not-due');
  if v_result->>'code' <> 'NOT_DUE' then
    raise exception 'not due order expiration was not rejected: %', v_result;
  end if;
  raise notice 'PASS: not-yet-due order cannot expire';

  -- Due order expiration releases once and is idempotent.
  select stock into v_before from public.products where id = v_normal_product_id for update;
  insert into public.orders(id, order_no, user_id, status, payment_status, total_amount, currency, payment_expires_at, created_at, updated_at)
  values (gen_random_uuid(), 'VERIFY-EXPIRE-' || left(v_run_id, 12), v_user_id, 'pending_payment', 'unpaid', 1, 'CNY', now() - interval '1 minute', now(), now())
  returning id into v_order_id;
  insert into public.order_items(
    id, order_id, product_id, product_name, quantity, unit_price, line_total,
    delivery_type
  )
  values (
    gen_random_uuid(), v_order_id, v_normal_product_id,
    'verification normal product ' || v_run_id,
    1, 1, 1, 'manual'
  );
  raise notice 'PASS: FIXTURE_NORMAL_ORDER_ITEM_CREATED';
  update public.products set stock = stock - 1 where id = v_normal_product_id;
  v_result := public.expire_unpaid_order(v_order_id, 'verification-expire');
  if v_result->>'code' <> 'EXPIRED' then
    raise exception 'due order expiration failed: %', v_result;
  end if;
  v_result := public.expire_unpaid_order(v_order_id, 'verification-expire-repeat');
  if v_result->>'code' <> 'ALREADY_EXPIRED' then
    raise exception 'repeat expiration was not idempotent: %', v_result;
  end if;
  select stock into v_after from public.products where id = v_normal_product_id;
  if v_after <> v_before then
    raise exception 'expiration did not restore stock exactly once: before %, after %', v_before, v_after;
  end if;
  raise notice 'PASS: due order expiration releases stock once and repeat expire is idempotent';

  -- User ownership cancellation must be verified with two authenticated sessions.
  raise notice 'PENDING MANUAL: user ownership cancellation must be verified with two authenticated sessions';
end $$;

ROLLBACK;
