-- Non-payment order lifecycle hardening.
--
-- Scope:
-- - direct checkout order creation
-- - order item snapshot persistence
-- - client_request_id idempotency
-- - pending order cancellation and expiration
-- - stock reservation/release
--
-- This migration is additive/compatible and must be executed manually.

alter table public.orders
  add column if not exists client_request_id text,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists reservation_released_at timestamptz,
  add column if not exists reservation_release_reason text;

alter table public.order_items
  add column if not exists sku_id uuid,
  add column if not exists sku_code text,
  add column if not exists sku_title text,
  add column if not exists option_snapshot jsonb,
  add column if not exists currency text not null default 'CNY',
  add column if not exists delivery_status text,
  add column if not exists delivered_quantity integer,
  add column if not exists delivery_failure_reason text,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_completed_at timestamptz;

do $$
begin
  if to_regclass('public.product_skus') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_items_sku_id_fkey'
        and conrelid = 'public.order_items'::regclass
    ) then
      execute 'alter table public.order_items
        add constraint order_items_sku_id_fkey
        foreign key (sku_id) references public.product_skus(id) on delete set null';
    end if;
  end if;
end $$;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending_payment','paid','processing','delivered','completed','cancelled','expired','refunded','failed'));

alter table public.order_items drop constraint if exists order_items_quantity_positive;
alter table public.order_items
  add constraint order_items_quantity_positive check (quantity > 0);

create unique index if not exists orders_user_client_request_uidx
  on public.orders(user_id, client_request_id)
  where client_request_id is not null and btrim(client_request_id) <> '';

create index if not exists orders_unpaid_expiration_idx
  on public.orders(payment_expires_at, status, payment_status)
  where payment_expires_at is not null and status = 'pending_payment' and payment_status <> 'paid';

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_sku_idx on public.order_items(product_id, sku_id);

create or replace function public.is_order_auto_delivery(p_delivery_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_delivery_type, '')) in ('automatic','auto','card','account','auto_delivery');
$$;

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

  if v_order.payment_status = 'paid' or v_order.status in ('paid','processing','delivered','completed','refunded') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_RELEASABLE', 'message', 'paid or fulfilled order inventory cannot be released');
  end if;

  if to_regclass('public.product_skus') is not null then
    execute $sql$
    update public.product_skus s
       set stock = s.stock + oi.quantity,
           status = case when s.status = 'sold_out' then 'active' else s.status end,
           updated_at = $1
      from public.order_items oi
     where oi.order_id = $2
       and oi.sku_id is not null
       and s.id = oi.sku_id
       and not public.is_order_auto_delivery(oi.delivery_type)
       and not exists (
         select 1
         from public.order_deliveries od
         where od.order_item_id = oi.id
           and od.delivery_status = 'delivered'
       )
    $sql$ using v_now, p_order_id;
    get diagnostics v_released_sku = row_count;
  end if;

  update public.products p
     set stock = p.stock + oi.quantity,
         status = case when p.status = 'sold_out' then 'active' else p.status end,
         updated_at = v_now
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id is null
     and p.id = oi.product_id
     and not public.is_order_auto_delivery(oi.delivery_type)
     and not exists (
       select 1
       from public.order_deliveries od
       where od.order_item_id = oi.id
         and od.delivery_status = 'delivered'
     );
  get diagnostics v_released_normal = row_count;

  if to_regclass('public.digital_inventory') is not null then
    update public.digital_inventory di
       set status = 'available',
           order_id = null,
           reserved_order_id = null,
           reserved_order_item_id = null,
           reserved_user_id = null,
           reserved_at = null,
           expires_at = null,
           updated_at = v_now
     where coalesce(di.reserved_order_id, di.order_id) = p_order_id
       and di.status = 'reserved'
       and di.delivered_at is null
       and coalesce(di.delivered_order_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_order_id;
    get diagnostics v_released_digital = row_count;
  end if;

  update public.orders
     set reservation_released_at = v_now,
         reservation_release_reason = v_reason,
         updated_at = v_now
   where id = p_order_id;

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

create or replace function public.create_order_with_item(
  p_product_id uuid,
  p_quantity integer default 1,
  p_customer_email text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_note text default null,
  p_shipping_address jsonb default null,
  p_sku_id uuid default null,
  p_payment_method text default 'balance',
  p_client_request_id text default null
)
returns table (
  order_id uuid,
  order_no text,
  status text,
  payment_status text,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_sku record;
  v_category record;
  v_existing_order record;
  v_order_item_id uuid;
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_request_id text := nullif(left(btrim(coalesce(p_client_request_id, '')), 120), '');
  v_payment_method text := lower(nullif(btrim(coalesce(p_payment_method, 'balance')), ''));
  v_order_id uuid;
  v_order_no text;
  v_unit_price numeric;
  v_original_price numeric;
  v_stock integer;
  v_delivery_type text;
  v_image_url text;
  v_line_total numeric;
  v_try integer := 0;
  v_option_snapshot jsonb := null;
  v_sku_title text := null;
  v_sku_code text := null;
  v_reserved integer := 0;
  v_auto_delivery boolean := false;
  v_has_active_skus boolean := false;
begin
  if v_user_id is null then
    raise exception 'Please sign in before creating an order';
  end if;

  if v_quantity <= 0 or v_quantity > 999 then
    raise exception 'Invalid quantity';
  end if;

  if v_payment_method not in ('balance','alipay','wechat','binance','usdt_trc20','usdt_bep20') then
    raise exception 'Unsupported payment method';
  end if;

  if v_request_id is not null then
    select o.id, o.order_no, o.status, o.payment_status, o.total_amount
      into v_existing_order
    from public.orders o
    where o.user_id = v_user_id
      and o.client_request_id = v_request_id
    limit 1;

    if found then
      return query
      select
        v_existing_order.id,
        v_existing_order.order_no,
        v_existing_order.status,
        v_existing_order.payment_status,
        v_existing_order.total_amount;
      return;
    end if;
  end if;

  select p.*
    into v_product
  from public.products p
  where p.id = p_product_id
    and p.status = 'active'
  limit 1
  for update;

  if not found then
    raise exception 'Product does not exist or is unavailable';
  end if;

  if p_sku_id is null and to_regclass('public.product_skus') is not null then
    execute
      'select exists (select 1 from public.product_skus s where s.product_id = $1 and s.status = ''active'')'
      into v_has_active_skus
      using p_product_id;

    if v_has_active_skus then
      raise exception 'Please select a complete product SKU';
    end if;
  end if;

  v_unit_price := coalesce(v_product.price, 0)::numeric;
  v_original_price := v_product.original_price;
  v_stock := coalesce(v_product.stock, 0);
  v_delivery_type := v_product.delivery_type;
  v_image_url := v_product.image_url;

  if p_sku_id is not null then
    if to_regclass('public.product_skus') is null then
      raise exception 'SKU table is not initialized';
    end if;

    execute
      'select s.* from public.product_skus s where s.id = $1 and s.product_id = $2 and s.status = ''active'' limit 1 for update'
      into v_sku
      using p_sku_id, p_product_id;

    if v_sku.id is null then
      raise exception 'Selected SKU does not exist or is unavailable';
    end if;

    v_unit_price := coalesce(v_sku.price, 0)::numeric;
    v_original_price := v_sku.original_price;
    v_stock := coalesce(v_sku.stock, 0);
    v_delivery_type := coalesce(v_sku.delivery_type, v_product.delivery_type);
    v_image_url := coalesce(nullif(v_sku.image_url, ''), v_product.image_url);
    v_sku_title := nullif(v_sku.sku_title, '');
    v_sku_code := nullif(v_sku.sku_code, '');

    if to_regclass('public.product_sku_values') is not null
       and to_regclass('public.product_option_groups') is not null
       and to_regclass('public.product_option_values') is not null then
      execute $sql$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'group_id', g.id,
            'group_name', g.name,
            'value_id', ov.id,
            'value_name', ov.name,
            'sort_order', coalesce(sv.sort_order, g.sort_order, 0)
          )
          order by coalesce(sv.sort_order, g.sort_order, 0), g.created_at
        ),
        '[]'::jsonb
      )
      from public.product_sku_values sv
      join public.product_option_groups g on g.id = sv.group_id
      join public.product_option_values ov on ov.id = sv.value_id
      where sv.sku_id = $1
      $sql$
        into v_option_snapshot
        using p_sku_id;

      if v_sku_title is null then
        execute $sql$
        select nullif(string_agg(value_name, ' / ' order by sort_order), '')
        from (
          select ov.name as value_name, coalesce(sv.sort_order, g.sort_order, 0) as sort_order
          from public.product_sku_values sv
          join public.product_option_groups g on g.id = sv.group_id
          join public.product_option_values ov on ov.id = sv.value_id
          where sv.sku_id = $1
        ) option_rows
        $sql$
          into v_sku_title
          using p_sku_id;
      end if;
    else
      v_option_snapshot := '[]'::jsonb;
    end if;
  end if;

  v_auto_delivery := public.is_order_auto_delivery(v_delivery_type);

  if v_stock < v_quantity then
    raise exception 'Insufficient stock';
  end if;

  if v_auto_delivery and to_regclass('public.digital_inventory') is not null then
    select count(*)::integer
      into v_stock
    from public.digital_inventory di_count
    where di_count.product_id = p_product_id
      and (
        (p_sku_id is null and di_count.sku_id is null)
        or di_count.sku_id = p_sku_id
      )
      and di_count.status = 'available'
      and (di_count.expires_at is null or di_count.expires_at > now());

    if v_stock < v_quantity then
      raise exception 'Insufficient digital inventory';
    end if;
  elsif p_sku_id is not null then
    execute $sql$
    update public.product_skus
       set stock = stock - $2,
           status = case when stock - $2 <= 0 and status = 'active' then 'sold_out' else status end,
           updated_at = now()
     where id = $1
       and stock >= $2
     returning stock
     $sql$
      into v_stock
      using p_sku_id, v_quantity;

    if v_stock is null then
      raise exception 'Insufficient stock';
    end if;
  else
    update public.products
       set stock = stock - v_quantity,
           status = case when stock - v_quantity <= 0 and status = 'active' then 'sold_out' else status end,
           updated_at = now()
     where id = p_product_id
       and status = 'active'
       and stock >= v_quantity
     returning stock into v_stock;

    if not found then
      raise exception 'Insufficient stock';
    end if;
  end if;

  select c.*
    into v_category
  from public.categories c
  where c.id = v_product.category_id
    and coalesce(c.is_active, true) = true
  limit 1;

  if not found then
    raise exception 'Product category is unavailable';
  end if;

  v_line_total := round((v_unit_price * v_quantity)::numeric, 2);

  loop
    v_try := v_try + 1;
    v_order_no := 'JL' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
      lpad(floor(random() * 10000)::text, 4, '0');

    begin
      insert into public.orders (
        order_no,user_id,status,payment_status,subtotal,discount_amount,total_amount,currency,
        customer_email,customer_name,customer_phone,shipping_address,customer_note,delivery_type,
        payment_method,client_request_id,payment_expires_at
      )
      values (
        v_order_no,v_user_id,'pending_payment','unpaid',v_line_total,0,v_line_total,'CNY',
        nullif(trim(p_customer_email), ''),nullif(trim(p_customer_name), ''),
        nullif(trim(p_customer_phone), ''),
        case
          when p_shipping_address is null or p_shipping_address = '{}'::jsonb then null
          else p_shipping_address
        end,
        nullif(trim(p_customer_note), ''),
        v_delivery_type,
        v_payment_method,
        v_request_id,
        now() + interval '30 minutes'
      )
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_request_id is not null then
        select o.id, o.order_no, o.status, o.payment_status, o.total_amount
          into v_existing_order
        from public.orders o
        where o.user_id = v_user_id
          and o.client_request_id = v_request_id
        limit 1;

        if found then
          return query
          select
            v_existing_order.id,
            v_existing_order.order_no,
            v_existing_order.status,
            v_existing_order.payment_status,
            v_existing_order.total_amount;
          return;
        end if;
      end if;

      if v_try >= 5 then
        raise exception 'Order number generation failed. Please retry';
      end if;
    end;
  end loop;

  insert into public.order_items (
    order_id,product_id,sku_id,sku_code,sku_title,option_snapshot,
    product_name,product_slug,product_image_url,category_name,
    unit_price,quantity,line_total,currency,delivery_type,delivery_status,product_snapshot
  )
  values (
    v_order_id,v_product.id,p_sku_id,v_sku_code,v_sku_title,v_option_snapshot,
    v_product.name,v_product.slug,v_image_url,v_category.name,
    v_unit_price,v_quantity,v_line_total,'CNY',v_delivery_type,
    case when v_auto_delivery then 'pending' else 'not_required' end,
    jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'slug', v_product.slug,
      'image_url', v_image_url,
      'price', v_unit_price,
      'original_price', v_original_price,
      'currency', 'CNY',
      'delivery_type', v_delivery_type,
      'category_id', v_product.category_id,
      'category_name', v_category.name,
      'sku_id', p_sku_id,
      'sku_code', v_sku_code,
      'sku_title', v_sku_title,
      'option_snapshot', v_option_snapshot
    )
  )
  returning id into v_order_item_id;

  if v_auto_delivery and to_regclass('public.digital_inventory') is not null then
    with picked as (
      select di_pick.id
      from public.digital_inventory di_pick
      where di_pick.product_id = p_product_id
        and (
          (p_sku_id is null and di_pick.sku_id is null)
          or di_pick.sku_id = p_sku_id
        )
        and di_pick.status = 'available'
        and (di_pick.expires_at is null or di_pick.expires_at > now())
      order by di_pick.created_at asc
      limit v_quantity
      for update skip locked
    )
    update public.digital_inventory di_update
       set status = 'reserved',
           order_id = v_order_id,
           reserved_order_id = v_order_id,
           reserved_order_item_id = v_order_item_id,
           reserved_user_id = v_user_id,
           reserved_at = now()
    from picked
    where di_update.id = picked.id;

    get diagnostics v_reserved = row_count;
    if v_reserved <> v_quantity then
      raise exception 'Insufficient digital inventory';
    end if;

    if to_regprocedure('public.sync_product_available_stock(uuid)') is not null then
      perform public.sync_product_available_stock(p_product_id);
    end if;
  end if;

  insert into public.order_status_logs (
    order_id,from_status,to_status,operator_id,operator_type,note
  )
  values (
    v_order_id,null,'pending_payment',v_user_id,'user','user created order'
  );

  return query
  select v_order_id, v_order_no, 'pending_payment'::text, 'unpaid'::text, v_line_total;
end;
$$;

grant execute on function public.create_order_with_item(uuid, integer, text, text, text, text, jsonb, uuid, text, text)
  to authenticated;

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
  v_order public.orders;
  v_release jsonb;
  v_now timestamptz := now();
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'user_cancelled');
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'please sign in first');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'order not found');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CANCELLED', 'order_id', p_order_id, 'order_no', v_order.order_no);
  end if;

  if v_order.payment_status = 'paid' or v_order.status in ('paid','processing','delivered','completed','refunded','expired') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_CANCELLABLE', 'message', 'this order cannot be cancelled by the user');
  end if;

  v_release := public.release_order_inventory(p_order_id, 'cancel:' || v_reason);

  update public.orders
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, v_now),
         updated_at = v_now
   where id = p_order_id
     and user_id = v_user_id
     and status = 'pending_payment'
     and payment_status <> 'paid'
   returning * into v_order;

  if not found then
    return jsonb_build_object('ok', true, 'code', 'STATE_CHANGED', 'order_id', p_order_id);
  end if;

  insert into public.order_status_logs(order_id, from_status, to_status, operator_id, operator_type, note)
  values (p_order_id, 'pending_payment', 'cancelled', v_user_id, 'user', 'user cancelled order: ' || v_reason);

  return jsonb_build_object(
    'ok', true,
    'code', 'CANCELLED',
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'release', v_release
  );
end;
$$;

grant execute on function public.cancel_unpaid_order(uuid, text) to authenticated;

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

  if v_order.payment_status = 'paid' or v_order.status in ('paid','processing','delivered','completed','refunded') then
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
  values (p_order_id, 'pending_payment', 'expired', null, 'system', 'unpaid order expired: ' || v_note);

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
