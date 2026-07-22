begin;

do $$
begin
  if to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)') is null then
    raise exception 'BEP20_UNDERPAYMENT_MANUAL_EARLY_PREFLIGHT_LEGACY_FUNCTION_MISSING';
  end if;
  if to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)') is not null then
    raise exception 'BEP20_UNDERPAYMENT_MANUAL_EARLY_PREFLIGHT_NEW_FUNCTION_ALREADY_EXISTS';
  end if;
end;
$$;

revoke all on function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)
  from public, anon, authenticated, service_role;
drop function if exists public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid);

create function public.settle_bep20_underpayment_to_wallet(
  p_session_id uuid,
  p_required_confirmations integer,
  p_reason text,
  p_request_id text default null,
  p_settlement_source text default 'automatic_service',
  p_operator_user_id uuid default null,
  p_irreversible_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_chain public.chain_payment_sessions;
  v_transaction public.chain_transactions;
  v_claim public.chain_transaction_claims;
  v_payment_session public.payment_sessions;
  v_order_payment public.order_payments;
  v_order public.orders;
  v_profile public.profiles;
  v_existing public.bep20_underpayment_dispositions;
  v_balance_transaction public.balance_transactions;
  v_release jsonb;
  v_source text := btrim(coalesce(p_settlement_source, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_tx_hash text;
  v_provider_transaction_id text;
  v_deadline timestamptz;
  v_manual_before_deadline boolean := false;
  v_received_raw numeric(78,0);
  v_expected_raw numeric(78,0);
  v_power numeric;
  v_received_usdt numeric(36,18);
  v_expected_usdt numeric(36,18);
  v_shortfall_usdt numeric(36,18);
  v_credited_cny numeric(18,2);
  v_balance_before numeric(18,6);
  v_balance_after numeric(18,6);
  v_balance_transaction_no text;
  v_transaction_count integer;
  v_now timestamptz := now();
  v_balance_max constant numeric(12,2) := 9999999999.99;
begin
  if v_role <> 'service_role' then
    raise exception 'BEP20_UNDERPAYMENT_SERVICE_ROLE_REQUIRED';
  end if;
  if p_session_id is null or p_required_confirmations is null
     or p_required_confirmations < 1 or p_required_confirmations > 1000
     or length(v_reason) not between 1 and 500
     or length(v_request_id) not between 1 and 200
     or v_source not in ('automatic_service','manual_admin') then
    raise exception 'BEP20_UNDERPAYMENT_INPUT_INVALID';
  end if;
  if v_source = 'automatic_service' and p_operator_user_id is not null then
    raise exception 'BEP20_UNDERPAYMENT_AUTOMATIC_OPERATOR_FORBIDDEN';
  end if;
  if v_source = 'automatic_service' and p_irreversible_confirmed is distinct from false then
    raise exception 'BEP20_UNDERPAYMENT_INPUT_INVALID';
  end if;
  if v_source = 'manual_admin'
     and (p_operator_user_id is null or not public.is_super_admin(p_operator_user_id)) then
    raise exception 'BEP20_UNDERPAYMENT_SUPER_ADMIN_REQUIRED';
  end if;
  if v_source = 'manual_admin' and p_irreversible_confirmed is distinct from true then
    raise exception 'BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  select * into v_chain
  from public.chain_payment_sessions cps
  where cps.id = p_session_id
  for update;
  if not found then raise exception 'BEP20_UNDERPAYMENT_SESSION_NOT_FOUND'; end if;

  select * into v_existing
  from public.bep20_underpayment_dispositions bud
  where bud.chain_session_id = v_chain.id;
  if found then
    return jsonb_build_object(
      'result', 'already_settled', 'idempotent', true,
      'chain_session_id', v_existing.chain_session_id,
      'order_id', v_existing.order_id,
      'received_usdt', v_existing.received_usdt,
      'expected_usdt', v_existing.expected_usdt,
      'shortfall_usdt', v_existing.shortfall_usdt,
      'exchange_rate', v_existing.exchange_rate,
      'credited_cny', v_existing.credited_cny,
      'settlement_source', v_existing.settlement_source,
      'irreversible_confirmed', coalesce((v_existing.metadata ->> 'irreversible_confirmed')::boolean, false),
      'manual_before_deadline', coalesce((v_existing.metadata ->> 'manual_before_deadline')::boolean, false),
      'processed_at', v_existing.processed_at,
      'release', jsonb_build_object('code', 'ALREADY_RELEASED')
    );
  end if;

  if v_chain.status <> 'underpaid'
     or v_chain.manual_review_decision is not null
     or nullif(btrim(coalesce(v_chain.submitted_tx_hash, '')), '') is null then
    raise exception 'BEP20_UNDERPAYMENT_STATE_INVALID';
  end if;
  if v_chain.payment_session_id is null or v_chain.payment_id is null
     or upper(coalesce(v_chain.network, '')) <> 'BEP20'
     or v_chain.chain_id <> 56
     or upper(coalesce(v_chain.asset, '')) <> 'USDT'
     or upper(coalesce(v_chain.payment_currency, '')) <> 'USDT'
     or upper(coalesce(v_chain.order_currency, '')) <> 'CNY'
     or v_chain.token_decimals <> 18
     or nullif(btrim(v_chain.token_contract), '') is null
     or nullif(btrim(v_chain.receive_address), '') is null
     or v_chain.confirmed_at is null
     or v_chain.order_amount is null
     or v_chain.confirmed_amount is null
     or v_chain.expected_amount is null
     or v_chain.confirmed_raw_amount is null
     or v_chain.expected_raw_amount is null
     or v_chain.exchange_rate is null or v_chain.exchange_rate <= 0 then
    raise exception 'BEP20_UNDERPAYMENT_SNAPSHOT_INVALID';
  end if;

  select * into v_order
  from public.orders o where o.id = v_chain.order_id for update;
  select * into v_payment_session
  from public.payment_sessions ps where ps.id = v_chain.payment_session_id for update;
  select * into v_order_payment
  from public.order_payments op where op.id = v_chain.payment_id for update;

  if v_order.id is null or v_payment_session.id is null or v_order_payment.id is null
     or v_payment_session.business_type is distinct from 'order'
     or v_payment_session.business_id is distinct from v_order.id
     or v_payment_session.user_id is distinct from v_order.user_id
     or v_order_payment.order_id is distinct from v_order.id
     or v_order_payment.user_id is distinct from v_order.user_id
     or v_order_payment.payment_session_id is null
     or v_order_payment.payment_session_id is distinct from v_payment_session.id then
    raise exception 'BEP20_UNDERPAYMENT_OWNERSHIP_INVALID';
  end if;
  if upper(v_order.currency) is distinct from 'CNY'
     or lower(v_order.payment_method) is distinct from 'usdt_bep20'
     or v_order.total_amount is null or v_order.total_amount <= 0
     or v_chain.order_amount is distinct from v_order.total_amount
     or v_payment_session.business_no is distinct from v_order.order_no
     or lower(v_payment_session.channel_code) is distinct from 'usdt_bep20'
     or upper(v_payment_session.network) is distinct from 'BEP20'
     or nullif(btrim(v_payment_session.wallet_address), '') is null
     or lower(v_payment_session.wallet_address) is distinct from lower(v_chain.receive_address)
     or lower(v_order_payment.payment_method) is distinct from 'usdt_bep20'
     or upper(v_order_payment.network) is distinct from 'BEP20'
     or v_order_payment.amount is null
     or v_order_payment.amount is distinct from v_order.total_amount
     or v_order_payment.order_amount is null
     or v_order_payment.order_amount is distinct from v_order.total_amount
     or upper(v_order_payment.currency) is distinct from 'CNY'
     or upper(v_order_payment.order_currency) is distinct from 'CNY' then
    raise exception 'BEP20_UNDERPAYMENT_ORDER_SNAPSHOT_MISMATCH';
  end if;
  if v_order.status is distinct from 'pending_payment'
     or v_order.payment_status is distinct from 'unpaid'
     or v_order.reservation_released_at is not null
     or v_payment_session.status not in ('pending','processing')
     or v_order_payment.status is distinct from 'under_review' then
    raise exception 'BEP20_UNDERPAYMENT_PAYMENT_STATE_INVALID';
  end if;
  if v_payment_session.payable_amount is null
     or upper(coalesce(v_payment_session.currency, '')) <> 'USDT'
     or v_payment_session.payable_amount is distinct from v_chain.expected_amount
     or v_order_payment.payable_amount is null
     or v_order_payment.payable_amount is distinct from v_chain.expected_amount
     or upper(coalesce(v_order_payment.payable_currency, '')) <> 'USDT'
     or v_order_payment.received_amount is null
     or v_order_payment.received_amount is distinct from v_chain.confirmed_amount
     or upper(coalesce(v_order_payment.received_currency, '')) <> 'USDT' then
    raise exception 'BEP20_UNDERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH';
  end if;

  v_tx_hash := lower(btrim(v_chain.submitted_tx_hash));
  select * into v_claim
  from public.chain_transaction_claims ctc
  where ctc.chain_id = 56 and lower(ctc.tx_hash) = v_tx_hash
  for update;
  if not found or v_claim.order_id is distinct from v_order.id
     or v_claim.chain_payment_session_id is distinct from v_chain.id then
    raise exception 'BEP20_UNDERPAYMENT_CLAIM_INVALID';
  end if;

  select count(*) into v_transaction_count
  from public.chain_transactions ct
  where ct.chain_id = 56 and lower(ct.tx_hash) = v_tx_hash;
  if v_transaction_count <> 1 then
    raise exception 'BEP20_UNDERPAYMENT_TRANSFER_COUNT_INVALID';
  end if;

  select * into v_transaction
  from public.chain_transactions ct
  where ct.chain_id = 56 and lower(ct.tx_hash) = v_tx_hash
  for update;
  if v_transaction.chain_payment_session_id is distinct from v_chain.id
     or v_transaction.order_id is distinct from v_order.id
     or nullif(btrim(v_transaction.token_contract), '') is null
     or nullif(btrim(v_transaction.to_address), '') is null
     or lower(v_transaction.token_contract) is distinct from lower(v_chain.token_contract)
     or lower(v_transaction.to_address) is distinct from lower(v_chain.receive_address)
     or v_transaction.log_index is null
     or v_transaction.log_index < 0
     or v_transaction.confirmation_count is null
     or v_transaction.confirmation_count < p_required_confirmations
     or v_transaction.block_timestamp is null
     or v_transaction.normalized_amount is null
     or v_transaction.status is distinct from 'underpaid' then
    raise exception 'BEP20_UNDERPAYMENT_TRANSFER_INVALID';
  end if;

  v_provider_transaction_id := v_tx_hash || ':' || v_transaction.log_index::text;
  if (nullif(btrim(coalesce(v_payment_session.provider_transaction_id, '')), '') is not null
      and lower(btrim(v_payment_session.provider_transaction_id)) not in (v_tx_hash, v_provider_transaction_id))
     or (nullif(btrim(coalesce(v_order_payment.transaction_reference, '')), '') is not null
      and lower(btrim(v_order_payment.transaction_reference)) not in (v_tx_hash, v_provider_transaction_id))
     or (nullif(btrim(coalesce(v_order_payment.provider_trade_no, '')), '') is not null
      and lower(btrim(v_order_payment.provider_trade_no)) not in (v_tx_hash, v_provider_transaction_id)) then
    raise exception 'BEP20_UNDERPAYMENT_TRANSACTION_REFERENCE_MISMATCH';
  end if;

  if v_order.payment_expires_at is null
     or v_payment_session.expires_at is null
     or v_chain.expires_at is null then
    raise exception 'BEP20_UNDERPAYMENT_DEADLINE_INVALID';
  end if;
  v_deadline := least(
    v_order.payment_expires_at,
    v_payment_session.expires_at,
    v_chain.expires_at
  );
  v_manual_before_deadline := v_source = 'manual_admin' and v_now <= v_deadline;
  if v_source = 'automatic_service' and v_now <= v_deadline then
    raise exception 'BEP20_UNDERPAYMENT_NOT_EXPIRED';
  end if;
  if v_transaction.block_timestamp > v_deadline then
    raise exception 'BEP20_UNDERPAYMENT_LATE_TRANSFER';
  end if;

  if v_transaction.raw_amount is null
     or v_transaction.raw_amount is distinct from trunc(v_transaction.raw_amount)
     or v_chain.confirmed_raw_amount is null
     or v_chain.confirmed_raw_amount is distinct from trunc(v_chain.confirmed_raw_amount)
     or v_chain.expected_raw_amount is null
     or v_chain.expected_raw_amount is distinct from trunc(v_chain.expected_raw_amount) then
    raise exception 'BEP20_UNDERPAYMENT_RAW_AMOUNT_INVALID';
  end if;
  v_received_raw := trunc(v_transaction.raw_amount);
  v_expected_raw := trunc(v_chain.expected_raw_amount);
  v_power := power(10::numeric, v_chain.token_decimals);
  v_received_usdt := v_received_raw / v_power;
  v_expected_usdt := v_expected_raw / v_power;
  if v_received_raw <= 0 or v_received_raw >= v_expected_raw
     or v_received_raw is distinct from trunc(v_chain.confirmed_raw_amount)
     or v_received_usdt is distinct from v_transaction.normalized_amount
     or v_received_usdt is distinct from v_chain.confirmed_amount
     or v_expected_usdt is distinct from v_chain.expected_amount then
    raise exception 'BEP20_UNDERPAYMENT_AMOUNT_MISMATCH';
  end if;

  v_shortfall_usdt := v_expected_usdt - v_received_usdt;
  v_credited_cny := round(v_received_usdt * v_chain.exchange_rate, 2);
  if v_credited_cny <= 0 then
    raise exception 'BEP20_UNDERPAYMENT_CREDIT_ROUNDS_TO_ZERO';
  end if;

  select * into v_profile
  from public.profiles p where p.id = v_order.user_id for update;
  if not found then raise exception 'BEP20_UNDERPAYMENT_PROFILE_NOT_FOUND'; end if;
  v_balance_before := coalesce(v_profile.balance, 0);
  v_balance_after := v_balance_before + v_credited_cny;
  if v_balance_before < 0 or v_balance_after > v_balance_max then
    raise exception 'BEP20_UNDERPAYMENT_BALANCE_OUT_OF_RANGE';
  end if;

  v_balance_transaction_no := 'BT-BEP20-UNDER-' || replace(v_chain.id::text, '-', '');
  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_order.user_id, v_balance_transaction_no, 'system', v_chain.id::text,
    'credit', v_credited_cny, v_balance_before, v_balance_after, 'CNY', 'completed',
    'BEP20 underpayment received amount credited to wallet',
    jsonb_build_object(
      'subtype', 'bep20_underpayment_wallet_credit',
      'chain_session_id', v_chain.id,
      'order_id', v_order.id,
      'payment_id', v_order_payment.id,
      'payment_session_id', v_payment_session.id,
      'received_usdt', v_received_usdt,
      'expected_usdt', v_expected_usdt,
      'shortfall_usdt', v_shortfall_usdt,
      'exchange_rate', v_chain.exchange_rate,
      'tx_hash', v_tx_hash,
      'settlement_source', v_source,
      'irreversible_confirmed', p_irreversible_confirmed,
      'manual_before_deadline', v_manual_before_deadline
    )
  ) returning * into v_balance_transaction;

  update public.profiles p
  set balance = v_balance_after, updated_at = v_now
  where p.id = v_order.user_id;

  insert into public.bep20_underpayment_dispositions (
    chain_session_id, order_id, user_id, payment_id, payment_session_id,
    balance_transaction_id, received_usdt, expected_usdt, shortfall_usdt,
    exchange_rate, credited_cny, disposition, settlement_source, processed_by,
    processed_at, reason, request_id, metadata
  ) values (
    v_chain.id, v_order.id, v_order.user_id, v_order_payment.id,
    v_payment_session.id, v_balance_transaction.id, v_received_usdt,
    v_expected_usdt, v_shortfall_usdt, v_chain.exchange_rate, v_credited_cny,
    'wallet_credit', v_source, case when v_source = 'manual_admin' then p_operator_user_id else null end,
    v_now, v_reason, v_request_id,
    jsonb_build_object(
      'chain_id', 56,
      'tx_hash_claim_retained', true,
      'irreversible_confirmed', p_irreversible_confirmed,
      'manual_before_deadline', v_manual_before_deadline,
      'settlement_source', v_source
    )
  );

  update public.payment_sessions ps
  set status = 'closed',
      provider_transaction_id = v_provider_transaction_id,
      closed_at = coalesce(ps.closed_at, v_now),
      last_synced_at = v_now,
      last_error = null,
      metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object(
        'closure_reason', 'underpayment_credited_to_wallet',
        'received_usdt', v_received_usdt,
        'credited_cny', v_credited_cny,
        'settlement_source', v_source,
        'irreversible_confirmed', p_irreversible_confirmed,
        'manual_before_deadline', v_manual_before_deadline
      ),
      updated_at = v_now
  where ps.id = v_payment_session.id;

  v_release := public.release_order_inventory(v_order.id, 'underpayment-wallet-credit:' || left(v_reason, 120));
  if coalesce(v_release ->> 'code', '') not in ('RELEASED','ALREADY_RELEASED') then
    raise exception 'BEP20_UNDERPAYMENT_INVENTORY_RELEASE_FAILED';
  end if;

  update public.orders o
  set status = 'cancelled', payment_status = 'failed',
      cancelled_at = coalesce(o.cancelled_at, v_now), updated_at = v_now
  where o.id = v_order.id and o.status = 'pending_payment' and o.payment_status = 'unpaid';
  if not found then raise exception 'BEP20_UNDERPAYMENT_ORDER_STATE_CHANGED'; end if;

  update public.chain_payment_sessions cps
  set status = 'expired',
      failure_reason = 'underpayment_credited_to_wallet',
      last_checked_at = v_now,
      completion_error = null,
      updated_at = v_now
  where cps.id = v_chain.id;

  update public.order_payments op
  set status = 'closed',
      received_amount = v_received_usdt,
      provider_trade_no = v_provider_transaction_id,
      exception_type = 'underpayment_credited_to_wallet',
      error_summary = 'Underpayment credited to wallet; order cancelled',
      reviewed_at = v_now,
      reviewed_by = case when v_source = 'manual_admin' then p_operator_user_id else null end,
      updated_at = v_now
  where op.id = v_order_payment.id;
  if not found then raise exception 'BEP20_UNDERPAYMENT_PAYMENT_LINK_LOST'; end if;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    v_order.id, 'pending_payment', 'cancelled',
    case when v_source = 'manual_admin' then p_operator_user_id else null end,
    case when v_source = 'manual_admin' then 'admin' else 'system' end,
    'BEP20 underpayment credited to wallet; order cancelled'
  );

  if v_source = 'manual_admin' then
    insert into public.admin_audit_logs (
      admin_user_id, action, module, target_type, target_id, request_id, result,
      before_summary, after_summary, metadata
    ) values (
      p_operator_user_id, 'settle_bep20_underpayment_to_wallet', 'payments',
      'chain_payment_session', v_chain.id::text, v_request_id, 'success',
      jsonb_build_object('order_status', v_order.status, 'payment_status', v_order.payment_status),
      jsonb_build_object('order_status', 'cancelled', 'payment_status', 'failed', 'credited_cny', v_credited_cny),
      jsonb_build_object(
        'order_id', v_order.id,
        'reason', v_reason,
        'settlement_source', v_source,
        'irreversible_confirmed', p_irreversible_confirmed,
        'manual_before_deadline', v_manual_before_deadline
      )
    );
  end if;

  return jsonb_build_object(
    'result', 'settled', 'idempotent', false,
    'chain_session_id', v_chain.id, 'order_id', v_order.id,
    'order_no', v_order.order_no,
    'received_usdt', v_received_usdt, 'expected_usdt', v_expected_usdt,
    'shortfall_usdt', v_shortfall_usdt, 'exchange_rate', v_chain.exchange_rate,
    'credited_cny', v_credited_cny, 'settlement_source', v_source,
    'irreversible_confirmed', p_irreversible_confirmed,
    'manual_before_deadline', v_manual_before_deadline,
    'processed_at', v_now, 'release', v_release
  );
end;
$$;

alter function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)
  owner to postgres;
revoke all on function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)
  to service_role;

do $$
declare
  v_function oid := to_regprocedure(
    'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)'
  );
begin
  if to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)') is not null
     or v_function is null then
    raise exception 'BEP20_UNDERPAYMENT_MANUAL_EARLY_POSTCHECK_SIGNATURE_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_function
      and (
        pg_catalog.pg_get_userbyid(p.proowner) is distinct from 'postgres'
        or not p.prosecdef
        or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public']::text[]
      )
  ) then
    raise exception 'BEP20_UNDERPAYMENT_MANUAL_EARLY_POSTCHECK_SECURITY_INVALID';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_function
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE')
     or not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'BEP20_UNDERPAYMENT_MANUAL_EARLY_POSTCHECK_GRANTS_INVALID';
  end if;
end;
$$;

-- Rollback guidance: restore the reviewed six-argument function definition from
-- 20260728 only after stopping all callers of this seven-argument contract.
-- Never delete existing disposition, balance, inventory, or audit evidence.

commit;
