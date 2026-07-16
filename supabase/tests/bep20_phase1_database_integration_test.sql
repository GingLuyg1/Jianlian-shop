-- Jianlian Shop BEP20 phase 1 database integration checks.
--
-- Run this whole file only in the Jianlian-shop-test Supabase project.
-- It is a single DO statement so Supabase SQL Editor does not need to preserve
-- temporary tables, pg_temp functions, or an explicit multi-statement transaction.
--
-- On failure, the uncaught exception rolls back the whole DO statement.
-- On success, the script deletes only the rows created from local UUID variables.
--
-- This file does not call any external RPC endpoint or blockchain provider.

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_category_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_order_2_id uuid := gen_random_uuid();
  v_order_reject_id uuid := gen_random_uuid();
  v_order_approve_id uuid := gen_random_uuid();
  v_order_approved_then_reject_id uuid := gen_random_uuid();
  v_payment_id uuid := gen_random_uuid();
  v_payment_2_id uuid := gen_random_uuid();
  v_payment_reject_id uuid := gen_random_uuid();
  v_payment_approve_id uuid := gen_random_uuid();
  v_payment_approved_then_reject_id uuid := gen_random_uuid();
  v_chain_session_id uuid := gen_random_uuid();
  v_chain_session_2_id uuid := gen_random_uuid();
  v_chain_session_reject_id uuid := gen_random_uuid();
  v_chain_session_approve_id uuid := gen_random_uuid();
  v_chain_session_approved_then_reject_id uuid := gen_random_uuid();
  v_tx_hash text := '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  v_tx_hash_reject text := '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  v_token_contract text := '0x55d398326f99059ff775485246999027b3197955';
  v_receive_address text := '0x1111111111111111111111111111111111111111';
  v_from_address text := '0x2222222222222222222222222222222222222222';
  v_claim jsonb;
  v_prepare jsonb;
  v_finish jsonb;
  v_attempt_id uuid;
  v_second_attempt_id uuid;
  v_decision jsonb;
  v_order_payment_count integer;
  v_delivery_count integer;
  v_index_predicate text;
  v_index_statuses text[];
  v_index_status_token_count integer;
  v_index_status_distinct_count integer;
  v_expected_active_statuses text[] := array[
    'confirming',
    'completing',
    'manual_review',
    'payment_failed',
    'submitted',
    'underpaid',
    'verified',
    'waiting_payment'
  ];
  v_test_orders uuid[] := array[
    v_order_id,
    v_order_2_id,
    v_order_reject_id,
    v_order_approve_id,
    v_order_approved_then_reject_id
  ];
  v_test_payments uuid[] := array[
    v_payment_id,
    v_payment_2_id,
    v_payment_reject_id,
    v_payment_approve_id,
    v_payment_approved_then_reject_id
  ];
  v_test_chain_sessions uuid[] := array[
    v_chain_session_id,
    v_chain_session_2_id,
    v_chain_session_reject_id,
    v_chain_session_approve_id,
    v_chain_session_approved_then_reject_id
  ];
begin
  perform set_config('statement_timeout', '30s', true);
  perform set_config('lock_timeout', '5s', true);

  if to_regprocedure('public.normalize_order_item_delivery_type(text)') is null then
    raise exception 'BEP20 phase1 database integration test failed [00_preflight_normalize_order_item_delivery_type_exists]: complete_order_payment depends on public.normalize_order_item_delivery_type(text); execute supabase/migrations/20260703_digital_delivery_atomic_hardening.sql or supabase/migrations/20260623_mixed_order_item_fulfillment.sql in the test database before this BEP20 integration test';
  end if;
  raise notice 'PASS: 00_preflight_normalize_order_item_delivery_type_exists';

  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'bep20-db-test-' || replace(v_user_id::text, '-', '') || '@example.test', '', now(), now(), now()),
    (v_admin_id, 'authenticated', 'authenticated', 'bep20-db-test-admin-' || replace(v_admin_id::text, '-', '') || '@example.test', '', now(), now(), now());

  -- auth.users may fire on_auth_user_created and create profiles automatically.
  -- Upsert here so the test remains compatible with that trigger while still
  -- forcing the intended user/admin roles for the RPC permission checks.
  insert into public.profiles(id, email, role, balance)
  values
    (v_user_id, 'bep20-db-test-' || replace(v_user_id::text, '-', '') || '@example.test', 'user', 0),
    (v_admin_id, 'bep20-db-test-admin-' || replace(v_admin_id::text, '-', '') || '@example.test', 'admin', 0)
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        balance = excluded.balance,
        updated_at = now();

  if not (
    exists (select 1 from public.profiles where id = v_user_id and role = 'user')
    and exists (select 1 from public.profiles where id = v_admin_id and role = 'admin')
  ) then
    raise exception 'BEP20 phase1 database integration test failed [00_profiles_created_or_updated_with_expected_roles]: auth trigger compatible profile upsert must leave user role=user and admin role=admin';
  end if;
  raise notice 'PASS: 00_profiles_created_or_updated_with_expected_roles';

  insert into public.categories(id, name, slug, level, status, sort_order)
  values (v_category_id, 'BEP20 DB Test Category', 'bep20-db-test-' || replace(v_category_id::text, '-', ''), 1, 'active', 9999);

  insert into public.products(
    id, category_id, name, slug, short_description, description, image_url,
    price, stock, delivery_type, status, sort_order
  )
  values (
    v_product_id,
    v_category_id,
    'BEP20 DB Test Product',
    'bep20-db-test-product-' || replace(v_product_id::text, '-', ''),
    'BEP20 database integration test product',
    'Only used inside a rollback-only SQL integration test.',
    '/placeholder.svg',
    69,
    100,
    'automatic',
    'active',
    9999
  );

  insert into public.orders(
    id, order_no, user_id, status, payment_status, payment_method,
    subtotal, discount_amount, total_amount, currency,
    customer_email, delivery_type
  )
  values
    (v_order_id, 'BEP20DB-' || replace(v_order_id::text, '-', ''), v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 69, 0, 69, 'CNY', 'bep20-db-test@example.test', 'automatic'),
    (v_order_2_id, 'BEP20DB-' || replace(v_order_2_id::text, '-', ''), v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 69, 0, 69, 'CNY', 'bep20-db-test@example.test', 'automatic'),
    (v_order_reject_id, 'BEP20DB-' || replace(v_order_reject_id::text, '-', ''), v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 69, 0, 69, 'CNY', 'bep20-db-test@example.test', 'automatic'),
    (v_order_approve_id, 'BEP20DB-' || replace(v_order_approve_id::text, '-', ''), v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 69, 0, 69, 'CNY', 'bep20-db-test@example.test', 'automatic'),
    (v_order_approved_then_reject_id, 'BEP20DB-' || replace(v_order_approved_then_reject_id::text, '-', ''), v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 69, 0, 69, 'CNY', 'bep20-db-test@example.test', 'automatic');

  insert into public.order_items(order_id, product_id, product_name, product_slug, product_image_url, unit_price, quantity, line_total, delivery_type, product_snapshot)
  select id, v_product_id, 'BEP20 DB Test Product', 'bep20-db-test-product-' || replace(v_product_id::text, '-', ''), '/placeholder.svg', 69, 1, 69, 'automatic',
         jsonb_build_object('source', 'bep20_phase1_database_integration_test')
  from public.orders
  where id = any(v_test_orders);

  insert into public.payment_sessions(
    id, session_no, business_type, business_id, business_no, user_id,
    channel_code, provider, currency, network,
    requested_amount, fee_amount, payable_amount,
    status, payment_type, expires_at, metadata
  )
  values
    (v_payment_id, 'BEP20DBPS-' || replace(v_payment_id::text, '-', ''), 'order', v_order_id, 'BEP20DB-' || replace(v_order_id::text, '-', ''), v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 69, 0, 9.583334, 'processing', 'address', now() + interval '30 minutes', '{"test":"bep20_phase1"}'::jsonb),
    (v_payment_2_id, 'BEP20DBPS-' || replace(v_payment_2_id::text, '-', ''), 'order', v_order_2_id, 'BEP20DB-' || replace(v_order_2_id::text, '-', ''), v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 69, 0, 9.583334, 'processing', 'address', now() + interval '30 minutes', '{"test":"bep20_phase1"}'::jsonb),
    (v_payment_reject_id, 'BEP20DBPS-' || replace(v_payment_reject_id::text, '-', ''), 'order', v_order_reject_id, 'BEP20DB-' || replace(v_order_reject_id::text, '-', ''), v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 69, 0, 9.583334, 'processing', 'address', now() + interval '30 minutes', '{"test":"bep20_phase1"}'::jsonb),
    (v_payment_approve_id, 'BEP20DBPS-' || replace(v_payment_approve_id::text, '-', ''), 'order', v_order_approve_id, 'BEP20DB-' || replace(v_order_approve_id::text, '-', ''), v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 69, 0, 9.583334, 'processing', 'address', now() + interval '30 minutes', '{"test":"bep20_phase1"}'::jsonb),
    (v_payment_approved_then_reject_id, 'BEP20DBPS-' || replace(v_payment_approved_then_reject_id::text, '-', ''), 'order', v_order_approved_then_reject_id, 'BEP20DB-' || replace(v_order_approved_then_reject_id::text, '-', ''), v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 69, 0, 9.583334, 'processing', 'address', now() + interval '30 minutes', '{"test":"bep20_phase1"}'::jsonb);

  insert into public.chain_payment_sessions(
    id, order_id, payment_id, payment_method, network, chain_id, asset,
    token_contract, token_decimals, expected_amount, expected_raw_amount,
    receive_address, status, expires_at,
    order_currency, order_amount, payment_currency,
    exchange_rate, exchange_rate_source, exchange_rate_fetched_at, exchange_rate_expires_at,
    pricing_status
  )
  values
    (v_chain_session_id, v_order_id, v_payment_id, 'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 9.583334, 9583334000000000000, v_receive_address, 'waiting_payment', now() + interval '30 minutes', 'CNY', 69, 'USDT', 7.2, 'manual_fixed_rate', now(), now() + interval '10 minutes', 'frozen'),
    (v_chain_session_2_id, v_order_2_id, v_payment_2_id, 'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 9.583334, 9583334000000000000, v_receive_address, 'waiting_payment', now() + interval '30 minutes', 'CNY', 69, 'USDT', 7.2, 'manual_fixed_rate', now(), now() + interval '10 minutes', 'frozen'),
    (v_chain_session_reject_id, v_order_reject_id, v_payment_reject_id, 'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 9.583334, 9583334000000000000, v_receive_address, 'manual_review', now() + interval '30 minutes', 'CNY', 69, 'USDT', 7.2, 'manual_fixed_rate', now(), now() + interval '10 minutes', 'frozen'),
    (v_chain_session_approve_id, v_order_approve_id, v_payment_approve_id, 'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 9.583334, 9583334000000000000, v_receive_address, 'manual_review', now() + interval '30 minutes', 'CNY', 69, 'USDT', 7.2, 'manual_fixed_rate', now(), now() + interval '10 minutes', 'frozen'),
    (v_chain_session_approved_then_reject_id, v_order_approved_then_reject_id, v_payment_approved_then_reject_id, 'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 9.583334, 9583334000000000000, v_receive_address, 'manual_review', now() + interval '30 minutes', 'CNY', 69, 'USDT', 7.2, 'manual_fixed_rate', now(), now() + interval '10 minutes', 'frozen');

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  if not exists (
    select 1 from public.orders
    where id = v_order_id
      and total_amount = 69
      and currency = 'CNY'
  ) then
    raise exception 'BEP20 phase1 database integration test failed [01_minimal_order_original_amount_is_69_cny]: order total_amount/currency must remain 69 CNY';
  end if;
  raise notice 'PASS: 01_minimal_order_original_amount_is_69_cny';

  if not exists (
    select 1 from public.chain_payment_sessions
    where id = v_chain_session_id
      and order_amount = 69
      and order_currency = 'CNY'
      and expected_amount = 9.583334
      and payment_currency = 'USDT'
      and expected_raw_amount = 9583334000000000000
  ) then
    raise exception 'BEP20 phase1 database integration test failed [02_chain_session_payable_amount_is_9583334_usdt]: chain session must freeze 9.583334 USDT while preserving 69 CNY order snapshot';
  end if;
  raise notice 'PASS: 02_chain_session_payable_amount_is_9583334_usdt';

  v_claim := public.claim_bep20_chain_transaction(
    v_chain_session_id, v_order_id, 56, v_tx_hash, 0, 12345678, '0x' || repeat('1', 64),
    now() - interval '1 minute', v_token_contract, v_from_address, v_receive_address,
    9583334000000000000, 9.583334, 12, 'verified'
  );
  if v_claim->>'result' <> 'claimed' then
    raise exception 'BEP20 phase1 database integration test failed [03_first_txhash_claim_succeeds]: %', v_claim::text;
  end if;
  raise notice 'PASS: 03_first_txhash_claim_succeeds';

  v_claim := public.claim_bep20_chain_transaction(
    v_chain_session_id, v_order_id, 56, v_tx_hash, 0, 12345678, '0x' || repeat('1', 64),
    now() - interval '1 minute', v_token_contract, v_from_address, v_receive_address,
    9583334000000000000, 9.583334, 12, 'verified'
  );
  if v_claim->>'result' <> 'already_claimed_by_same_order' then
    raise exception 'BEP20 phase1 database integration test failed [04_same_order_repeated_claim_is_idempotent]: %', v_claim::text;
  end if;
  raise notice 'PASS: 04_same_order_repeated_claim_is_idempotent';

  v_claim := public.claim_bep20_chain_transaction(
    v_chain_session_2_id, v_order_2_id, 56, v_tx_hash, 0, 12345678, '0x' || repeat('1', 64),
    now() - interval '1 minute', v_token_contract, v_from_address, v_receive_address,
    9583334000000000000, 9.583334, 12, 'verified'
  );
  if v_claim->>'result' <> 'claimed_by_other_order' then
    raise exception 'BEP20 phase1 database integration test failed [05_other_order_same_txhash_is_rejected]: %', v_claim::text;
  end if;
  raise notice 'PASS: 05_other_order_same_txhash_is_rejected';

  if not exists (
    select 1
    from public.chain_transaction_claims c
    join public.chain_transactions t
      on t.chain_id = c.chain_id and t.tx_hash = c.tx_hash
    where c.chain_id = 56
      and c.tx_hash = v_tx_hash
      and c.order_id = v_order_id
      and t.order_id = c.order_id
  ) then
    raise exception 'BEP20 phase1 database integration test failed [06_claim_table_and_transaction_table_order_match]: chain_transaction_claims and chain_transactions must agree on order_id';
  end if;
  raise notice 'PASS: 06_claim_table_and_transaction_table_order_match';

  update public.chain_payment_sessions
  set status = 'verified',
      submitted_tx_hash = v_tx_hash,
      confirmed_amount = 9.583334,
      confirmed_raw_amount = 9583334000000000000,
      confirmed_at = now()
  where id = v_chain_session_id;

  v_prepare := public.prepare_bep20_payment_completion(v_chain_session_id, v_tx_hash, 9.583334, 9583334000000000000, false, null);
  v_attempt_id := nullif(v_prepare->>'attempt_id', '')::uuid;
  if not (v_prepare->>'result' = 'acquired' and v_attempt_id is not null) then
    raise exception 'BEP20 phase1 database integration test failed [07_first_prepare_completion_acquires_lock]: %', v_prepare::text;
  end if;
  raise notice 'PASS: 07_first_prepare_completion_acquires_lock';

  v_prepare := public.prepare_bep20_payment_completion(v_chain_session_id, v_tx_hash, 9.583334, 9583334000000000000, false, null);
  if v_prepare->>'result' not in ('already_completing', 'already_paid') then
    raise exception 'BEP20 phase1 database integration test failed [08_second_prepare_does_not_get_new_lock]: %', v_prepare::text;
  end if;
  raise notice 'PASS: 08_second_prepare_does_not_get_new_lock';

  v_finish := public.finish_bep20_payment_completion(v_chain_session_id, gen_random_uuid(), 'paid', null, null);
  if v_finish->>'result' <> 'stale_attempt' then
    raise exception 'BEP20 phase1 database integration test failed [09_wrong_attempt_cannot_finish]: %', v_finish::text;
  end if;
  raise notice 'PASS: 09_wrong_attempt_cannot_finish';

  v_finish := public.finish_bep20_payment_completion(v_chain_session_id, v_attempt_id, 'payment_failed', 'intentional test failure before retry', null);
  if v_finish->>'result' <> 'payment_failed' then
    raise exception 'BEP20 phase1 database integration test failed [10_correct_attempt_can_mark_payment_failed]: %', v_finish::text;
  end if;
  raise notice 'PASS: 10_correct_attempt_can_mark_payment_failed';

  v_prepare := public.prepare_bep20_payment_completion(v_chain_session_id, v_tx_hash, 9.583334, 9583334000000000000, true, null);
  v_second_attempt_id := nullif(v_prepare->>'attempt_id', '')::uuid;
  if not (v_prepare->>'result' = 'acquired' and v_second_attempt_id is not null and v_second_attempt_id <> v_attempt_id) then
    raise exception 'BEP20 phase1 database integration test failed [11_payment_failed_can_be_safely_retried]: %', v_prepare::text;
  end if;
  raise notice 'PASS: 11_payment_failed_can_be_safely_retried';

  v_finish := public.finish_bep20_payment_completion(v_chain_session_id, v_second_attempt_id, 'paid', null, null);
  if v_finish->>'result' <> 'paid' then
    raise exception 'BEP20 phase1 database integration test failed [12_correct_retry_attempt_can_mark_paid]: %', v_finish::text;
  end if;
  raise notice 'PASS: 12_correct_retry_attempt_can_mark_paid';

  perform public.complete_payment_session(v_payment_id, v_tx_hash, 9.583334, 'USDT', now());
  perform public.complete_payment_session(v_payment_id, v_tx_hash, 9.583334, 'USDT', now());

  select count(*) into v_order_payment_count
  from public.order_payments
  where order_id = v_order_id
    and payment_no = 'AUTO-' || (select session_no from public.payment_sessions where id = v_payment_id);

  if v_order_payment_count <> 1 then
    raise exception 'BEP20 phase1 database integration test failed [13_complete_payment_session_is_idempotent_for_order_payment_row]: expected exactly one AUTO order_payments row after repeated complete_payment_session calls, got %', v_order_payment_count;
  end if;
  raise notice 'PASS: 13_complete_payment_session_is_idempotent_for_order_payment_row';

  if not exists (
    select 1
    from public.order_payments
    where order_id = v_order_id
      and amount = 69
      and currency = 'CNY'
      and order_amount = 69
      and order_currency = 'CNY'
      and received_amount = 9.583334
      and received_currency = 'USDT'
  ) then
    raise exception 'BEP20 phase1 database integration test failed [14_order_payment_records_cny_order_and_usdt_receipt]: order_payments must preserve order amount/currency and received amount/currency separately';
  end if;
  raise notice 'PASS: 14_order_payment_records_cny_order_and_usdt_receipt';

  select count(*) into v_delivery_count
  from public.order_deliveries
  where order_id = v_order_id;

  if v_delivery_count > 1 then
    raise exception 'BEP20 phase1 database integration test failed [15_no_duplicate_delivery_records_created_by_repeated_payment_completion]: database payment completion must not create duplicate order_deliveries rows, got %', v_delivery_count;
  end if;
  raise notice 'PASS: 15_no_duplicate_delivery_records_created_by_repeated_payment_completion';

  v_claim := public.claim_bep20_chain_transaction(
    v_chain_session_reject_id, v_order_reject_id, 56, v_tx_hash_reject, 0, 12345679, '0x' || repeat('2', 64),
    now() - interval '1 minute', v_token_contract, v_from_address, v_receive_address,
    9583334000000000000, 9.583334, 12, 'verified'
  );
  if v_claim->>'result' <> 'claimed' then
    raise exception 'BEP20 phase1 database integration test failed [16_manual_review_reject_txhash_claim_succeeds]: %', v_claim::text;
  end if;
  raise notice 'PASS: 16_manual_review_reject_txhash_claim_succeeds';

  v_decision := public.decide_bep20_manual_review(v_chain_session_approve_id, v_admin_id, 'approved', 'SQL integration approve check');
  if v_decision->>'result' <> 'approved' then
    raise exception 'BEP20 phase1 database integration test failed [17_manual_review_approve_succeeds]: %', v_decision::text;
  end if;
  raise notice 'PASS: 17_manual_review_approve_succeeds';

  v_decision := public.decide_bep20_manual_review(v_chain_session_reject_id, v_admin_id, 'rejected', 'SQL integration reject check');
  if v_decision->>'result' <> 'rejected' then
    raise exception 'BEP20 phase1 database integration test failed [18_manual_review_reject_succeeds]: %', v_decision::text;
  end if;
  raise notice 'PASS: 18_manual_review_reject_succeeds';

  v_decision := public.decide_bep20_manual_review(v_chain_session_reject_id, v_admin_id, 'approved', 'SQL integration approve after reject must fail');
  if v_decision->>'result' <> 'already_rejected' then
    raise exception 'BEP20 phase1 database integration test failed [19_reject_then_approve_is_rejected]: %', v_decision::text;
  end if;
  raise notice 'PASS: 19_reject_then_approve_is_rejected';

  v_decision := public.decide_bep20_manual_review(v_chain_session_reject_id, v_admin_id, 'rejected', 'SQL integration duplicate reject');
  if v_decision->>'result' <> 'already_rejected' then
    raise exception 'BEP20 phase1 database integration test failed [20_duplicate_reject_is_idempotent]: %', v_decision::text;
  end if;
  raise notice 'PASS: 20_duplicate_reject_is_idempotent';

  v_decision := public.decide_bep20_manual_review(v_chain_session_approve_id, v_admin_id, 'approved', 'SQL integration duplicate approve');
  if v_decision->>'result' <> 'already_approved' then
    raise exception 'BEP20 phase1 database integration test failed [21_duplicate_approve_is_idempotent]: %', v_decision::text;
  end if;
  raise notice 'PASS: 21_duplicate_approve_is_idempotent';

  v_decision := public.decide_bep20_manual_review(v_chain_session_approved_then_reject_id, v_admin_id, 'approved', 'SQL integration approve before reject');
  if v_decision->>'result' <> 'approved' then
    raise exception 'BEP20 phase1 database integration test failed [22_approve_before_reject_succeeds]: %', v_decision::text;
  end if;
  raise notice 'PASS: 22_approve_before_reject_succeeds';

  v_decision := public.decide_bep20_manual_review(v_chain_session_approved_then_reject_id, v_admin_id, 'rejected', 'SQL integration reject after approve must fail');
  if v_decision->>'result' <> 'already_approved' then
    raise exception 'BEP20 phase1 database integration test failed [23_approve_then_reject_is_rejected]: %', v_decision::text;
  end if;
  raise notice 'PASS: 23_approve_then_reject_is_rejected';

  v_claim := public.claim_bep20_chain_transaction(
    v_chain_session_2_id, v_order_2_id, 56, v_tx_hash_reject, 0, 12345679, '0x' || repeat('2', 64),
    now() - interval '1 minute', v_token_contract, v_from_address, v_receive_address,
    9583334000000000000, 9.583334, 12, 'verified'
  );
  if v_claim->>'result' <> 'claimed_by_other_order' then
    raise exception 'BEP20 phase1 database integration test failed [24_rejected_txhash_claim_is_not_released_to_other_order]: %', v_claim::text;
  end if;
  raise notice 'PASS: 24_rejected_txhash_claim_is_not_released_to_other_order';

  if has_function_privilege(
    'anon',
    'public.claim_bep20_chain_transaction(uuid,uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer,text)',
    'execute'
  ) then
    raise exception 'BEP20 phase1 database integration test failed [25_anon_has_no_claim_rpc_execute]: anon must not execute claim_bep20_chain_transaction';
  end if;
  raise notice 'PASS: 25_anon_has_no_claim_rpc_execute';

  if has_function_privilege(
    'authenticated',
    'public.claim_bep20_chain_transaction(uuid,uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer,text)',
    'execute'
  ) then
    raise exception 'BEP20 phase1 database integration test failed [26_authenticated_has_no_claim_rpc_execute]: authenticated must not execute claim_bep20_chain_transaction';
  end if;
  raise notice 'PASS: 26_authenticated_has_no_claim_rpc_execute';

  if has_function_privilege(
      'authenticated',
      'public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.finish_bep20_payment_completion(uuid,uuid,text,text,uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.decide_bep20_manual_review(uuid,uuid,text,text)',
      'execute'
    ) then
    raise exception 'BEP20 phase1 database integration test failed [27_authenticated_has_no_completion_rpc_execute]: authenticated must not execute completion or manual review RPCs';
  end if;
  raise notice 'PASS: 27_authenticated_has_no_completion_rpc_execute';

  if not (
    select bool_and(c.relrowsecurity)
    from pg_class c
    where c.oid in (
      'public.chain_payment_sessions'::regclass,
      'public.chain_transactions'::regclass,
      'public.chain_transaction_claims'::regclass
    )
  ) then
    raise exception 'BEP20 phase1 database integration test failed [28_bep20_tables_have_rls_enabled]: chain_payment_sessions, chain_transactions and chain_transaction_claims must have RLS enabled';
  end if;
  raise notice 'PASS: 28_bep20_tables_have_rls_enabled';

  select pg_get_expr(i.indpred, i.indrelid)
  into v_index_predicate
  from pg_class idx
  join pg_index i on i.indexrelid = idx.oid
  where idx.relname = 'chain_payment_sessions_active_order_unique';

  select
    coalesce(array_agg(distinct status order by status), array[]::text[]),
    count(*),
    count(distinct status)
  into v_index_statuses, v_index_status_token_count, v_index_status_distinct_count
  from (
    select match[1] as status
    from regexp_matches(coalesce(v_index_predicate, ''), '''([^'']+)''', 'g') as match
  ) extracted;

  if not (
    v_index_statuses @> v_expected_active_statuses
    and v_expected_active_statuses @> v_index_statuses
    and v_index_status_token_count = v_index_status_distinct_count
    and v_index_status_distinct_count = cardinality(v_expected_active_statuses)
  ) then
    raise exception 'BEP20 phase1 database integration test failed [29_active_session_unique_index_status_set_matches_server_contract]: expected active statuses %; got %; token_count %; distinct_count %; predicate %',
      array_to_string(v_expected_active_statuses, ','),
      coalesce(array_to_string(v_index_statuses, ','), '<none>'),
      coalesce(v_index_status_token_count::text, '0'),
      coalesce(v_index_status_distinct_count::text, '0'),
      coalesce(v_index_predicate, 'missing index predicate');
  end if;
  raise notice 'PASS: 29_active_session_unique_index_status_set_matches_server_contract';

  raise notice 'PASS: 30_serial_sql_cannot_prove_real_concurrent_prepare - serial SQL verifies lock outcomes after the first prepare; true parallel contention still requires two independent database connections';
  raise notice 'PASS: 31_serial_sql_cannot_prove_real_concurrent_approve_reject - serial SQL verifies already_decided outcomes; true approve/reject race still requires two independent database connections';

  -- Success cleanup. Every predicate is scoped to local UUIDs or fixed test hashes
  -- created by this DO statement; no broad test-data cleanup is used.
  delete from public.order_deliveries where order_id = any(v_test_orders);
  delete from public.order_payments where order_id = any(v_test_orders);
  delete from public.chain_transaction_claims where tx_hash in (v_tx_hash, v_tx_hash_reject);
  delete from public.chain_transactions where tx_hash in (v_tx_hash, v_tx_hash_reject);
  delete from public.chain_payment_sessions where id = any(v_test_chain_sessions);
  delete from public.payment_sessions where id = any(v_test_payments);
  delete from public.order_items where order_id = any(v_test_orders);
  delete from public.orders where id = any(v_test_orders);
  delete from public.products where id = v_product_id;
  delete from public.categories where id = v_category_id;
  delete from public.profiles where id in (v_user_id, v_admin_id);
  delete from auth.users where id in (v_user_id, v_admin_id);

  raise notice 'PASS: BEP20 phase1 database integration test completed';
end;
$$;
