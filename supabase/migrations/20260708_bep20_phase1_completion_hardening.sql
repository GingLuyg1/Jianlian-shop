-- BEP20 phase 1 round-three hardening.
-- Execute manually after:
--   1) 20260704_000_bep20_phase1_preflight.sql
--   2) 20260704_bep20_chain_payment_phase1.sql
--   3) 20260708_bep20_phase1_atomic_hardening.sql
-- This migration preserves the existing complete_payment_session signature.

do $$
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.chain_transactions') is null
     or to_regclass('public.chain_transaction_claims') is null then
    raise exception 'BEP20 completion hardening requires both phase 1 migrations';
  end if;
  if to_regclass('public.payment_sessions') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.order_payments') is null then
    raise exception 'BEP20 completion hardening requires payment core tables';
  end if;
  if to_regprocedure('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'BEP20 completion hardening requires complete_order_payment';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'BEP20 completion hardening requires public.is_admin()';
  end if;
end $$;

alter table public.order_payments
  add column if not exists order_amount numeric(18, 6),
  add column if not exists order_currency text,
  add column if not exists received_currency text;

create table if not exists public.bep20_admin_review_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payment_sessions(id) on delete restrict,
  chain_payment_session_id uuid not null references public.chain_payment_sessions(id) on delete restrict,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  reason text not null,
  previous_status text not null,
  requested_at timestamptz not null default now(),
  result_status text not null default 'requested',
  error_message text,
  completed_at timestamptz,
  request_id text,
  constraint bep20_admin_review_action_check check (
    action in ('recheck', 'approve_late_payment', 'reject_late_payment')
  ),
  constraint bep20_admin_review_result_check check (
    result_status in ('requested', 'processing', 'succeeded', 'failed', 'rejected')
  ),
  constraint bep20_admin_review_reason_check check (char_length(btrim(reason)) between 2 and 500)
);

create index if not exists bep20_admin_review_session_idx
  on public.bep20_admin_review_attempts(chain_payment_session_id, requested_at desc);
create index if not exists bep20_admin_review_request_idx
  on public.bep20_admin_review_attempts(request_id)
  where request_id is not null;

alter table public.bep20_admin_review_attempts enable row level security;
revoke all on public.bep20_admin_review_attempts from public, anon, authenticated;
grant all on public.bep20_admin_review_attempts to service_role;

drop index if exists public.chain_payment_sessions_active_order_unique;
create unique index chain_payment_sessions_active_order_unique
  on public.chain_payment_sessions(order_id, payment_method)
  where status in (
    'waiting_payment','submitted','confirming','verified','completing',
    'payment_failed','underpaid','manual_review'
  );

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
  v_session public.chain_payment_sessions;
  v_claim public.chain_transaction_claims;
  v_existing public.chain_transactions;
  v_claimed_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'claim_bep20_chain_transaction requires service_role';
  end if;
  if p_chain_id <> 56
     or p_tx_hash !~* '^0x[0-9a-f]{64}$'
     or p_log_index < 0
     or p_raw_amount <= 0
     or p_normalized_amount <= 0 then
    raise exception 'invalid BEP20 claim input';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found or v_session.order_id <> p_order_id or v_session.chain_id <> p_chain_id then
    raise exception 'chain payment session does not match order or chain';
  end if;
  if lower(v_session.token_contract) <> lower(p_token_contract)
     or lower(v_session.receive_address) <> lower(p_to_address) then
    raise exception 'chain transaction contract or recipient does not match session';
  end if;
  if p_raw_amount <> trunc(p_raw_amount)
     or trunc(v_session.expected_raw_amount) <= 0 then
    raise exception 'chain transaction raw amount is invalid';
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

  if v_claim.order_id <> p_order_id or v_claim.chain_payment_session_id <> p_session_id then
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
      raise exception 'existing chain transaction ownership is inconsistent';
    end if;
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

create or replace function public.prepare_bep20_payment_completion(
  p_session_id uuid,
  p_tx_hash text,
  p_confirmed_amount numeric,
  p_confirmed_raw_amount numeric,
  p_allow_stale_retry boolean default false,
  p_review_attempt_id uuid default null
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
    raise exception 'prepare_bep20_payment_completion requires service_role';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'chain payment session not found'; end if;
  if v_session.status = 'paid' then
    return jsonb_build_object('result', 'already_paid');
  end if;
  if v_session.status = 'completing'
     and v_session.completion_started_at > now() - interval '5 minutes' then
    return jsonb_build_object('result', 'already_completing');
  end if;
  if v_session.status = 'completing' and not p_allow_stale_retry then
    return jsonb_build_object('result', 'already_completing');
  end if;
  if v_session.status not in ('waiting_payment','submitted','confirming','verified','payment_failed','completing','manual_review') then
    return jsonb_build_object('result', 'invalid_state');
  end if;
  if v_session.status = 'manual_review' and p_review_attempt_id is null then
    return jsonb_build_object('result', 'invalid_state');
  end if;
  if lower(coalesce(v_session.submitted_tx_hash, p_tx_hash)) <> lower(p_tx_hash) then
    raise exception 'submitted TxHash does not match session';
  end if;
  if round(p_confirmed_amount, 6) <> round(v_session.expected_amount, 6)
     or trunc(p_confirmed_raw_amount) <> trunc(v_session.expected_raw_amount) then
    raise exception 'confirmed amount does not match frozen session amount';
  end if;
  if p_review_attempt_id is not null and not exists (
    select 1 from public.bep20_admin_review_attempts a
    where a.id = p_review_attempt_id
      and a.chain_payment_session_id = p_session_id
      and a.result_status = 'requested'
  ) then
    raise exception 'admin review attempt is missing or already used';
  end if;

  v_attempt_id := gen_random_uuid();
  update public.chain_payment_sessions
  set status = 'completing',
      submitted_tx_hash = lower(p_tx_hash),
      confirmed_amount = p_confirmed_amount,
      confirmed_raw_amount = p_confirmed_raw_amount,
      completion_attempt_id = v_attempt_id,
      completion_started_at = now(),
      completion_error = null,
      last_checked_at = now()
  where id = p_session_id;

  if p_review_attempt_id is not null then
    update public.bep20_admin_review_attempts
    set result_status = 'processing'
    where id = p_review_attempt_id;
  end if;

  return jsonb_build_object('result', 'acquired', 'attempt_id', v_attempt_id);
end;
$$;

revoke execute on function public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)
  to service_role;

create or replace function public.finish_bep20_payment_completion(
  p_session_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_error_message text default null,
  p_review_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.chain_payment_sessions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'finish_bep20_payment_completion requires service_role';
  end if;
  if p_status not in ('paid','payment_failed') then
    raise exception 'invalid completion result status';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'chain payment session not found'; end if;
  if v_session.status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'session', to_jsonb(v_session));
  end if;
  if v_session.status <> 'completing' or v_session.completion_attempt_id <> p_attempt_id then
    return jsonb_build_object('result', 'stale_attempt');
  end if;

  update public.chain_payment_sessions
  set status = p_status,
      completion_error = case when p_error_message is null then null else left(p_error_message, 500) end,
      confirmed_at = case when p_status = 'paid' then coalesce(confirmed_at, now()) else confirmed_at end,
      last_checked_at = now()
  where id = p_session_id
  returning * into v_session;

  if p_review_attempt_id is not null then
    update public.bep20_admin_review_attempts
    set result_status = case when p_status = 'paid' then 'succeeded' else 'failed' end,
        error_message = case when p_error_message is null then null else left(p_error_message, 500) end,
        completed_at = now()
    where id = p_review_attempt_id
      and chain_payment_session_id = p_session_id;
    if not found then
      raise exception 'admin review result could not be recorded';
    end if;
  end if;

  return jsonb_build_object('result', p_status, 'session', to_jsonb(v_session));
end;
$$;

revoke execute on function public.finish_bep20_payment_completion(uuid,uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.finish_bep20_payment_completion(uuid,uuid,text,text,uuid)
  to service_role;

revoke execute on function public.begin_bep20_payment_completion(uuid,boolean) from service_role;

create or replace function public.complete_payment_session(
  p_session_id uuid,
  p_provider_transaction_id text,
  p_paid_amount numeric,
  p_currency text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.payment_sessions;
  v_order public.orders;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_payment_session can only be called by trusted server role';
  end if;

  select * into v_session
  from public.payment_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'payment session not found'; end if;
  if v_session.status = 'paid' then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'businessType', case when v_session.business_type = 'order' then 'order' else 'recharge' end,
      'businessId', v_session.business_id, 'businessNo', v_session.business_no
    );
  end if;
  if v_session.status in ('expired','closed','failed') then
    raise exception 'payment session status does not allow completion';
  end if;
  if round(coalesce(p_paid_amount, 0), 6) <> round(coalesce(v_session.payable_amount, 0), 6) then
    raise exception 'received amount does not match frozen payment session amount';
  end if;
  if upper(coalesce(p_currency, '')) <> upper(coalesce(v_session.currency, '')) then
    raise exception 'received currency does not match payment session currency';
  end if;
  if exists (
    select 1 from public.payment_sessions ps
    where ps.provider_transaction_id = nullif(p_provider_transaction_id, '')
      and ps.id <> v_session.id
  ) then
    raise exception 'provider transaction is already used by another payment session';
  end if;

  if v_session.business_type = 'order' then
    select * into v_order from public.orders where id = v_session.business_id;
    if not found then raise exception 'order not found'; end if;
    if v_order.payment_status = 'paid' then
      raise exception 'order is already paid by a different completion path';
    end if;

    v_result := public.complete_order_payment(
      v_order.id,
      v_session.session_no,
      v_session.channel_code,
      p_provider_transaction_id,
      v_order.total_amount,
      v_order.currency,
      p_paid_at
    );

    update public.order_payments
    set order_amount = v_order.total_amount,
        order_currency = upper(coalesce(v_order.currency, 'CNY')),
        received_amount = p_paid_amount,
        received_currency = upper(p_currency),
        updated_at = now()
    where payment_no = 'AUTO-' || v_session.session_no;
  else
    v_result := public.complete_account_recharge(
      v_session.business_id,
      p_provider_transaction_id,
      p_paid_amount,
      p_currency
    );
    v_result := jsonb_build_object(
      'ok', true,
      'idempotent', coalesce((v_result ->> 'alreadyCompleted')::boolean, false),
      'businessType', 'recharge',
      'businessId', v_session.business_id,
      'businessNo', v_session.business_no
    );
  end if;

  update public.payment_sessions
  set status = 'paid',
      provider_transaction_id = nullif(p_provider_transaction_id, ''),
      paid_at = coalesce(p_paid_at, now()),
      last_synced_at = now(),
      reconcile_status = 'matched',
      last_error = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'order_currency', case when v_session.business_type = 'order' then v_order.currency else null end,
        'channel_currency', upper(p_currency),
        'channel_received_amount', p_paid_amount,
        'initializing', false
      ),
      updated_at = now()
  where id = v_session.id;

  return v_result;
end;
$$;

revoke execute on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  to service_role;

-- Rollback guidance (manual assessment required): restore the previous RPC bodies,
-- drop the three new RPCs and the audit table only after confirming no phase-1
-- payments depend on them. Do not roll back order/payment data or paid statuses.
