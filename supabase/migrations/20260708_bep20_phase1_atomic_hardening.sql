-- BEP20 phase 1 atomic claim and recoverable completion hardening.
-- Execute manually after 20260704_bep20_chain_payment_phase1.sql and payment core migrations.

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'BEP20 hardening requires public.is_admin() before RLS policies can be verified';
  end if;
  if to_regclass('public.chain_payment_sessions') is null then
    raise exception 'Run 20260704_bep20_chain_payment_phase1.sql before this migration';
  end if;
  if to_regclass('public.chain_transactions') is null then
    raise exception 'Run 20260704_bep20_chain_payment_phase1.sql before this migration';
  end if;
  if to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'BEP20 hardening requires complete_payment_session payment core RPC';
  end if;
end $$;

alter table public.chain_payment_sessions
  add column if not exists order_currency text,
  add column if not exists order_amount numeric(36, 18),
  add column if not exists payment_currency text not null default 'USDT',
  add column if not exists exchange_rate numeric(36, 18),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_fetched_at timestamptz,
  add column if not exists exchange_rate_expires_at timestamptz,
  add column if not exists pricing_status text not null default 'frozen',
  add column if not exists completion_attempt_id uuid,
  add column if not exists completion_started_at timestamptz,
  add column if not exists completion_error text,
  add column if not exists last_rechecked_by uuid references auth.users(id) on delete set null,
  add column if not exists last_rechecked_at timestamptz,
  add column if not exists last_recheck_reason text;

alter table public.chain_transactions
  add column if not exists block_timestamp timestamptz;

alter table public.chain_payment_sessions
  drop constraint if exists chain_payment_sessions_status_check;
alter table public.chain_payment_sessions
  add constraint chain_payment_sessions_status_check check (
    status in (
      'waiting_payment','submitted','confirming','verified','completing','payment_failed',
      'paid','underpaid','overpaid','expired','manual_review','failed'
    )
  );

alter table public.chain_transactions
  drop constraint if exists chain_transactions_status_check;
alter table public.chain_transactions
  add constraint chain_transactions_status_check check (
    status in (
      'submitted','confirming','verified','completing','payment_failed','paid',
      'underpaid','overpaid','manual_review','failed'
    )
  );

create table if not exists public.chain_transaction_claims (
  chain_id integer not null,
  tx_hash text not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  chain_payment_session_id uuid not null references public.chain_payment_sessions(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chain_id, tx_hash),
  constraint chain_transaction_claims_chain_check check (chain_id = 56),
  constraint chain_transaction_claims_hash_check check (tx_hash ~* '^0x[0-9a-f]{64}$')
);

do $$
begin
  if exists (
    select 1
    from public.chain_transactions
    where order_id is not null
    group by chain_id, lower(tx_hash)
    having count(distinct order_id) > 1
  ) then
    raise exception 'Existing chain transactions contain a TxHash assigned to multiple orders; resolve before hardening';
  end if;
end $$;

insert into public.chain_transaction_claims (
  chain_id, tx_hash, order_id, chain_payment_session_id, claimed_at, updated_at
)
select distinct on (ct.chain_id, lower(ct.tx_hash))
  ct.chain_id,
  lower(ct.tx_hash),
  ct.order_id,
  ct.chain_payment_session_id,
  ct.created_at,
  now()
from public.chain_transactions ct
where ct.order_id is not null
  and ct.chain_payment_session_id is not null
order by ct.chain_id, lower(ct.tx_hash), ct.created_at
on conflict (chain_id, tx_hash) do nothing;

alter table public.chain_transaction_claims enable row level security;
revoke all on table public.chain_transaction_claims from public, anon, authenticated;
grant all on table public.chain_transaction_claims to service_role;

create or replace function public.claim_bep20_chain_transaction(
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
set search_path = public
as $$
declare
  v_claim public.chain_transaction_claims;
  v_existing public.chain_transactions;
  v_claimed_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'claim_bep20_chain_transaction requires service_role';
  end if;

  if not exists (
    select 1 from public.chain_payment_sessions cps
    where cps.id = p_session_id and cps.order_id = p_order_id and cps.chain_id = p_chain_id
  ) then
    raise exception 'chain payment session does not match order or chain';
  end if;

  select * into v_existing
  from public.chain_transactions
  where chain_id = p_chain_id and lower(tx_hash) = lower(p_tx_hash)
  order by created_at
  limit 1
  for update;

  if found and v_existing.order_id is not null and v_existing.order_id <> p_order_id then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  insert into public.chain_transaction_claims (
    chain_id, tx_hash, order_id, chain_payment_session_id
  ) values (
    p_chain_id, lower(p_tx_hash), p_order_id, p_session_id
  )
  on conflict (chain_id, tx_hash) do nothing;
  get diagnostics v_claimed_count = row_count;

  select * into v_claim
  from public.chain_transaction_claims
  where chain_id = p_chain_id and tx_hash = lower(p_tx_hash)
  for update;

  if v_claim.order_id <> p_order_id then
    return jsonb_build_object('result', 'claimed_by_other_order');
  end if;

  select * into v_existing
  from public.chain_transactions
  where chain_id = p_chain_id and lower(tx_hash) = lower(p_tx_hash) and log_index = p_log_index
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
      p_session_id, p_order_id, p_chain_id, lower(p_tx_hash), p_log_index,
      p_block_number, p_block_hash, p_block_timestamp, lower(p_token_contract), lower(p_from_address),
      lower(p_to_address), p_raw_amount, p_normalized_amount, p_confirmation_count, p_status
    );
  else
    update public.chain_transactions
    set confirmation_count = p_confirmation_count,
        status = p_status,
        block_number = p_block_number,
        block_hash = p_block_hash,
        block_timestamp = p_block_timestamp,
        updated_at = now()
    where id = v_existing.id and order_id = p_order_id;
  end if;

  update public.chain_transaction_claims
  set updated_at = now()
  where chain_id = p_chain_id and tx_hash = lower(p_tx_hash) and order_id = p_order_id;

  return jsonb_build_object(
    'result', case when v_claimed_count > 0 then 'claimed' else 'already_claimed_by_same_order' end
  );
end;
$$;

revoke execute on function public.claim_bep20_chain_transaction(
  uuid,uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer,text
) from public, anon, authenticated;
grant execute on function public.claim_bep20_chain_transaction(
  uuid,uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer,text
) to service_role;

create or replace function public.begin_bep20_payment_completion(
  p_session_id uuid,
  p_allow_stale_retry boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.chain_payment_sessions;
  v_attempt_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'begin_bep20_payment_completion requires service_role';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'chain payment session not found'; end if;
  if v_session.status = 'paid' then
    return jsonb_build_object('result', 'already_paid');
  end if;
  if v_session.status = 'completing' then
    if v_session.completion_started_at > now() - interval '5 minutes' then
      return jsonb_build_object('result', 'in_progress');
    end if;
    if not p_allow_stale_retry then
      return jsonb_build_object('result', 'in_progress');
    end if;
  end if;
  if v_session.status not in ('verified','payment_failed','completing') then
    return jsonb_build_object('result', 'not_ready');
  end if;

  v_attempt_id := gen_random_uuid();
  update public.chain_payment_sessions
  set status = 'completing',
      completion_attempt_id = v_attempt_id,
      completion_started_at = now(),
      completion_error = null
  where id = p_session_id;

  return jsonb_build_object('result', 'acquired', 'attempt_id', v_attempt_id);
end;
$$;

revoke execute on function public.begin_bep20_payment_completion(uuid,boolean) from public, anon, authenticated;
grant execute on function public.begin_bep20_payment_completion(uuid,boolean) to service_role;
