-- Candidate only. Do not execute without separate database authorization.
-- Phase 3: atomic BEP20 fingerprint match + exact requested-CNY balance credit.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.account_recharge_chain_claims') is null
     or to_regclass('public.bep20_transaction_usage_registry') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null
     or to_regclass('public.recharge_review_events') is null
     or to_regprocedure(
       'public.match_account_recharge_bep20_fingerprint_v2(integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)'
     ) is null then
    raise exception 'account recharge BEP20 auto-credit V3 prerequisites are missing';
  end if;
end $$;

create or replace function public.credit_auto_matched_account_recharge_bep20_v3(
  p_recharge_id uuid,
  p_tx_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_recharge public.account_recharges;
  target_claim public.account_recharge_chain_claims;
  target_usage public.bep20_transaction_usage_registry;
  target_profile public.profiles;
  existing_transaction public.balance_transactions;
  created_transaction public.balance_transactions;
  normalized_hash text := lower(btrim(p_tx_hash));
  prior_status text;
  credited_cny numeric(18, 2);
  before_balance numeric(18, 2);
  after_balance numeric(18, 2);
  transaction_no text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'credit_auto_matched_account_recharge_bep20_v3 requires service_role';
  end if;

  if p_recharge_id is null
     or normalized_hash is null
     or normalized_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'invalid account recharge auto-credit input';
  end if;

  select * into target_recharge
  from public.account_recharges
  where id = p_recharge_id
  for update;

  if not found then
    raise exception 'account recharge auto-credit target not found';
  end if;

  if target_recharge.channel is distinct from 'usdt_bep20'
     or target_recharge.channel_code is distinct from 'usdt_bep20'
     or target_recharge.currency is distinct from 'CNY'
     or target_recharge.settlement_currency is distinct from 'USDT'
     or target_recharge.requested_cny_amount is null
     or target_recharge.requested_cny_amount <= 0
     or target_recharge.expected_usdt_amount is null
     or target_recharge.expected_usdt_amount <= 0
     or target_recharge.actual_received_usdt is distinct from target_recharge.expected_usdt_amount
     or target_recharge.match_method is distinct from 'amount_fingerprint'
     or target_recharge.matched_at is null
     or target_recharge.transaction_reference is distinct from normalized_hash
     or target_recharge.provider_trade_no is distinct from normalized_hash then
    raise exception 'account recharge is not eligible for fingerprint auto-credit';
  end if;

  select * into target_claim
  from public.account_recharge_chain_claims
  where recharge_id = target_recharge.id
  for update;

  if not found
     or target_claim.chain_id is distinct from 56
     or target_claim.tx_hash is distinct from normalized_hash
     or target_claim.actual_received_usdt is distinct from target_recharge.expected_usdt_amount
     or lower(target_claim.token_contract) is distinct from lower(target_recharge.payment_token_contract)
     or lower(target_claim.to_address) is distinct from lower(target_recharge.payment_address) then
    raise exception 'account recharge auto-credit chain evidence mismatch';
  end if;

  select * into target_usage
  from public.bep20_transaction_usage_registry
  where chain_id = 56
    and tx_hash = normalized_hash
  for update;

  if not found
     or target_usage.usage_type is distinct from 'account_recharge'
     or target_usage.business_id is distinct from target_recharge.id then
    raise exception 'account recharge auto-credit transaction ownership mismatch';
  end if;

  credited_cny := target_recharge.requested_cny_amount;

  select * into existing_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = target_recharge.recharge_no
    and status = 'completed'
  order by created_at asc
  limit 1
  for update;

  if found then
    if existing_transaction.user_id is distinct from target_recharge.user_id
       or existing_transaction.direction is distinct from 'credit'
       or existing_transaction.currency is distinct from 'CNY'
       or existing_transaction.amount is distinct from credited_cny
       or existing_transaction.metadata->>'credit_policy' is distinct from 'requested_cny_exact'
       or existing_transaction.metadata->>'match_method' is distinct from 'amount_fingerprint'
       or target_recharge.status is distinct from 'paid'
       or target_recharge.credited_cny_amount is distinct from credited_cny
       or target_recharge.credited_amount is distinct from credited_cny
       or target_recharge.received_amount is distinct from credited_cny
       or target_recharge.provider_trade_no is distinct from normalized_hash
       or target_recharge.callback_status is distinct from 'success' then
      raise exception 'existing account recharge credit is inconsistent';
    end if;

    return jsonb_build_object(
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no,
      'credited', false,
      'alreadyCredited', true,
      'transactionNo', existing_transaction.transaction_no
    );
  end if;

  if target_recharge.status is distinct from 'submitted'
     or target_recharge.credited_cny_amount is not null
     or coalesce(target_recharge.credited_amount, 0) <> 0 then
    raise exception 'account recharge status does not allow fingerprint auto-credit';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_recharge.user_id
  for update;

  if not found then
    raise exception 'account recharge auto-credit profile not found';
  end if;

  prior_status := target_recharge.status;
  before_balance := coalesce(target_profile.balance, 0);
  after_balance := before_balance + credited_cny;
  transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
    || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  update public.profiles
  set balance = after_balance,
      updated_at = now()
  where id = target_recharge.user_id;

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    target_recharge.user_id,
    transaction_no,
    'account_recharge',
    target_recharge.recharge_no,
    'credit',
    credited_cny,
    before_balance,
    after_balance,
    'CNY',
    'completed',
    'USDT-BEP20 fingerprint recharge credited by exact requested CNY amount',
    jsonb_build_object(
      'settlement_currency', 'USDT',
      'expected_usdt_amount', target_recharge.expected_usdt_amount,
      'actual_received_usdt', target_recharge.actual_received_usdt,
      'requested_cny_amount', target_recharge.requested_cny_amount,
      'credited_cny_amount', credited_cny,
      'credit_policy', 'requested_cny_exact',
      'match_method', 'amount_fingerprint',
      'tx_hash_present', true
    )
  )
  returning * into created_transaction;

  update public.account_recharges
  set status = 'paid',
      provider_trade_no = normalized_hash,
      credited_cny_amount = credited_cny,
      credited_amount = credited_cny,
      received_amount = credited_cny,
      paid_at = coalesce(paid_at, now()),
      callback_status = 'success',
      updated_at = now()
  where id = target_recharge.id;

  insert into public.recharge_review_events (
    recharge_id, recharge_no, actor_user_id, actor_type, action,
    from_status, to_status, reason, request_id, metadata
  ) values (
    target_recharge.id,
    target_recharge.recharge_no,
    null,
    'system',
    'auto_bep20_fingerprint_credit_v3',
    prior_status,
    'paid',
    'BEP20 fingerprint recharge credited atomically by requested CNY amount',
    gen_random_uuid()::text,
    jsonb_build_object(
      'requested_cny_amount', target_recharge.requested_cny_amount,
      'expected_usdt_amount', target_recharge.expected_usdt_amount,
      'actual_received_usdt', target_recharge.actual_received_usdt,
      'credited_cny_amount', credited_cny,
      'credit_policy', 'requested_cny_exact',
      'match_method', 'amount_fingerprint',
      'chain_id', 56,
      'tx_hash_present', true
    )
  );

  return jsonb_build_object(
    'rechargeId', target_recharge.id,
    'rechargeNo', target_recharge.recharge_no,
    'credited', true,
    'alreadyCredited', false,
    'transactionNo', created_transaction.transaction_no
  );
end;
$$;

revoke all on function public.credit_auto_matched_account_recharge_bep20_v3(uuid,text)
  from public, anon, authenticated;
grant execute on function public.credit_auto_matched_account_recharge_bep20_v3(uuid,text)
  to service_role;

create or replace function public.match_and_credit_account_recharge_bep20_v3(
  p_chain_id integer,
  p_tx_hash text,
  p_log_index integer,
  p_block_number numeric,
  p_block_hash text,
  p_block_timestamp timestamptz,
  p_token_contract text,
  p_from_address text,
  p_to_address text,
  p_raw_amount numeric,
  p_actual_received_usdt numeric,
  p_confirmation_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_hash text := lower(btrim(p_tx_hash));
  normalized_block_hash text := lower(btrim(p_block_hash));
  normalized_token text := lower(btrim(p_token_contract));
  normalized_to text := lower(btrim(p_to_address));
  normalized_from text := nullif(lower(btrim(coalesce(p_from_address, ''))), '');
  existing_claim public.account_recharge_chain_claims;
  match_result jsonb;
  credit_result jsonb;
  match_kind text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'match_and_credit_account_recharge_bep20_v3 requires service_role';
  end if;

  if p_chain_id is distinct from 56
     or normalized_hash is null
     or normalized_hash !~ '^0x[0-9a-f]{64}$'
     or normalized_block_hash is null
     or normalized_block_hash !~ '^0x[0-9a-f]{64}$'
     or normalized_token is null
     or normalized_token !~ '^0x[0-9a-f]{40}$'
     or normalized_to is null
     or normalized_to !~ '^0x[0-9a-f]{40}$'
     or (normalized_from is not null and normalized_from !~ '^0x[0-9a-f]{40}$')
     or p_log_index is null
     or p_log_index < 0
     or p_block_number is null
     or p_block_number < 0
     or p_raw_amount is null
     or p_raw_amount <= 0
     or p_actual_received_usdt is null
     or p_actual_received_usdt <= 0
     or p_confirmation_count is null
     or p_confirmation_count <= 0
     or p_block_timestamp is null then
    raise exception 'invalid account recharge BEP20 auto-credit evidence';
  end if;

  -- Paid or submitted replay: never call V2 again for the same claimed transfer.
  -- Locate the claim without locking it first. The helper then takes locks in the
  -- same recharge -> claim order as V2, avoiding a claim -> recharge inversion.
  -- Full evidence is re-read under that lock before this transaction can commit.
  select * into existing_claim
  from public.account_recharge_chain_claims
  where chain_id = p_chain_id
    and tx_hash = normalized_hash;

  if found then
    credit_result := public.credit_auto_matched_account_recharge_bep20_v3(
      existing_claim.recharge_id,
      normalized_hash
    );

    select * into existing_claim
    from public.account_recharge_chain_claims
    where chain_id = p_chain_id
      and tx_hash = normalized_hash
    for update;

    if not found then
      raise exception 'existing account recharge claim disappeared during replay';
    end if;

    if existing_claim.log_index is distinct from p_log_index
       or existing_claim.block_number is distinct from p_block_number
       or lower(existing_claim.block_hash) is distinct from normalized_block_hash
       or existing_claim.block_timestamp is distinct from p_block_timestamp
       or lower(existing_claim.token_contract) is distinct from normalized_token
       or lower(existing_claim.from_address) is distinct from normalized_from
       or lower(existing_claim.to_address) is distinct from normalized_to
       or existing_claim.raw_amount is distinct from p_raw_amount
       or existing_claim.actual_received_usdt is distinct from p_actual_received_usdt
       or p_confirmation_count < existing_claim.confirmation_count then
      raise exception 'existing account recharge claim evidence mismatch';
    end if;

    return jsonb_build_object(
      'result', 'already_matched',
      'rechargeId', existing_claim.recharge_id
    ) || credit_result;
  end if;

  match_result := public.match_account_recharge_bep20_fingerprint_v2(
    p_chain_id,
    normalized_hash,
    p_log_index,
    p_block_number,
    normalized_block_hash,
    p_block_timestamp,
    normalized_token,
    normalized_from,
    normalized_to,
    p_raw_amount,
    p_actual_received_usdt,
    p_confirmation_count
  );

  match_kind := match_result->>'result';
  if match_kind in ('matched', 'already_matched') then
    credit_result := public.credit_auto_matched_account_recharge_bep20_v3(
      (match_result->>'rechargeId')::uuid,
      normalized_hash
    );
    return match_result || credit_result;
  end if;

  if match_kind is null or match_kind not in (
    'unmatched',
    'ambiguous_order_payment',
    'tx_conflict',
    'terminal_recharge',
    'invalid_window'
  ) then
    raise exception 'account recharge BEP20 V2 returned an unknown match result';
  end if;

  return match_result || jsonb_build_object(
    'credited', false,
    'alreadyCredited', false
  );
end;
$$;

revoke all on function public.match_and_credit_account_recharge_bep20_v3(
  integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer
) from public, anon, authenticated;
grant execute on function public.match_and_credit_account_recharge_bep20_v3(
  integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer
) to service_role;

commit;
