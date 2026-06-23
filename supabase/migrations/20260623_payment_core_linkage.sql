-- Payment core linkage for Jianlian Shop.
-- Execute manually after 20260623_payment_provider_core.sql.
-- This migration is idempotent and does not integrate or simulate a real Provider.

create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;

create unique index if not exists payment_sessions_active_business_unique
  on public.payment_sessions(business_type, business_id)
  where status in ('pending', 'processing');

alter table if exists public.payment_callback_logs
  add column if not exists session_no text,
  add column if not exists business_id text,
  add column if not exists provider_order_no text;

alter table if exists public.payment_callback_logs
  drop constraint if exists payment_callback_logs_process_result_check;

alter table if exists public.payment_callback_logs
  add constraint payment_callback_logs_process_result_check
  check (
    process_result is null
    or process_result in (
      'received',
      'verified',
      'signature_failed',
      'parsed',
      'amount_mismatch',
      'currency_mismatch',
      'duplicate',
      'business_not_found',
      'order_not_found',
      'processing_failed',
      'success'
    )
  );

create index if not exists payment_callback_logs_session_no_idx
  on public.payment_callback_logs(session_no)
  where session_no is not null;

create or replace function public.reserve_payment_session(
  p_session_no text,
  p_business_type text,
  p_business_id uuid,
  p_business_no text,
  p_user_id uuid,
  p_channel_code text,
  p_provider text,
  p_currency text,
  p_network text,
  p_requested_amount numeric,
  p_fee_amount numeric,
  p_payable_amount numeric,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.payment_sessions;
  v_created boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'reserve_payment_session can only be called by trusted server role';
  end if;

  if p_business_type not in ('order', 'recharge') then
    raise exception '不支持的支付业务类型';
  end if;

  update public.payment_sessions
  set status = 'expired',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
  where business_type = p_business_type
    and business_id = p_business_id
    and status in ('pending', 'processing')
    and expires_at <= now();

  select *
  into v_session
  from public.payment_sessions
  where business_type = p_business_type
    and business_id = p_business_id
    and status in ('pending', 'processing')
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object('created', false, 'session', to_jsonb(v_session));
  end if;

  begin
    insert into public.payment_sessions (
      session_no,
      business_type,
      business_id,
      business_no,
      user_id,
      channel_code,
      provider,
      currency,
      network,
      requested_amount,
      fee_amount,
      payable_amount,
      status,
      payment_type,
      expires_at,
      metadata
    ) values (
      p_session_no,
      p_business_type,
      p_business_id,
      p_business_no,
      p_user_id,
      p_channel_code,
      p_provider,
      upper(coalesce(nullif(p_currency, ''), 'CNY')),
      nullif(p_network, ''),
      p_requested_amount,
      p_fee_amount,
      p_payable_amount,
      'processing',
      'redirect',
      p_expires_at,
      jsonb_build_object('initializing', true)
    )
    returning * into v_session;
    v_created := true;
  exception when unique_violation then
    select *
    into v_session
    from public.payment_sessions
    where business_type = p_business_type
      and business_id = p_business_id
      and status in ('pending', 'processing')
    order by created_at desc
    limit 1;
  end;

  if v_session.id is null then
    raise exception '支付会话占用失败，请稍后重试';
  end if;

  return jsonb_build_object('created', v_created, 'session', to_jsonb(v_session));
end;
$$;

revoke execute on function public.reserve_payment_session(
  text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_payment_session(
  text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz
) to service_role;

create or replace function public.complete_order_payment(
  p_order_id uuid,
  p_session_no text,
  p_channel_code text,
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
  v_order public.orders;
  v_item public.order_items;
  v_product public.products;
  v_next_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_order_payment can only be called by trusted server role';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception '订单不存在'; end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'businessType', 'order',
      'businessId', v_order.id,
      'businessNo', v_order.order_no
    );
  end if;

  if v_order.status in ('cancelled', 'refunded', 'failed') then
    raise exception '当前订单状态不允许确认支付';
  end if;

  if round(coalesce(p_paid_amount, 0)::numeric, 6)
     <> round(coalesce(v_order.total_amount, 0)::numeric, 6) then
    raise exception '渠道金额与订单应付金额不一致';
  end if;

  if upper(coalesce(p_currency, 'CNY')) <> upper(coalesce(v_order.currency, 'CNY')) then
    raise exception '渠道币种与订单币种不一致';
  end if;

  if exists (
    select 1
    from public.order_payments op
    where op.provider_trade_no = nullif(p_provider_transaction_id, '')
      and op.order_id <> v_order.id
  ) then
    raise exception '渠道交易号已被其他订单使用';
  end if;

  for v_item in
    select *
    from public.order_items
    where order_id = v_order.id
      and public.normalize_order_item_delivery_type(delivery_type) <> 'auto_delivery'
      and product_id is not null
    order by created_at asc
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if not found or coalesce(v_product.stock, 0) < coalesce(v_item.quantity, 1) then
      raise exception '商品库存不足，无法确认支付';
    end if;

    update public.products
    set stock = stock - coalesce(v_item.quantity, 1),
        status = case
          when stock - coalesce(v_item.quantity, 1) <= 0 and status = 'active' then 'sold_out'
          else status
        end,
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  v_next_status := case when v_order.status = 'pending_payment' then 'paid' else v_order.status end;

  update public.orders
  set payment_status = 'paid',
      status = v_next_status,
      payment_method = p_channel_code,
      paid_at = coalesce(p_paid_at, now()),
      updated_at = now()
  where id = v_order.id;

  insert into public.order_payments (
    payment_no,
    order_id,
    user_id,
    payment_method,
    amount,
    currency,
    status,
    transaction_reference,
    submitted_at,
    reviewed_at,
    business_type,
    channel,
    business_amount,
    fee_amount,
    payable_amount,
    received_amount,
    provider_trade_no,
    paid_at,
    callback_status
  ) values (
    'AUTO-' || p_session_no,
    v_order.id,
    v_order.user_id,
    p_channel_code,
    v_order.total_amount,
    v_order.currency,
    'paid',
    nullif(p_provider_transaction_id, ''),
    now(),
    now(),
    'order',
    p_channel_code,
    v_order.total_amount,
    0,
    v_order.total_amount,
    p_paid_amount,
    nullif(p_provider_transaction_id, ''),
    coalesce(p_paid_at, now()),
    'success'
  )
  on conflict (payment_no) do update
  set status = 'paid',
      provider_trade_no = coalesce(excluded.provider_trade_no, public.order_payments.provider_trade_no),
      received_amount = excluded.received_amount,
      paid_at = coalesce(public.order_payments.paid_at, excluded.paid_at),
      callback_status = 'success',
      updated_at = now();

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    v_order.id,
    v_order.status,
    v_next_status,
    null,
    'system',
    '支付渠道回调确认到账'
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'businessType', 'order',
    'businessId', v_order.id,
    'businessNo', v_order.order_no
  );
end;
$$;

revoke execute on function public.complete_order_payment(
  uuid,text,text,text,numeric,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_order_payment(
  uuid,text,text,text,numeric,text,timestamptz
) to service_role;

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
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_payment_session can only be called by trusted server role';
  end if;

  select * into v_session
  from public.payment_sessions
  where id = p_session_id
  for update;

  if not found then raise exception '支付会话不存在'; end if;

  if v_session.status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'businessType', case when v_session.business_type = 'order' then 'order' else 'recharge' end,
      'businessId', v_session.business_id,
      'businessNo', v_session.business_no
    );
  end if;

  if v_session.status in ('expired', 'closed', 'failed') then
    raise exception '支付会话状态不允许确认支付';
  end if;

  if round(coalesce(p_paid_amount, 0)::numeric, 6)
     <> round(coalesce(v_session.payable_amount, 0)::numeric, 6) then
    raise exception '渠道金额与支付会话金额不一致';
  end if;

  if upper(coalesce(p_currency, 'CNY')) <> upper(coalesce(v_session.currency, 'CNY')) then
    raise exception '渠道币种与支付会话币种不一致';
  end if;

  if exists (
    select 1
    from public.payment_sessions ps
    where ps.provider_transaction_id = nullif(p_provider_transaction_id, '')
      and ps.id <> v_session.id
  ) then
    raise exception '渠道交易号已被其他支付会话使用';
  end if;

  if v_session.business_type = 'order' then
    v_result := public.complete_order_payment(
      v_session.business_id,
      v_session.session_no,
      v_session.channel_code,
      p_provider_transaction_id,
      p_paid_amount,
      p_currency,
      p_paid_at
    );
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
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('initializing', false),
      updated_at = now()
  where id = v_session.id;

  return v_result;
end;
$$;

revoke execute on function public.complete_payment_session(
  uuid,text,numeric,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_payment_session(
  uuid,text,numeric,text,timestamptz
) to service_role;

create or replace function public.payment_core_readiness_probe()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activeSessionUniqueIndex',
      to_regclass('public.payment_sessions_active_business_unique') is not null,
    'reservePaymentSessionRpc',
      to_regprocedure('public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamp with time zone)') is not null,
    'completeRechargeRpc',
      to_regprocedure('public.complete_account_recharge(uuid,text,numeric,text)') is not null,
    'completeOrderRpc',
      to_regprocedure('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)') is not null,
    'completePaymentSessionRpc',
      to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is not null,
    'callbackLogsTable',
      to_regclass('public.payment_callback_logs') is not null,
    'reconciliationTable',
      to_regclass('public.payment_reconciliations') is not null
  );
$$;

revoke execute on function public.payment_core_readiness_probe() from public, anon, authenticated;
grant execute on function public.payment_core_readiness_probe() to service_role;
