-- CANDIDATE ONLY. Never execute against Production without separate approval.
-- This file is intentionally outside supabase/migrations until a test database
-- validates behavior, cost, privileges and the historical data contract.
-- One RPC invocation uses one PostgreSQL calling-query snapshot because the
-- function is STABLE and contains only SELECT statements.

begin;

create or replace function public.admin_dashboard_analytics_v23(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
set statement_timeout = '15s'
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from
     or p_to > (current_timestamp at time zone 'Asia/Shanghai')::date
     or p_to - p_from + 1 > 365 then
    raise exception 'ANALYTICS_INVALID_RANGE' using errcode = '22023';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Shanghai';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Shanghai';

  -- A paid order without a payment timestamp cannot be allocated to a day.
  if exists (
    select 1 from public.orders o
    where o.payment_status = 'paid' and o.paid_at is null and o.created_at < v_end
  ) then
    raise exception 'ANALYTICS_ORDER_TIME_INCOMPLETE' using errcode = '22000';
  end if;

  -- Current historical data has CNY business orders, including those paid in
  -- USDT. An original-USDT order has no proven CNY conversion direction in
  -- this schema: fail closed until a separately verified snapshot is added.
  if exists (
    select 1 from public.orders o
    where o.payment_status = 'paid' and o.paid_at >= v_start and o.paid_at < v_end
      and (o.currency is distinct from 'CNY' or o.total_amount is null or o.total_amount <= 0)
  ) then
    raise exception 'ANALYTICS_ORDER_CNY_SNAPSHOT_INCOMPLETE' using errcode = '22000';
  end if;

  -- One completed payment evidence per order; never sum sessions/callbacks.
  if exists (
    select 1 from public.orders o
    left join lateral (
      select count(*) as n,
             count(*) filter (where p.order_currency = 'CNY'
               and p.order_amount = o.total_amount
               and p.paid_at is not null
               and (p.paid_at at time zone 'Asia/Shanghai')::date =
                 (o.paid_at at time zone 'Asia/Shanghai')::date) as matching_n
      from public.order_payments p
      where p.order_id = o.id and p.status = 'paid'
    ) proof on true
    where o.payment_status = 'paid' and o.paid_at >= v_start and o.paid_at < v_end
      and (proof.n <> 1 or proof.matching_n <> 1)
  ) then
    raise exception 'ANALYTICS_ORDER_PAYMENT_EVIDENCE_INCOMPLETE' using errcode = '22000';
  end if;

  -- A recharge credit is the balance-ledger event, not the request date or
  -- provider payment time. A duplicate completed credit is not summed.
  if exists (
    select 1 from public.balance_transactions b
    left join public.account_recharges r on r.recharge_no = b.business_id
    where b.business_type = 'account_recharge' and b.direction = 'credit'
      and b.status = 'completed' and b.created_at >= v_start and b.created_at < v_end
      and (b.currency is distinct from 'CNY' or b.amount <= 0 or r.id is null
        or r.status not in ('paid', 'succeeded')
        or coalesce(r.credited_cny_amount, r.credited_amount) is distinct from b.amount)
  ) then
    raise exception 'ANALYTICS_RECHARGE_CREDIT_INCOMPLETE' using errcode = '22000';
  end if;

  if exists (
    select 1 from public.balance_transactions b
    where b.business_type = 'account_recharge' and b.direction = 'credit'
      and b.status = 'completed'
    group by b.business_id having count(*) <> 1
  ) then
    raise exception 'ANALYTICS_RECHARGE_CREDIT_DUPLICATE' using errcode = '22000';
  end if;

  -- A recharge marked succeeded without a completed wallet credit is not an
  -- authoritative zero. A credit on a later date is valid, but must exist.
  if exists (
    select 1 from public.account_recharges r
    where r.status = 'succeeded'
      and not exists (
        select 1 from public.balance_transactions b
        where b.business_type = 'account_recharge' and b.direction = 'credit'
          and b.status = 'completed' and b.business_id = r.recharge_no
      )
  ) then
    raise exception 'ANALYTICS_RECHARGE_CREDIT_MISSING' using errcode = '22000';
  end if;

  -- The session only stores payable_amount. Raw received amounts must be
  -- proven by the linked paid order payment or recharge record, per currency.
  if exists (
    select 1 from public.payment_sessions s
    left join lateral (
      select count(*) as n from public.order_payments p
      where s.business_type = 'order' and p.order_id = s.business_id
        and p.status = 'paid'
        and (p.payment_session_id = s.id or p.payment_session_id is null)
        and p.received_currency = s.currency and p.received_amount > 0
    ) order_proof on true
    left join public.account_recharges r
      on s.business_type in ('recharge','account_recharge') and r.id = s.business_id
    where s.status = 'paid' and s.created_at >= v_start and s.created_at < v_end
      and (s.currency not in ('CNY','USDT')
        or (s.business_type = 'order' and order_proof.n <> 1)
        or (s.business_type in ('recharge','account_recharge') and
          (r.id is null or r.status not in ('paid','succeeded') or
            (s.currency = 'CNY' and (r.currency is distinct from 'CNY' or coalesce(r.received_amount,0) <= 0)) or
            (s.currency = 'USDT' and (r.settlement_currency is distinct from 'USDT' or coalesce(r.actual_received_usdt,0) <= 0))))
        or s.business_type not in ('order','recharge','account_recharge'))
  ) then
    raise exception 'ANALYTICS_CHANNEL_RECEIPT_INCOMPLETE' using errcode = '22000';
  end if;

  with
  paid_orders as (
    select o.id, o.paid_at, round(o.total_amount, 2) as cny_amount,
      coalesce(s.channel_code, p.channel, 'other') as channel_code
    from public.orders o
    join public.order_payments p on p.order_id = o.id and p.status = 'paid'
    left join public.payment_sessions s on s.id = p.payment_session_id
    where o.payment_status = 'paid' and o.currency = 'CNY'
      and o.paid_at >= v_start and o.paid_at < v_end
  ),
  recharge_credits as (
    select b.id, b.created_at, round(b.amount, 2) as cny_amount
    from public.balance_transactions b
    where b.business_type = 'account_recharge' and b.direction = 'credit'
      and b.status = 'completed' and b.currency = 'CNY'
      and b.created_at >= v_start and b.created_at < v_end
  ),
  created_orders as (
    select o.id, o.created_at, o.payment_status
    from public.orders o where o.created_at >= v_start and o.created_at < v_end
  ),
  visits as (
    select v.visit_date, v.visitor_key
    from public.page_visit_events v
    where v.visit_date >= v_start and v.visit_date < v_end
      and v.page_path not like '/admin%'
  ),
  channel_cohort as (
    select s.id, s.channel_code, s.currency, s.status, s.business_type, s.business_id,
      case when s.status <> 'paid' then null::numeric
        when s.business_type = 'order' then (
          select p.received_amount from public.order_payments p
          where p.order_id = s.business_id and p.status = 'paid'
            and (p.payment_session_id = s.id or p.payment_session_id is null)
            and p.received_currency = s.currency
        )
        when s.currency = 'USDT' then r.actual_received_usdt
        else r.received_amount end as received_amount
    from public.payment_sessions s
    left join public.account_recharges r
      on s.business_type in ('recharge','account_recharge') and r.id = s.business_id
    where s.created_at >= v_start and s.created_at < v_end
  ),
  dates as (select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
  daily as (
    select d.day,
      (select coalesce(sum(p.cny_amount),0) from paid_orders p
        where (p.paid_at at time zone 'Asia/Shanghai')::date = d.day) revenue_cny,
      (select coalesce(sum(r.cny_amount),0) from recharge_credits r
        where (r.created_at at time zone 'Asia/Shanghai')::date = d.day) recharge_cny,
      (select count(*) from created_orders o
        where (o.created_at at time zone 'Asia/Shanghai')::date = d.day) order_created,
      (select count(*) from visits v
        where (v.visit_date at time zone 'Asia/Shanghai')::date = d.day) pv,
      (select count(distinct v.visitor_key) from visits v
        where (v.visit_date at time zone 'Asia/Shanghai')::date = d.day) daily_uv
    from dates d
  )
  select jsonb_build_object(
    'version', 2, 'completeness', 'complete',
    'timezone', 'Asia/Shanghai', 'from', p_from::text, 'to', p_to::text,
    'asOf', current_timestamp,
    'definitions', jsonb_build_object(
      'revenue', 'paid_order_cny_business_amount_gross',
      'recharge', 'completed_cny_balance_credit_gross',
      'channelSuccess', 'created_session_cohort_current_paid',
      'channelExceptions', 'created_session_cohort_current_failed_expired_closed',
      'channelReceived', 'linked_actual_received_by_original_currency',
      'uv', 'distinct_visitor_key_whole_interval'
    ),
    'summary', jsonb_build_object(
      'revenueCny', (select round(coalesce(sum(cny_amount),0),2)::text from paid_orders),
      'rechargeCny', (select round(coalesce(sum(cny_amount),0),2)::text from recharge_credits),
      'ordersCreated', (select count(*) from created_orders),
      'ordersCreatedCurrentlyPaid', (select count(*) from created_orders where payment_status='paid'),
      'pv', (select count(*) from visits),
      'uv', (select count(distinct visitor_key) from visits)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
      'date', day::text, 'revenueCny', round(revenue_cny,2)::text,
      'rechargeCny', round(recharge_cny,2)::text,
      'ordersCreated', order_created, 'pv', pv, 'dailyUv', daily_uv
    ) order by day), '[]'::jsonb) from daily),
    'channelRevenueCny', (select coalesce(jsonb_agg(jsonb_build_object(
      'channel', channel_code, 'amountCny', round(amount,2)::text
    ) order by channel_code), '[]'::jsonb) from (
      select channel_code, sum(cny_amount) amount from paid_orders group by channel_code
    ) q),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object(
      'channel', channel_code, 'currency', currency, 'initiated', initiated,
      'successful', successful, 'exceptions', exceptions,
      'failed', failed, 'expired', expired, 'closed', closed,
      'receivedAmount', round(received,6)::text
    ) order by channel_code,currency), '[]'::jsonb) from (
      select channel_code,currency,count(*) initiated,
        count(*) filter(where status='paid') successful,
        count(*) filter(where status in ('failed','expired','closed')) exceptions,
        count(*) filter(where status='failed') failed,
        count(*) filter(where status='expired') expired,
        count(*) filter(where status='closed') closed,
        coalesce(sum(received_amount) filter(where status='paid'),0) received
      from channel_cohort group by channel_code,currency
    ) q)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_dashboard_analytics_v23(date,date) from public, anon, authenticated;
grant execute on function public.admin_dashboard_analytics_v23(date,date) to service_role;

commit;
