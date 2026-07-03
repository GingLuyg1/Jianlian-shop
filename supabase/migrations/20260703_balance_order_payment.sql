-- Balance payment for direct checkout orders.
-- Execute manually in Supabase SQL Editor after:
-- 1) 20260623_payment_balance_transactions_compatibility.sql
-- 2) 20260623_payment_core_linkage.sql
-- 3) order tables and create_order_with_item migrations
-- This migration does not integrate any external payment provider.

create extension if not exists pgcrypto;

create or replace function public.pay_order_with_balance(
  p_order_id uuid,
  p_user_id uuid,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_profile public.profiles;
  v_existing_tx public.balance_transactions;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_amount numeric(18, 6);
  v_currency text;
  v_transaction_no text;
  v_payment_ref text;
  v_complete jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'pay_order_with_balance can only be called by trusted server role';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '订单不存在';
  end if;

  if v_order.user_id <> p_user_id then
    raise exception '无权支付该订单';
  end if;

  if coalesce(v_order.payment_method, 'balance') not in ('balance', '') then
    raise exception '该订单不是余额支付订单';
  end if;

  select * into v_existing_tx
  from public.balance_transactions
  where business_type = 'order_payment'
    and business_id = v_order.id::text
    and status = 'completed'
  limit 1;

  if coalesce(v_order.payment_status, 'unpaid') = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'orderId', v_order.id,
      'orderNo', v_order.order_no,
      'paymentStatus', v_order.payment_status,
      'status', v_order.status,
      'transactionNo', v_existing_tx.transaction_no
    );
  end if;

  if v_order.status in ('cancelled', 'refunded', 'failed', 'expired', 'closed') then
    raise exception '当前订单状态不允许余额支付';
  end if;

  v_amount := round(coalesce(v_order.total_amount, 0)::numeric, 6);
  v_currency := upper(coalesce(v_order.currency, 'CNY'));

  if v_amount <= 0 then
    raise exception '订单金额不正确';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception '用户资料不存在';
  end if;

  v_before := round(coalesce(v_profile.balance, 0)::numeric, 6);
  if v_before < v_amount then
    raise exception '账户余额不足';
  end if;

  v_after := round(v_before - v_amount, 6);
  v_transaction_no := 'BT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 8));
  v_payment_ref := 'BAL-' || v_order.order_no;

  update public.profiles
  set balance = v_after,
      updated_at = now()
  where id = p_user_id;

  insert into public.balance_transactions (
    user_id,
    transaction_no,
    business_type,
    business_id,
    direction,
    amount,
    balance_before,
    balance_after,
    currency,
    status,
    remark,
    metadata
  ) values (
    p_user_id,
    v_transaction_no,
    'order_payment',
    v_order.id::text,
    'debit',
    v_amount,
    v_before,
    v_after,
    v_currency,
    'completed',
    '订单余额支付',
    jsonb_build_object(
      'order_no', v_order.order_no,
      'client_request_id_present', nullif(btrim(coalesce(p_client_request_id, '')), '') is not null
    )
  )
  returning * into v_existing_tx;

  v_complete := public.complete_order_payment(
    v_order.id,
    v_payment_ref,
    'balance',
    v_payment_ref,
    v_amount,
    v_currency,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'orderId', v_order.id,
    'orderNo', v_order.order_no,
    'paymentStatus', 'paid',
    'status', coalesce(v_complete->>'status', 'paid'),
    'transactionNo', v_existing_tx.transaction_no
  );
exception
  when unique_violation then
    select * into v_existing_tx
    from public.balance_transactions
    where business_type = 'order_payment'
      and business_id = p_order_id::text
      and status = 'completed'
    limit 1;

    if found then
      select * into v_order from public.orders where id = p_order_id;
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'orderId', p_order_id,
        'orderNo', v_order.order_no,
        'paymentStatus', v_order.payment_status,
        'status', v_order.status,
        'transactionNo', v_existing_tx.transaction_no
      );
    end if;
    raise;
end;
$$;

revoke execute on function public.pay_order_with_balance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pay_order_with_balance(uuid, uuid, text) to service_role;