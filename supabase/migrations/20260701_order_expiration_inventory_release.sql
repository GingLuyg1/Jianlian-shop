-- Order expiration, payment session timeout, and reservation release.
-- Safe to execute manually. Does not delete orders, payments, or inventory records.

alter table public.orders
  add column if not exists payment_expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists reservation_released_at timestamptz,
  add column if not exists reservation_release_reason text;

create index if not exists orders_unpaid_expiration_idx
  on public.orders(payment_expires_at, status, payment_status)
  where payment_expires_at is not null and status = 'pending_payment' and payment_status <> 'paid';

create or replace function public.expire_unpaid_order(
  p_order_id uuid,
  p_reason text default 'payment_timeout'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from_status text;
  v_released_normal integer := 0;
  v_released_sku integer := 0;
  v_released_digital integer := 0;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(btrim(p_reason), ''), 'payment_timeout');
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', '订单不存在');
  end if;

  if v_order.payment_status = 'paid' or v_order.status in ('paid','processing','delivered','completed','refunded') then
    return jsonb_build_object('ok', true, 'code', 'SKIPPED_PAID_OR_FINAL', 'order_id', p_order_id, 'status', v_order.status, 'payment_status', v_order.payment_status);
  end if;

  if v_order.status in ('cancelled','failed') then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CLOSED', 'order_id', p_order_id, 'status', v_order.status, 'released', v_order.reservation_released_at is not null);
  end if;

  if v_order.payment_expires_at is not null and v_order.payment_expires_at > v_now then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'order_id', p_order_id, 'expires_at', v_order.payment_expires_at);
  end if;

  if exists (
    select 1 from public.payment_sessions
    where business_type = 'order'
      and business_id = p_order_id
      and status = 'paid'
  ) then
    return jsonb_build_object('ok', true, 'code', 'SKIPPED_SESSION_PAID', 'order_id', p_order_id);
  end if;

  update public.payment_sessions
     set status = case when status in ('pending','processing') then 'expired' else status end,
         closed_at = coalesce(closed_at, v_now),
         updated_at = v_now
   where business_type = 'order'
     and business_id = p_order_id
     and status in ('pending','processing','failed');

  if v_order.reservation_released_at is null then
    update public.product_skus s
       set stock = s.stock + oi.quantity,
           status = case when s.status = 'sold_out' then 'active' else s.status end,
           updated_at = v_now
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.sku_id is not null
       and s.id = oi.sku_id
       and not exists (
         select 1 from public.order_deliveries od
         where od.order_item_id = oi.id and od.delivery_status = 'delivered'
       );
    get diagnostics v_released_sku = row_count;

    update public.products p
       set stock = p.stock + oi.quantity,
           status = case when p.status = 'sold_out' then 'active' else p.status end,
           updated_at = v_now
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.sku_id is null
       and p.id = oi.product_id
       and coalesce(oi.delivery_type, '') not in ('automatic','auto','card','account')
       and not exists (
         select 1 from public.order_deliveries od
         where od.order_item_id = oi.id and od.delivery_status = 'delivered'
       );
    get diagnostics v_released_normal = row_count;

    update public.digital_inventory
       set status = 'available',
           order_id = null,
           reserved_order_id = null,
           reserved_order_item_id = null,
           reserved_user_id = null,
           reserved_at = null,
           expires_at = null,
           updated_at = v_now
     where coalesce(reserved_order_id, order_id) = p_order_id
       and status = 'reserved'
       and delivered_at is null
       and delivered_order_id is null;
    get diagnostics v_released_digital = row_count;
  end if;

  v_from_status := v_order.status;

  update public.orders
     set status = 'cancelled',
         payment_status = case when payment_status = 'unpaid' then 'failed' else payment_status end,
         cancelled_at = coalesce(cancelled_at, v_now),
         expired_at = coalesce(expired_at, v_now),
         reservation_released_at = coalesce(reservation_released_at, v_now),
         reservation_release_reason = coalesce(reservation_release_reason, v_note),
         updated_at = v_now
   where id = p_order_id
     and payment_status <> 'paid'
     and status = v_from_status
   returning * into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (p_order_id, v_from_status, 'cancelled', null, 'system', '未支付订单超时关闭：' || v_note);

  return jsonb_build_object(
    'ok', true,
    'code', 'EXPIRED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'released_normal', v_released_normal,
    'released_sku', v_released_sku,
    'released_digital', v_released_digital,
    'status', v_order.status,
    'payment_status', v_order.payment_status
  );
end;
$$;

grant execute on function public.expire_unpaid_order(uuid, text) to service_role;

create or replace function public.list_expirable_unpaid_orders(p_limit integer default 50)
returns table(order_id uuid)
language sql
security definer
set search_path = public
as $$
  select o.id
  from public.orders o
  where o.status = 'pending_payment'
    and o.payment_status <> 'paid'
    and coalesce(o.payment_expires_at, o.created_at + interval '30 minutes') <= now()
  order by coalesce(o.payment_expires_at, o.created_at + interval '30 minutes') asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.list_expirable_unpaid_orders(integer) to service_role;

create or replace function public.set_order_payment_expiration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending_payment' and new.payment_status <> 'paid' and new.payment_expires_at is null then
    new.payment_expires_at := coalesce(new.created_at, now()) + interval '30 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_payment_expiration on public.orders;
create trigger trg_orders_set_payment_expiration
before insert or update of status, payment_status, payment_expires_at on public.orders
for each row execute function public.set_order_payment_expiration();
