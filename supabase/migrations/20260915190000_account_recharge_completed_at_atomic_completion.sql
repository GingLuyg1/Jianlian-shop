-- Forward-only compatibility fix for final account-recharge completion time.
-- This migration redefines completion functions only. It does not backfill or
-- otherwise update any existing account_recharges row.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  completed_at_type text;
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_PREFLIGHT_TABLE_MISSING';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into completed_at_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.account_recharges'::regclass
    and a.attname = 'completed_at'
    and a.attnum > 0
    and not a.attisdropped;

  if completed_at_type is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_PREFLIGHT_COLUMN_MISSING';
  end if;
  if completed_at_type <> 'timestamp with time zone' then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_PREFLIGHT_TYPE_INVALID: %', completed_at_type;
  end if;

  if to_regprocedure('public.credit_account_recharge_balance(text,text,numeric,text)') is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_PREFLIGHT_CNY_FUNCTION_MISSING';
  end if;
  if to_regprocedure('public.credit_auto_matched_account_recharge_bep20_v3(uuid,text)') is null then
    raise exception 'ACCOUNT_RECHARGE_COMPLETED_AT_PREFLIGHT_BEP20_FUNCTION_MISSING';
  end if;
end $$;

create or replace function public.credit_account_recharge_balance(
  p_recharge_no text,
  p_provider_trade_no text,
  p_received_amount numeric,
  p_currency text default 'CNY'
)
returns public.balance_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.account_recharges;
  v_profile public.profiles;
  v_transaction public.balance_transactions;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_transaction_no text;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception '无权执行余额入账';
  end if;

  select * into v_recharge
  from public.account_recharges
  where recharge_no = p_recharge_no
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status in ('closed','expired','failed','refunded') then
    raise exception '充值单状态不允许入账';
  end if;

  if round(coalesce(p_received_amount, 0)::numeric, 6) <> round(coalesce(v_recharge.payable_amount, v_recharge.amount, 0)::numeric, 6) then
    raise exception '到账金额与应付金额不一致';
  end if;

  if upper(coalesce(p_currency, v_recharge.currency, 'CNY')) <> upper(coalesce(v_recharge.currency, 'CNY')) then
    raise exception '到账币种与充值单币种不一致';
  end if;

  select * into v_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = v_recharge.recharge_no
    and status = 'completed'
  limit 1;

  if found then
    return v_transaction;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_recharge.user_id
  for update;

  if not found then
    raise exception '用户资料不存在';
  end if;

  v_before := coalesce(v_profile.balance, 0);
  v_after := v_before + coalesce(v_recharge.amount, 0);
  v_transaction_no := 'BT' || to_char(now(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 8));

  update public.profiles
  set balance = v_after,
      updated_at = now()
  where id = v_recharge.user_id;

  update public.account_recharges
  set status = 'paid',
      provider_trade_no = coalesce(nullif(p_provider_trade_no, ''), provider_trade_no),
      received_amount = p_received_amount,
      credited_amount = v_recharge.amount,
      paid_at = coalesce(paid_at, now()),
      completed_at = coalesce(completed_at, now()),
      callback_status = 'success',
      updated_at = now()
  where id = v_recharge.id;

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    v_recharge.user_id, v_transaction_no, 'account_recharge', v_recharge.recharge_no, 'credit', v_recharge.amount,
    v_before, v_after, coalesce(v_recharge.currency, 'CNY'), 'completed', '账户充值入账',
    jsonb_build_object('provider_trade_no_present', nullif(p_provider_trade_no, '') is not null)
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.credit_account_recharge_balance(text,text,numeric,text) from public;
revoke execute on function public.credit_account_recharge_balance(text,text,numeric,text) from anon;
grant execute on function public.credit_account_recharge_balance(text,text,numeric,text) to service_role;

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
      completed_at = coalesce(completed_at, now()),
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

commit;
