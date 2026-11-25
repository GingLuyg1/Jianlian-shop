-- Candidate migration for TRON Network (USDT-TRC20) account recharge closed-loop.
-- Forward-only, additive, and 100% backward-compatible with existing BEP20 V3 rows.
-- Does NOT auto-enable the usdt_trc20 channel; admin/operator explicitly enables after env + test verification.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.account_recharge_chain_claims') is null
     or to_regclass('public.account_recharge_amount_reservations') is null
     or to_regclass('public.bep20_transaction_usage_registry') is null
     or to_regclass('public.payment_channels') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null then
    raise exception 'TRC20 closed-loop prerequisites are missing';
  end if;
end $$;

-- 1. Extend account_recharges USDT/CNY snapshot check to accept both usdt_bep20 (EVM 0x...) and usdt_trc20 (TRON T...)
alter table public.account_recharges
  drop constraint if exists account_recharges_usdt_cny_amounts_check;

alter table public.account_recharges
  add constraint account_recharges_usdt_cny_amounts_check check (
    (requested_cny_amount is null and expected_usdt_amount is null
      and actual_received_usdt is null and credited_cny_amount is null
      and settlement_currency is null and locked_market_rate is null
      and locked_settlement_rate is null and rate_source is null
      and rate_effective_date is null and rate_effective_at is null and rate_locked_at is null)
    or
    (
      currency = 'CNY' and settlement_currency = 'USDT'
      and (
        (channel_code = 'usdt_bep20' and channel = 'usdt_bep20'
          and payment_address ~* '^0x[0-9a-f]{40}$'
          and payment_token_contract ~* '^0x[0-9a-f]{40}$')
        or
        (channel_code = 'usdt_trc20' and channel = 'usdt_trc20'
          and payment_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
          and payment_token_contract ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
      )
      and requested_cny_amount > 0 and expected_usdt_amount > 0
      and locked_market_rate > 0 and locked_settlement_rate > 0
      and locked_settlement_rate = trunc(locked_market_rate, 1)
      and length(btrim(rate_source)) between 1 and 120
      and rate_effective_date is not null and rate_effective_at is not null and rate_locked_at is not null
      and (actual_received_usdt is null or actual_received_usdt > 0)
      and (credited_cny_amount is null or credited_cny_amount > 0)
    )
  ) not valid;

alter table public.account_recharges
  validate constraint account_recharges_usdt_cny_amounts_check;

-- 2. Extend account_recharge_amount_reservations & reserve_account_recharge_usdt_fingerprint_v3 for TRON Base58Check addresses
alter table public.account_recharge_amount_reservations
  drop constraint if exists account_recharge_amount_reservations_address_check;

alter table public.account_recharge_amount_reservations
  add constraint account_recharge_amount_reservations_address_check check (
    (payment_address = lower(payment_address) and payment_address ~ '^0x[0-9a-f]{40}$')
    or (payment_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
  );

create or replace function public.reserve_account_recharge_usdt_fingerprint_v3(
  p_recharge_id uuid,
  p_payment_address text,
  p_theoretical_usdt numeric,
  p_minimum_usdt numeric,
  p_maximum_usdt numeric,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  trimmed_address text := btrim(coalesce(p_payment_address, ''));
  normalized_address text;
  existing_reservation public.account_recharge_amount_reservations;
  base_tenth numeric(36, 4);
  candidate numeric(36, 4);
  reserved_amount numeric(36, 4);
  start_slot integer := floor(random() * 1000)::integer;
  slot integer;
  offset_index integer;
  minimum_amount numeric := coalesce(p_minimum_usdt, 0);
  maximum_amount numeric := coalesce(p_maximum_usdt, 0);
  quarantine_until_value timestamptz := p_expires_at + interval '24 hours';
begin
  if auth.role() <> 'service_role' then
    raise exception 'reserve_account_recharge_usdt_fingerprint_v3 requires service_role';
  end if;

  if trimmed_address ~* '^0x[0-9a-f]{40}$' then
    normalized_address := lower(trimmed_address);
  elsif trimmed_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
    normalized_address := trimmed_address;
  else
    normalized_address := '';
  end if;

  if p_recharge_id is null
     or normalized_address = ''
     or p_theoretical_usdt <= 0
     or minimum_amount < 0
     or maximum_amount < 0
     or (maximum_amount > 0 and maximum_amount < minimum_amount)
     or p_expires_at <= now()
     or p_expires_at > now() + interval '2 hours' then
    raise exception 'invalid recharge fingerprint reservation input';
  end if;

  select * into existing_reservation
  from public.account_recharge_amount_reservations
  where recharge_id = p_recharge_id
  for update;

  if found and existing_reservation.quarantine_until > now() then
    return jsonb_build_object(
      'expectedUsdtAmount', to_char(existing_reservation.expected_usdt_amount, 'FM999999999999999999999999999999990.0000'),
      'expiresAt', existing_reservation.expires_at,
      'quarantineUntil', existing_reservation.quarantine_until,
      'reused', true
    );
  elsif found then
    delete from public.account_recharge_amount_reservations
    where recharge_id = p_recharge_id;
  end if;

  base_tenth := trunc(p_theoretical_usdt, 1);

  for offset_index in 0..999 loop
    slot := mod(start_slot + offset_index, 1000);
    candidate := trunc(base_tenth + (slot::numeric / 10000), 4);

    if candidate < minimum_amount
       or (maximum_amount > 0 and candidate > maximum_amount) then
      continue;
    end if;

    reserved_amount := null;
    insert into public.account_recharge_amount_reservations (
      payment_address,
      expected_usdt_amount,
      recharge_id,
      reserved_at,
      expires_at,
      quarantine_until
    ) values (
      normalized_address,
      candidate,
      p_recharge_id,
      now(),
      p_expires_at,
      quarantine_until_value
    )
    on conflict (payment_address, expected_usdt_amount) do update
      set recharge_id = excluded.recharge_id,
          reserved_at = excluded.reserved_at,
          expires_at = excluded.expires_at,
          quarantine_until = excluded.quarantine_until
      where public.account_recharge_amount_reservations.quarantine_until <= now()
    returning expected_usdt_amount into reserved_amount;

    if reserved_amount is not null then
      return jsonb_build_object(
        'expectedUsdtAmount', to_char(reserved_amount, 'FM999999999999999999999999999999990.0000'),
        'expiresAt', p_expires_at,
        'quarantineUntil', quarantine_until_value,
        'reused', false
      );
    end if;
  end loop;

  raise exception 'RECHARGE_FINGERPRINT_EXHAUSTED';
end;
$$;

revoke all on function public.reserve_account_recharge_usdt_fingerprint_v3(uuid,text,numeric,numeric,numeric,timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_account_recharge_usdt_fingerprint_v3(uuid,text,numeric,numeric,numeric,timestamptz)
  to service_role;

-- 3. Extend global transaction usage registry to enforce replay protection across BSC (56) and TRON (728126428)
alter table public.bep20_transaction_usage_registry
  drop constraint if exists bep20_transaction_usage_chain_check,
  drop constraint if exists bep20_transaction_usage_hash_check;

alter table public.bep20_transaction_usage_registry
  add constraint bep20_transaction_usage_chain_check check (chain_id in (56, 728126428)),
  add constraint bep20_transaction_usage_hash_check check (
    (chain_id = 56 and tx_hash ~ '^0x[0-9a-f]{64}$')
    or (chain_id = 728126428 and tx_hash ~ '^[0-9a-f]{64}$')
  );

-- 4. Extend account_recharge_chain_claims to store verified TRON TRC20 claims alongside BSC BEP20 claims
alter table public.account_recharge_chain_claims
  drop constraint if exists account_recharge_chain_claims_chain_check,
  drop constraint if exists account_recharge_chain_claims_hash_check,
  drop constraint if exists account_recharge_chain_claims_address_check;

alter table public.account_recharge_chain_claims
  add constraint account_recharge_chain_claims_chain_check check (chain_id in (56, 728126428)),
  add constraint account_recharge_chain_claims_hash_check check (
    (chain_id = 56 and tx_hash ~ '^0x[0-9a-f]{64}$')
    or (chain_id = 728126428 and tx_hash ~ '^[0-9a-f]{64}$')
  ),
  add constraint account_recharge_chain_claims_address_check check (
    (chain_id = 56
      and token_contract ~ '^0x[0-9a-f]{40}$'
      and to_address ~ '^0x[0-9a-f]{40}$'
      and (from_address is null or from_address ~ '^0x[0-9a-f]{40}$'))
    or
    (chain_id = 728126428
      and token_contract ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      and to_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      and (from_address is null or from_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'))
  );

-- 5. Atomic TRON TRC20 recharge transfer claim RPC (service_role only, V3 exact fingerprint + payment window)
create or replace function public.claim_account_recharge_trc20_transfer(
  p_recharge_id uuid,
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
  target_recharge public.account_recharges;
  existing_usage public.bep20_transaction_usage_registry;
  existing_claim public.account_recharge_chain_claims;
  normalized_hash text := lower(btrim(p_tx_hash));
  clean_contract text := btrim(p_token_contract);
  clean_to text := btrim(p_to_address);
  clean_from text := nullif(btrim(coalesce(p_from_address, '')), '');
begin
  if auth.role() <> 'service_role' then
    raise exception 'claim_account_recharge_trc20_transfer requires service_role';
  end if;
  if p_chain_id <> 728126428 or normalized_hash !~ '^[0-9a-f]{64}$'
     or clean_contract !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
     or clean_to !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
     or (clean_from is not null and clean_from !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
     or p_actual_received_usdt <= 0 or p_confirmation_count < 19 then
    raise exception 'invalid account recharge TRC20 evidence';
  end if;

  select * into target_recharge from public.account_recharges
  where id = p_recharge_id for update;
  if not found or target_recharge.channel <> 'usdt_trc20'
     or target_recharge.channel_code <> 'usdt_trc20'
     or target_recharge.currency <> 'CNY'
     or target_recharge.settlement_currency <> 'USDT'
     or target_recharge.requested_cny_amount is null
     or target_recharge.requested_cny_amount <= 0
     or target_recharge.expected_usdt_amount is null
     or target_recharge.expires_at is null
     or target_recharge.payment_address <> clean_to
     or target_recharge.payment_token_contract <> clean_contract
     or target_recharge.locked_settlement_rate is null then
    raise exception 'recharge is not eligible for USDT-TRC20/CNY settlement';
  end if;

  if target_recharge.status not in ('waiting_payment', 'submitted', 'reviewing', 'approved', 'processing', 'paid', 'succeeded') then
    raise exception 'recharge status does not allow TRC20 verification';
  end if;

  if p_actual_received_usdt <> target_recharge.expected_usdt_amount then
    raise exception 'recharge fingerprint amount mismatch';
  end if;

  if p_block_timestamp < target_recharge.created_at - interval '2 minutes'
     or p_block_timestamp > target_recharge.expires_at then
    raise exception 'recharge payment is outside the valid payment window';
  end if;

  select * into existing_claim from public.account_recharge_chain_claims
  where recharge_id = p_recharge_id for update;
  if found then
    if existing_claim.tx_hash <> normalized_hash then
      raise exception 'recharge is already assigned to another transaction';
    end if;
    return jsonb_build_object(
      'result', 'already_verified',
      'actualReceivedUsdt', existing_claim.actual_received_usdt::text,
      'creditedCnyAmount', target_recharge.requested_cny_amount::text
    );
  end if;

  insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id)
  values (p_chain_id, normalized_hash, 'account_recharge', p_recharge_id)
  on conflict (chain_id, tx_hash) do nothing;

  select * into existing_usage from public.bep20_transaction_usage_registry
  where chain_id = p_chain_id and tx_hash = normalized_hash for update;
  if existing_usage.usage_type <> 'account_recharge' or existing_usage.business_id <> p_recharge_id then
    raise exception 'TRC20 transaction is already assigned to another business object';
  end if;

  insert into public.account_recharge_chain_claims (
    recharge_id, chain_id, tx_hash, log_index, block_number, block_hash,
    block_timestamp, token_contract, from_address, to_address, raw_amount,
    actual_received_usdt, confirmation_count
  ) values (
    p_recharge_id, p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_hash,
    p_block_timestamp, clean_contract, clean_from, clean_to,
    p_raw_amount, p_actual_received_usdt, p_confirmation_count
  );

  update public.account_recharges
  set actual_received_usdt = p_actual_received_usdt,
      transaction_reference = normalized_hash,
      provider_trade_no = normalized_hash,
      status = case when status in ('waiting_payment', 'submitted') then 'approved' else status end,
      submitted_at = coalesce(submitted_at, now()),
      matched_at = coalesce(matched_at, now()),
      match_method = coalesce(match_method, 'manual_tx_hash'),
      updated_at = now()
  where id = p_recharge_id;

  return jsonb_build_object(
    'result', 'verified',
    'actualReceivedUsdt', p_actual_received_usdt::text,
    'creditedCnyAmount', target_recharge.requested_cny_amount::text
  );
end;
$$;

revoke all on function public.claim_account_recharge_trc20_transfer(uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) from public, anon, authenticated;
grant execute on function public.claim_account_recharge_trc20_transfer(uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) to service_role;

-- 6. Extend complete_account_recharge_usdt_cny_v1 to support both usdt_bep20 and usdt_trc20 atomically (preserving V3 semantics, signature & ACL)
create or replace function public.complete_account_recharge_usdt_cny_v1(
  p_recharge_id uuid,
  p_provider_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_recharge public.account_recharges;
  target_profile public.profiles;
  target_claim public.account_recharge_chain_claims;
  existing_transaction public.balance_transactions;
  created_transaction public.balance_transactions;
  before_balance numeric(18, 2);
  after_balance numeric(18, 2);
  credited_cny numeric(18, 2);
  transaction_no text;
  normalized_hash text := lower(btrim(p_provider_transaction_id));
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_account_recharge_usdt_cny_v1 requires service_role';
  end if;

  select * into target_recharge
  from public.account_recharges
  where id = p_recharge_id
  for update;
  if not found then raise exception 'recharge not found'; end if;

  if target_recharge.channel_code = 'usdt_bep20' and normalized_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'provider transaction id is invalid';
  end if;
  if target_recharge.channel_code = 'usdt_trc20' and normalized_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'provider transaction id is invalid';
  end if;

  select * into target_claim
  from public.account_recharge_chain_claims
  where recharge_id = p_recharge_id
  for update;

  if not found
     or target_claim.tx_hash <> normalized_hash
     or target_claim.actual_received_usdt <> target_recharge.actual_received_usdt
     or target_claim.actual_received_usdt <> target_recharge.expected_usdt_amount then
    raise exception 'verified chain evidence does not match recharge fingerprint';
  end if;

  select * into existing_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = target_recharge.recharge_no
    and status = 'completed'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'alreadyCompleted', true,
      'rechargeNo', target_recharge.recharge_no,
      'transactionNo', existing_transaction.transaction_no
    );
  end if;

  if target_recharge.channel not in ('usdt_bep20', 'usdt_trc20')
     or target_recharge.channel_code <> target_recharge.channel
     or target_recharge.currency <> 'CNY'
     or target_recharge.settlement_currency <> 'USDT'
     or target_recharge.requested_cny_amount is null
     or target_recharge.requested_cny_amount <= 0
     or target_recharge.actual_received_usdt is null
     or target_recharge.expected_usdt_amount is null
     or target_recharge.status not in ('approved', 'processing') then
    raise exception 'recharge is not eligible for USDT/CNY V3 credit';
  end if;

  credited_cny := target_recharge.requested_cny_amount;

  select * into target_profile
  from public.profiles
  where id = target_recharge.user_id
  for update;
  if not found then raise exception 'profile not found'; end if;

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
    target_recharge.user_id, transaction_no, 'account_recharge', target_recharge.recharge_no,
    'credit', credited_cny, before_balance, after_balance, 'CNY', 'completed',
    format('%s account recharge credited by requested CNY amount', upper(replace(target_recharge.channel_code, '_', '-'))),
    jsonb_build_object(
      'channel_code', target_recharge.channel_code,
      'settlement_currency', 'USDT',
      'expected_usdt_amount', target_recharge.expected_usdt_amount,
      'actual_received_usdt', target_recharge.actual_received_usdt,
      'requested_cny_amount', target_recharge.requested_cny_amount,
      'credited_cny_amount', credited_cny,
      'locked_settlement_rate', target_recharge.locked_settlement_rate,
      'rate_effective_date', target_recharge.rate_effective_date,
      'credit_policy', 'requested_cny_exact',
      'tx_hash_present', true
    )
  ) returning * into created_transaction;

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
  where id = p_recharge_id;

  return jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'rechargeNo', target_recharge.recharge_no,
    'transactionNo', created_transaction.transaction_no
  );
end;
$$;

revoke all on function public.complete_account_recharge_usdt_cny_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.complete_account_recharge_usdt_cny_v1(uuid,text)
  to service_role;

-- 7. Prepare payment_channels.usdt_trc20 metadata (kept enabled = false; operator enables explicitly after live check)
update public.payment_channels
set
  display_name = 'USDT-TRC20',
  currency = 'USDT',
  network = 'TRON',
  fee_rate = 0,
  min_amount = 1,
  minimum_amount = 1,
  provider = 'crypto_address',
  provider_name = 'crypto_address',
  configured = true,
  public_config = jsonb_build_object(
    'review_mode', 'manual',
    'payment_address', 'TL4aGps8PX8khNXZwm7wCx4YAbmdu6qgBU',
    'token_contract', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    'payment_instructions', '请仅通过 TRON Network (TRC20) 向本收款地址转入精确应付 USDT 金额，切勿跨链转账。'
  ),
  updated_at = now()
where code = 'usdt_trc20' or channel = 'usdt_trc20';

commit;
