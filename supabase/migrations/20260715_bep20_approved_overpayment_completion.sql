-- Allow a database-approved BEP20 manual-review overpayment to enter completion.
-- Ordinary automatic payments still require exact equality with the frozen amount.
-- This migration does not change complete_payment_session or complete_order_payment.

do $$
declare
  v_missing text;
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.bep20_admin_review_attempts') is null then
    raise exception 'BEP20 approved overpayment completion requires chain_payment_sessions and bep20_admin_review_attempts';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing
  from (
    values
      ('status'),
      ('submitted_tx_hash'),
      ('expected_amount'),
      ('expected_raw_amount'),
      ('confirmed_amount'),
      ('confirmed_raw_amount'),
      ('token_decimals'),
      ('manual_review_decision'),
      ('completion_attempt_id'),
      ('completion_started_at'),
      ('completion_error')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'chain_payment_sessions'
      and c.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception 'BEP20 approved overpayment completion missing required chain session columns: %', v_missing;
  end if;

  if to_regprocedure('public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)') is null then
    raise exception 'BEP20 approved overpayment completion requires prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)';
  end if;
end $$;

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
  v_manual_review_approved boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'prepare_bep20_payment_completion requires service_role';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'chain payment session not found';
  end if;
  if v_session.status = 'paid' then
    return jsonb_build_object('result', 'already_paid');
  end if;
  if v_session.manual_review_decision = 'rejected' then
    return jsonb_build_object('result', 'manual_review_rejected');
  end if;
  if v_session.status = 'completing'
     and v_session.completion_started_at > now() - interval '5 minutes' then
    return jsonb_build_object('result', 'already_completing');
  end if;
  if v_session.status = 'completing' and not p_allow_stale_retry then
    return jsonb_build_object('result', 'already_completing');
  end if;
  if v_session.status not in (
    'waiting_payment', 'submitted', 'confirming', 'verified',
    'payment_failed', 'completing', 'manual_review'
  ) then
    return jsonb_build_object('result', 'invalid_state');
  end if;

  v_manual_review_approved :=
    v_session.manual_review_decision = 'approved'
    and p_review_attempt_id is not null;

  if v_session.status = 'manual_review' and not v_manual_review_approved then
    return jsonb_build_object('result', 'invalid_state');
  end if;
  if lower(coalesce(v_session.submitted_tx_hash, p_tx_hash)) <> lower(p_tx_hash) then
    raise exception 'submitted TxHash does not match session';
  end if;

  if p_review_attempt_id is not null and not exists (
    select 1 from public.bep20_admin_review_attempts a
    where a.id = p_review_attempt_id
      and a.chain_payment_session_id = p_session_id
      and a.result_status = 'requested'
  ) then
    raise exception 'admin review attempt is missing or already used';
  end if;

  if v_manual_review_approved then
    -- The approval decision is read from the locked database row. The caller
    -- cannot enable overpayment completion with a request boolean.
    if v_session.confirmed_amount is null or v_session.confirmed_raw_amount is null then
      raise exception 'approved manual review is missing persisted confirmed amount';
    end if;
    if p_confirmed_amount <> v_session.confirmed_amount
       or trunc(p_confirmed_raw_amount) <> trunc(v_session.confirmed_raw_amount) then
      raise exception 'confirmed amount does not match persisted chain receipt amount';
    end if;
    if p_confirmed_amount < v_session.expected_amount
       or trunc(p_confirmed_raw_amount) < trunc(v_session.expected_raw_amount) then
      raise exception 'approved manual review cannot complete an underpaid transfer';
    end if;
  else
    -- Normal automatic completion remains exact and unchanged.
    if round(p_confirmed_amount, 6) <> round(v_session.expected_amount, 6)
       or trunc(p_confirmed_raw_amount) <> trunc(v_session.expected_raw_amount) then
      raise exception 'confirmed amount does not match frozen session amount';
    end if;
  end if;

  -- Both decimal and raw values must describe the same immutable chain amount.
  if round(p_confirmed_amount * power(10::numeric, v_session.token_decimals))
     <> trunc(p_confirmed_raw_amount) then
    raise exception 'confirmed decimal and raw amounts are inconsistent';
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
      last_checked_at = now(),
      updated_at = now()
  where id = p_session_id;

  if p_review_attempt_id is not null then
    update public.bep20_admin_review_attempts
    set result_status = 'processing'
    where id = p_review_attempt_id
      and chain_payment_session_id = p_session_id
      and result_status = 'requested';

    if not found then
      raise exception 'admin review attempt could not be acquired';
    end if;
  end if;

  return jsonb_build_object(
    'result', 'acquired',
    'attempt_id', v_attempt_id,
    'approved_overpayment', v_manual_review_approved
  );
end;
$$;

revoke all on function public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)
  to service_role;
