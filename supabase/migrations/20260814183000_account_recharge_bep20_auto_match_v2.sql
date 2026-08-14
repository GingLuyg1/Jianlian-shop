-- Candidate only. Do not execute without separate database authorization.
-- V2 automatic BEP20 discovery/matching only. This migration DOES NOT auto-credit CNY.
-- V3 automatic credit is intentionally a later gate after TEST scanning/matching acceptance.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.account_recharge_amount_reservations') is null
     or to_regclass('public.account_recharge_chain_claims') is null
     or to_regclass('public.bep20_transaction_usage_registry') is null
     or to_regclass('public.recharge_review_events') is null
     or to_regclass('public.chain_payment_sessions') is null then
    raise exception 'account recharge BEP20 auto-match V2 prerequisites are missing';
  end if;
end $$;

create table if not exists public.account_recharge_bep20_scan_state (
  scanner_key text primary key,
  chain_id integer not null,
  token_contract text not null,
  receive_address text not null,
  last_scanned_block numeric(30, 0) not null,
  last_scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_recharge_bep20_scan_state_chain_check check (chain_id = 56),
  constraint account_recharge_bep20_scan_state_token_check
    check (token_contract = lower(token_contract) and token_contract ~ '^0x[0-9a-f]{40}$'),
  constraint account_recharge_bep20_scan_state_address_check
    check (receive_address = lower(receive_address) and receive_address ~ '^0x[0-9a-f]{40}$'),
  constraint account_recharge_bep20_scan_state_block_check check (last_scanned_block >= 0)
);

alter table public.account_recharge_bep20_scan_state enable row level security;
revoke all on table public.account_recharge_bep20_scan_state from public, anon, authenticated;
grant all on table public.account_recharge_bep20_scan_state to service_role;

create table if not exists public.account_recharge_bep20_scan_events (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  tx_hash text not null,
  log_index integer not null,
  block_number numeric(30, 0) not null,
  block_timestamp timestamptz not null,
  token_contract text not null,
  to_address text not null,
  actual_received_usdt numeric(36, 18) not null,
  recharge_id uuid references public.account_recharges(id) on delete set null,
  recharge_no text,
  outcome text not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  constraint account_recharge_bep20_scan_events_chain_check check (chain_id = 56),
  constraint account_recharge_bep20_scan_events_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint account_recharge_bep20_scan_events_token_check
    check (token_contract = lower(token_contract) and token_contract ~ '^0x[0-9a-f]{40}$'),
  constraint account_recharge_bep20_scan_events_address_check
    check (to_address = lower(to_address) and to_address ~ '^0x[0-9a-f]{40}$'),
  constraint account_recharge_bep20_scan_events_amount_check check (actual_received_usdt > 0),
  constraint account_recharge_bep20_scan_events_outcome_check check (
    outcome in (
      'matched',
      'already_matched',
      'unmatched',
      'ambiguous_order_payment',
      'tx_conflict',
      'terminal_recharge',
      'invalid_window'
    )
  )
);

create index if not exists account_recharge_bep20_scan_events_created_idx
  on public.account_recharge_bep20_scan_events(created_at desc);
create index if not exists account_recharge_bep20_scan_events_recharge_idx
  on public.account_recharge_bep20_scan_events(recharge_id, created_at desc);

alter table public.account_recharge_bep20_scan_events enable row level security;
revoke all on table public.account_recharge_bep20_scan_events from public, anon, authenticated;
grant all on table public.account_recharge_bep20_scan_events to service_role;

create or replace function public.match_account_recharge_bep20_fingerprint_v2(
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
  normalized_token text := lower(btrim(p_token_contract));
  normalized_to text := lower(btrim(p_to_address));
  normalized_from text := nullif(lower(btrim(coalesce(p_from_address, ''))), '');
  target_reservation public.account_recharge_amount_reservations;
  target_recharge public.account_recharges;
  existing_usage public.bep20_transaction_usage_registry;
  existing_claim public.account_recharge_chain_claims;
  order_collision_count integer := 0;
  prior_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'match_account_recharge_bep20_fingerprint_v2 requires service_role';
  end if;

  if p_chain_id <> 56
     or normalized_hash !~ '^0x[0-9a-f]{64}$'
     or normalized_token !~ '^0x[0-9a-f]{40}$'
     or normalized_to !~ '^0x[0-9a-f]{40}$'
     or (normalized_from is not null and normalized_from !~ '^0x[0-9a-f]{40}$')
     or p_log_index < 0
     or p_block_number < 0
     or p_raw_amount <= 0
     or p_actual_received_usdt <= 0
     or p_confirmation_count <= 0
     or p_block_timestamp is null then
    raise exception 'invalid account recharge BEP20 scan evidence';
  end if;

  select * into target_reservation
  from public.account_recharge_amount_reservations
  where payment_address = normalized_to
    and expected_usdt_amount = p_actual_received_usdt
  order by reserved_at desc
  limit 1
  for update;

  if not found then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt, 'unmatched', 'RECHARGE_FINGERPRINT_NOT_FOUND', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object('result', 'unmatched');
  end if;

  select * into target_recharge
  from public.account_recharges
  where id = target_reservation.recharge_id
  for update;

  if not found
     or target_recharge.channel <> 'usdt_bep20'
     or target_recharge.channel_code <> 'usdt_bep20'
     or target_recharge.currency <> 'CNY'
     or target_recharge.settlement_currency <> 'USDT'
     or target_recharge.requested_cny_amount is null
     or target_recharge.requested_cny_amount <= 0
     or target_recharge.expected_usdt_amount <> p_actual_received_usdt
     or lower(target_recharge.payment_address) <> normalized_to
     or lower(target_recharge.payment_token_contract) <> normalized_token then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
      outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt,
      target_reservation.recharge_id, target_recharge.recharge_no,
      'terminal_recharge', 'RECHARGE_FINGERPRINT_TARGET_INVALID', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set recharge_id = excluded.recharge_id,
          recharge_no = excluded.recharge_no,
          outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object('result', 'terminal_recharge');
  end if;

  prior_status := target_recharge.status;

  if target_recharge.status not in ('waiting_payment', 'submitted') then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
      outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt,
      target_recharge.id, target_recharge.recharge_no,
      'terminal_recharge', 'RECHARGE_STATUS_NOT_AUTO_MATCHABLE', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set recharge_id = excluded.recharge_id,
          recharge_no = excluded.recharge_no,
          outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object(
      'result', 'terminal_recharge',
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no
    );
  end if;

  if target_recharge.expires_at is null
     or p_block_timestamp < target_recharge.created_at - interval '2 minutes'
     or p_block_timestamp > target_recharge.expires_at
     or p_block_timestamp > target_reservation.expires_at then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
      outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt,
      target_recharge.id, target_recharge.recharge_no,
      'invalid_window', 'RECHARGE_PAYMENT_OUTSIDE_WINDOW', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set recharge_id = excluded.recharge_id,
          recharge_no = excluded.recharge_no,
          outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object(
      'result', 'invalid_window',
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no
    );
  end if;

  -- Shared-address safety gate:
  -- if the same exact on-chain amount could also belong to any BEP20 order
  -- whose payment window contains this block timestamp, V2 refuses automatic
  -- recharge ownership and leaves the transfer for manual reconciliation.
  select count(*) into order_collision_count
  from public.chain_payment_sessions cps
  where cps.chain_id = p_chain_id
    and cps.payment_method = 'usdt_bep20'
    and lower(cps.token_contract) = normalized_token
    and lower(cps.receive_address) = normalized_to
    and cps.expected_amount = p_actual_received_usdt
    and coalesce(cps.created_at, '-infinity'::timestamptz) <= p_block_timestamp
    and cps.expires_at >= p_block_timestamp;

  if order_collision_count > 0 then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
      outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt,
      target_recharge.id, target_recharge.recharge_no,
      'ambiguous_order_payment', 'BEP20_SHARED_ADDRESS_AMOUNT_AMBIGUOUS', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set recharge_id = excluded.recharge_id,
          recharge_no = excluded.recharge_no,
          outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object(
      'result', 'ambiguous_order_payment',
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no
    );
  end if;

  select * into existing_claim
  from public.account_recharge_chain_claims
  where recharge_id = target_recharge.id
  for update;

  if found then
    if existing_claim.tx_hash = normalized_hash
       and existing_claim.log_index = p_log_index
       and existing_claim.actual_received_usdt = p_actual_received_usdt then
      insert into public.account_recharge_bep20_scan_events (
        chain_id, tx_hash, log_index, block_number, block_timestamp,
        token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
        outcome, error_code, updated_at
      ) values (
        p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
        normalized_token, normalized_to, p_actual_received_usdt,
        target_recharge.id, target_recharge.recharge_no,
        'already_matched', null, now()
      )
      on conflict (chain_id, tx_hash, log_index) do update
        set recharge_id = excluded.recharge_id,
            recharge_no = excluded.recharge_no,
            outcome = excluded.outcome,
            error_code = null,
            updated_at = now();

      return jsonb_build_object(
        'result', 'already_matched',
        'rechargeId', target_recharge.id,
        'rechargeNo', target_recharge.recharge_no
      );
    end if;

    return jsonb_build_object(
      'result', 'tx_conflict',
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no
    );
  end if;

  insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id)
  values (p_chain_id, normalized_hash, 'account_recharge', target_recharge.id)
  on conflict (chain_id, tx_hash) do nothing;

  select * into existing_usage
  from public.bep20_transaction_usage_registry
  where chain_id = p_chain_id and tx_hash = normalized_hash
  for update;

  if existing_usage.usage_type <> 'account_recharge'
     or existing_usage.business_id <> target_recharge.id then
    insert into public.account_recharge_bep20_scan_events (
      chain_id, tx_hash, log_index, block_number, block_timestamp,
      token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
      outcome, error_code, updated_at
    ) values (
      p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
      normalized_token, normalized_to, p_actual_received_usdt,
      target_recharge.id, target_recharge.recharge_no,
      'tx_conflict', 'BEP20_TRANSACTION_ALREADY_ASSIGNED', now()
    )
    on conflict (chain_id, tx_hash, log_index) do update
      set recharge_id = excluded.recharge_id,
          recharge_no = excluded.recharge_no,
          outcome = excluded.outcome,
          error_code = excluded.error_code,
          updated_at = now();

    return jsonb_build_object(
      'result', 'tx_conflict',
      'rechargeId', target_recharge.id,
      'rechargeNo', target_recharge.recharge_no
    );
  end if;

  insert into public.account_recharge_chain_claims (
    recharge_id, chain_id, tx_hash, log_index, block_number, block_hash,
    block_timestamp, token_contract, from_address, to_address, raw_amount,
    actual_received_usdt, confirmation_count
  ) values (
    target_recharge.id, p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_hash,
    p_block_timestamp, normalized_token, normalized_from, normalized_to, p_raw_amount,
    p_actual_received_usdt, p_confirmation_count
  );

  update public.account_recharges
  set actual_received_usdt = p_actual_received_usdt,
      transaction_reference = normalized_hash,
      provider_trade_no = normalized_hash,
      status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      matched_at = coalesce(matched_at, now()),
      match_method = 'amount_fingerprint',
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
    'auto_bep20_fingerprint_match_v2',
    prior_status,
    'submitted',
    'BEP20 transfer matched by exact amount fingerprint',
    gen_random_uuid()::text,
    jsonb_build_object(
      'chain_id', p_chain_id,
      'tx_hash', normalized_hash,
      'log_index', p_log_index,
      'block_number', p_block_number,
      'actual_received_usdt', p_actual_received_usdt,
      'confirmation_count', p_confirmation_count
    )
  );

  insert into public.account_recharge_bep20_scan_events (
    chain_id, tx_hash, log_index, block_number, block_timestamp,
    token_contract, to_address, actual_received_usdt, recharge_id, recharge_no,
    outcome, error_code, updated_at
  ) values (
    p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_timestamp,
    normalized_token, normalized_to, p_actual_received_usdt,
    target_recharge.id, target_recharge.recharge_no,
    'matched', null, now()
  )
  on conflict (chain_id, tx_hash, log_index) do update
    set recharge_id = excluded.recharge_id,
        recharge_no = excluded.recharge_no,
        outcome = excluded.outcome,
        error_code = null,
        updated_at = now();

  return jsonb_build_object(
    'result', 'matched',
    'rechargeId', target_recharge.id,
    'rechargeNo', target_recharge.recharge_no
  );
end;
$$;

revoke all on function public.match_account_recharge_bep20_fingerprint_v2(
  integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer
) from public, anon, authenticated;
grant execute on function public.match_account_recharge_bep20_fingerprint_v2(
  integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer
) to service_role;

commit;
