-- CANDIDATE ONLY. Do not run in Production without separate approval.
-- One SELECT statement supplies a consistent snapshot for total, page and daily series.
-- Intended caller: server-side service_role after requireApiAdmin(); never expose that key.
-- Review query plan and permissions in the isolated test project before deployment.

-- Keep initial creation and privilege lockdown atomic.
begin;

create or replace function public.admin_product_dashboard_v25_snapshot(
  p_from date,
  p_to date,
  p_page integer default 1,
  p_page_size integer default 15,
  p_search text default '',
  p_sort text default 'paidOrders_desc',
  p_product_id uuid default null
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public
set statement_timeout = '8s'
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from
     or p_to > (current_timestamp at time zone 'Asia/Shanghai')::date
     or p_to - p_from + 1 > 365
     or p_page is null or p_page < 1 or p_page > 10000
     or p_page_size is null or p_page_size not in (10, 15)
     or p_search is null or length(p_search) > 80
     or p_sort is null or p_sort not in ('recent','name','paidOrders_desc','paidOrders_asc','units_desc','units_asc')
  then
    raise exception 'invalid product dashboard query' using errcode = '22023';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Shanghai';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Shanghai';

  with filtered as materialized (
    select p.id, p.name, p.updated_at
    from public.products p
    where (p_product_id is null or p.id = p_product_id)
      and (p_search = '' or p.name ilike '%' || regexp_replace(p_search, '[%_,\\]', '', 'g') || '%')
  ), scoped as materialized (
    select i.product_id, i.order_id, i.quantity,
           (o.paid_at at time zone 'Asia/Shanghai')::date as paid_day
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join filtered f on f.id = i.product_id
    where o.payment_status = 'paid' and o.paid_at >= v_start and o.paid_at < v_end
  ), invalid_paid as (
    -- This check shares the same statement snapshot as totals, rows and daily.
    select exists (
      select 1 from public.order_items i
      join public.orders o on o.id = i.order_id
      join filtered f on f.id = i.product_id
      where o.payment_status = 'paid' and o.paid_at is null
    ) as present
  ), totals as (
    select product_id, count(distinct order_id)::bigint as paid_orders,
           sum(quantity)::bigint as units
    from scoped group by product_id
  ), ranked as (
    select f.id, f.name, coalesce(t.paid_orders,0) as paid_orders,
           coalesce(t.units,0) as units,
           row_number() over (order by
             case when p_sort = 'paidOrders_desc' then coalesce(t.paid_orders,0) end desc nulls last,
             case when p_sort = 'paidOrders_asc' then coalesce(t.paid_orders,0) end asc nulls last,
             case when p_sort = 'units_desc' then coalesce(t.units,0) end desc nulls last,
             case when p_sort = 'units_asc' then coalesce(t.units,0) end asc nulls last,
             case when p_sort = 'recent' then f.updated_at end desc nulls last,
             case when p_sort = 'name' then f.name collate "zh-x-icu" end asc nulls last,
             f.id asc
           ) as row_no
    from filtered f left join totals t on t.product_id = f.id
  ), daily_totals as (
    select paid_day, count(distinct order_id)::bigint as paid_orders,
           sum(quantity)::bigint as units
    from scoped where p_product_id is not null group by paid_day
  )
  select jsonb_build_object(
    'invalidPaid', (select present from invalid_paid),
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'paidOrders', r.paid_orders,
      'units', r.units, 'amountCny', null) order by r.row_no)
      from ranked r where r.row_no > (p_page - 1) * p_page_size
        and r.row_no <= p_page * p_page_size), '[]'::jsonb),
    'daily', case when p_product_id is null then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object(
        'date', d.day::date::text, 'paidOrders', coalesce(t.paid_orders,0),
        'units', coalesce(t.units,0)) order by d.day)
        from generate_series(p_from,p_to,interval '1 day') as d(day)
        left join daily_totals t on t.paid_day = d.day::date), '[]'::jsonb) end
  ) into v_result;

  if (v_result ->> 'invalidPaid')::boolean then
    raise exception 'paid product item lacks paid_at' using errcode = '22000';
  end if;
  v_result := v_result - 'invalidPaid';

  return v_result;
end
$function$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default; close it explicitly.
revoke all on function public.admin_product_dashboard_v25_snapshot(date,date,integer,integer,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.admin_product_dashboard_v25_snapshot(date,date,integer,integer,text,text,uuid)
  to service_role;

commit;
