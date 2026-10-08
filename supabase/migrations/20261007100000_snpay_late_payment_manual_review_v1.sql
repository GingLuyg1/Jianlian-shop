-- Forward-only dedicated ADMIN exception. No historical rows are changed by installation.
-- Normal completion/expiry functions are deliberately NOT replaced or bypassed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare v_index text;
begin
  if to_regprocedure('public.is_admin(uuid)') is null
     or to_regclass('public.recharge_review_events') is null then
    raise exception 'LATE_PAYMENT_PREFLIGHT_DEPENDENCY_MISSING';
  end if;
  -- Accounting and provider uniqueness must remain database-enforced.
  foreach v_index in array array['balance_transactions_business_unique',
    'account_recharges_provider_trade_no_unique','payment_sessions_provider_order_unique',
    'payment_sessions_provider_transaction_unique'] loop
    if not exists (select 1 from pg_catalog.pg_index
      where indexrelid=to_regclass('public.' || v_index) and indisunique and indisvalid) then
      raise exception 'LATE_PAYMENT_PREFLIGHT_UNIQUE_INDEX_MISSING';
    end if;
  end loop;
  if exists (
    select 1 from unnest(array['reviewed_at','reviewed_by','review_reason','exception_type',
      'completed_at','credited_amount','requested_amount','expires_at','provider']) c(name)
    where not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid='public.account_recharges'::regclass and a.attname=c.name
        and a.attnum > 0 and not a.attisdropped)
  ) then raise exception 'LATE_PAYMENT_PREFLIGHT_RECHARGE_COLUMNS_MISSING'; end if;
end;
$$;

create or replace function public.complete_account_recharge_late_payment_manual_v1(
  p_recharge_id uuid, p_session_id uuid, p_user_id uuid,
  p_session_no text, p_provider_order_no text, p_amount numeric, p_paid_at timestamptz,
  p_recharge_created_at timestamptz, p_recharge_expires_at timestamptz,
  p_session_created_at timestamptz, p_session_expires_at timestamptz,
  p_admin_id uuid, p_reason text, p_request_id text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.account_recharges;
  s public.payment_sessions;
  t public.balance_transactions;
  v_before numeric;
  v_after numeric;
  v_count bigint;
begin
  if auth.role() is distinct from 'service_role' or p_admin_id is null
     or not public.is_admin(p_admin_id) then
    raise exception 'LATE_PAYMENT_ADMIN_REQUIRED';
  end if;
  if nullif(btrim(p_reason), '') is null or length(p_reason) > 500
     or p_reason ~* 'sb_secret_|-----BEGIN|https?://|eyJ[a-zA-Z0-9_-]{20}|(secret|token|signature|merchant.?key)[[:space:]]*[:=]'
     or nullif(btrim(p_request_id), '') is null or length(p_request_id) > 160 then
    raise exception 'LATE_PAYMENT_REVIEW_REASON_REQUIRED';
  end if;
  -- Match canonical complete_payment_session lock ordering (session -> recharge -> profile).
  select * into s from public.payment_sessions where id = p_session_id for update;
  if not found then raise exception 'LATE_PAYMENT_SESSION_MISSING'; end if;
  select * into r from public.account_recharges where id = p_recharge_id for update;
  if not found then raise exception 'LATE_PAYMENT_RECHARGE_MISSING'; end if;

  if r.provider is distinct from 'snpay' or s.provider is distinct from 'snpay'
     or r.channel_code not in ('alipay','wechat') or r.channel_code is null
     or s.channel_code is distinct from r.channel_code
     or r.currency is distinct from 'CNY' or s.currency is distinct from 'CNY'
     or r.user_id is distinct from p_user_id or s.user_id is distinct from r.user_id
     or s.business_type is distinct from 'recharge' or s.business_id is distinct from r.id
     or s.business_no is distinct from r.recharge_no
     or s.session_no is distinct from p_session_no
     or nullif(btrim(p_provider_order_no), '') is null
     or s.provider_order_no is distinct from p_provider_order_no
     or (s.provider_transaction_id is not null and s.provider_transaction_id <> p_provider_order_no)
     or (r.provider_trade_no is not null and r.provider_trade_no <> p_provider_order_no) then
    raise exception 'LATE_PAYMENT_IDENTITY_CONFLICT';
  end if;
  select count(*) into v_count from public.payment_sessions
    where business_type = 'recharge' and business_id = r.id
      and provider = 'snpay' and nullif(btrim(provider_order_no), '') is not null;
  if v_count <> 1 then raise exception 'LATE_PAYMENT_SESSION_AMBIGUOUS'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2)
     or r.payable_amount is distinct from p_amount or r.amount is distinct from p_amount
     or r.requested_amount is distinct from p_amount or s.payable_amount is distinct from p_amount then
    raise exception 'LATE_PAYMENT_AMOUNT_CONFLICT';
  end if;
  if p_paid_at is null or not isfinite(p_paid_at)
     or r.created_at is distinct from p_recharge_created_at
     or s.created_at is distinct from p_session_created_at
     or r.expires_at is distinct from p_recharge_expires_at
     or s.expires_at is distinct from p_session_expires_at
     or r.expires_at is null or s.expires_at is null
     or p_paid_at <= r.created_at or p_paid_at <= s.created_at
     or p_paid_at <= r.expires_at or p_paid_at <= s.expires_at
     or p_paid_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'LATE_PAYMENT_TRUSTED_TIME_INVALID';
  end if;
  if exists (select 1 from public.payment_sessions x where x.id <> s.id
      and (x.provider_order_no = p_provider_order_no or x.provider_transaction_id = p_provider_order_no))
     or exists (select 1 from public.account_recharges x where x.id <> r.id
      and x.provider_trade_no = p_provider_order_no) then
    raise exception 'LATE_PAYMENT_PROVIDER_TRANSACTION_REUSED';
  end if;
  select count(*) into v_count from public.balance_transactions
    where business_id = r.recharge_no and status = 'completed';
  select * into t from public.balance_transactions where business_id = r.recharge_no
    and status = 'completed' limit 1;
  if r.status = 'succeeded' and r.exception_type = 'snpay_late_payment_manual_v1' then
    if v_count <> 1 or t.business_type <> 'account_recharge' or t.direction <> 'credit'
       or t.user_id <> r.user_id or t.amount <> p_amount or t.currency <> 'CNY'
       or r.credited_amount is distinct from p_amount or r.completed_at is null
       or r.paid_at is distinct from p_paid_at or s.status <> 'paid'
       or s.paid_at is distinct from p_paid_at then
      raise exception 'LATE_PAYMENT_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true);
  end if;
  if r.status is distinct from 'expired' or s.status is distinct from 'expired'
     or r.credited_amount is distinct from 0::numeric or r.completed_at is not null
     or v_count <> 0 then
    raise exception 'LATE_PAYMENT_EXISTING_CREDIT_OR_STATUS_CONFLICT';
  end if;

  -- Dedicated atomic accounting follows canonical ledger semantics; never calls
  -- normal completion after transiently changing expired into pending/processing.
  select balance into v_before from public.profiles where id = r.user_id for update;
  if not found or v_before is null then raise exception 'LATE_PAYMENT_PROFILE_MISSING'; end if;
  v_after := v_before + p_amount;
  update public.profiles set balance = v_after, updated_at = now() where id = r.user_id;
  insert into public.balance_transactions (
    user_id,transaction_no,business_type,business_id,direction,amount,
    balance_before,balance_after,currency,status,remark,metadata
  ) values (
    r.user_id,'BT' || replace(gen_random_uuid()::text,'-',''),'account_recharge',r.recharge_no,
    'credit',p_amount,v_before,v_after,'CNY','completed','过期付款管理员核验入账',
    jsonb_build_object('manualLatePayment',true,'provider','snpay','providerOrderPresent',true)
  );
  update public.account_recharges set status='succeeded', received_amount=p_amount,
    credited_amount=p_amount, paid_at=p_paid_at, completed_at=now(), provider_trade_no=p_provider_order_no,
    reviewed_at=now(), reviewed_by=p_admin_id, review_reason=btrim(p_reason),
    exception_type='snpay_late_payment_manual_v1', callback_status='manual_review', updated_at=now()
    where id=r.id;
  update public.payment_sessions set status='paid', paid_at=p_paid_at,
    provider_transaction_id=p_provider_order_no, reconcile_status='matched',
    last_error=null, last_synced_at=now(), updated_at=now() where id=s.id;
  insert into public.recharge_review_events (
    recharge_id,recharge_no,actor_user_id,actor_type,action,from_status,to_status,reason,request_id,metadata
  ) values (
    r.id,r.recharge_no,p_admin_id,'admin','approve_late_payment','expired','succeeded',btrim(p_reason),p_request_id,
    jsonb_build_object('provider','snpay','channel',r.channel_code,'principalAmount',p_amount,
      'providerOrderPresent',true,'providerPaidAt',p_paid_at,'expiresAt',r.expires_at,
      'paidAfterExpirySeconds',extract(epoch from (p_paid_at-r.expires_at)))
  );
  return jsonb_build_object('ok',true,'idempotent',false);
end;
$$;
revoke all on function public.complete_account_recharge_late_payment_manual_v1(
  uuid,uuid,uuid,text,text,numeric,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.complete_account_recharge_late_payment_manual_v1(
  uuid,uuid,uuid,text,text,numeric,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,uuid,text,text
) to service_role;
commit;
