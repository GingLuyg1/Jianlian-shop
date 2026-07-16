-- Order payment inventory idempotency verification.
--
-- Run only in a test Supabase database after executing:
--   supabase/migrations/20260710_order_payment_inventory_idempotency_fix.sql
--
-- Before running in Jianlian-shop-test, manually change:
--   v_confirm_test_database boolean := true;
-- This script creates its own product, SKU, and digital inventory fixtures
-- inside the transaction, uses real project RPCs, and rolls back all changes.

BEGIN;

DO $$
DECLARE
  v_confirm_test_database boolean := false;
  v_test_user_id uuid := 'b0a56264-aa77-4409-b91e-74a1442cf60e'::uuid; -- TEST_USER_UUID
  v_test_admin_id uuid := 'd26b5042-d124-40f1-82ea-e00da7ad2ce4'::uuid; -- TEST_ADMIN_UUID
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_category_id uuid;
  v_normal_product_id uuid;
  v_sku_product_id uuid;
  v_sku_id uuid;
  v_option_group_id uuid;
  v_option_value_id uuid;
  v_digital_product_id uuid;

  v_order record;
  v_repeat_order record;
  v_order_row public.orders%rowtype;
  v_result jsonb;
  v_missing_columns text[];
  v_missing_relations text[];
  v_request_id text;
  v_session_no text;
  v_trade_no text;
  v_before integer;
  v_after_create integer;
  v_after_pay integer;
  v_after_repeat integer;
  v_parent_before integer;
  v_parent_after_create integer;
  v_parent_after_pay integer;
  v_sku_before integer;
  v_sku_after_create integer;
  v_sku_after_pay integer;
  v_available_before integer;
  v_reserved_after_create integer;
  v_available_after_cancel integer;
  v_delivered_after integer;
  v_delivery_count integer;
  v_secret_count integer;
  v_payment_count integer;
  v_log_count integer;
  v_paid_at timestamptz;
  v_paid_at_after_repeat timestamptz;
  v_blocked boolean;
  v_status_input text;
BEGIN
  IF NOT v_confirm_test_database THEN
    RAISE EXCEPTION 'TEST DATABASE CONFIRMATION REQUIRED: set v_confirm_test_database to true only in Jianlian-shop-test';
  END IF;

  IF to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)';
  END IF;
  IF to_regprocedure('public.cancel_unpaid_order(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing cancel_unpaid_order(uuid,text)';
  END IF;
  IF to_regprocedure('public.expire_unpaid_order(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing expire_unpaid_order(uuid,text)';
  END IF;
  IF to_regprocedure('public.deliver_digital_order(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing deliver_digital_order(uuid,text)';
  END IF;
  IF to_regprocedure('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Missing complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)';
  END IF;
  IF to_regprocedure('public.admin_update_order_status(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing admin_update_order_status(uuid,text,text,text)';
  END IF;

  SELECT array_agg(required.relation_name ORDER BY required.relation_name)
    INTO v_missing_relations
  FROM (
    VALUES
      ('public.categories'),
      ('public.products'),
      ('public.product_option_groups'),
      ('public.product_option_values'),
      ('public.product_skus'),
      ('public.product_sku_values'),
      ('public.orders'),
      ('public.order_items'),
      ('public.digital_inventory'),
      ('public.order_deliveries'),
      ('public.digital_delivery_secrets'),
      ('public.order_payments'),
      ('public.order_status_logs')
  ) AS required(relation_name)
  WHERE to_regclass(required.relation_name) IS NULL;
  IF coalesce(array_length(v_missing_relations, 1), 0) > 0 THEN
    RAISE EXCEPTION 'RELATION_PREFLIGHT failed: missing relations %', v_missing_relations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.indexname = 'orders_user_client_request_uidx'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND replace(lower(i.indexdef), ' ', '') LIKE '%(user_id,client_request_id)%'
      AND replace(lower(i.indexdef), ' ', '') LIKE '%client_request_idisnotnull%'
      AND replace(lower(i.indexdef), ' ', '') LIKE '%btrim(client_request_id)<>''%'
  ) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_PREFLIGHT failed: orders_user_client_request_uidx is missing or incompatible';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_test_user_id) THEN
    RAISE EXCEPTION 'TEST_USER_UUID does not exist in auth.users';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_test_admin_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'TEST_ADMIN_UUID does not exist or is not an admin profile';
  END IF;

  SELECT array_agg(required.column_name ORDER BY required.column_name)
    INTO v_missing_columns
  FROM (
    VALUES
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
  ) AS required(column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'order_items'
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL;
  IF coalesce(array_length(v_missing_columns, 1), 0) > 0 THEN
    RAISE EXCEPTION 'ORDER_ITEMS_FIXTURE_PREFLIGHT failed: missing columns %', v_missing_columns;
  END IF;
  RAISE NOTICE 'PASS: ORDER_ITEMS_FIXTURE_PREFLIGHT';
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'currency'
  ) THEN
    RAISE NOTICE 'PASS: ORDER_ITEMS_CURRENCY_COLUMN_PRESENT';
  ELSE
    RAISE NOTICE 'PASS: ORDER_ITEMS_CURRENCY_COLUMN_ABSENT_USING_ORDER_CURRENCY';
  END IF;

  SELECT c.id
    INTO v_category_id
  FROM public.categories c
  WHERE c.status = 'active'
    AND c.is_active = true
  ORDER BY c.level, c.sort_order, c.created_at
  LIMIT 1;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_CATEGORY_READY failed: no active category exists';
  END IF;
  RAISE NOTICE 'PASS: FIXTURE_CATEGORY_READY';

  INSERT INTO public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  VALUES (
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
  RETURNING id INTO v_normal_product_id;
  RAISE NOTICE 'PASS: FIXTURE_NORMAL_PRODUCT_CREATED %', v_normal_product_id;

  INSERT INTO public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  VALUES (
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
  RETURNING id INTO v_sku_product_id;
  RAISE NOTICE 'PASS: FIXTURE_SKU_PRODUCT_CREATED %', v_sku_product_id;

  INSERT INTO public.product_option_groups(product_id, name, sort_order, is_active, created_at, updated_at)
  VALUES (v_sku_product_id, 'verification-size-' || v_run_id, 0, true, now(), now())
  RETURNING id INTO v_option_group_id;

  INSERT INTO public.product_option_values(product_id, group_id, name, value_code, sort_order, is_active, created_at, updated_at)
  VALUES (v_sku_product_id, v_option_group_id, 'verification-value-' || v_run_id, 'verification-value-' || v_run_id, 0, true, now(), now())
  RETURNING id INTO v_option_value_id;

  INSERT INTO public.product_skus(
    product_id, sku_code, sku_title, combination_key, price, original_price, stock,
    status, delivery_type, image_url, sort_order, note, metadata, created_at, updated_at
  )
  VALUES (
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
  RETURNING id INTO v_sku_id;

  INSERT INTO public.product_sku_values(sku_id, product_id, group_id, value_id, sort_order, created_at)
  VALUES (v_sku_id, v_sku_product_id, v_option_group_id, v_option_value_id, 0, now());
  RAISE NOTICE 'PASS: FIXTURE_SKU_CREATED %', v_sku_id;

  INSERT INTO public.products(
    category_id, name, slug, short_description, description, image_url, gallery,
    price, original_price, stock, delivery_type, status, sort_order, has_skus,
    metadata, created_at, updated_at
  )
  VALUES (
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
  RETURNING id INTO v_digital_product_id;
  RAISE NOTICE 'PASS: FIXTURE_DIGITAL_PRODUCT_CREATED %', v_digital_product_id;

  INSERT INTO public.digital_inventory(product_id, content, status, batch_no, remark, created_at, updated_at)
  VALUES
    (v_digital_product_id, 'verification-nonsecret-content-' || v_run_id || '-1', 'available', 'verification-' || v_run_id, 'verification test content only', now(), now()),
    (v_digital_product_id, 'verification-nonsecret-content-' || v_run_id || '-2', 'available', 'verification-' || v_run_id, 'verification test content only', now(), now());
  RAISE NOTICE 'PASS: FIXTURE_DIGITAL_INVENTORY_CREATED';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_test_user_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_user_id::text, true);

  SELECT stock INTO v_before FROM public.products WHERE id = v_normal_product_id FOR UPDATE;
  v_request_id := 'normal-pay-' || gen_random_uuid()::text;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_normal_product_id, 1, 'inventory-test@example.invalid', 'Inventory Test',
    null, 'normal product payment idempotency', '{}'::jsonb, null, 'balance',
    v_request_id
  );
  SELECT * INTO v_order_row FROM public.orders WHERE id = v_order.order_id;
  SELECT stock INTO v_after_create FROM public.products WHERE id = v_normal_product_id;
  IF v_after_create <> v_before - 1 THEN
    RAISE EXCEPTION 'normal product stock not reduced exactly once after order create: before %, after %', v_before, v_after_create;
  END IF;
  SELECT * INTO v_repeat_order
  FROM public.create_order_with_item(
    v_normal_product_id, 1, 'inventory-test@example.invalid', 'Inventory Test',
    null, 'normal product payment idempotency retry', '{}'::jsonb, null, 'balance',
    v_request_id
  );
  IF v_repeat_order.order_id IS DISTINCT FROM v_order.order_id THEN
    RAISE EXCEPTION 'normal client_request_id replay returned another order: expected %, actual %', v_order.order_id, v_repeat_order.order_id;
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_normal_product_id) <> v_after_create THEN
    RAISE EXCEPTION 'normal client_request_id replay deducted product stock again: expected %, actual %', v_after_create, (SELECT stock FROM public.products WHERE id = v_normal_product_id);
  END IF;
  IF (SELECT count(*) FROM public.orders WHERE user_id = v_test_user_id AND client_request_id = v_request_id) <> 1
     OR (SELECT count(*) FROM public.order_items WHERE order_id = v_order.order_id) <> 1 THEN
    RAISE EXCEPTION 'normal client_request_id replay created duplicate order or order item';
  END IF;
  RAISE NOTICE 'PASS: NORMAL_ORDER_CREATED';
  RAISE NOTICE 'PASS: normal product order creation reduced stock once';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_test_admin_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_admin_id::text, true);
  v_session_no := 'normal-session-' || gen_random_uuid()::text;
  v_trade_no := 'normal-trade-' || gen_random_uuid()::text;
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now());
  SELECT stock INTO v_after_pay FROM public.products WHERE id = v_normal_product_id;
  IF v_after_pay <> v_after_create THEN
    RAISE EXCEPTION 'normal product stock changed after payment: after_create %, after_pay %', v_after_create, v_after_pay;
  END IF;
  RAISE NOTICE 'PASS: NORMAL_PAYMENT_COMPLETED';
  RAISE NOTICE 'PASS: normal product payment completion did not reduce stock again';

  SELECT count(*) INTO v_payment_count FROM public.order_payments WHERE order_id = v_order.order_id AND status = 'paid';
  SELECT count(*) INTO v_log_count FROM public.order_status_logs WHERE order_id = v_order.order_id AND to_status = 'paid';
  SELECT paid_at INTO v_paid_at FROM public.orders WHERE id = v_order.order_id;
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now() + interval '1 minute');
  SELECT stock INTO v_after_repeat FROM public.products WHERE id = v_normal_product_id;
  IF v_after_repeat <> v_after_pay THEN
    RAISE EXCEPTION 'normal product stock changed after repeated payment completion';
  END IF;
  IF (SELECT count(*) FROM public.order_payments WHERE order_id = v_order.order_id AND status = 'paid') <> v_payment_count THEN
    RAISE EXCEPTION 'repeated payment created duplicate effective order_payments row';
  END IF;
  IF (SELECT count(*) FROM public.order_status_logs WHERE order_id = v_order.order_id AND to_status = 'paid') <> v_log_count THEN
    RAISE EXCEPTION 'repeated payment created duplicate paid status log';
  END IF;
  SELECT paid_at INTO v_paid_at_after_repeat FROM public.orders WHERE id = v_order.order_id;
  IF v_paid_at_after_repeat IS DISTINCT FROM v_paid_at THEN
    RAISE EXCEPTION 'repeated payment unexpectedly reset paid_at';
  END IF;
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'normal repeated payment did not return idempotent=true: %', v_result;
  END IF;
  RAISE NOTICE 'PASS: NORMAL_PAYMENT_REPEAT_IDEMPOTENT';
  RAISE NOTICE 'PASS: repeated payment completion is idempotent for stock, payment record, paid_at, and status log';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_test_user_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_user_id::text, true);
  SELECT stock INTO v_before FROM public.products WHERE id = v_normal_product_id;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'paid-order-cancel-should-not-release');
  SELECT stock INTO v_after_repeat FROM public.products WHERE id = v_normal_product_id;
  IF v_after_repeat <> v_before THEN
    RAISE EXCEPTION 'cancel paid order changed normal product stock';
  END IF;
  RAISE NOTICE 'PASS: cancelling a paid order does not restore inventory';

  SELECT stock INTO v_sku_before FROM public.product_skus WHERE id = v_sku_id FOR UPDATE;
  SELECT stock INTO v_parent_before FROM public.products WHERE id = v_sku_product_id FOR UPDATE;
  v_request_id := 'sku-pay-' || gen_random_uuid()::text;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_sku_product_id, 1, 'sku-test@example.invalid', 'SKU Test',
    null, 'sku product payment idempotency', '{}'::jsonb, v_sku_id, 'balance',
    v_request_id
  );
  SELECT * INTO v_order_row FROM public.orders WHERE id = v_order.order_id;
  SELECT stock INTO v_sku_after_create FROM public.product_skus WHERE id = v_sku_id;
  SELECT stock INTO v_parent_after_create FROM public.products WHERE id = v_sku_product_id;
  IF v_sku_after_create <> v_sku_before - 1 THEN
    RAISE EXCEPTION 'SKU stock not reduced exactly once after order create';
  END IF;
  IF v_parent_after_create <> v_parent_before THEN
    RAISE EXCEPTION 'parent product stock changed during SKU order creation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_skus s
    WHERE s.id = v_sku_id
      AND s.product_id = v_sku_product_id
  ) THEN
    RAISE EXCEPTION 'SKU fixture no longer belongs to the expected parent product';
  END IF;
  SELECT * INTO v_repeat_order
  FROM public.create_order_with_item(
    v_sku_product_id, 1, 'sku-test@example.invalid', 'SKU Test',
    null, 'sku product payment idempotency retry', '{}'::jsonb, v_sku_id, 'balance',
    v_request_id
  );
  IF v_repeat_order.order_id IS DISTINCT FROM v_order.order_id
     OR (SELECT stock FROM public.product_skus WHERE id = v_sku_id) <> v_sku_after_create
     OR (SELECT stock FROM public.products WHERE id = v_sku_product_id) <> v_parent_after_create
     OR (SELECT count(*) FROM public.order_items WHERE order_id = v_order.order_id) <> 1 THEN
    RAISE EXCEPTION 'SKU client_request_id replay was not idempotent: expected order %, actual order %', v_order.order_id, v_repeat_order.order_id;
  END IF;
  RAISE NOTICE 'PASS: SKU_ORDER_CREATED';
  RAISE NOTICE 'PASS: SKU order creation reduced SKU stock and kept parent product stock unchanged';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_test_admin_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_admin_id::text, true);
  v_session_no := 'sku-session-' || gen_random_uuid()::text;
  v_trade_no := 'sku-trade-' || gen_random_uuid()::text;
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now());
  SELECT stock INTO v_sku_after_pay FROM public.product_skus WHERE id = v_sku_id;
  SELECT stock INTO v_parent_after_pay FROM public.products WHERE id = v_sku_product_id;
  IF v_sku_after_pay <> v_sku_after_create OR v_parent_after_pay <> v_parent_after_create THEN
    RAISE EXCEPTION 'SKU or parent product stock changed after payment completion';
  END IF;
  RAISE NOTICE 'PASS: SKU_PAYMENT_COMPLETED';
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now());
  IF (SELECT stock FROM public.product_skus WHERE id = v_sku_id) <> v_sku_after_pay
     OR (SELECT stock FROM public.products WHERE id = v_sku_product_id) <> v_parent_after_pay THEN
    RAISE EXCEPTION 'SKU or parent product stock changed after repeated payment';
  END IF;
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SKU repeated payment did not return idempotent=true: %', v_result;
  END IF;
  RAISE NOTICE 'PASS: SKU_PAYMENT_REPEAT_IDEMPOTENT';
  RAISE NOTICE 'PASS: SKU payment completion and repeated payment do not mutate SKU or parent stock';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_test_user_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_user_id::text, true);
  SELECT stock INTO v_before FROM public.products WHERE id = v_normal_product_id;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_normal_product_id, 1, 'cancel-test@example.invalid', 'Cancel Test',
    null, 'normal cancel inventory release', '{}'::jsonb, null, 'balance',
    'normal-cancel-' || gen_random_uuid()::text
  );
  SELECT stock INTO v_after_create FROM public.products WHERE id = v_normal_product_id;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-cancel');
  IF v_result->>'code' <> 'CANCELLED' THEN
    RAISE EXCEPTION 'normal unpaid cancel failed: %', v_result;
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_normal_product_id) <> v_before THEN
    RAISE EXCEPTION 'normal unpaid cancel did not restore stock exactly once';
  END IF;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-cancel-repeat');
  IF coalesce(v_result->>'code', '') NOT IN ('ALREADY_CANCELLED', 'STATE_CHANGED') THEN
    RAISE EXCEPTION 'repeated normal cancel returned unexpected result: %', v_result;
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_normal_product_id) <> v_before THEN
    RAISE EXCEPTION 'repeated normal cancel changed stock';
  END IF;
  RAISE NOTICE 'PASS: CANCEL_NORMAL_IDEMPOTENT';
  RAISE NOTICE 'PASS: normal unpaid cancel restores stock once and is idempotent';

  SELECT stock INTO v_sku_before FROM public.product_skus WHERE id = v_sku_id;
  SELECT stock INTO v_parent_before FROM public.products WHERE id = v_sku_product_id;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_sku_product_id, 1, 'sku-cancel@example.invalid', 'SKU Cancel',
    null, 'sku cancel inventory release', '{}'::jsonb, v_sku_id, 'balance',
    'sku-cancel-' || gen_random_uuid()::text
  );
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-sku-cancel');
  IF (SELECT stock FROM public.product_skus WHERE id = v_sku_id) <> v_sku_before THEN
    RAISE EXCEPTION 'SKU unpaid cancel did not restore SKU stock exactly once';
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_sku_product_id) <> v_parent_before THEN
    RAISE EXCEPTION 'SKU unpaid cancel incorrectly changed parent product stock';
  END IF;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-sku-cancel-repeat');
  IF coalesce(v_result->>'code', '') NOT IN ('ALREADY_CANCELLED', 'STATE_CHANGED') THEN
    RAISE EXCEPTION 'repeated SKU cancel returned unexpected result: %', v_result;
  END IF;
  IF (SELECT stock FROM public.product_skus WHERE id = v_sku_id) <> v_sku_before THEN
    RAISE EXCEPTION 'repeated SKU cancel changed SKU stock';
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_sku_product_id) <> v_parent_before THEN
    RAISE EXCEPTION 'repeated SKU cancel changed parent product stock';
  END IF;
  RAISE NOTICE 'PASS: CANCEL_SKU_IDEMPOTENT';
  RAISE NOTICE 'PASS: SKU unpaid cancel restores SKU stock once and is idempotent';

  SELECT count(*) INTO v_available_before
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id AND sku_id IS NULL AND status = 'available';
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_digital_product_id, 1, 'digital-cancel@example.invalid', 'Digital Cancel',
    null, 'digital cancel reservation release', '{}'::jsonb, null, 'balance',
    'digital-cancel-' || gen_random_uuid()::text
  );
  SELECT count(*) INTO v_reserved_after_create
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id
    AND sku_id IS NULL
    AND status = 'reserved'
    AND reserved_order_id = v_order.order_id;
  IF v_reserved_after_create <> 1 THEN
    RAISE EXCEPTION 'digital order creation did not reserve exactly one inventory row';
  END IF;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-digital-cancel');
  SELECT count(*) INTO v_available_after_cancel
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id AND sku_id IS NULL AND status = 'available';
  IF v_available_after_cancel <> v_available_before THEN
    RAISE EXCEPTION 'digital cancel did not restore available inventory exactly once';
  END IF;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-digital-cancel-repeat');
  IF coalesce(v_result->>'code', '') NOT IN ('ALREADY_CANCELLED', 'STATE_CHANGED') THEN
    RAISE EXCEPTION 'repeated digital cancel returned unexpected result: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.digital_inventory WHERE product_id = v_digital_product_id AND sku_id IS NULL AND status = 'available') <> v_available_before THEN
    RAISE EXCEPTION 'repeated digital cancel changed available inventory count';
  END IF;
  RAISE NOTICE 'PASS: CANCEL_DIGITAL_IDEMPOTENT';
  RAISE NOTICE 'PASS: digital unpaid cancel releases reserved inventory';

  SELECT stock INTO v_before FROM public.products WHERE id = v_normal_product_id;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_normal_product_id, 1, 'expire-test@example.invalid', 'Expire Test',
    null, 'normal expiration inventory release', '{}'::jsonb, null, 'balance',
    'normal-expire-' || gen_random_uuid()::text
  );
  v_result := public.expire_unpaid_order(v_order.order_id, 'verification-not-due');
  IF v_result->>'code' <> 'NOT_DUE' THEN
    RAISE EXCEPTION 'not-due expiration returned unexpected result: expected NOT_DUE, actual %', v_result;
  END IF;
  UPDATE public.orders SET payment_expires_at = now() - interval '1 minute' WHERE id = v_order.order_id;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_test_admin_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_admin_id::text, true);
  v_result := public.expire_unpaid_order(v_order.order_id, 'verification-expire');
  IF v_result->>'code' <> 'EXPIRED' THEN
    RAISE EXCEPTION 'due expiration returned unexpected result: expected EXPIRED, actual %', v_result;
  END IF;
  IF (SELECT status FROM public.orders WHERE id = v_order.order_id) <> 'expired' THEN
    RAISE EXCEPTION 'due expiration did not set order status to expired';
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_normal_product_id) <> v_before THEN
    RAISE EXCEPTION 'normal expiration did not restore stock exactly once';
  END IF;
  v_result := public.expire_unpaid_order(v_order.order_id, 'verification-expire-repeat');
  IF coalesce(v_result->>'code', '') NOT IN ('ALREADY_EXPIRED', 'STATE_CHANGED') THEN
    RAISE EXCEPTION 'repeated expiration returned unexpected result: %', v_result;
  END IF;
  IF (SELECT stock FROM public.products WHERE id = v_normal_product_id) <> v_before THEN
    RAISE EXCEPTION 'repeated expiration changed stock';
  END IF;
  RAISE NOTICE 'PASS: EXPIRE_ORDER_IDEMPOTENT';
  RAISE NOTICE 'PASS: normal expiration restores stock once and is idempotent';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_test_user_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_user_id::text, true);
  SELECT count(*) INTO v_available_before
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id AND sku_id IS NULL AND status = 'available';
  v_request_id := 'digital-pay-' || gen_random_uuid()::text;
  SELECT * INTO v_order
  FROM public.create_order_with_item(
    v_digital_product_id, 1, 'digital-pay@example.invalid', 'Digital Pay',
    null, 'digital payment delivery', '{}'::jsonb, null, 'balance',
    v_request_id
  );
  SELECT * INTO v_order_row FROM public.orders WHERE id = v_order.order_id;
  IF NOT EXISTS (
    SELECT 1
    FROM public.digital_inventory
    WHERE product_id = v_digital_product_id
      AND status = 'reserved'
      AND reserved_order_id = v_order.order_id
      AND reserved_order_item_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'digital paid test order did not reserve inventory with order and item';
  END IF;
  SELECT count(*) INTO v_reserved_after_create
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id
    AND sku_id IS NULL
    AND status = 'reserved'
    AND reserved_order_id = v_order.order_id
    AND reserved_order_item_id IS NOT NULL;
  IF v_reserved_after_create <> 1 THEN
    RAISE EXCEPTION 'digital order reserved unexpected inventory count: expected 1, actual %', v_reserved_after_create;
  END IF;
  SELECT * INTO v_repeat_order
  FROM public.create_order_with_item(
    v_digital_product_id, 1, 'digital-pay@example.invalid', 'Digital Pay',
    null, 'digital payment delivery retry', '{}'::jsonb, null, 'balance',
    v_request_id
  );
  IF v_repeat_order.order_id IS DISTINCT FROM v_order.order_id
     OR (SELECT count(*) FROM public.order_items WHERE order_id = v_order.order_id) <> 1
     OR (SELECT count(*) FROM public.digital_inventory WHERE reserved_order_id = v_order.order_id AND status = 'reserved') <> 1 THEN
    RAISE EXCEPTION 'digital client_request_id replay duplicated order, item, or reservation';
  END IF;
  RAISE NOTICE 'PASS: DIGITAL_ORDER_CREATED';
  RAISE NOTICE 'PASS: DIGITAL_INVENTORY_RESERVED';
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_test_admin_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_admin_id::text, true);
  v_session_no := 'digital-session-' || gen_random_uuid()::text;
  v_trade_no := 'digital-trade-' || gen_random_uuid()::text;
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now());
  RAISE NOTICE 'PASS: DIGITAL_PAYMENT_COMPLETED';
  SELECT count(*) INTO v_payment_count FROM public.order_payments WHERE order_id = v_order.order_id AND status = 'paid';
  v_result := public.complete_order_payment(v_order.order_id, v_session_no, 'balance', v_trade_no, v_order_row.total_amount, v_order_row.currency, now() + interval '1 minute');
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.order_payments WHERE order_id = v_order.order_id AND status = 'paid') <> v_payment_count THEN
    RAISE EXCEPTION 'digital repeated payment was not idempotent: %', v_result;
  END IF;
  RAISE NOTICE 'PASS: DIGITAL_PAYMENT_REPEAT_IDEMPOTENT';
  v_result := public.deliver_digital_order(v_order.order_id, 'verification');
  SELECT count(*) INTO v_delivered_after
  FROM public.digital_inventory
  WHERE product_id = v_digital_product_id
    AND status = 'delivered'
    AND delivered_order_id = v_order.order_id;
  IF v_delivered_after <> 1 THEN
    RAISE EXCEPTION 'digital delivery did not mark exactly one inventory row delivered';
  END IF;
  SELECT count(*) INTO v_delivery_count
  FROM public.order_deliveries
  WHERE order_id = v_order.order_id AND delivery_status = 'delivered';
  SELECT count(*) INTO v_secret_count
  FROM public.digital_delivery_secrets ds
  JOIN public.order_deliveries od ON od.id = ds.delivery_id
  WHERE od.order_id = v_order.order_id AND od.delivery_status = 'delivered';
  IF v_delivery_count <> 1 OR v_secret_count <> 1 THEN
    RAISE EXCEPTION 'digital delivery expected one delivery and one secret, got deliveries %, secrets %', v_delivery_count, v_secret_count;
  END IF;
  RAISE NOTICE 'PASS: DIGITAL_DELIVERY_COMPLETED';
  v_result := public.deliver_digital_order(v_order.order_id, 'verification-repeat');
  IF (SELECT count(*) FROM public.order_deliveries WHERE order_id = v_order.order_id AND delivery_status = 'delivered') <> v_delivery_count THEN
    RAISE EXCEPTION 'repeated digital delivery created duplicate delivered delivery';
  END IF;
  IF (SELECT count(*) FROM public.digital_delivery_secrets ds JOIN public.order_deliveries od ON od.id = ds.delivery_id WHERE od.order_id = v_order.order_id AND od.delivery_status = 'delivered') <> v_secret_count THEN
    RAISE EXCEPTION 'repeated digital delivery created duplicate secret';
  END IF;
  v_result := public.cancel_unpaid_order(v_order.order_id, 'verification-delivered-cancel-block');
  IF v_result->>'code' <> 'ORDER_NOT_CANCELLABLE'
     OR (SELECT count(*) FROM public.digital_inventory WHERE delivered_order_id = v_order.order_id AND status = 'delivered') <> v_delivered_after THEN
    RAISE EXCEPTION 'delivered digital inventory was restored or cancel result was unsafe: %', v_result;
  END IF;
  RAISE NOTICE 'PASS: DIGITAL_DELIVERY_REPEAT_IDEMPOTENT';
  RAISE NOTICE 'PASS: digital reservation, payment, delivery, and repeated delivery are idempotent';

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_test_admin_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_test_admin_id::text, true);
  FOREACH v_status_input IN ARRAY array['paid', 'PAID', ' paid ', 'payment_completed', 'completed_payment'] LOOP
    v_blocked := false;
    BEGIN
      PERFORM public.admin_update_order_status(v_order.order_id, v_status_input, null, 'verification paid block');
    EXCEPTION WHEN OTHERS THEN
      v_blocked := sqlerrm like '%ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW%' OR sqlerrm like '%invalid order status%';
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'admin_update_order_status did not block direct paid status input: %', v_status_input;
    END IF;
  END LOOP;
  v_blocked := false;
  BEGIN
    PERFORM public.admin_update_order_status(v_order.order_id, 'processing', 'paid', 'verification payment_status paid block');
  EXCEPTION WHEN OTHERS THEN
    v_blocked := sqlerrm like '%ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW%';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'admin_update_order_status did not block payment_status = paid';
  END IF;
  RAISE NOTICE 'PASS: ADMIN_PAID_BYPASS_BLOCKED';
  RAISE NOTICE 'PASS: admin_update_order_status blocks direct paid transitions and payment_status paid';

  RAISE NOTICE 'PASS: ALL_ORDER_PAYMENT_INVENTORY_CHECKS_PASSED';
  RAISE NOTICE 'PASS: order payment inventory verification completed';
END $$;

ROLLBACK;

-- After the transaction reports success, this read-only residue check should return 0 rows:
-- select id, name, slug
-- from public.products
-- where name ilike '%verification%'
--    or slug ilike '%verification%';
