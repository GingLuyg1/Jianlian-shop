-- Forward-only: replace reservation RPC; no historical row repair or accounting.
-- Apply separately after approval. Do not replay prior payment migrations.
begin;
do $$
begin
  if to_regprocedure('public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz)') is null
     or to_regclass('public.account_recharges') is null
     or to_regclass('public.payment_sessions') is null then
    raise exception 'PAYMENT_SESSION_GUARD_BASELINE_MISSING';
  end if;
  if not exists (select 1 from pg_index where indexrelid = to_regclass('public.payment_sessions_active_business_unique')
      and indisvalid and indisunique) then
    raise exception 'PAYMENT_SESSION_GUARD_ACTIVE_UNIQUE_MISSING';
  end if;
end $$;

create or replace function public.reserve_payment_session(
  p_session_no text, p_business_type text, p_business_id uuid, p_business_no text,
  p_user_id uuid, p_channel_code text, p_provider text, p_currency text, p_network text,
  p_requested_amount numeric, p_fee_amount numeric, p_payable_amount numeric,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.payment_sessions;
  v_recharge public.account_recharges;
  v_created boolean := false;
  v_type text := case when p_business_type = 'account_recharge' then 'recharge' else p_business_type end;
  v_guarded boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'reserve_payment_session can only be called by trusted server role';
  end if;
  if v_type is null or v_type not in ('order','recharge') then
    raise exception '不支持的支付业务类型';
  end if;

  if v_type = 'recharge' then
    -- Completion locks session -> recharge -> profile. A recharge row lock here
    -- before expiring a session would invert that ordering. Serialize reservations
    -- with a transaction-scoped business lock instead; never key by session_no.
    perform pg_advisory_xact_lock(hashtextextended('payment-session-reserve:recharge:' || p_business_id::text, 0));
    select * into v_recharge from public.account_recharges where id = p_business_id;
    if not found then
      return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
        'blockCode','BUSINESS_STATUS_INVALID');
    end if;
    -- Guard based on persisted business, not caller-supplied provider flags.
    v_guarded := v_recharge.provider in ('snpay','liuhaoyi')
      and v_recharge.channel_code in ('alipay','wechat','wechat_pay');
    if v_guarded then
      if v_recharge.recharge_no is distinct from p_business_no
         or v_recharge.user_id is distinct from p_user_id
         or v_recharge.provider is distinct from p_provider
         or (case when v_recharge.channel_code='wechat_pay' then 'wechat' else v_recharge.channel_code end) is distinct from p_channel_code then
        return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
          'blockCode','SESSION_IDENTITY_CONFLICT');
      end if;
      if v_recharge.status in ('succeeded','paid') then
        return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
          'blockCode','BUSINESS_ALREADY_PAID');
      end if;
      select * into v_session from public.payment_sessions
        where business_type in ('recharge','account_recharge') and business_id=p_business_id
          and status in ('pending','processing') and expires_at > now()
        order by created_at desc limit 1;
      if found then
        if v_session.business_no is distinct from p_business_no
           or v_session.user_id is distinct from p_user_id
           or v_session.channel_code is distinct from p_channel_code
           or v_session.provider is distinct from p_provider then
          return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
            'blockCode','SESSION_IDENTITY_CONFLICT');
        end if;
        return jsonb_build_object('created',false,'session',to_jsonb(v_session),'retryGuardVersion',1);
      end if;
      -- Any failed history is uncertain, regardless of expiry/order artifact.
      -- No mutation occurs on a blocked reservation, even with two historical failures.
      select * into v_session from public.payment_sessions
        where business_type in ('recharge','account_recharge') and business_id=p_business_id and status='failed'
        order by created_at desc limit 1;
      if found then
        if v_session.business_no is distinct from p_business_no
           or v_session.user_id is distinct from p_user_id
           or v_session.channel_code is distinct from p_channel_code
           or v_session.provider is distinct from p_provider then
          return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
            'blockCode','SESSION_IDENTITY_CONFLICT');
        end if;
        return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
          'blockCode','SESSION_FAILED_REQUIRES_REVIEW',
          'session',jsonb_build_object('status','failed'));
      end if;
      if v_recharge.status in ('cancelled','closed','expired','refunded','failed','rejected')
         or v_recharge.expires_at <= now() then
        return jsonb_build_object('created',false,'blocked',true,'retryGuardVersion',1,
          'blockCode','BUSINESS_STATUS_INVALID');
      end if;
    end if;
  end if;

  -- Legacy order reservation/expiry semantics remain unchanged.
  update public.payment_sessions set status='expired', closed_at=coalesce(closed_at,now()), updated_at=now()
    where business_type=v_type and business_id=p_business_id
      and status in ('pending','processing') and expires_at <= now();
  select * into v_session from public.payment_sessions
    where business_type=v_type and business_id=p_business_id
      and status in ('pending','processing') and expires_at > now()
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('created',false,'session',to_jsonb(v_session))
      || case when v_guarded then jsonb_build_object('retryGuardVersion',1) else '{}'::jsonb end;
  end if;
  begin
    insert into public.payment_sessions (
      session_no,business_type,business_id,business_no,user_id,channel_code,provider,
      currency,network,requested_amount,fee_amount,payable_amount,status,payment_type,expires_at,metadata
    ) values (
      p_session_no,v_type,p_business_id,p_business_no,p_user_id,p_channel_code,p_provider,
      upper(coalesce(nullif(p_currency,''),'CNY')),nullif(p_network,''),p_requested_amount,
      p_fee_amount,p_payable_amount,'processing','redirect',p_expires_at,jsonb_build_object('initializing',true)
    ) returning * into v_session;
    v_created := true;
  exception when unique_violation then
    select * into v_session from public.payment_sessions
      where business_type=v_type and business_id=p_business_id and status in ('pending','processing')
      order by created_at desc limit 1;
  end;
  if v_session.id is null then raise exception '支付会话占用失败，请稍后重试'; end if;
  return jsonb_build_object('created',v_created,'session',to_jsonb(v_session))
    || case when v_guarded then jsonb_build_object('retryGuardVersion',1) else '{}'::jsonb end;
end;
$$;
revoke all on function public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz)
  to service_role;
commit;
