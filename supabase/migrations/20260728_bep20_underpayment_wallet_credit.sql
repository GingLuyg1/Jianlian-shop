-- Atomically settle expired, confirmed BEP20 underpayments into the user's CNY
-- wallet while cancelling the unpaid order and releasing its reservation.
-- This migration never settles historical rows by itself.

begin;

do $$
declare
  v_missing text[];
  v_constraint text;
begin
  select array_agg(v.name order by v.name) into v_missing
  from (values
    ('public.chain_payment_sessions'),
    ('public.chain_transactions'),
    ('public.chain_transaction_claims'),
    ('public.payment_sessions'),
    ('public.order_payments'),
    ('public.orders'),
    ('public.profiles'),
    ('public.balance_transactions'),
    ('public.order_status_logs'),
    ('public.admin_audit_logs')
  ) as v(name)
  where to_regclass(v.name) is null;

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_TABLES_MISSING: %', v_missing;
  end if;

  if to_regprocedure('public.release_order_inventory(uuid,text)') is null
     or to_regprocedure('public.is_super_admin(uuid)') is null
     or to_regprocedure('public.sync_bep20_chain_order_payment()') is null then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_FUNCTIONS_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.chain_payment_sessions'::regclass
      and t.tgname = 'trg_sync_bep20_chain_order_payment'
      and not t.tgisinternal
  ) then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_PAYMENT_SYNC_TRIGGER_MISSING';
  end if;

  select array_agg(v.name order by v.name) into v_missing
  from (values
    ('chain_payment_sessions.id'), ('chain_payment_sessions.order_id'),
    ('chain_payment_sessions.payment_session_id'), ('chain_payment_sessions.payment_id'),
    ('chain_payment_sessions.status'), ('chain_payment_sessions.network'),
    ('chain_payment_sessions.chain_id'), ('chain_payment_sessions.asset'),
    ('chain_payment_sessions.token_contract'), ('chain_payment_sessions.token_decimals'),
    ('chain_payment_sessions.receive_address'), ('chain_payment_sessions.expected_amount'),
    ('chain_payment_sessions.expected_raw_amount'), ('chain_payment_sessions.confirmed_amount'),
    ('chain_payment_sessions.confirmed_raw_amount'), ('chain_payment_sessions.exchange_rate'),
    ('chain_payment_sessions.order_amount'), ('chain_payment_sessions.order_currency'),
    ('chain_payment_sessions.payment_currency'),
    ('chain_payment_sessions.expires_at'), ('chain_payment_sessions.submitted_tx_hash'),
    ('chain_payment_sessions.confirmed_at'), ('chain_payment_sessions.manual_review_decision'),
    ('chain_payment_sessions.failure_reason'), ('chain_payment_sessions.last_checked_at'),
    ('chain_payment_sessions.completion_error'), ('chain_payment_sessions.created_at'),
    ('chain_payment_sessions.updated_at'),
    ('chain_transactions.id'), ('chain_transactions.chain_payment_session_id'),
    ('chain_transactions.order_id'), ('chain_transactions.chain_id'),
    ('chain_transactions.tx_hash'), ('chain_transactions.log_index'),
    ('chain_transactions.token_contract'),
    ('chain_transactions.to_address'), ('chain_transactions.raw_amount'),
    ('chain_transactions.normalized_amount'), ('chain_transactions.confirmation_count'),
    ('chain_transactions.block_timestamp'), ('chain_transactions.status'),
    ('chain_transaction_claims.chain_id'), ('chain_transaction_claims.tx_hash'),
    ('chain_transaction_claims.order_id'), ('chain_transaction_claims.chain_payment_session_id'),
    ('payment_sessions.id'), ('payment_sessions.business_type'),
    ('payment_sessions.business_id'), ('payment_sessions.user_id'),
    ('payment_sessions.business_no'), ('payment_sessions.channel_code'),
    ('payment_sessions.network'), ('payment_sessions.wallet_address'),
    ('payment_sessions.status'), ('payment_sessions.currency'),
    ('payment_sessions.payable_amount'), ('payment_sessions.expires_at'),
    ('payment_sessions.closed_at'), ('payment_sessions.provider_transaction_id'),
    ('payment_sessions.last_synced_at'), ('payment_sessions.last_error'),
    ('payment_sessions.metadata'), ('payment_sessions.updated_at'),
    ('order_payments.id'), ('order_payments.order_id'), ('order_payments.user_id'),
    ('order_payments.payment_session_id'), ('order_payments.status'),
    ('order_payments.amount'), ('order_payments.currency'),
    ('order_payments.order_amount'), ('order_payments.order_currency'),
    ('order_payments.payment_method'), ('order_payments.network'),
    ('order_payments.transaction_reference'), ('order_payments.payable_amount'),
    ('order_payments.payable_currency'), ('order_payments.received_currency'),
    ('order_payments.received_amount'), ('order_payments.provider_trade_no'),
    ('order_payments.callback_status'),
    ('order_payments.exception_type'), ('order_payments.error_summary'),
    ('order_payments.reviewed_at'), ('order_payments.reviewed_by'),
    ('order_payments.updated_at'),
    ('orders.id'), ('orders.user_id'), ('orders.order_no'), ('orders.status'),
    ('orders.total_amount'), ('orders.currency'), ('orders.payment_method'),
    ('orders.payment_status'), ('orders.payment_expires_at'),
    ('orders.reservation_released_at'), ('orders.cancelled_at'), ('orders.updated_at'),
    ('profiles.id'), ('profiles.balance'), ('profiles.updated_at'),
    ('balance_transactions.id'), ('balance_transactions.user_id'),
    ('balance_transactions.transaction_no'), ('balance_transactions.business_type'),
    ('balance_transactions.business_id'), ('balance_transactions.direction'),
    ('balance_transactions.amount'), ('balance_transactions.balance_before'),
    ('balance_transactions.balance_after'), ('balance_transactions.currency'),
    ('balance_transactions.status'), ('balance_transactions.remark'),
    ('balance_transactions.metadata')
  ) as v(name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(v.name, '.', 1)
      and c.column_name = split_part(v.name, '.', 2)
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_COLUMNS_MISSING: %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'profiles'
      and c.column_name = 'balance' and c.data_type = 'numeric'
      and c.numeric_precision = 12 and c.numeric_scale = 2
  ) then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_PROFILE_BALANCE_TYPE_INVALID';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid) into v_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.chain_payment_sessions'::regclass
    and c.conname = 'chain_payment_sessions_status_check' and c.contype = 'c';
  if v_constraint is null
     or position('underpaid' in lower(v_constraint)) = 0
     or position('expired' in lower(v_constraint)) = 0 then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_CHAIN_STATUS_INVALID';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid) into v_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.chain_transactions'::regclass
    and c.conname = 'chain_transactions_status_check' and c.contype = 'c';
  if v_constraint is null or position('underpaid' in lower(v_constraint)) = 0 then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_TRANSACTION_STATUS_INVALID';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.balance_transactions'::regclass
      and i.indisunique
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(business_type, business_id)%'
  ) then
    raise exception 'BEP20_UNDERPAYMENT_PREFLIGHT_BALANCE_IDEMPOTENCY_MISSING';
  end if;
end;
$$;

create table public.bep20_underpayment_dispositions (
  chain_session_id uuid primary key
    references public.chain_payment_sessions(id) on delete restrict,
  order_id uuid not null unique
    references public.orders(id) on delete restrict,
  user_id uuid not null
    references auth.users(id) on delete restrict,
  payment_id uuid not null unique
    references public.order_payments(id) on delete restrict,
  payment_session_id uuid not null unique
    references public.payment_sessions(id) on delete restrict,
  balance_transaction_id uuid not null unique
    references public.balance_transactions(id) on delete restrict,
  received_usdt numeric(36,18) not null,
  expected_usdt numeric(36,18) not null,
  shortfall_usdt numeric(36,18) not null,
  exchange_rate numeric(36,18) not null,
  credited_cny numeric(18,2) not null,
  disposition text not null,
  settlement_source text not null,
  processed_by uuid references auth.users(id) on delete restrict,
  processed_at timestamptz not null,
  reason text not null,
  request_id text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bep20_underpayment_received_positive check (received_usdt > 0),
  constraint bep20_underpayment_expected_greater check (expected_usdt > received_usdt),
  constraint bep20_underpayment_shortfall_exact check (shortfall_usdt = expected_usdt - received_usdt),
  constraint bep20_underpayment_exchange_rate_positive check (exchange_rate > 0),
  constraint bep20_underpayment_credit_positive check (credited_cny > 0),
  constraint bep20_underpayment_disposition_check check (disposition = 'wallet_credit'),
  constraint bep20_underpayment_source_check
    check (settlement_source in ('automatic_service','manual_admin')),
  constraint bep20_underpayment_operator_check check (
    (settlement_source = 'automatic_service' and processed_by is null)
    or (settlement_source = 'manual_admin' and processed_by is not null)
  ),
  constraint bep20_underpayment_reason_length check (length(btrim(reason)) between 1 and 500),
  constraint bep20_underpayment_request_length check (length(btrim(request_id)) between 1 and 200),
  constraint bep20_underpayment_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index bep20_underpayment_user_processed_idx
  on public.bep20_underpayment_dispositions(user_id, processed_at desc);
create index bep20_underpayment_processed_idx
  on public.bep20_underpayment_dispositions(processed_at desc);

alter table public.bep20_underpayment_dispositions enable row level security;
revoke all privileges on table public.bep20_underpayment_dispositions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.bep20_underpayment_dispositions
  to service_role;

create function public.settle_bep20_underpayment_to_wallet(
  p_session_id uuid,
  p_required_confirmations integer,
  p_reason text,
  p_request_id text default null,
  p_settlement_source text default 'automatic_service',
  p_operator_user_id uuid default null
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
  if v_source = 'manual_admin'
     and (p_operator_user_id is null or not public.is_super_admin(p_operator_user_id)) then
    raise exception 'BEP20_UNDERPAYMENT_SUPER_ADMIN_REQUIRED';
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
  if v_now <= v_deadline then
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
      'settlement_source', v_source
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
    jsonb_build_object('chain_id', 56, 'tx_hash_claim_retained', true)
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
        'settlement_source', v_source
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

  -- The existing chain-session trigger first records the terminal chain state
  -- on order_payments. Close it explicitly afterwards so the final financial
  -- record cannot be left as merely expired by that trigger.
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
      jsonb_build_object('order_id', v_order.id, 'reason', v_reason, 'settlement_source', v_source)
    );
  end if;

  return jsonb_build_object(
    'result', 'settled', 'idempotent', false,
    'chain_session_id', v_chain.id, 'order_id', v_order.id,
    'order_no', v_order.order_no,
    'received_usdt', v_received_usdt, 'expected_usdt', v_expected_usdt,
    'shortfall_usdt', v_shortfall_usdt, 'exchange_rate', v_chain.exchange_rate,
    'credited_cny', v_credited_cny, 'settlement_source', v_source,
    'processed_at', v_now, 'release', v_release
  );
end;
$$;

revoke all on function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)
  to service_role;
alter function public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)
  owner to postgres;

create function public.list_expirable_bep20_underpayments(p_limit integer default 50)
returns table(session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_role <> 'service_role' then
    raise exception 'BEP20_UNDERPAYMENT_SERVICE_ROLE_REQUIRED';
  end if;

  return query
  select cps.id
  from public.chain_payment_sessions cps
  join public.orders o on o.id = cps.order_id
  join public.payment_sessions ps on ps.id = cps.payment_session_id
  join public.order_payments op on op.id = cps.payment_id
  where cps.status = 'underpaid'
    and cps.manual_review_decision is null
    and nullif(btrim(coalesce(cps.submitted_tx_hash, '')), '') is not null
    and cps.confirmed_at is not null
    and cps.chain_id = 56
    and upper(cps.network) = 'BEP20'
    and upper(cps.asset) = 'USDT'
    and upper(cps.payment_currency) = 'USDT'
    and upper(cps.order_currency) = 'CNY'
    and cps.exchange_rate > 0
    and nullif(btrim(cps.token_contract), '') is not null
    and nullif(btrim(cps.receive_address), '') is not null
    and cps.confirmed_raw_amount > 0
    and cps.confirmed_raw_amount < cps.expected_raw_amount
    and cps.confirmed_amount > 0
    and cps.confirmed_amount < cps.expected_amount
    and o.status = 'pending_payment'
    and o.payment_status = 'unpaid'
    and upper(o.currency) = 'CNY'
    and lower(o.payment_method) = 'usdt_bep20'
    and o.total_amount > 0
    and o.reservation_released_at is null
    and ps.status in ('pending','processing')
    and ps.business_type = 'order'
    and ps.business_id = o.id
    and ps.user_id = o.user_id
    and ps.business_no = o.order_no
    and lower(ps.channel_code) = 'usdt_bep20'
    and upper(ps.network) = 'BEP20'
    and lower(ps.wallet_address) = lower(cps.receive_address)
    and op.status = 'under_review'
    and ps.payable_amount is not null
    and ps.payable_amount is not distinct from cps.expected_amount
    and upper(coalesce(ps.currency, '')) = 'USDT'
    and op.payment_session_id = ps.id
    and op.order_id = o.id
    and op.user_id = o.user_id
    and lower(op.payment_method) = 'usdt_bep20'
    and upper(op.network) = 'BEP20'
    and op.amount is not distinct from o.total_amount
    and op.order_amount is not distinct from o.total_amount
    and upper(op.currency) = 'CNY'
    and upper(op.order_currency) = 'CNY'
    and cps.order_amount is not distinct from o.total_amount
    and op.payable_amount is not null
    and op.payable_amount is not distinct from cps.expected_amount
    and upper(coalesce(op.payable_currency, '')) = 'USDT'
    and op.received_amount is not null
    and op.received_amount is not distinct from cps.confirmed_amount
    and upper(coalesce(op.received_currency, '')) = 'USDT'
    and o.payment_expires_at is not null
    and ps.expires_at is not null
    and cps.expires_at is not null
    and least(o.payment_expires_at, ps.expires_at, cps.expires_at) < now()
    and not exists (
      select 1 from public.bep20_underpayment_dispositions bud
      where bud.chain_session_id = cps.id
    )
  order by least(o.payment_expires_at, ps.expires_at, cps.expires_at), cps.created_at
  limit v_limit;
end;
$$;

revoke all on function public.list_expirable_bep20_underpayments(integer)
  from public, anon, authenticated;
grant execute on function public.list_expirable_bep20_underpayments(integer)
  to service_role;
alter function public.list_expirable_bep20_underpayments(integer)
  owner to postgres;

do $$
declare
  v_definition text;
  v_public_execute boolean;
  v_public_table_access boolean;
  v_constraint_count integer;
  v_column_count integer;
begin
  if to_regclass('public.bep20_underpayment_dispositions') is null
     or to_regprocedure('public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)') is null
     or to_regprocedure('public.list_expirable_bep20_underpayments(integer)') is null then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_OBJECTS_MISSING';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.bep20_underpayment_dispositions'::regclass
      and c.relrowsecurity
  ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_RLS_DISABLED';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = 'public.bep20_underpayment_dispositions'::regclass
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) into v_public_table_access;

  if v_public_table_access
     or has_table_privilege('anon', 'public.bep20_underpayment_dispositions', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.bep20_underpayment_dispositions', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.bep20_underpayment_dispositions', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_TABLE_ACL_FAILED';
  end if;

  select count(*) into v_column_count
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'bep20_underpayment_dispositions';
  if v_column_count <> 19
     or not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'bep20_underpayment_dispositions'
         and c.column_name = 'received_usdt' and c.data_type = 'numeric'
         and c.numeric_precision = 36 and c.numeric_scale = 18 and c.is_nullable = 'NO'
     )
     or not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'bep20_underpayment_dispositions'
         and c.column_name = 'credited_cny' and c.data_type = 'numeric'
         and c.numeric_precision = 18 and c.numeric_scale = 2 and c.is_nullable = 'NO'
     ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_COLUMNS_INVALID';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where p.oid in (
      'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)'::regprocedure,
      'public.list_expirable_bep20_underpayments(integer)'::regprocedure
    ) and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;

  if v_public_execute
     or has_function_privilege('anon', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_expirable_bep20_underpayments(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_expirable_bep20_underpayments(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.list_expirable_bep20_underpayments(integer)', 'EXECUTE') then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_FUNCTION_ACL_FAILED';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (
      'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)'::regprocedure,
      'public.list_expirable_bep20_underpayments(integer)'::regprocedure
    )
      and (
        pg_catalog.pg_get_userbyid(p.proowner) is distinct from 'postgres'
        or not p.prosecdef
        or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public']::text[]
      )
  ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_FUNCTION_SECURITY_INVALID';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)'::regprocedure
  ) into v_definition;
  if position('SECURITY DEFINER' in upper(v_definition)) = 0
     or position('SET search_path TO ''public''' in v_definition) = 0
     or position('pg_advisory_xact_lock' in v_definition) = 0
     or position('for update' in lower(v_definition)) = 0
     or position('release_order_inventory' in v_definition) = 0
     or position('complete_payment_session' in v_definition) > 0
     or position('deliver_digital_order' in v_definition) > 0 then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_SETTLEMENT_DEFINITION_FAILED';
  end if;

  select count(*) into v_constraint_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.bep20_underpayment_dispositions'::regclass
    and c.contype in ('p','u','f','c');
  if v_constraint_count < 17 then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_CONSTRAINTS_INCOMPLETE: %', v_constraint_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.bep20_underpayment_dispositions'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'processed_by'
      and c.confdeltype in ('a','r')
  ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_PROCESSED_BY_FK_DELETE_ACTION_INVALID';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'profiles'
      and c.column_name = 'balance' and c.data_type = 'numeric'
      and c.numeric_precision = 12 and c.numeric_scale = 2
  ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_PROFILE_BALANCE_CHANGED';
  end if;

  if exists (
    select 1 from public.bep20_underpayment_dispositions
  ) then
    raise exception 'BEP20_UNDERPAYMENT_POSTCHECK_HISTORY_MUTATED';
  end if;
end;
$$;

commit;

-- Rollback/degradation guidance:
-- Disable callers and revoke EXECUTE before dropping the two RPCs. The table may
-- be dropped only while empty. Once a disposition exists, preserve the table,
-- wallet ledger row, claim and chain evidence; never reverse a financial credit
-- by deleting evidence. Use a separately reviewed compensating transaction.
