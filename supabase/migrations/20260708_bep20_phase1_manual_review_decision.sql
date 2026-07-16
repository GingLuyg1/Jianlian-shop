-- BEP20 phase 1 round-four manual review decision hardening.
-- Execute manually after:
--   1) 20260704_000_bep20_phase1_preflight.sql
--   2) 20260704_bep20_chain_payment_phase1.sql
--   3) 20260708_bep20_phase1_atomic_hardening.sql
--   4) 20260708_bep20_phase1_completion_hardening.sql
-- Do not run this file in separate fragments; the RPC definitions are part of
-- the same hardening step.

do $$
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.chain_transactions') is null
     or to_regclass('public.chain_transaction_claims') is null then
    raise exception 'BEP20 manual review decision requires phase 1 chain tables';
  end if;
  if to_regclass('public.bep20_admin_review_attempts') is null then
    raise exception 'BEP20 manual review decision requires bep20_admin_review_attempts';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'BEP20 manual review decision requires public.is_admin()';
  end if;
  if to_regprocedure('public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)') is null then
    raise exception 'BEP20 manual review decision requires completion hardening migration';
  end if;
end $$;

alter table public.chain_payment_sessions
  add column if not exists manual_review_decision text,
  add column if not exists manual_review_decided_at timestamptz,
  add column if not exists manual_review_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_review_decision_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chain_payment_sessions_manual_review_decision_check'
      and conrelid = 'public.chain_payment_sessions'::regclass
  ) then
    alter table public.chain_payment_sessions
      add constraint chain_payment_sessions_manual_review_decision_check
      check (
        manual_review_decision is null
        or manual_review_decision in ('pending', 'approved', 'rejected')
      );
  end if;
end $$;

update public.chain_payment_sessions
set manual_review_decision = 'pending'
where status = 'manual_review'
  and manual_review_decision is null;

create or replace function public.decide_bep20_manual_review(
  p_session_id uuid,
  p_operator_user_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.chain_payment_sessions;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if auth.role() <> 'service_role' then
    raise exception 'decide_bep20_manual_review requires service_role';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid manual review decision';
  end if;
  if p_operator_user_id is null then
    raise exception 'manual review operator is required';
  end if;
  if char_length(v_reason) < 2 then
    raise exception 'manual review reason is required';
  end if;

  select * into v_session
  from public.chain_payment_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'chain payment session not found';
  end if;
  if v_session.status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'session', to_jsonb(v_session));
  end if;
  if v_session.manual_review_decision = 'approved' then
    return jsonb_build_object('result', 'already_approved', 'session', to_jsonb(v_session));
  end if;
  if v_session.manual_review_decision = 'rejected' then
    return jsonb_build_object('result', 'already_rejected', 'session', to_jsonb(v_session));
  end if;
  if v_session.status <> 'manual_review' then
    return jsonb_build_object('result', 'invalid_state', 'session', to_jsonb(v_session));
  end if;

  update public.chain_payment_sessions
  set manual_review_decision = p_decision,
      manual_review_decided_at = now(),
      manual_review_decided_by = p_operator_user_id,
      manual_review_decision_reason = v_reason,
      manual_review_reason = case
        when p_decision = 'rejected' then '管理员拒绝晚到账：' || v_reason
        else coalesce(manual_review_reason, '管理员批准晚到账')
      end,
      status = case when p_decision = 'rejected' then 'failed' else status end,
      failure_reason = case
        when p_decision = 'rejected' then '管理员拒绝晚到账：' || v_reason
        else failure_reason
      end,
      last_rechecked_by = p_operator_user_id,
      last_rechecked_at = now(),
      last_recheck_reason = v_reason,
      updated_at = now()
  where id = p_session_id
    and status = 'manual_review'
    and coalesce(manual_review_decision, 'pending') = 'pending'
  returning * into v_session;

  if not found then
    select * into v_session
    from public.chain_payment_sessions
    where id = p_session_id;
    return jsonb_build_object(
      'result',
      case
        when v_session.status = 'paid' then 'already_paid'
        when v_session.manual_review_decision = 'approved' then 'already_approved'
        when v_session.manual_review_decision = 'rejected' then 'already_rejected'
        else 'already_decided'
      end,
      'session',
      to_jsonb(v_session)
    );
  end if;

  return jsonb_build_object('result', p_decision, 'session', to_jsonb(v_session));
end;
$$;

revoke execute on function public.decide_bep20_manual_review(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.decide_bep20_manual_review(uuid,uuid,text,text)
  to service_role;

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
  if v_session.status not in ('waiting_payment','submitted','confirming','verified','payment_failed','completing','manual_review') then
    return jsonb_build_object('result', 'invalid_state');
  end if;
  if v_session.status = 'manual_review'
     and (
       p_review_attempt_id is null
       or coalesce(v_session.manual_review_decision, 'pending') <> 'approved'
     ) then
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
      last_checked_at = now(),
      updated_at = now()
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

-- Manual rollback guidance:
-- 1) restore prepare_bep20_payment_completion from
--    20260708_bep20_phase1_completion_hardening.sql;
-- 2) drop decide_bep20_manual_review only after confirming no manual-review
--    sessions depend on decision fields;
-- 3) do not clear chain_transaction_claims, paid sessions, or order/payment
--    records as part of code rollback.
