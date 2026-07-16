-- Order lifecycle compatibility baseline.
--
-- Scope:
-- - Backfill orders.payment_expires_at, orders.reservation_released_at,
--   and orders.expired_at when missing.
-- - Add release_order_inventory(uuid,text), cancel_unpaid_order(uuid,text),
--   and expire_unpaid_order(uuid,text) for test databases that have the
--   current order/payment core but missed the lifecycle RPCs.
--
-- This migration intentionally does not replace:
-- - create_order_with_item
-- - complete_order_payment
-- - deliver_digital_order
-- - admin_update_order_status
-- - complete_payment_session

do $$
declare
  v_missing text[];
begin
  select array_remove(array[
    case when to_regclass('public.orders') is null then 'public.orders' end,
    case when to_regclass('public.order_items') is null then 'public.order_items' end,
    case when to_regclass('public.products') is null then 'public.products' end,
    case when to_regclass('public.product_skus') is null then 'public.product_skus' end,
    case when to_regclass('public.digital_inventory') is null then 'public.digital_inventory' end,
    case when to_regclass('public.order_status_logs') is null then 'public.order_status_logs' end,
    case when to_regclass('public.order_deliveries') is null then 'public.order_deliveries' end
  ], null) into v_missing;

  if cardinality(v_missing) > 0 then
    raise exception 'order lifecycle compatibility baseline missing required tables: %', array_to_string(v_missing, ', ');
  end if;

  select array_remove(array[
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'id') then 'orders.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id') then 'orders.user_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'status') then 'orders.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status') then 'orders.payment_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'cancelled_at') then 'orders.cancelled_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'id') then 'order_items.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'order_id') then 'order_items.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'product_id') then 'order_items.product_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'sku_id') then 'order_items.sku_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'quantity') then 'order_items.quantity' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'delivery_type') then 'order_items.delivery_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'order_id') then 'order_status_logs.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'from_status') then 'order_status_logs.from_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'to_status') then 'order_status_logs.to_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'operator_id') then 'order_status_logs.operator_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'operator_type') then 'order_status_logs.operator_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_status_logs' and column_name = 'note') then 'order_status_logs.note' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'status') then 'digital_inventory.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'order_id') then 'digital_inventory.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'reserved_order_id') then 'digital_inventory.reserved_order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'reserved_order_item_id') then 'digital_inventory.reserved_order_item_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'delivered_order_id') then 'digital_inventory.delivered_order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'delivered_at') then 'digital_inventory.delivered_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'reserved_at') then 'digital_inventory.reserved_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'expires_at') then 'digital_inventory.expires_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'digital_inventory' and column_name = 'updated_at') then 'digital_inventory.updated_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_deliveries' and column_name = 'order_item_id') then 'order_deliveries.order_item_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_deliveries' and column_name = 'delivery_status') then 'order_deliveries.delivery_status' end
  ], null) into v_missing;

  if cardinality(v_missing) > 0 then
    raise exception 'order lifecycle compatibility baseline missing required columns: %', array_to_string(v_missing, ', ');
  end if;
end $$;

alter table public.orders
  add column if not exists payment_expires_at timestamptz,
  add column if not exists reservation_released_at timestamptz,
  add column if not exists expired_at timestamptz;

create index if not exists orders_unpaid_expiration_idx
  on public.orders(payment_expires_at, status, payment_status)
  where payment_expires_at is not null and status = 'pending_payment' and payment_status <> 'paid';

create or replace function public.release_order_inventory(
  p_order_id uuid,
  p_reason text default 'release'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_released_normal integer := 0;
  v_released_sku integer := 0;
  v_released_digital integer := 0;
  v_now timestamptz := now();
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'release');
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_order.reservation_released_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_RELEASED',
      'order_id', p_order_id,
      'released_normal', 0,
      'released_sku', 0,
      'released_digital', 0
    );
  end if;

  if v_order.payment_status = 'paid'
     or v_order.status in ('paid','processing','delivered','completed','refunded') then
    return jsonb_build_object(
      'ok', false,
      'code', 'ORDER_NOT_RELEASABLE',
      'message', 'paid or fulfilled order inventory cannot be released',
      'order_id', p_order_id,
      'status', v_order.status,
      'payment_status', v_order.payment_status
    );
  end if;

  update public.product_skus s
     set stock = s.stock + oi.quantity,
         status = case when s.status = 'sold_out' then 'active' else s.status end,
         updated_at = v_now
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id is not null
     and s.id = oi.sku_id
     and lower(coalesce(oi.delivery_type, '')) not in ('automatic','auto','card','account','auto_delivery')
     and not exists (
       select 1
       from public.order_deliveries od
       where od.order_item_id = oi.id
         and od.delivery_status = 'delivered'
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
     and lower(coalesce(oi.delivery_type, '')) not in ('automatic','auto','card','account','auto_delivery')
     and not exists (
       select 1
       from public.order_deliveries od
       where od.order_item_id = oi.id
         and od.delivery_status = 'delivered'
     );
  get diagnostics v_released_normal = row_count;

  update public.digital_inventory di
     set status = 'available',
         order_id = null,
         reserved_order_id = null,
         reserved_order_item_id = null,
         reserved_at = null,
         expires_at = null,
         updated_at = v_now
   where coalesce(di.reserved_order_id, di.order_id) = p_order_id
     and di.status = 'reserved'
     and di.delivered_at is null
     and di.delivered_order_id is null;
  get diagnostics v_released_digital = row_count;

  update public.orders
     set reservation_released_at = v_now,
         updated_at = v_now
   where id = p_order_id;

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (
    p_order_id,
    v_order.status,
    v_order.status,
    null,
    'system',
    'inventory released: ' || left(v_reason, 160)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'RELEASED',
    'order_id', p_order_id,
    'released_normal', v_released_normal,
    'released_sku', v_released_sku,
    'released_digital', v_released_digital
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.release_order_inventory(uuid)') is null then
    execute $fn$
      create function public.release_order_inventory(p_order_id uuid)
      returns jsonb
      language sql
      security definer
      set search_path = public
      as $body$
        select public.release_order_inventory(p_order_id, 'legacy-wrapper');
      $body$;
    $fn$;
    raise notice 'Created compatibility wrapper public.release_order_inventory(uuid)';
  else
    raise notice 'Keeping existing public.release_order_inventory(uuid) without changing its return type';
  end if;
end $$;

revoke execute on function public.release_order_inventory(uuid, text) from public, anon, authenticated;
grant execute on function public.release_order_inventory(uuid, text) to service_role;
revoke execute on function public.release_order_inventory(uuid) from public, anon, authenticated;
grant execute on function public.release_order_inventory(uuid) to service_role;

create or replace function public.cancel_unpaid_order(
  p_order_id uuid,
  p_reason text default 'user_cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_order public.orders;
  v_release jsonb;
  v_now timestamptz := now();
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'user_cancelled');
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_user_id is not null and v_order.user_id <> v_user_id and not public.is_admin() and not v_is_service_role then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_user_id is null and not public.is_admin() and not v_is_service_role then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'please sign in first');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CANCELLED', 'order_id', p_order_id, 'order_no', v_order.order_no);
  end if;

  if v_order.payment_status = 'paid'
     or v_order.status in ('paid','processing','delivered','completed','refunded','expired') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_CANCELLABLE', 'message', 'this order cannot be cancelled');
  end if;

  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_CANCELLABLE', 'message', 'only pending payment orders can be cancelled');
  end if;

  v_release := public.release_order_inventory(p_order_id, 'cancel:' || v_reason);

  update public.orders
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, v_now),
         updated_at = v_now
   where id = p_order_id
     and status = 'pending_payment'
     and payment_status <> 'paid'
   returning * into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (p_order_id, 'pending_payment', 'cancelled', v_user_id, case when v_is_service_role then 'service' when public.is_admin() then 'admin' else 'user' end, 'cancelled order: ' || left(v_reason, 160));

  return jsonb_build_object(
    'ok', true,
    'code', 'CANCELLED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'release', v_release
  );
end;
$$;

revoke execute on function public.cancel_unpaid_order(uuid, text) from public, anon;
grant execute on function public.cancel_unpaid_order(uuid, text) to authenticated, service_role;

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
  v_release jsonb;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(btrim(p_reason), ''), 'payment_timeout');
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_order.payment_status = 'paid'
     or v_order.status in ('paid','processing','delivered','completed','refunded') then
    return jsonb_build_object('ok', true, 'code', 'SKIPPED_PAID_OR_FINAL', 'order_id', p_order_id, 'status', v_order.status, 'payment_status', v_order.payment_status);
  end if;

  if v_order.status = 'expired' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_EXPIRED', 'order_id', p_order_id, 'released', v_order.reservation_released_at is not null);
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CANCELLED', 'order_id', p_order_id, 'released', v_order.reservation_released_at is not null);
  end if;

  if coalesce(v_order.payment_expires_at, v_order.created_at + interval '30 minutes') > v_now then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'order_id', p_order_id, 'expires_at', coalesce(v_order.payment_expires_at, v_order.created_at + interval '30 minutes'));
  end if;

  if to_regclass('public.payment_sessions') is not null and exists (
    select 1
    from public.payment_sessions ps
    where ps.business_type = 'order'
      and ps.business_id = p_order_id
      and ps.status = 'paid'
  ) then
    return jsonb_build_object('ok', true, 'code', 'SKIPPED_SESSION_PAID', 'order_id', p_order_id);
  end if;

  if to_regclass('public.payment_sessions') is not null then
    update public.payment_sessions ps
       set status = case when ps.status in ('pending','processing') then 'expired' else ps.status end,
           closed_at = coalesce(ps.closed_at, v_now),
           updated_at = v_now
     where ps.business_type = 'order'
       and ps.business_id = p_order_id
       and ps.status in ('pending','processing','failed');
  end if;

  v_release := public.release_order_inventory(p_order_id, 'expired:' || v_note);

  update public.orders
     set status = 'expired',
         payment_status = case when payment_status = 'unpaid' then 'failed' else payment_status end,
         expired_at = coalesce(expired_at, v_now),
         updated_at = v_now
   where id = p_order_id
     and payment_status <> 'paid'
     and status = 'pending_payment'
   returning * into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (p_order_id, 'pending_payment', 'expired', null, 'system', 'unpaid order expired: ' || left(v_note, 160));

  return jsonb_build_object(
    'ok', true,
    'code', 'EXPIRED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'release', v_release,
    'status', v_order.status,
    'payment_status', v_order.payment_status
  );
end;
$$;

revoke execute on function public.expire_unpaid_order(uuid, text) from public, anon, authenticated;
grant execute on function public.expire_unpaid_order(uuid, text) to service_role;
