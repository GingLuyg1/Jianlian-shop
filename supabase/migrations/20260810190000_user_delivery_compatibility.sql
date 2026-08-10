-- Consolidate the deployed user-delivery compatibility contract without
-- changing delivery semantics, secret storage, or caller privileges.

begin;

do $$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.order_deliveries') is null
     or to_regclass('public.digital_delivery_secrets') is null then
    raise exception 'USER_DELIVERY_COMPATIBILITY_TABLES_MISSING';
  end if;
  if to_regprocedure('public.mask_delivery_secret(text)') is null
     or to_regprocedure('public.normalize_order_item_delivery_type(text)') is null then
    raise exception 'USER_DELIVERY_COMPATIBILITY_FUNCTIONS_MISSING';
  end if;
end;
$$;

alter table public.order_deliveries
  add column if not exists delivery_no text;

create or replace function public.get_order_fulfillment_for_user(p_order_no text)
returns table (
  order_item_id uuid,
  product_name text,
  delivery_status text,
  delivery_type text,
  quantity integer,
  delivered_quantity integer,
  delivered_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'please sign in first';
  end if;

  select o.*
    into v_order
  from public.orders as o
  where o.order_no = p_order_no
    and o.user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'order not found or access denied';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'order is not paid';
  end if;
  if v_order.status in ('cancelled', 'expired', 'failed') then
    raise exception 'order status does not allow delivery access';
  end if;

  update public.order_deliveries as od
     set viewed_at = coalesce(od.viewed_at, clock_timestamp())
   where od.order_id = v_order.id
     and od.user_id = auth.uid()
     and od.delivery_status = 'delivered'
     and od.viewed_at is null;

  return query
  select
    oi.id,
    oi.product_name,
    coalesce(oi.delivery_status, 'pending'),
    public.normalize_order_item_delivery_type(oi.delivery_type),
    coalesce(oi.quantity, 1)::integer,
    coalesce(oi.delivered_quantity, 0)::integer,
    coalesce(oi.delivery_completed_at, max(od.delivered_at)),
    public.mask_delivery_secret(string_agg(ds.content, E'\n' order by od.delivered_at asc)),
    case
      when coalesce(oi.delivery_status, '') = 'delivered'
        then string_agg(ds.content, E'\n' order by od.delivered_at asc)
      else null
    end,
    max(od.delivery_note)
  from public.order_items as oi
  left join public.order_deliveries as od
    on od.order_item_id = oi.id
   and od.order_id = v_order.id
   and od.user_id = auth.uid()
   and od.delivery_status = 'delivered'
  left join public.digital_delivery_secrets as ds
    on ds.delivery_id = od.id
  where oi.order_id = v_order.id
  group by
    oi.id,
    oi.product_name,
    oi.delivery_status,
    oi.delivery_type,
    oi.quantity,
    oi.delivered_quantity,
    oi.delivery_completed_at
  order by min(oi.created_at) asc;
end;
$$;

create or replace function public.get_order_delivery_for_user(p_order_no text)
returns table (
  order_no text,
  order_status text,
  payment_status text,
  product_name text,
  delivery_id uuid,
  delivery_status text,
  delivery_type text,
  delivered_at timestamptz,
  viewed_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'please sign in first';
  end if;

  select o.*
    into v_order
  from public.orders as o
  where o.order_no = p_order_no
    and o.user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'order not found or access denied';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'order is not paid';
  end if;
  if v_order.status in ('cancelled', 'expired', 'failed') then
    raise exception 'order status does not allow delivery access';
  end if;

  update public.order_deliveries as od
     set viewed_at = coalesce(od.viewed_at, clock_timestamp())
   where od.order_id = v_order.id
     and od.user_id = auth.uid()
     and od.delivery_status = 'delivered'
     and od.viewed_at is null;

  return query
  select
    v_order.order_no,
    v_order.status,
    v_order.payment_status,
    oi.product_name,
    od.id,
    od.delivery_status,
    od.delivery_type,
    od.delivered_at,
    od.viewed_at,
    public.mask_delivery_secret(ds.content),
    ds.content,
    od.delivery_note
  from public.order_deliveries as od
  join public.order_items as oi
    on oi.id = od.order_item_id
   and oi.order_id = v_order.id
  join public.digital_delivery_secrets as ds
    on ds.delivery_id = od.id
  where od.order_id = v_order.id
    and od.user_id = auth.uid()
    and od.delivery_status = 'delivered'
  order by od.delivered_at asc, od.id asc;
end;
$$;

revoke execute on function public.get_order_fulfillment_for_user(text) from public, anon;
revoke execute on function public.get_order_delivery_for_user(text) from public, anon;
grant execute on function public.get_order_fulfillment_for_user(text) to authenticated, service_role;
grant execute on function public.get_order_delivery_for_user(text) to authenticated, service_role;

commit;
