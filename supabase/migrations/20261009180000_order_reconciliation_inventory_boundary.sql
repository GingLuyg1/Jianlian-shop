-- Forward-only: canonical order reconciliation inventory/expiry boundary.
-- No business data writes. Apply separately with explicit deployment approval.
begin;
do $migration$
declare
  definition text;
  anchor text;
  replacement text;
begin
  select pg_get_functiondef('public.complete_payment_session(uuid,text,numeric,text,timestamptz)'::regprocedure) into definition;
  anchor := '  select * into v_session';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1
     or position('ORDER_FIRST_LOCK_BOUNDARY' in definition) > 0 then
    raise exception 'UNKNOWN_PAYMENT_SESSION_LOCK_BASELINE';
  end if;
  -- Same order -> session lock order as expire_unpaid_order. Re-read after
  -- obtaining the lock; a completion never resurrects released inventory.
  replacement := $guard$  -- ORDER_FIRST_LOCK_BOUNDARY
  perform o.id from public.orders o
    join public.payment_sessions ps on ps.business_id = o.id
    where ps.id = p_session_id and ps.business_type = 'order'
    for update of o;
$guard$ || anchor;
  definition := replace(definition, anchor, replacement);
  anchor := '    v_result := public.complete_order_payment(';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'UNKNOWN_ORDER_SESSION_COMPLETION_BASELINE';
  end if;
  replacement := $guard$    -- SNPAY-only principal/expiry policy. BEP20 currency conversion and
    -- other Provider/manual completion contracts are deliberately unchanged.
    if v_session.provider = 'snpay' then
      if v_order.status <> 'pending_payment' or v_order.payment_status <> 'unpaid'
         or v_order.reservation_released_at is not null then
        raise exception 'ORDER_RESERVED_PAYMENT_BOUNDARY';
      end if;
      if p_paid_at is null or not isfinite(p_paid_at)
         or p_paid_at < v_order.created_at
         or p_paid_at > statement_timestamp() + interval '5 minutes'
         or v_order.payment_expires_at is null
         or p_paid_at > v_order.payment_expires_at then
        raise exception 'ORDER_TRUSTED_PAYMENT_TIME_BOUNDARY';
      end if;
      if v_session.business_no is distinct from v_order.order_no
       or v_session.user_id is distinct from v_order.user_id
       or v_session.channel_code is distinct from v_order.payment_method
       or v_session.currency is distinct from v_order.currency
       or v_session.payable_amount is distinct from v_order.total_amount
       or v_session.expires_at is null or v_session.fee_amount <> 0
       or v_session.currency <> 'CNY' or v_session.channel_code not in ('alipay','wechat')
       or v_session.payable_amount <= 0 or v_session.payable_amount > 2000
       or p_paid_at is null or not isfinite(p_paid_at)
       or p_paid_at < v_session.created_at or p_paid_at > v_session.expires_at then
        raise exception 'ORDER_SESSION_FROZEN_CONTEXT_BOUNDARY';
      end if;
    end if;
$guard$ || anchor;
  execute replace(definition, anchor, replacement);
end;
$migration$;
-- CREATE OR REPLACE preserves existing ACL. Assert trusted server-only entry.
do $acl$
begin
  if has_function_privilege('anon','public.complete_payment_session(uuid,text,numeric,text,timestamptz)','execute')
     or has_function_privilege('authenticated','public.complete_payment_session(uuid,text,numeric,text,timestamptz)','execute')
     or has_function_privilege('anon','public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)','execute')
     or has_function_privilege('authenticated','public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)','execute')
     or not has_function_privilege('service_role','public.complete_payment_session(uuid,text,numeric,text,timestamptz)','execute')
     or not has_function_privilege('service_role','public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)','execute') then
    raise exception 'ORDER_COMPLETION_ACL_UNSAFE';
  end if;
end;
$acl$;
commit;
