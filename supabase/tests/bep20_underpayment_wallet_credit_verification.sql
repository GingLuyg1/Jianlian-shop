-- Jianlian Shop BEP20 underpayment wallet-credit database verification.
--
-- SAFETY:
--   * Run only in an explicitly approved disposable test database.
--   * The guard below defaults to false and intentionally aborts execution.
--   * All fixtures use generated UUIDs and synthetic values.
--   * The outer transaction always ends with ROLLBACK.
--   * Do not run this file against production.

begin;

do $$
declare
  v_confirm_test_database boolean := false;
  v_user_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_other_order_id uuid := gen_random_uuid();
  v_category_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_order_item_id uuid;
  v_inventory_id uuid := gen_random_uuid();
  v_payment_session_id uuid := gen_random_uuid();
  v_order_payment_id uuid := gen_random_uuid();
  v_chain_session_id uuid := gen_random_uuid();
  v_manual_order_id uuid := gen_random_uuid();
  v_manual_order_item_id uuid;
  v_manual_inventory_id uuid := gen_random_uuid();
  v_manual_payment_session_id uuid := gen_random_uuid();
  v_manual_order_payment_id uuid := gen_random_uuid();
  v_manual_chain_session_id uuid := gen_random_uuid();
  v_tx_hash text := '0x' || repeat('a', 64);
  v_manual_tx_hash text := '0x' || repeat('c', 64);
  v_provider_reference text := ('0x' || repeat('a', 64)) || ':0';
  v_manual_provider_reference text := ('0x' || repeat('c', 64)) || ':1';
  v_token_contract text := '0x55d398326f99059ff775485246999027b3197955';
  v_receive_address text := '0x1111111111111111111111111111111111111111';
  v_from_address text := '0x2222222222222222222222222222222222222222';
  v_deadline timestamptz := now() + interval '30 minutes';
  v_manual_deadline timestamptz := now() + interval '30 minutes';
  v_result jsonb;
  v_candidates integer;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_manual_balance_before numeric(12,2);
  v_manual_balance_after numeric(12,2);
  v_automatic_request_id text := 'underpayment-auto-' || replace(gen_random_uuid()::text, '-', '');
  v_count integer;
  v_error text;
  v_sqlstate text;
  v_deadline_field text;
begin
  if not v_confirm_test_database then
    raise exception 'BEP20_UNDERPAYMENT_TEST_DATABASE_CONFIRMATION_REQUIRED';
  end if;

  perform set_config('statement_timeout', '60s', true);
  perform set_config('lock_timeout', '5s', true);

  if to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)') is null
     or to_regprocedure('public.list_expirable_bep20_underpayments(integer)') is null then
    raise exception 'BEP20_UNDERPAYMENT_TEST_MIGRATION_REQUIRED';
  end if;
  if to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)') is not null then
    raise exception 'BEP20_UNDERPAYMENT_TEST_LEGACY_FUNCTION_STILL_EXISTS';
  end if;

  -- Verify grants without impersonating an application role in the SQL editor.
  if has_function_privilege('anon', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)', 'EXECUTE') then
    raise exception 'BEP20_UNDERPAYMENT_TEST_FUNCTION_GRANTS_INVALID';
  end if;
  raise notice 'PASS 01: non-service roles have no RPC EXECUTE grant';

  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'underpayment-user-' || replace(v_user_id::text, '-', '') || '@example.test', '', now(), now(), now()),
    (v_admin_id, 'authenticated', 'authenticated', 'underpayment-admin-' || replace(v_admin_id::text, '-', '') || '@example.test', '', now(), now(), now());

  insert into public.profiles(id, email, role, balance)
  values
    (v_user_id, 'underpayment-user-' || replace(v_user_id::text, '-', '') || '@example.test', 'user', 10.00),
    (v_admin_id, 'underpayment-admin-' || replace(v_admin_id::text, '-', '') || '@example.test', 'admin', 0)
  on conflict (id) do update
    set role = excluded.role, balance = excluded.balance, updated_at = now();

  insert into public.admin_users(user_id, admin_level, status, permissions, reason)
  values (v_admin_id, 'super_admin', 'active', '{}'::jsonb, 'rollback-only underpayment verification');

  insert into public.categories(id, name, slug, level, status, sort_order)
  values (v_category_id, 'Underpayment Test Category', 'underpayment-test-' || replace(v_category_id::text, '-', ''), 1, 'active', 9999);

  insert into public.products(
    id, category_id, name, slug, short_description, description, image_url,
    price, stock, delivery_type, status, sort_order
  ) values (
    v_product_id, v_category_id, 'Underpayment Test Product',
    'underpayment-test-product-' || replace(v_product_id::text, '-', ''),
    'Rollback-only test product', 'Rollback-only test product', '/placeholder.svg',
    28.80, 1, 'automatic', 'active', 9999
  );

  insert into public.orders(
    id, order_no, user_id, status, payment_status, payment_method,
    subtotal, discount_amount, total_amount, currency, customer_email,
    delivery_type, payment_expires_at
  ) values
    (v_order_id, 'UNDERPAY-' || replace(v_order_id::text, '-', ''), v_user_id,
     'pending_payment', 'unpaid', 'usdt_bep20', 28.80, 0, 28.80, 'CNY',
     'underpayment-user@example.test', 'automatic', v_deadline),
    (v_other_order_id, 'UNDERPAY-' || replace(v_other_order_id::text, '-', ''), v_user_id,
     'pending_payment', 'unpaid', 'usdt_bep20', 28.80, 0, 28.80, 'CNY',
     'underpayment-user@example.test', 'automatic', v_deadline);

  insert into public.order_items(
    order_id, product_id, product_name, product_slug, product_image_url,
    unit_price, quantity, line_total, delivery_type, product_snapshot
  ) values (
    v_order_id, v_product_id, 'Underpayment Test Product',
    'underpayment-test-product-' || replace(v_product_id::text, '-', ''),
    '/placeholder.svg', 28.80, 1, 28.80, 'automatic',
    jsonb_build_object('source', 'bep20_underpayment_wallet_credit_verification')
  ) returning id into v_order_item_id;

  insert into public.digital_inventory(
    id, product_id, content, status, order_id, reserved_order_id,
    reserved_order_item_id, reserved_at, batch_no
  ) values (
    v_inventory_id, v_product_id,
    'rollback-only-secret-' || replace(v_inventory_id::text, '-', ''),
    'reserved', v_order_id, v_order_id, v_order_item_id, now(),
    'UNDERPAYMENT-ROLLBACK-ONLY'
  );

  insert into public.payment_sessions(
    id, session_no, business_type, business_id, business_no, user_id,
    channel_code, provider, currency, network, requested_amount, fee_amount,
    payable_amount, status, payment_type, wallet_address, expires_at, metadata
  ) values (
    v_payment_session_id, 'UNDERPAYPS-' || replace(v_payment_session_id::text, '-', ''),
    'order', v_order_id, 'UNDERPAY-' || replace(v_order_id::text, '-', ''), v_user_id,
    'usdt_bep20', 'bep20', 'USDT', 'BEP20', 4.000000, 0, 4.000000,
    'processing', 'address', v_receive_address, v_deadline, '{"test":"underpayment_rollback_only"}'::jsonb
  );

  insert into public.order_payments(
    id, payment_no, order_id, user_id, payment_session_id, payment_method,
    amount, currency, status, network, order_amount, order_currency,
    payable_amount, payable_currency, received_amount, received_currency,
    transaction_reference, provider_trade_no
  ) values (
    v_order_payment_id, 'UNDERPAYOP-' || replace(v_order_payment_id::text, '-', ''),
    v_order_id, v_user_id, v_payment_session_id, 'usdt_bep20', 28.80, 'CNY',
    'under_review', 'BEP20', 28.80, 'CNY', 4.000000, 'USDT', 2.990000,
    'USDT', v_tx_hash, v_tx_hash
  );

  insert into public.chain_payment_sessions(
    id, order_id, payment_id, payment_session_id, payment_method, network,
    chain_id, asset, token_contract, token_decimals, expected_amount,
    expected_raw_amount, receive_address, status, expires_at, submitted_tx_hash,
    confirmed_amount, confirmed_raw_amount, confirmed_at, order_currency,
    order_amount, payment_currency, exchange_rate, exchange_rate_source,
    exchange_rate_fetched_at, exchange_rate_expires_at, pricing_status
  ) values (
    v_chain_session_id, v_order_id, v_order_payment_id, v_payment_session_id,
    'usdt_bep20', 'BEP20', 56, 'USDT', v_token_contract, 18, 4.000000,
    4000000000000000000, v_receive_address, 'underpaid', v_deadline, v_tx_hash,
    2.990000, 2990000000000000000, now(), 'CNY', 28.80, 'USDT', 7.2,
    'rollback_test', now(), now() + interval '10 minutes', 'frozen'
  );

  insert into public.chain_transaction_claims(
    chain_id, tx_hash, order_id, chain_payment_session_id
  ) values (56, v_tx_hash, v_order_id, v_chain_session_id);

  insert into public.chain_transactions(
    chain_payment_session_id, order_id, chain_id, tx_hash, log_index,
    block_number, block_hash, block_timestamp, token_contract, from_address,
    to_address, raw_amount, normalized_amount, confirmation_count, status
  ) values (
    v_chain_session_id, v_order_id, 56, v_tx_hash, 0, 12345678,
    '0x' || repeat('b', 64), now(), v_token_contract, v_from_address,
    v_receive_address, 2990000000000000000, 2.990000, 12, 'underpaid'
  );

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  select balance into v_balance_before from public.profiles where id = v_user_id;
  begin
    perform public.settle_bep20_underpayment_to_wallet(
      v_chain_session_id, 12, 'negative-automatic-before-deadline',
      gen_random_uuid()::text, 'automatic_service', null, false
    );
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_NOT_EXPIRED' then
      raise exception 'TEST_FAILED_01B_EXPECTED_NOT_EXPIRED_GOT: %', v_error;
    end if;
  end;
  if (select balance from public.profiles where id = v_user_id) <> v_balance_before
     or exists (select 1 from public.bep20_underpayment_dispositions where chain_session_id = v_chain_session_id)
     or exists (select 1 from public.balance_transactions where business_id = v_chain_session_id::text)
     or not exists (
       select 1 from public.orders
       where id = v_order_id and status = 'pending_payment' and payment_status = 'unpaid'
     )
     or not exists (
       select 1 from public.digital_inventory
       where id = v_inventory_id and status = 'reserved' and reserved_order_id = v_order_id
     ) then
    raise exception 'TEST_FAILED_01B_AUTOMATIC_EARLY_MUTATION';
  end if;
  raise notice 'PASS 01B: automatic service cannot settle before the deadline';

  select count(*) into v_candidates
  from public.list_expirable_bep20_underpayments(10) x
  where x.session_id = v_chain_session_id;
  if v_candidates <> 0 then raise exception 'TEST_FAILED_02_NOT_EXPIRED_CANDIDATE'; end if;
  raise notice 'PASS 02: not-expired underpayment is not a candidate';

  -- Candidate selection must fail closed when confirmation evidence is absent,
  -- even if every deadline is already expired.
  update public.orders set payment_expires_at = now() - interval '2 minutes' where id = v_order_id;
  update public.payment_sessions set expires_at = now() - interval '2 minutes' where id = v_payment_session_id;
  update public.chain_payment_sessions
  set expires_at = now() - interval '2 minutes', confirmed_at = null
  where id = v_chain_session_id;
  select count(*) into v_candidates
  from public.list_expirable_bep20_underpayments(10) x
  where x.session_id = v_chain_session_id;
  if v_candidates <> 0 then raise exception 'TEST_FAILED_02B_NULL_CONFIRMED_AT_CANDIDATE'; end if;

  -- Mirror the 20260730 migration's strict evidence selector in a rollback-only
  -- temporary view so synthetic historical rows can exercise the backfill behavior.
  execute $view$
    create temporary view bep20_underpayment_confirmation_test_candidates as
    select cps.id as session_id, tx.evidence_created_at as confirmation_time
    from public.chain_payment_sessions cps
    join public.orders o on o.id = cps.order_id
    join public.payment_sessions ps on ps.id = cps.payment_session_id
    join public.order_payments op on op.id = cps.payment_id
    join lateral (
      select count(*)::integer as match_count
      from public.chain_transaction_claims ctc
      where ctc.chain_id = cps.chain_id
        and ctc.order_id = cps.order_id
        and ctc.chain_payment_session_id = cps.id
        and lower(ctc.tx_hash) = lower(cps.submitted_tx_hash)
    ) claim on claim.match_count = 1
    join lateral (
      select count(*)::integer as match_count, min(ct.created_at) as evidence_created_at
      from public.chain_transactions ct
      where ct.chain_payment_session_id = cps.id
        and ct.order_id = cps.order_id
        and ct.chain_id = 56
        and lower(ct.tx_hash) = lower(cps.submitted_tx_hash)
        and ct.status = 'underpaid'
        and lower(ct.token_contract) = lower(cps.token_contract)
        and lower(ct.to_address) = lower(cps.receive_address)
        and ct.raw_amount is not distinct from cps.confirmed_raw_amount
        and ct.normalized_amount is not distinct from cps.confirmed_amount
        and ct.confirmation_count >= 12
        and ct.block_timestamp is not null
        and ct.created_at is not null
        and ct.block_timestamp <= least(o.payment_expires_at, ps.expires_at, cps.expires_at)
    ) tx on tx.match_count = 1
    where cps.status = 'underpaid'
      and cps.confirmed_at is null
      and cps.manual_review_decision is null
      and cps.chain_id = 56
      and upper(cps.network) = 'BEP20'
      and upper(cps.asset) = 'USDT'
      and upper(cps.payment_currency) = 'USDT'
      and upper(cps.order_currency) = 'CNY'
      and cps.confirmed_raw_amount > 0
      and cps.confirmed_raw_amount < cps.expected_raw_amount
      and cps.confirmed_amount > 0
      and cps.confirmed_amount < cps.expected_amount
      and o.status = 'pending_payment'
      and o.payment_status = 'unpaid'
      and o.reservation_released_at is null
      and ps.status in ('pending', 'processing')
      and op.status = 'under_review'
      and o.payment_expires_at is not null
      and ps.expires_at is not null
      and cps.expires_at is not null
      and least(o.payment_expires_at, ps.expires_at, cps.expires_at) < transaction_timestamp()
      and not exists (
        select 1 from public.bep20_underpayment_dispositions bud
        where bud.chain_session_id = cps.id
      )
  $view$;

  update public.chain_transactions
  set block_timestamp = now() - interval '3 minutes', confirmation_count = 11
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_LOW_CONFIRMATIONS_BACKFILLED';
  end if;

  update public.chain_transactions
  set confirmation_count = 12, block_timestamp = now() - interval '1 minute'
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_LATE_TRANSFER_BACKFILLED';
  end if;

  update public.chain_transactions
  set block_timestamp = now() - interval '3 minutes', tx_hash = '0x' || repeat('e', 64)
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_TX_HASH_MISMATCH_BACKFILLED';
  end if;

  update public.chain_transactions
  set tx_hash = v_tx_hash, order_id = v_other_order_id
  where chain_id = 56 and tx_hash = '0x' || repeat('e', 64) and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_ORDER_MISMATCH_BACKFILLED';
  end if;

  update public.chain_transactions
  set order_id = v_order_id, chain_payment_session_id = null
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_SESSION_MISMATCH_BACKFILLED';
  end if;

  update public.chain_transactions
  set chain_payment_session_id = v_chain_session_id, normalized_amount = 2.989999
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_AMOUNT_MISMATCH_BACKFILLED';
  end if;

  update public.chain_transactions
  set normalized_amount = 2.990000
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  insert into public.chain_transactions(
    chain_payment_session_id, order_id, chain_id, tx_hash, log_index,
    block_number, block_hash, block_timestamp, token_contract, from_address,
    to_address, raw_amount, normalized_amount, confirmation_count, status
  ) values (
    v_chain_session_id, v_order_id, 56, v_tx_hash, 1, 12345679,
    '0x' || repeat('f', 64), now() - interval '3 minutes', v_token_contract,
    v_from_address, v_receive_address, 2990000000000000000, 2.990000, 12, 'underpaid'
  );
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and confirmed_at is not null) then
    raise exception 'TEST_FAILED_02B_MULTIPLE_TRANSACTIONS_BACKFILLED';
  end if;
  delete from public.chain_transactions
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 1;

  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  select count(*) into v_candidates
  from public.list_expirable_bep20_underpayments(10) x
  where x.session_id = v_chain_session_id;
  if v_candidates <> 1 then raise exception 'TEST_FAILED_02B_SAFE_BACKFILL_NOT_CANDIDATE'; end if;
  if not exists (
    select 1
    from public.chain_payment_sessions cps
    join public.chain_transactions ct on ct.chain_payment_session_id = cps.id
    where cps.id = v_chain_session_id and cps.confirmed_at = ct.created_at
      and ct.tx_hash = v_tx_hash and ct.log_index = 0
  ) then raise exception 'TEST_FAILED_02B_BACKFILL_TIME_NOT_EVIDENCE_CREATED_AT'; end if;

  select confirmed_at::text into v_error
  from public.chain_payment_sessions where id = v_chain_session_id;
  update public.chain_payment_sessions cps set confirmed_at = candidate.confirmation_time
  from bep20_underpayment_confirmation_test_candidates candidate
  where cps.id = candidate.session_id and cps.confirmed_at is null;
  if (select confirmed_at::text from public.chain_payment_sessions where id = v_chain_session_id) is distinct from v_error then
    raise exception 'TEST_FAILED_02B_BACKFILL_NOT_IDEMPOTENT';
  end if;
  if (select balance from public.profiles where id = v_user_id) <> v_balance_before
     or exists (select 1 from public.balance_transactions where business_id = v_chain_session_id::text)
     or exists (select 1 from public.bep20_underpayment_dispositions where chain_session_id = v_chain_session_id)
     or not exists (select 1 from public.orders where id = v_order_id and status = 'pending_payment' and payment_status = 'unpaid')
     or not exists (select 1 from public.payment_sessions where id = v_payment_session_id and status = 'processing')
     or not exists (select 1 from public.order_payments where id = v_order_payment_id and status = 'under_review')
     or not exists (select 1 from public.digital_inventory where id = v_inventory_id and status = 'reserved') then
    raise exception 'TEST_FAILED_02B_BACKFILL_CHANGED_BUSINESS_STATE';
  end if;

  update public.orders set payment_expires_at = v_deadline where id = v_order_id;
  update public.payment_sessions set expires_at = v_deadline where id = v_payment_session_id;
  update public.chain_payment_sessions set expires_at = v_deadline, confirmed_at = now() where id = v_chain_session_id;
  update public.chain_transactions set block_timestamp = now()
  where chain_id = 56 and tx_hash = v_tx_hash and log_index = 0;
  raise notice 'PASS 02B: strict confirmation backfill is fail-closed, side-effect free, and idempotent';

  -- The production chain-session deadline is NOT NULL. This rollback-only test
  -- temporarily relaxes that schema guard so the RPC's own fail-closed deadline
  -- contract can be exercised for all three deadline sources. Each expected
  -- exception runs in a PL/pgSQL subtransaction, so its NULL mutation is rolled
  -- back before the next case. The real NOT NULL contract is restored immediately.
  alter table public.chain_payment_sessions
    alter column expires_at drop not null;

  -- Each deadline is independently mandatory for both listing and direct RPC.
  foreach v_deadline_field in array array['order','payment_session','chain_session']
  loop
    begin
      if v_deadline_field = 'order' then
        update public.orders set payment_expires_at = null where id = v_order_id;
      elsif v_deadline_field = 'payment_session' then
        update public.payment_sessions set expires_at = null where id = v_payment_session_id;
      else
        update public.chain_payment_sessions set expires_at = null where id = v_chain_session_id;
      end if;

      select count(*) into v_candidates
      from public.list_expirable_bep20_underpayments(10) x
      where x.session_id = v_chain_session_id;
      if v_candidates <> 0 then
        raise exception 'TEST_FAILED_02C_NULL_DEADLINE_CANDIDATE: %', v_deadline_field;
      end if;

      perform public.settle_bep20_underpayment_to_wallet(
        v_chain_session_id, 12, 'negative-null-deadline-' || v_deadline_field,
        gen_random_uuid()::text, 'automatic_service', null, false
      );
      raise exception 'EXPECTED_REJECTION_NOT_RAISED';
    exception when others then
      get stacked diagnostics v_error = message_text;
      if v_error is distinct from 'BEP20_UNDERPAYMENT_DEADLINE_INVALID' then
        raise exception 'TEST_FAILED_02C_EXPECTED_DEADLINE_INVALID_GOT_%: %', v_deadline_field, v_error;
      end if;
    end;
  end loop;
  alter table public.chain_payment_sessions
    alter column expires_at set not null;
  raise notice 'PASS 02C: every missing deadline is rejected and excluded from candidates';

  -- Every negative case runs in a subtransaction. The expected exception rolls
  -- back the temporary mutation before the next case begins.
  begin
    update public.chain_payment_sessions set confirmed_amount = null where id = v_chain_session_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-null-confirmed', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_SNAPSHOT_INVALID' then
      raise exception 'TEST_FAILED_03_EXPECTED_SNAPSHOT_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 03: null confirmed amount is rejected';

  begin
    update public.order_payments set payment_session_id = null where id = v_order_payment_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-payment-link', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_OWNERSHIP_INVALID' then
      raise exception 'TEST_FAILED_04_EXPECTED_OWNERSHIP_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 04: null payment_session_id is rejected';

  -- confirmation_count is NOT NULL in the intended schema. Drop the constraint
  -- only inside this rollback-only transaction so the RPC's explicit NULL guard
  -- is exercised rather than merely inferred from DDL.
  alter table public.chain_transactions alter column confirmation_count drop not null;
  begin
    update public.chain_transactions set confirmation_count = null where chain_id = 56 and tx_hash = v_tx_hash;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-null-confirmations', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_TRANSFER_INVALID' then
      raise exception 'TEST_FAILED_05_EXPECTED_TRANSFER_INVALID_GOT: %', v_error;
    end if;
  end;
  begin
    update public.chain_transactions set confirmation_count = 11 where chain_id = 56 and tx_hash = v_tx_hash;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-low-confirmations', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_TRANSFER_INVALID' then
      raise exception 'TEST_FAILED_05_EXPECTED_TRANSFER_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 05: null or insufficient confirmations are rejected';

  begin
    update public.chain_transaction_claims set order_id = v_other_order_id where chain_id = 56 and tx_hash = v_tx_hash;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-claim-owner', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_CLAIM_INVALID' then
      raise exception 'TEST_FAILED_06_EXPECTED_CLAIM_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 06: mismatched TxHash claim ownership is rejected';

  begin
    update public.chain_transactions set order_id = v_other_order_id where chain_id = 56 and tx_hash = v_tx_hash;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-transaction-owner', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_TRANSFER_INVALID' then
      raise exception 'TEST_FAILED_07_EXPECTED_TRANSFER_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 07: mismatched chain transaction ownership is rejected';

  begin
    update public.chain_transactions set block_timestamp = v_deadline + interval '1 second' where chain_id = 56 and tx_hash = v_tx_hash;
    update public.orders set payment_expires_at = now() - interval '1 minute' where id = v_order_id;
    update public.payment_sessions set expires_at = now() - interval '1 minute' where id = v_payment_session_id;
    update public.chain_payment_sessions set expires_at = now() - interval '1 minute' where id = v_chain_session_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-late-transfer', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_LATE_TRANSFER' then
      raise exception 'TEST_FAILED_08_EXPECTED_LATE_TRANSFER_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 08: block timestamp after deadline is rejected';

  begin
    update public.order_payments set status = 'pending' where id = v_order_payment_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-payment-status', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_PAYMENT_STATE_INVALID' then
      raise exception 'TEST_FAILED_09_EXPECTED_PAYMENT_STATE_INVALID_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 09: order payment must be under_review';

  begin
    update public.payment_sessions set payable_amount = 3.999999 where id = v_payment_session_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-exact-payment-payable', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH' then
      raise exception 'TEST_FAILED_10_EXPECTED_EXACT_PAYMENT_SNAPSHOT_MISMATCH_GOT: %', v_error;
    end if;
  end;
  begin
    update public.order_payments set payable_amount = 3.99 where id = v_order_payment_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-payable-snapshot', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH' then
      raise exception 'TEST_FAILED_10_EXPECTED_PAYMENT_SNAPSHOT_MISMATCH_GOT: %', v_error;
    end if;
  end;
  begin
    update public.order_payments set received_amount = 2.989999 where id = v_order_payment_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-received-snapshot', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH' then
      raise exception 'TEST_FAILED_10_EXPECTED_PAYMENT_SNAPSHOT_MISMATCH_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 10: payable and received snapshots must match';

  begin
    update public.orders set total_amount = 28.81 where id = v_order_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-order-cny-snapshot', gen_random_uuid()::text, 'automatic_service', null, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_ORDER_SNAPSHOT_MISMATCH' then
      raise exception 'TEST_FAILED_10B_EXPECTED_ORDER_SNAPSHOT_MISMATCH_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 10B: CNY order snapshot mismatch is rejected';

  begin
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-automatic-operator', gen_random_uuid()::text, 'automatic_service', v_admin_id, false);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_AUTOMATIC_OPERATOR_FORBIDDEN' then
      raise exception 'TEST_FAILED_11_EXPECTED_AUTOMATIC_OPERATOR_FORBIDDEN_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 11: automatic service forbids an operator';

  begin
    update public.admin_users set status = 'disabled' where user_id = v_admin_id;
    perform public.settle_bep20_underpayment_to_wallet(v_chain_session_id, 12, 'negative-disabled-admin', gen_random_uuid()::text, 'manual_admin', v_admin_id, true);
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_SUPER_ADMIN_REQUIRED' then
      raise exception 'TEST_FAILED_12_EXPECTED_SUPER_ADMIN_REQUIRED_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 12: manual settlement requires an active super admin';

  update public.orders set payment_expires_at = now() - interval '2 minutes' where id = v_order_id;
  update public.payment_sessions set expires_at = now() - interval '2 minutes' where id = v_payment_session_id;
  update public.chain_payment_sessions set expires_at = now() - interval '2 minutes' where id = v_chain_session_id;
  update public.chain_transactions set block_timestamp = now() - interval '5 minutes', confirmation_count = 12
  where chain_id = 56 and tx_hash = v_tx_hash;

  select count(*) into v_candidates
  from public.list_expirable_bep20_underpayments(10) x
  where x.session_id = v_chain_session_id;
  if v_candidates <> 1 then raise exception 'TEST_FAILED_13_EXPIRED_CANDIDATE'; end if;
  raise notice 'PASS 13: expired underpaid payment is a candidate';

  select balance into v_balance_before from public.profiles where id = v_user_id;
  v_result := public.settle_bep20_underpayment_to_wallet(
    v_chain_session_id, 12, 'rollback-only-valid-settlement',
    v_automatic_request_id,
    'automatic_service', null, false
  );
  if v_result->>'result' <> 'settled' or (v_result->>'credited_cny')::numeric <> 21.53 then
    raise exception 'TEST_FAILED_14_SETTLEMENT_RESULT: %', v_result::text;
  end if;
  select balance into v_balance_after from public.profiles where id = v_user_id;
  if v_balance_after - v_balance_before <> 21.53 then raise exception 'TEST_FAILED_15_BALANCE_DELTA'; end if;

  select count(*) into v_count from public.balance_transactions
  where business_type = 'system' and business_id = v_chain_session_id::text
    and metadata->>'subtype' = 'bep20_underpayment_wallet_credit';
  if v_count <> 1 then raise exception 'TEST_FAILED_16_BALANCE_TRANSACTION_COUNT'; end if;
  select count(*) into v_count from public.bep20_underpayment_dispositions
  where chain_session_id = v_chain_session_id
    and settlement_source = 'automatic_service'
    and processed_by is null;
  if v_count <> 1 then raise exception 'TEST_FAILED_17_DISPOSITION_COUNT'; end if;

  if not exists (select 1 from public.orders where id = v_order_id and status = 'cancelled' and payment_status = 'failed' and reservation_released_at is not null)
     or not exists (select 1 from public.payment_sessions where id = v_payment_session_id and status = 'closed' and provider_transaction_id = v_provider_reference)
     or not exists (
       select 1 from public.order_payments
       where id = v_order_payment_id and status = 'closed'
         and provider_trade_no = v_provider_reference
         and transaction_reference = v_tx_hash
     )
     or not exists (select 1 from public.chain_payment_sessions where id = v_chain_session_id and status = 'expired') then
    raise exception 'TEST_FAILED_18_TERMINAL_STATES';
  end if;
  if exists (select 1 from public.order_deliveries where order_id = v_order_id) then
    raise exception 'TEST_FAILED_19_DELIVERY_MUST_NOT_EXIST';
  end if;
  if not exists (
    select 1 from public.digital_inventory
    where id = v_inventory_id and status = 'available'
      and reserved_order_id is null and reserved_order_item_id is null
  ) then raise exception 'TEST_FAILED_20_INVENTORY_RELEASE'; end if;
  if not exists (select 1 from public.chain_transaction_claims where chain_id = 56 and tx_hash = v_tx_hash and order_id = v_order_id)
     or not exists (select 1 from public.chain_transactions where chain_id = 56 and tx_hash = v_tx_hash and order_id = v_order_id) then
    raise exception 'TEST_FAILED_21_CHAIN_EVIDENCE_RETAINED';
  end if;
  select count(*) into v_count from public.order_status_logs
  where order_id = v_order_id and from_status = 'pending_payment' and to_status = 'cancelled';
  if v_count <> 1 then raise exception 'TEST_FAILED_21_ORDER_STATUS_LOG_COUNT'; end if;
  select count(*) into v_count from public.admin_audit_logs
  where action = 'settle_bep20_underpayment_to_wallet'
    and target_id = v_chain_session_id::text and result = 'success';
  if v_count <> 0 then raise exception 'TEST_FAILED_21_AUTOMATIC_ADMIN_AUDIT_MUST_NOT_EXIST'; end if;
  raise notice 'PASS 14-21: amount, ledger, state, release, no delivery, and evidence checks passed';

  v_result := public.settle_bep20_underpayment_to_wallet(
    v_chain_session_id, 12, 'rollback-only-idempotency', gen_random_uuid()::text,
    'automatic_service', null, false
  );
  if v_result->>'result' <> 'already_settled' then raise exception 'TEST_FAILED_22_ALREADY_SETTLED'; end if;
  if (select balance from public.profiles where id = v_user_id) <> v_balance_after then
    raise exception 'TEST_FAILED_23_REPEAT_BALANCE';
  end if;
  select count(*) into v_count from public.balance_transactions
  where business_type = 'system' and business_id = v_chain_session_id::text
    and metadata->>'subtype' = 'bep20_underpayment_wallet_credit';
  if v_count <> 1 then raise exception 'TEST_FAILED_23_REPEAT_LEDGER'; end if;
  if not exists (
    select 1 from public.digital_inventory
    where id = v_inventory_id and status = 'available'
      and reserved_order_id is null and reserved_order_item_id is null
  ) then raise exception 'TEST_FAILED_23_REPEAT_INVENTORY_CHANGED'; end if;
  select count(*) into v_count from public.order_status_logs
  where order_id = v_order_id and from_status = 'pending_payment' and to_status = 'cancelled';
  if v_count <> 1 then raise exception 'TEST_FAILED_23_REPEAT_ORDER_STATUS_LOG'; end if;
  raise notice 'PASS 22-23: repeat call is idempotent';

  -- A second, independent fixture proves the manual-admin success path. It does
  -- not reuse the already-settled automatic session.
  insert into public.orders(
    id, order_no, user_id, status, payment_status, payment_method,
    subtotal, discount_amount, total_amount, currency, customer_email,
    delivery_type, payment_expires_at
  ) values (
    v_manual_order_id, 'UNDERPAY-' || replace(v_manual_order_id::text, '-', ''),
    v_user_id, 'pending_payment', 'unpaid', 'usdt_bep20', 28.80, 0, 28.80,
    'CNY', 'underpayment-user@example.test', 'automatic', v_manual_deadline
  );

  insert into public.order_items(
    order_id, product_id, product_name, product_slug, product_image_url,
    unit_price, quantity, line_total, delivery_type, product_snapshot
  ) values (
    v_manual_order_id, v_product_id, 'Underpayment Test Product',
    'underpayment-test-product-' || replace(v_product_id::text, '-', ''),
    '/placeholder.svg', 28.80, 1, 28.80, 'automatic',
    jsonb_build_object('source', 'bep20_underpayment_manual_verification')
  ) returning id into v_manual_order_item_id;

  insert into public.digital_inventory(
    id, product_id, content, status, order_id, reserved_order_id,
    reserved_order_item_id, reserved_at, batch_no
  ) values (
    v_manual_inventory_id, v_product_id,
    'rollback-only-secret-' || replace(v_manual_inventory_id::text, '-', ''),
    'reserved', v_manual_order_id, v_manual_order_id, v_manual_order_item_id,
    now(), 'UNDERPAYMENT-MANUAL-ROLLBACK-ONLY'
  );

  insert into public.payment_sessions(
    id, session_no, business_type, business_id, business_no, user_id,
    channel_code, provider, currency, network, requested_amount, fee_amount,
    payable_amount, status, payment_type, wallet_address, expires_at, metadata
  ) values (
    v_manual_payment_session_id,
    'UNDERPAYPS-' || replace(v_manual_payment_session_id::text, '-', ''),
    'order', v_manual_order_id, 'UNDERPAY-' || replace(v_manual_order_id::text, '-', ''),
    v_user_id, 'usdt_bep20', 'bep20', 'USDT', 'BEP20', 4.000000, 0,
    4.000000, 'processing', 'address', v_receive_address,
    v_manual_deadline, '{"test":"underpayment_manual_rollback_only"}'::jsonb
  );

  insert into public.order_payments(
    id, payment_no, order_id, user_id, payment_session_id, payment_method,
    amount, currency, status, network, order_amount, order_currency,
    payable_amount, payable_currency, received_amount, received_currency,
    transaction_reference, provider_trade_no
  ) values (
    v_manual_order_payment_id,
    'UNDERPAYOP-' || replace(v_manual_order_payment_id::text, '-', ''),
    v_manual_order_id, v_user_id, v_manual_payment_session_id, 'usdt_bep20',
    28.80, 'CNY', 'under_review', 'BEP20', 28.80, 'CNY', 4.000000,
    'USDT', 2.990000, 'USDT', v_manual_tx_hash, v_manual_tx_hash
  );

  insert into public.chain_payment_sessions(
    id, order_id, payment_id, payment_session_id, payment_method, network,
    chain_id, asset, token_contract, token_decimals, expected_amount,
    expected_raw_amount, receive_address, status, expires_at, submitted_tx_hash,
    confirmed_amount, confirmed_raw_amount, confirmed_at, order_currency,
    order_amount, payment_currency, exchange_rate, exchange_rate_source,
    exchange_rate_fetched_at, exchange_rate_expires_at, pricing_status
  ) values (
    v_manual_chain_session_id, v_manual_order_id, v_manual_order_payment_id,
    v_manual_payment_session_id, 'usdt_bep20', 'BEP20', 56, 'USDT',
    v_token_contract, 18, 4.000000, 4000000000000000000, v_receive_address,
    'underpaid', v_manual_deadline, v_manual_tx_hash, 2.990000,
    2990000000000000000, now(), 'CNY', 28.80,
    'USDT', 7.2, 'rollback_test', now() - interval '10 minutes',
    now() - interval '5 minutes', 'frozen'
  );

  insert into public.chain_transaction_claims(
    chain_id, tx_hash, order_id, chain_payment_session_id
  ) values (56, v_manual_tx_hash, v_manual_order_id, v_manual_chain_session_id);

  insert into public.chain_transactions(
    chain_payment_session_id, order_id, chain_id, tx_hash, log_index,
    block_number, block_hash, block_timestamp, token_contract, from_address,
    to_address, raw_amount, normalized_amount, confirmation_count, status
  ) values (
    v_manual_chain_session_id, v_manual_order_id, 56, v_manual_tx_hash, 1,
    12345679, '0x' || repeat('d', 64), now(),
    v_token_contract, v_from_address, v_receive_address,
    2990000000000000000, 2.990000, 12, 'underpaid'
  );

  select balance into v_manual_balance_before from public.profiles where id = v_user_id;

  begin
    perform public.settle_bep20_underpayment_to_wallet(
      v_manual_chain_session_id, 12, 'negative-manual-without-confirmation',
      gen_random_uuid()::text, 'manual_admin', v_admin_id, false
    );
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED' then
      raise exception 'TEST_FAILED_23A_EXPECTED_IRREVERSIBLE_CONFIRMATION_GOT: %', v_error;
    end if;
  end;
  if (select balance from public.profiles where id = v_user_id) <> v_manual_balance_before
     or exists (select 1 from public.bep20_underpayment_dispositions where chain_session_id = v_manual_chain_session_id)
     or exists (select 1 from public.balance_transactions where business_id = v_manual_chain_session_id::text)
     or not exists (
       select 1 from public.orders
       where id = v_manual_order_id and status = 'pending_payment' and payment_status = 'unpaid'
     )
     or not exists (
       select 1 from public.digital_inventory
       where id = v_manual_inventory_id and status = 'reserved'
     ) then
    raise exception 'TEST_FAILED_23A_MANUAL_UNCONFIRMED_MUTATION';
  end if;
  raise notice 'PASS 23A: manual settlement requires explicit irreversible confirmation';

  begin
    update public.chain_transactions
    set block_timestamp = v_manual_deadline + interval '1 second'
    where chain_id = 56 and tx_hash = v_manual_tx_hash;
    perform public.settle_bep20_underpayment_to_wallet(
      v_manual_chain_session_id, 12, 'negative-manual-late-transfer',
      gen_random_uuid()::text, 'manual_admin', v_admin_id, true
    );
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error is distinct from 'BEP20_UNDERPAYMENT_LATE_TRANSFER' then
      raise exception 'TEST_FAILED_23B_EXPECTED_LATE_TRANSFER_GOT: %', v_error;
    end if;
  end;
  raise notice 'PASS 23B: manual confirmation never bypasses late-transfer rejection';

  -- Reusing another session's request_id must fail atomically. The unique
  -- violation occurs after the provisional ledger insert, so the subtransaction
  -- proves that neither balance nor ledger/disposition survives the failure.
  begin
    perform public.settle_bep20_underpayment_to_wallet(
      v_manual_chain_session_id, 12, 'rollback-only-request-id-conflict',
      v_automatic_request_id, 'manual_admin', v_admin_id, true
    );
    raise exception 'EXPECTED_REJECTION_NOT_RAISED';
  exception when others then
    get stacked diagnostics v_error = message_text, v_sqlstate = returned_sqlstate;
    if v_sqlstate is distinct from '23505' then
      raise exception 'TEST_FAILED_24_EXPECTED_REQUEST_ID_UNIQUE_VIOLATION_GOT: % %', v_sqlstate, v_error;
    end if;
  end;
  if (select balance from public.profiles where id = v_user_id) <> v_manual_balance_before
     or exists (select 1 from public.bep20_underpayment_dispositions where chain_session_id = v_manual_chain_session_id)
     or exists (
       select 1 from public.balance_transactions
       where business_type = 'system' and business_id = v_manual_chain_session_id::text
     ) then
    raise exception 'TEST_FAILED_24_REQUEST_ID_CONFLICT_LEFT_FINANCIAL_MUTATION';
  end if;

  v_result := public.settle_bep20_underpayment_to_wallet(
    v_manual_chain_session_id, 12, 'rollback-only-manual-success',
    'underpayment-manual-' || replace(v_manual_chain_session_id::text, '-', ''),
    'manual_admin', v_admin_id, true
  );
  if v_result->>'result' <> 'settled' then raise exception 'TEST_FAILED_25_MANUAL_SETTLEMENT_RESULT'; end if;
  select balance into v_manual_balance_after from public.profiles where id = v_user_id;
  if v_manual_balance_after - v_manual_balance_before <> 21.53 then
    raise exception 'TEST_FAILED_25_MANUAL_BALANCE_DELTA';
  end if;
  select count(*) into v_count from public.bep20_underpayment_dispositions
  where chain_session_id = v_manual_chain_session_id
    and settlement_source = 'manual_admin' and processed_by = v_admin_id
    and metadata @> '{"irreversible_confirmed":true,"manual_before_deadline":true,"settlement_source":"manual_admin"}'::jsonb;
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_DISPOSITION'; end if;
  select count(*) into v_count from public.balance_transactions
  where business_type = 'system' and business_id = v_manual_chain_session_id::text
    and metadata->>'subtype' = 'bep20_underpayment_wallet_credit';
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_LEDGER_COUNT'; end if;
  select count(*) into v_count from public.admin_audit_logs
  where admin_user_id = v_admin_id
    and action = 'settle_bep20_underpayment_to_wallet'
    and target_id = v_manual_chain_session_id::text and result = 'success'
    and metadata @> '{"irreversible_confirmed":true,"manual_before_deadline":true,"settlement_source":"manual_admin"}'::jsonb;
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_AUDIT_COUNT'; end if;
  select count(*) into v_count from public.order_status_logs
  where order_id = v_manual_order_id and from_status = 'pending_payment' and to_status = 'cancelled';
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_STATUS_LOG_COUNT'; end if;
  if not exists (
       select 1 from public.orders
       where id = v_manual_order_id and status = 'cancelled'
         and payment_status = 'failed' and reservation_released_at is not null
     )
     or not exists (
       select 1 from public.payment_sessions
       where id = v_manual_payment_session_id and status = 'closed'
         and provider_transaction_id = v_manual_provider_reference
     )
     or not exists (
       select 1 from public.order_payments
       where id = v_manual_order_payment_id and status = 'closed'
         and provider_trade_no = v_manual_provider_reference
         and transaction_reference = v_manual_tx_hash
     )
     or not exists (
       select 1 from public.chain_payment_sessions
       where id = v_manual_chain_session_id and status = 'expired'
     ) then raise exception 'TEST_FAILED_25_MANUAL_TERMINAL_STATES'; end if;
  if not exists (
       select 1 from public.digital_inventory
       where id = v_manual_inventory_id and status = 'available'
         and reserved_order_id is null and reserved_order_item_id is null
     )
     or exists (select 1 from public.order_deliveries where order_id = v_manual_order_id)
     or not exists (
       select 1 from public.chain_transaction_claims
       where chain_id = 56 and tx_hash = v_manual_tx_hash
         and order_id = v_manual_order_id
     )
     or not exists (
       select 1 from public.chain_transactions
       where chain_id = 56 and tx_hash = v_manual_tx_hash
         and order_id = v_manual_order_id
     ) then raise exception 'TEST_FAILED_25_MANUAL_RELEASE_OR_EVIDENCE'; end if;

  v_result := public.settle_bep20_underpayment_to_wallet(
    v_manual_chain_session_id, 12, 'rollback-only-manual-repeat', gen_random_uuid()::text,
    'manual_admin', v_admin_id, true
  );
  if v_result->>'result' <> 'already_settled'
     or (select balance from public.profiles where id = v_user_id) <> v_manual_balance_after then
    raise exception 'TEST_FAILED_25_MANUAL_REPEAT_IDEMPOTENCY';
  end if;
  select count(*) into v_count from public.admin_audit_logs
  where admin_user_id = v_admin_id
    and action = 'settle_bep20_underpayment_to_wallet'
    and target_id = v_manual_chain_session_id::text and result = 'success';
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_REPEAT_AUDIT'; end if;
  select count(*) into v_count from public.balance_transactions
  where business_type = 'system' and business_id = v_manual_chain_session_id::text
    and metadata->>'subtype' = 'bep20_underpayment_wallet_credit';
  if v_count <> 1 then raise exception 'TEST_FAILED_25_MANUAL_REPEAT_LEDGER'; end if;
  if not exists (select 1 from public.digital_inventory where id = v_manual_inventory_id and status = 'available') then
    raise exception 'TEST_FAILED_25_MANUAL_REPEAT_INVENTORY';
  end if;
  raise notice 'PASS 24-25: request-id uniqueness and independent manual-admin settlement are safe and idempotent';
end;
$$;

rollback;
