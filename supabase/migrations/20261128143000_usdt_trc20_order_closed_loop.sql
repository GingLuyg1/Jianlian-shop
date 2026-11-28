-- Forward-only additive migration to enable TRON Network (USDT-TRC20) direct order payments
-- alongside existing BNB Smart Chain (USDT-BEP20) order payments with zero BEP20 regression.
-- Does NOT auto-enable payment_channels.usdt_trc20; operator enables explicitly after deploy.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.chain_transactions') is null
     or to_regclass('public.chain_transaction_claims') is null
     or to_regclass('public.bep20_transaction_usage_registry') is null
     or to_regclass('public.account_recharges') is null
     or to_regclass('public.payment_sessions') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.order_payments') is null then
    raise exception 'TRC20 order closed-loop prerequisites are missing';
  end if;
end $$;

-- 1. Extend chain_payment_sessions constraints to allow both usdt_bep20 (chain 56) and usdt_trc20 (chain 728126428)
alter table public.chain_payment_sessions
  drop constraint if exists chain_payment_sessions_method_check,
  drop constraint if exists chain_payment_sessions_chain_check,
  drop constraint if exists chain_payment_sessions_address_format_check,
  drop constraint if exists chain_payment_sessions_tx_hash_format_check;

alter table public.chain_payment_sessions
  add constraint chain_payment_sessions_method_check check (
    payment_method in ('usdt_bep20', 'usdt_trc20')
  ),
  add constraint chain_payment_sessions_chain_check check (
    (payment_method = 'usdt_bep20' and chain_id = 56)
    or (payment_method = 'usdt_trc20' and chain_id = 728126428)
  ),
  add constraint chain_payment_sessions_address_format_check check (
    (chain_id = 56
      and receive_address ~* '^0x[0-9a-f]{40}$'
      and token_contract ~* '^0x[0-9a-f]{40}$')
    or
    (chain_id = 728126428
      and receive_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      and token_contract ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$')
  ),
  add constraint chain_payment_sessions_tx_hash_format_check check (
    submitted_tx_hash is null
    or (chain_id = 56 and submitted_tx_hash ~* '^0x[0-9a-f]{64}$')
    or (chain_id = 728126428 and submitted_tx_hash ~ '^[0-9a-f]{64}$')
  );

-- Guarantee distinct active expected amounts on the same TRC20 receive address for deterministic auto-scan
create unique index if not exists chain_payment_sessions_trc20_active_amount_unique
  on public.chain_payment_sessions (receive_address, expected_amount)
  where payment_method = 'usdt_trc20'
    and status in ('waiting_payment', 'submitted', 'confirming');

-- 2. Extend chain_transactions constraints for TRON (728126428)
alter table public.chain_transactions
  drop constraint if exists chain_transactions_chain_check,
  drop constraint if exists chain_transactions_hash_format_check,
  drop constraint if exists chain_transactions_address_format_check;

alter table public.chain_transactions
  add constraint chain_transactions_chain_check check (
    chain_id in (56, 728126428)
  ),
  add constraint chain_transactions_hash_format_check check (
    (chain_id = 56 and tx_hash ~* '^0x[0-9a-f]{64}$')
    or (chain_id = 728126428 and tx_hash ~ '^[0-9a-f]{64}$')
  ),
  add constraint chain_transactions_address_format_check check (
    (chain_id = 56
      and token_contract ~* '^0x[0-9a-f]{40}$'
      and to_address ~* '^0x[0-9a-f]{40}$'
      and (from_address is null or from_address ~* '^0x[0-9a-f]{40}$'))
    or
    (chain_id = 728126428
      and token_contract ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      and to_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      and (from_address is null or from_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'))
  );

-- 3. Extend chain_transaction_claims constraints for TRON (728126428)
alter table public.chain_transaction_claims
  drop constraint if exists chain_transaction_claims_chain_check,
  drop constraint if exists chain_transaction_claims_hash_check;

alter table public.chain_transaction_claims
  add constraint chain_transaction_claims_chain_check check (
    chain_id in (56, 728126428)
  ),
  add constraint chain_transaction_claims_hash_check check (
    (chain_id = 56 and tx_hash ~* '^0x[0-9a-f]{64}$')
    or (chain_id = 728126428 and tx_hash ~ '^[0-9a-f]{64}$')
  );

-- 4. Extend cross-business TxHash uniqueness trigger to cover both BSC (56) and TRON (728126428)
create or replace function public.enforce_bep20_txhash_business_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tx_hash text;
  v_provider_hash text;
  v_reference_hash text;
  v_lock_hash text;
begin
  if tg_table_name = 'chain_transaction_claims' then
    v_tx_hash := lower(btrim(new.tx_hash));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('bep20-business-tx:' || v_tx_hash, 0)
    );
    if exists (
      select 1
      from public.account_recharges ar
      where ar.status in ('paid', 'succeeded')
        and (
          regexp_replace(lower(nullif(btrim(ar.provider_trade_no), '')), ':[0-9]+$', '') = v_tx_hash
          or regexp_replace(lower(nullif(btrim(ar.transaction_reference), '')), ':[0-9]+$', '') = v_tx_hash
        )
    ) then
      raise exception 'BEP20_TX_HASH_ALREADY_USED_BY_RECHARGE';
    end if;
    return new;
  end if;

  if new.status not in ('paid', 'succeeded') then
    return new;
  end if;

  v_provider_hash := regexp_replace(
    lower(nullif(btrim(new.provider_trade_no), '')),
    ':[0-9]+$',
    ''
  );
  v_reference_hash := regexp_replace(
    lower(nullif(btrim(new.transaction_reference), '')),
    ':[0-9]+$',
    ''
  );

  for v_lock_hash in
    select distinct candidate
    from unnest(array[v_provider_hash, v_reference_hash]) as candidate
    where candidate ~ '^(0x)?[0-9a-f]{64}$'
    order by candidate
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('bep20-business-tx:' || v_lock_hash, 0)
    );
  end loop;

  if exists (
    select 1
    from public.chain_transaction_claims ctc
    where ctc.chain_id in (56, 728126428)
      and lower(ctc.tx_hash) in (v_provider_hash, v_reference_hash)
  ) then
    raise exception 'BEP20_TX_HASH_ALREADY_USED_BY_ORDER';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_bep20_txhash_business_uniqueness()
  from public, anon, authenticated, service_role;

-- 5. Dedicated atomic TRON TRC20 order transaction claim RPC (preserves case-sensitive Base58Check addresses)
create or replace function public.claim_trc20_chain_transaction(
  p_session_id uuid,
  p_order_id uuid,
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
  p_normalized_amount numeric,
  p_confirmation_count integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.chain_payment_sessions;
  v_claim public.chain_transaction_claims;
  v_existing public.chain_transactions;
  v_usage public.bep20_transaction_usage_registry;
  v_tx_hash text := lower(btrim(coalesce(p_tx_hash, '')));
  v_contract text := btrim(coalesce(p_token_contract, ''));
  v_to text := btrim(coalesce(p_to_address, ''));
  v_from text := nullif(btrim(coalesce(p_from_address, '')), '');
  v_claimed_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'claim_trc20_chain_transaction requires service_role';
  end if;
  if p_chain_id <> 728126428
     or v_tx_hash !~ '^[0-9a-f]{64}$'
     or p_log_index < 0
     or p_raw_amount <= 0
     or p_raw_amount <> trunc(p_raw_amount)
     or p_normalized_amount <= 0
     or v_contract !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
     or v_to !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
     or (v_from is not null and v_from !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$') then
    raise exception 'invalid TRC20 claim input';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found
     or v_session.order_id <> p_order_id
     or v_session.payment_method <> 'usdt_trc20'
     or v_session.chain_id <> 728126428 then
    raise exception 'chain payment session does not match TRC20 order or chain';
  end if;

  -- TRON Base58Check addresses are case-sensitive.
  if v_session.token_contract <> v_contract
     or v_session.receive_address <> v_to then
    raise exception 'TRC20 transaction contract or recipient does not match session';
  end if;

  if trunc(v_session.expected_raw_amount) <= 0 then
    raise exception 'chain payment session expected raw amount is invalid';
  end if;

  -- Check global cross-business registry first so recharge-used hashes return a clean conflict status.
  select * into v_usage
  from public.bep20_transaction_usage_registry
  where chain_id = p_chain_id and tx_hash = v_tx_hash
  for update;

  if found and (v_usage.usage_type <> 'order' or v_usage.business_id <> p_order_id) then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  select * into v_existing
  from public.chain_transactions
  where chain_id = p_chain_id and tx_hash = v_tx_hash
  order by created_at
  limit 1
  for update;

  if found and v_existing.order_id is not null and v_existing.order_id <> p_order_id then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  insert into public.chain_transaction_claims (
    chain_id, tx_hash, order_id, chain_payment_session_id
  ) values (
    p_chain_id, v_tx_hash, p_order_id, p_session_id
  )
  on conflict (chain_id, tx_hash) do nothing;
  get diagnostics v_claimed_count = row_count;

  select * into v_claim
  from public.chain_transaction_claims
  where chain_id = p_chain_id and tx_hash = v_tx_hash
  for update;

  if v_claim.order_id <> p_order_id or v_claim.chain_payment_session_id <> p_session_id then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  select * into v_existing
  from public.chain_transactions
  where chain_id = p_chain_id and tx_hash = v_tx_hash and log_index = p_log_index
  for update;

  if found and v_existing.order_id is not null and v_existing.order_id <> p_order_id then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  if not found then
    insert into public.chain_transactions (
      chain_payment_session_id, order_id, chain_id, tx_hash, log_index,
      block_number, block_hash, block_timestamp, token_contract, from_address,
      to_address, raw_amount, normalized_amount, confirmation_count, status
    ) values (
      p_session_id, p_order_id, p_chain_id, v_tx_hash, p_log_index,
      p_block_number, p_block_hash, p_block_timestamp, v_contract, v_from,
      v_to, p_raw_amount, p_normalized_amount, p_confirmation_count, p_status
    );
  else
    update public.chain_transactions
    set chain_payment_session_id = case
          when chain_payment_session_id is null then p_session_id else chain_payment_session_id end,
        order_id = case when order_id is null then p_order_id else order_id end,
        confirmation_count = p_confirmation_count,
        status = p_status,
        block_number = p_block_number,
        block_hash = p_block_hash,
        block_timestamp = p_block_timestamp,
        updated_at = now()
    where id = v_existing.id
      and (order_id is null or order_id = p_order_id)
      and (chain_payment_session_id is null or chain_payment_session_id = p_session_id);
    if not found then
      raise exception 'existing TRC20 chain transaction ownership is inconsistent';
    end if;
  end if;

  update public.chain_transaction_claims
  set updated_at = now()
  where chain_id = p_chain_id and tx_hash = v_tx_hash and order_id = p_order_id;

  return jsonb_build_object(
    'result', case when v_claimed_count > 0 then 'claimed' else 'already_claimed_by_same_order' end
  );
end;
$$;

revoke all on function public.claim_trc20_chain_transaction(
  uuid,uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer,text
) from public, anon, authenticated;
grant execute on function public.claim_trc20_chain_transaction(
  uuid,uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer,text
) to service_role;

commit;
