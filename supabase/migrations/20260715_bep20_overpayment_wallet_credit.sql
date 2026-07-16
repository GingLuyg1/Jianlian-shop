-- Credit an approved BEP20 overpayment to the user's CNY wallet exactly once.
-- Apply after:
--   20260715_admin_users_super_admin_model.sql
--   20260715_bep20_manual_review_payment_linkage.sql
--   20260715_bep20_approved_overpayment_completion.sql

do $$
declare
  v_missing text;
begin
  if to_regclass('public.chain_payment_sessions') is null
     or to_regclass('public.order_payments') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.balance_transactions') is null
     or to_regclass('public.admin_audit_logs') is null
     or to_regclass('public.admin_users') is null then
    raise exception 'BEP20 overpayment wallet credit requires chain payments, orders, profiles, balance ledger, audit logs, and admin_users';
  end if;

  if to_regprocedure('public.is_super_admin(uuid)') is null then
    raise exception 'BEP20 overpayment wallet credit requires public.is_super_admin(uuid)';
  end if;

  select string_agg(required.object_name, ', ' order by required.object_name)
  into v_missing
  from (
    values
      ('chain_payment_sessions.payment_id'),
      ('chain_payment_sessions.order_id'),
      ('chain_payment_sessions.status'),
      ('chain_payment_sessions.manual_review_decision'),
      ('chain_payment_sessions.expected_amount'),
      ('chain_payment_sessions.confirmed_amount'),
      ('chain_payment_sessions.exchange_rate'),
      ('chain_payment_sessions.order_currency'),
      ('chain_payment_sessions.payment_currency'),
      ('order_payments.order_id'),
      ('order_payments.payable_amount'),
      ('order_payments.received_amount'),
      ('order_payments.status'),
      ('orders.user_id'),
      ('orders.status'),
      ('orders.payment_status'),
      ('profiles.balance'),
      ('profiles.updated_at')
  ) as required(object_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(required.object_name, '.', 1)
      and c.column_name = split_part(required.object_name, '.', 2)
  );

  if v_missing is not null then
    raise exception 'BEP20 overpayment wallet credit missing required columns: %', v_missing;
  end if;
end;
$$;

create table if not exists public.bep20_overpayment_dispositions (
  chain_session_id uuid primary key references public.chain_payment_sessions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  payment_id uuid not null references public.order_payments(id) on delete restrict,
  balance_transaction_id uuid not null unique references public.balance_transactions(id) on delete restrict,
  overpaid_usdt numeric(36, 18) not null,
  exchange_rate numeric(36, 18) not null,
  credited_cny numeric(18, 2) not null,
  disposition text not null default 'wallet_credit',
  processed_by uuid not null references auth.users(id) on delete restrict,
  processed_at timestamptz not null default now(),
  reason text not null,
  request_id text not null,
  constraint bep20_overpayment_disposition_type_check check (disposition = 'wallet_credit'),
  constraint bep20_overpayment_amount_check check (overpaid_usdt > 0),
  constraint bep20_overpayment_rate_check check (exchange_rate > 0),
  constraint bep20_overpayment_credit_check check (credited_cny > 0),
  constraint bep20_overpayment_reason_check check (length(btrim(reason)) between 1 and 500)
);

create unique index if not exists bep20_overpayment_dispositions_payment_uidx
  on public.bep20_overpayment_dispositions(payment_id);
create index if not exists bep20_overpayment_dispositions_user_processed_idx
  on public.bep20_overpayment_dispositions(user_id, processed_at desc);

alter table public.bep20_overpayment_dispositions enable row level security;

drop policy if exists "super admins read BEP20 overpayment dispositions"
  on public.bep20_overpayment_dispositions;
create policy "super admins read BEP20 overpayment dispositions"
on public.bep20_overpayment_dispositions for select to authenticated
using (public.is_super_admin(auth.uid()));

revoke all on public.bep20_overpayment_dispositions from public, anon, authenticated;
grant select on public.bep20_overpayment_dispositions to authenticated;
grant all on public.bep20_overpayment_dispositions to service_role;

create or replace function public.credit_bep20_overpayment_to_wallet(
  p_payment_id uuid,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator_id uuid := auth.uid();
  v_payment public.order_payments;
  v_chain public.chain_payment_sessions;
  v_order public.orders;
  v_profile public.profiles;
  v_existing public.bep20_overpayment_dispositions;
  v_balance_transaction public.balance_transactions;
  v_overpaid_usdt numeric(36, 18);
  v_credited_cny numeric(18, 2);
  v_balance_before numeric(18, 6);
  v_balance_after numeric(18, 6);
  v_request_id text := coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text);
  v_transaction_no text;
begin
  if v_operator_id is null or not public.is_super_admin(v_operator_id) then
    raise exception 'BEP20_OVERPAYMENT_SUPER_ADMIN_REQUIRED';
  end if;
  if p_payment_id is null then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_REQUIRED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'BEP20_OVERPAYMENT_REASON_REQUIRED';
  end if;

  select * into v_payment
  from public.order_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_NOT_FOUND';
  end if;

  select * into v_chain
  from public.chain_payment_sessions
  where payment_id = v_payment.id
  for update;

  if not found then
    raise exception 'BEP20_OVERPAYMENT_CHAIN_SESSION_NOT_FOUND';
  end if;

  select * into v_existing
  from public.bep20_overpayment_dispositions
  where chain_session_id = v_chain.id;

  if found then
    return jsonb_build_object(
      'result', 'already_processed',
      'chain_session_id', v_existing.chain_session_id,
      'order_id', v_existing.order_id,
      'overpaid_usdt', v_existing.overpaid_usdt,
      'exchange_rate', v_existing.exchange_rate,
      'credited_cny', v_existing.credited_cny,
      'processed_at', v_existing.processed_at
    );
  end if;

  select * into v_order
  from public.orders
  where id = v_chain.order_id
  for update;

  if not found or v_payment.order_id <> v_order.id then
    raise exception 'BEP20_OVERPAYMENT_ORDER_LINK_INVALID';
  end if;
  if v_chain.status <> 'paid' or v_payment.status <> 'paid' or v_order.payment_status <> 'paid' then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_NOT_PAID';
  end if;
  if v_order.status not in ('paid', 'processing', 'delivered', 'completed') then
    raise exception 'BEP20_OVERPAYMENT_ORDER_STATUS_INVALID';
  end if;
  if v_chain.manual_review_decision <> 'approved' then
    raise exception 'BEP20_OVERPAYMENT_MANUAL_REVIEW_NOT_APPROVED';
  end if;
  if upper(coalesce(v_chain.payment_currency, '')) <> 'USDT'
     or upper(coalesce(v_chain.order_currency, '')) <> 'CNY' then
    raise exception 'BEP20_OVERPAYMENT_CURRENCY_INVALID';
  end if;
  if v_chain.confirmed_amount is null
     or v_chain.expected_amount is null
     or v_chain.confirmed_amount <= v_chain.expected_amount then
    raise exception 'BEP20_OVERPAYMENT_AMOUNT_NOT_POSITIVE';
  end if;
  if v_chain.exchange_rate is null or v_chain.exchange_rate <= 0 then
    raise exception 'BEP20_OVERPAYMENT_EXCHANGE_RATE_INVALID';
  end if;
  if round(coalesce(v_payment.payable_amount, 0), 6) <> round(v_chain.expected_amount, 6)
     or round(coalesce(v_payment.received_amount, 0), 6) <> round(v_chain.confirmed_amount, 6) then
    raise exception 'BEP20_OVERPAYMENT_PAYMENT_SNAPSHOT_MISMATCH';
  end if;

  v_overpaid_usdt := v_chain.confirmed_amount - v_chain.expected_amount;
  v_credited_cny := round(v_overpaid_usdt * v_chain.exchange_rate, 2);
  if v_credited_cny <= 0 then
    raise exception 'BEP20_OVERPAYMENT_CREDIT_ROUNDS_TO_ZERO';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_order.user_id
  for update;

  if not found then
    raise exception 'BEP20_OVERPAYMENT_PROFILE_NOT_FOUND';
  end if;

  v_balance_before := coalesce(v_profile.balance, 0);
  v_balance_after := v_balance_before + v_credited_cny;
  v_transaction_no := 'BT-BEP20-' || replace(v_chain.id::text, '-', '');

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
    v_order.user_id,
    v_transaction_no,
    'system',
    v_chain.id::text,
    'credit',
    v_credited_cny,
    v_balance_before,
    v_balance_after,
    'CNY',
    'completed',
    'BEP20 超额支付按冻结汇率转入站内余额',
    jsonb_build_object(
      'subtype', 'bep20_overpayment_wallet_credit',
      'chain_session_id', v_chain.id,
      'order_id', v_order.id,
      'payment_id', v_payment.id,
      'overpaid_usdt', v_overpaid_usdt,
      'exchange_rate', v_chain.exchange_rate
    )
  )
  returning * into v_balance_transaction;

  update public.profiles
  set balance = v_balance_after,
      updated_at = now()
  where id = v_order.user_id;

  insert into public.bep20_overpayment_dispositions (
    chain_session_id,
    order_id,
    user_id,
    payment_id,
    balance_transaction_id,
    overpaid_usdt,
    exchange_rate,
    credited_cny,
    disposition,
    processed_by,
    processed_at,
    reason,
    request_id
  ) values (
    v_chain.id,
    v_order.id,
    v_order.user_id,
    v_payment.id,
    v_balance_transaction.id,
    v_overpaid_usdt,
    v_chain.exchange_rate,
    v_credited_cny,
    'wallet_credit',
    v_operator_id,
    now(),
    btrim(p_reason),
    v_request_id
  );

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    module,
    target_type,
    target_id,
    request_id,
    result,
    before_summary,
    after_summary,
    metadata
  ) values (
    v_operator_id,
    'credit_bep20_overpayment_to_wallet',
    'payments',
    'chain_payment_session',
    v_chain.id::text,
    v_request_id,
    'success',
    jsonb_build_object('balance', v_balance_before),
    jsonb_build_object('balance', v_balance_after, 'credited_cny', v_credited_cny),
    jsonb_build_object(
      'order_id', v_order.id,
      'payment_id', v_payment.id,
      'overpaid_usdt', v_overpaid_usdt,
      'exchange_rate', v_chain.exchange_rate,
      'reason', btrim(p_reason)
    )
  );

  return jsonb_build_object(
    'result', 'credited',
    'chain_session_id', v_chain.id,
    'order_id', v_order.id,
    'overpaid_usdt', v_overpaid_usdt,
    'exchange_rate', v_chain.exchange_rate,
    'credited_cny', v_credited_cny,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.credit_bep20_overpayment_to_wallet(uuid,text,text)
  from public, anon, service_role;
grant execute on function public.credit_bep20_overpayment_to_wallet(uuid,text,text)
  to authenticated;
