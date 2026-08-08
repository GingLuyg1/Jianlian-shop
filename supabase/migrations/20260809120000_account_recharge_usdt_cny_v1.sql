-- Candidate only. Do not execute without separate database authorization.
-- Adds locked daily USDT/CNY recharge rates and atomic CNY balance crediting.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.account_recharges') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null
     or to_regclass('public.chain_transaction_claims') is null then
    raise exception 'account recharge USDT/CNY V1 prerequisites are missing';
  end if;
end $$;

create table public.account_recharge_daily_rates (
  effective_date date primary key,
  market_rate numeric(18, 6) not null,
  settlement_rate numeric(18, 1) not null,
  source text not null,
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint account_recharge_daily_rates_market_positive check (market_rate > 0),
  constraint account_recharge_daily_rates_settlement_positive check (settlement_rate > 0),
  constraint account_recharge_daily_rates_floor_check
    check (settlement_rate = trunc(market_rate, 1)),
  constraint account_recharge_daily_rates_source_check
    check (length(btrim(source)) between 1 and 120)
);

alter table public.account_recharge_daily_rates enable row level security;
revoke all on table public.account_recharge_daily_rates from public, anon, authenticated;
grant all on table public.account_recharge_daily_rates to service_role;

create or replace function public.prevent_account_recharge_daily_rate_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'daily recharge rates are immutable';
end;
$$;

create trigger prevent_account_recharge_daily_rate_mutation
before update or delete on public.account_recharge_daily_rates
for each row execute function public.prevent_account_recharge_daily_rate_mutation();

revoke all on function public.prevent_account_recharge_daily_rate_mutation() from public, anon, authenticated;

alter table public.account_recharges
  add column requested_cny_amount numeric(18, 2),
  add column expected_usdt_amount numeric(36, 18),
  add column actual_received_usdt numeric(36, 18),
  add column credited_cny_amount numeric(18, 2),
  add column settlement_currency text,
  add column payment_token_contract text,
  add column locked_market_rate numeric(18, 6),
  add column locked_settlement_rate numeric(18, 1),
  add column rate_source text,
  add column rate_effective_date date,
  add column rate_effective_at timestamptz,
  add column rate_locked_at timestamptz;

alter table public.account_recharges
  add constraint account_recharges_usdt_cny_amounts_check check (
    (requested_cny_amount is null and expected_usdt_amount is null
      and actual_received_usdt is null and credited_cny_amount is null
      and settlement_currency is null and locked_market_rate is null
      and locked_settlement_rate is null and rate_source is null
      and rate_effective_date is null and rate_effective_at is null and rate_locked_at is null)
    or
    (channel_code = 'usdt_bep20' and channel = 'usdt_bep20'
      and currency = 'CNY' and settlement_currency = 'USDT'
      and payment_address ~* '^0x[0-9a-f]{40}$'
      and payment_token_contract ~* '^0x[0-9a-f]{40}$'
      and requested_cny_amount > 0 and expected_usdt_amount > 0
      and locked_market_rate > 0 and locked_settlement_rate > 0
      and locked_settlement_rate = trunc(locked_market_rate, 1)
      and length(btrim(rate_source)) between 1 and 120
      and rate_effective_date is not null and rate_effective_at is not null and rate_locked_at is not null
      and (actual_received_usdt is null or actual_received_usdt > 0)
      and (credited_cny_amount is null or credited_cny_amount > 0))
  ) not valid;
alter table public.account_recharges validate constraint account_recharges_usdt_cny_amounts_check;

create or replace function public.protect_account_recharge_rate_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.requested_cny_amount is not null and (
    new.requested_cny_amount is distinct from old.requested_cny_amount
    or new.expected_usdt_amount is distinct from old.expected_usdt_amount
    or new.settlement_currency is distinct from old.settlement_currency
    or new.payment_address is distinct from old.payment_address
    or new.payment_token_contract is distinct from old.payment_token_contract
    or new.locked_market_rate is distinct from old.locked_market_rate
    or new.locked_settlement_rate is distinct from old.locked_settlement_rate
    or new.rate_source is distinct from old.rate_source
    or new.rate_effective_date is distinct from old.rate_effective_date
    or new.rate_effective_at is distinct from old.rate_effective_at
    or new.rate_locked_at is distinct from old.rate_locked_at
  ) then
    raise exception 'account recharge rate snapshot is immutable';
  end if;
  return new;
end;
$$;

create trigger protect_account_recharge_rate_snapshot
before update on public.account_recharges
for each row execute function public.protect_account_recharge_rate_snapshot();

revoke all on function public.protect_account_recharge_rate_snapshot() from public, anon, authenticated;

create table public.bep20_transaction_usage_registry (
  chain_id integer not null,
  tx_hash text not null,
  usage_type text not null,
  business_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (chain_id, tx_hash),
  constraint bep20_transaction_usage_chain_check check (chain_id = 56),
  constraint bep20_transaction_usage_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint bep20_transaction_usage_type_check check (usage_type in ('order', 'account_recharge'))
);

insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id, created_at)
select chain_id, lower(tx_hash), 'order', order_id, claimed_at
from public.chain_transaction_claims
on conflict (chain_id, tx_hash) do nothing;

alter table public.bep20_transaction_usage_registry enable row level security;
revoke all on table public.bep20_transaction_usage_registry from public, anon, authenticated;
grant all on table public.bep20_transaction_usage_registry to service_role;

create or replace function public.guard_order_bep20_transaction_usage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_usage public.bep20_transaction_usage_registry;
begin
  new.tx_hash := lower(new.tx_hash);
  insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id)
  values (new.chain_id, new.tx_hash, 'order', new.order_id)
  on conflict (chain_id, tx_hash) do nothing;

  select * into existing_usage
  from public.bep20_transaction_usage_registry
  where chain_id = new.chain_id and tx_hash = new.tx_hash
  for update;

  if existing_usage.usage_type <> 'order' or existing_usage.business_id <> new.order_id then
    raise exception 'BEP20 transaction is already assigned to another business object';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_order_bep20_transaction_usage on public.chain_transaction_claims;
create trigger guard_order_bep20_transaction_usage
before insert on public.chain_transaction_claims
for each row execute function public.guard_order_bep20_transaction_usage();

-- Repeat after the trigger is installed so a claim inserted during the first
-- snapshot cannot fall outside the shared registry.
insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id, created_at)
select chain_id, lower(tx_hash), 'order', order_id, claimed_at
from public.chain_transaction_claims
on conflict (chain_id, tx_hash) do nothing;

revoke all on function public.guard_order_bep20_transaction_usage() from public, anon, authenticated;

create table public.account_recharge_chain_claims (
  recharge_id uuid primary key references public.account_recharges(id) on delete restrict,
  chain_id integer not null default 56,
  tx_hash text not null,
  log_index integer not null,
  block_number numeric(30, 0) not null,
  block_hash text,
  block_timestamp timestamptz not null,
  token_contract text not null,
  from_address text,
  to_address text not null,
  raw_amount numeric(78, 0) not null,
  actual_received_usdt numeric(36, 18) not null,
  confirmation_count integer not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash),
  constraint account_recharge_chain_claims_chain_check check (chain_id = 56),
  constraint account_recharge_chain_claims_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint account_recharge_chain_claims_amount_check check (raw_amount > 0 and actual_received_usdt > 0),
  constraint account_recharge_chain_claims_confirmation_check check (confirmation_count > 0),
  constraint account_recharge_chain_claims_address_check check (
    token_contract ~ '^0x[0-9a-f]{40}$'
    and to_address ~ '^0x[0-9a-f]{40}$'
    and (from_address is null or from_address ~ '^0x[0-9a-f]{40}$')
  )
);

alter table public.account_recharge_chain_claims enable row level security;
revoke all on table public.account_recharge_chain_claims from public, anon, authenticated;
grant all on table public.account_recharge_chain_claims to service_role;

create or replace function public.claim_account_recharge_bep20_transfer(
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
  credited_preview numeric(18, 2);
begin
  if auth.role() <> 'service_role' then
    raise exception 'claim_account_recharge_bep20_transfer requires service_role';
  end if;
  if p_chain_id <> 56 or normalized_hash !~ '^0x[0-9a-f]{64}$'
     or p_actual_received_usdt <= 0 or p_confirmation_count <= 0 then
    raise exception 'invalid account recharge BEP20 evidence';
  end if;

  select * into target_recharge from public.account_recharges
  where id = p_recharge_id for update;
  if not found or target_recharge.channel <> 'usdt_bep20'
     or target_recharge.channel_code <> 'usdt_bep20'
     or target_recharge.currency <> 'CNY'
     or target_recharge.settlement_currency <> 'USDT'
     or lower(target_recharge.payment_address) <> lower(p_to_address)
     or lower(target_recharge.payment_token_contract) <> lower(p_token_contract)
     or target_recharge.locked_settlement_rate is null then
    raise exception 'recharge is not eligible for USDT/CNY settlement';
  end if;
  if target_recharge.status not in ('waiting_payment', 'submitted', 'reviewing', 'approved', 'processing', 'paid', 'succeeded') then
    raise exception 'recharge status does not allow BEP20 verification';
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
      'creditedCnyAmount', trunc(existing_claim.actual_received_usdt * target_recharge.locked_settlement_rate, 2)::text
    );
  end if;

  insert into public.bep20_transaction_usage_registry (chain_id, tx_hash, usage_type, business_id)
  values (p_chain_id, normalized_hash, 'account_recharge', p_recharge_id)
  on conflict (chain_id, tx_hash) do nothing;

  select * into existing_usage from public.bep20_transaction_usage_registry
  where chain_id = p_chain_id and tx_hash = normalized_hash for update;
  if existing_usage.usage_type <> 'account_recharge' or existing_usage.business_id <> p_recharge_id then
    raise exception 'BEP20 transaction is already assigned to another business object';
  end if;

  insert into public.account_recharge_chain_claims (
    recharge_id, chain_id, tx_hash, log_index, block_number, block_hash,
    block_timestamp, token_contract, from_address, to_address, raw_amount,
    actual_received_usdt, confirmation_count
  ) values (
    p_recharge_id, p_chain_id, normalized_hash, p_log_index, p_block_number, p_block_hash,
    p_block_timestamp, lower(p_token_contract), lower(p_from_address), lower(p_to_address),
    p_raw_amount, p_actual_received_usdt, p_confirmation_count
  );

  credited_preview := trunc(p_actual_received_usdt * target_recharge.locked_settlement_rate, 2);
  update public.account_recharges
  set actual_received_usdt = p_actual_received_usdt,
      transaction_reference = normalized_hash,
      provider_trade_no = normalized_hash,
      status = case when status in ('waiting_payment', 'submitted') then 'submitted' else status end,
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
  where id = p_recharge_id;

  return jsonb_build_object(
    'result', 'verified',
    'actualReceivedUsdt', p_actual_received_usdt::text,
    'creditedCnyAmount', credited_preview::text
  );
end;
$$;

revoke all on function public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) from public, anon, authenticated;
grant execute on function public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer) to service_role;

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

  select * into target_recharge from public.account_recharges
  where id = p_recharge_id for update;
  if not found then raise exception 'recharge not found'; end if;

  if normalized_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'provider transaction id is invalid';
  end if;

  select * into target_claim from public.account_recharge_chain_claims
  where recharge_id = p_recharge_id for update;
  if not found or target_claim.tx_hash <> normalized_hash
     or target_claim.actual_received_usdt <> target_recharge.actual_received_usdt then
    raise exception 'verified chain evidence does not match recharge';
  end if;

  select * into existing_transaction from public.balance_transactions
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

  if target_recharge.channel <> 'usdt_bep20'
     or target_recharge.channel_code <> 'usdt_bep20'
     or target_recharge.currency <> 'CNY'
     or target_recharge.settlement_currency <> 'USDT'
     or target_recharge.actual_received_usdt is null
     or target_recharge.locked_settlement_rate is null
     or target_recharge.status not in ('approved', 'processing') then
    raise exception 'recharge is not eligible for USDT/CNY credit';
  end if;

  credited_cny := trunc(target_recharge.actual_received_usdt * target_recharge.locked_settlement_rate, 2);
  if credited_cny <= 0 then raise exception 'credited CNY amount is invalid'; end if;

  select * into target_profile from public.profiles
  where id = target_recharge.user_id for update;
  if not found then raise exception 'profile not found'; end if;

  before_balance := coalesce(target_profile.balance, 0);
  after_balance := before_balance + credited_cny;
  transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  update public.profiles set balance = after_balance, updated_at = now()
  where id = target_recharge.user_id;

  insert into public.balance_transactions (
    user_id, transaction_no, business_type, business_id, direction, amount,
    balance_before, balance_after, currency, status, remark, metadata
  ) values (
    target_recharge.user_id, transaction_no, 'account_recharge', target_recharge.recharge_no,
    'credit', credited_cny, before_balance, after_balance, 'CNY', 'completed',
    'USDT-BEP20 account recharge converted to CNY',
    jsonb_build_object(
      'settlement_currency', 'USDT',
      'actual_received_usdt', target_recharge.actual_received_usdt,
      'locked_settlement_rate', target_recharge.locked_settlement_rate,
      'rate_effective_date', target_recharge.rate_effective_date,
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

revoke all on function public.complete_account_recharge_usdt_cny_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.complete_account_recharge_usdt_cny_v1(uuid,text) to service_role;

commit;
