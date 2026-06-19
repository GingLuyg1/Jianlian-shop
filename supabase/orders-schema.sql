-- Jianlian Shop order system schema.
-- Execute this file once in Supabase SQL Editor after products/categories/profiles exist.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending_payment',
  payment_status text not null default 'unpaid',
  payment_method text,
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  total_amount numeric not null default 0,
  currency text not null default 'CNY',
  customer_email text,
  customer_name text,
  customer_phone text,
  shipping_address jsonb,
  customer_note text,
  admin_note text,
  delivery_type text,
  paid_at timestamptz,
  processed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (status in (
    'pending_payment','paid','processing','delivered','completed','cancelled','refunded','failed'
  )),
  constraint orders_payment_status_check check (payment_status in (
    'unpaid','paid','refunded','partially_refunded','failed'
  ))
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  product_slug text,
  product_image_url text,
  category_name text,
  unit_price numeric not null,
  quantity integer not null default 1,
  line_total numeric not null,
  delivery_type text,
  product_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  operator_id uuid,
  operator_type text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  delivery_type text,
  delivery_content text,
  delivery_status text not null default 'pending',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_order_no_idx on public.orders(order_no);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_status_logs_order_id_idx on public.order_status_logs(order_id, created_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists order_deliveries_set_updated_at on public.order_deliveries;
create trigger order_deliveries_set_updated_at
before update on public.order_deliveries
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.order_deliveries enable row level security;

drop policy if exists "users can read own orders" on public.orders;
create policy "users can read own orders"
on public.orders for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users can create own orders" on public.orders;
create policy "users can create own orders"
on public.orders for insert
with check (user_id = auth.uid());

drop policy if exists "users can cancel own pending orders" on public.orders;
create policy "users can cancel own pending orders"
on public.orders for update
using ((user_id = auth.uid() and status = 'pending_payment') or public.is_admin())
with check ((user_id = auth.uid() and status = 'cancelled') or public.is_admin());

drop policy if exists "users can read own order items" on public.order_items;
create policy "users can read own order items"
on public.order_items for select
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "authenticated can create order items for own orders" on public.order_items;
create policy "authenticated can create order items for own orders"
on public.order_items for insert
with check (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

drop policy if exists "users can read own order logs" on public.order_status_logs;
create policy "users can read own order logs"
on public.order_status_logs for select
using (
  exists (
    select 1 from public.orders
    where orders.id = order_status_logs.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "authenticated can insert own order logs" on public.order_status_logs;
create policy "authenticated can insert own order logs"
on public.order_status_logs for insert
with check (
  exists (
    select 1 from public.orders
    where orders.id = order_status_logs.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "users can read own deliveries" on public.order_deliveries;
create policy "users can read own deliveries"
on public.order_deliveries for select
using (
  exists (
    select 1 from public.orders
    where orders.id = order_deliveries.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "admins can manage orders" on public.orders;
create policy "admins can manage orders"
on public.orders for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage order items" on public.order_items;
create policy "admins can manage order items"
on public.order_items for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage order logs" on public.order_status_logs;
create policy "admins can manage order logs"
on public.order_status_logs for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage deliveries" on public.order_deliveries;
create policy "admins can manage deliveries"
on public.order_deliveries for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.create_order_with_item(
  p_product_id uuid,
  p_quantity integer default 1,
  p_customer_email text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_note text default null,
  p_shipping_address jsonb default null
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
  v_category record;
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_order_id uuid;
  v_order_no text;
  v_line_total numeric;
  v_try integer := 0;
begin
  if v_user_id is null then
    raise exception '请先登录后再下单';
  end if;

  select p.*
    into v_product
  from public.products p
  where p.id = p_product_id
    and p.status = 'active'
  limit 1;

  if not found then
    raise exception '商品不存在或已下架';
  end if;

  if coalesce(v_product.stock, 0) < v_quantity then
    raise exception '库存不足';
  end if;

  select c.*
    into v_category
  from public.categories c
  where c.id = v_product.category_id
    and coalesce(c.is_active, true) = true
  limit 1;

  if not found then
    raise exception '商品分类不可用';
  end if;

  v_line_total := round((coalesce(v_product.price, 0)::numeric * v_quantity)::numeric, 2);

  loop
    v_try := v_try + 1;
    v_order_no := 'JL' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
      lpad(floor(random() * 10000)::text, 4, '0');

    begin
      insert into public.orders (
        order_no,user_id,status,payment_status,subtotal,discount_amount,total_amount,currency,
        customer_email,customer_name,customer_phone,shipping_address,customer_note,delivery_type
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
        v_product.delivery_type
      )
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_try >= 5 then
        raise exception '订单号生成失败，请重试';
      end if;
    end;
  end loop;

  insert into public.order_items (
    order_id,product_id,product_name,product_slug,product_image_url,category_name,
    unit_price,quantity,line_total,delivery_type,product_snapshot
  )
  values (
    v_order_id,v_product.id,v_product.name,v_product.slug,v_product.image_url,v_category.name,
    v_product.price,v_quantity,v_line_total,v_product.delivery_type,
    jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'slug', v_product.slug,
      'image_url', v_product.image_url,
      'price', v_product.price,
      'original_price', v_product.original_price,
      'delivery_type', v_product.delivery_type,
      'category_id', v_product.category_id,
      'category_name', v_category.name
    )
  );

  insert into public.order_status_logs (
    order_id,from_status,to_status,operator_id,operator_type,note
  )
  values (
    v_order_id,null,'pending_payment',v_user_id,'user','用户创建订单'
  );

  return query
  select v_order_id, v_order_no, 'pending_payment'::text, 'unpaid'::text, v_line_total;
end;
$$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_payment_status text default null,
  p_admin_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from_status text;
  v_stock_ok boolean := true;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;

  v_from_status := v_order.status;

  if p_to_status not in ('pending_payment','paid','processing','delivered','completed','cancelled','refunded','failed') then
    raise exception '无效订单状态';
  end if;

  if not (
    (v_order.status = 'pending_payment' and p_to_status in ('paid','cancelled')) or
    (v_order.status = 'paid' and p_to_status in ('processing','refunded')) or
    (v_order.status = 'processing' and p_to_status in ('delivered','failed','refunded')) or
    (v_order.status = 'delivered' and p_to_status in ('completed','refunded')) or
    (v_order.status = 'failed' and p_to_status in ('processing','refunded')) or
    v_order.status = p_to_status
  ) then
    raise exception '当前订单状态不允许执行该操作';
  end if;

  if v_order.status = 'pending_payment' and p_to_status = 'paid' then
    select bool_and(p.stock >= oi.quantity)
      into v_stock_ok
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id;

    if coalesce(v_stock_ok, false) = false then
      raise exception '库存不足，无法标记已支付';
    end if;

    update public.products p
      set stock = p.stock - oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = p.id;
  end if;

  update public.orders
    set status = p_to_status,
        payment_status = coalesce(p_payment_status, case when p_to_status = 'paid' then 'paid' else payment_status end),
        admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
        paid_at = case when p_to_status = 'paid' and paid_at is null then now() else paid_at end,
        processed_at = case when p_to_status = 'processing' and processed_at is null then now() else processed_at end,
        completed_at = case when p_to_status = 'completed' and completed_at is null then now() else completed_at end,
        cancelled_at = case when p_to_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_logs (
    order_id,from_status,to_status,operator_id,operator_type,note
  )
  values (
    p_order_id,v_from_status,p_to_status,auth.uid(),'admin',nullif(trim(p_admin_note), '')
  );

  return v_order;
end;
$$;

create or replace function public.admin_upsert_order_delivery(
  p_order_id uuid,
  p_order_item_id uuid default null,
  p_delivery_type text default null,
  p_delivery_content text default null,
  p_delivery_status text default 'delivered',
  p_delivered_at timestamptz default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_delivery public.order_deliveries;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;

  if v_order.status = 'cancelled' then
    raise exception '订单已取消，不能继续提交交付信息';
  end if;

  select * into v_delivery
  from public.order_deliveries
  where order_id = p_order_id
  order by created_at asc
  limit 1
  for update;

  if found then
    update public.order_deliveries
      set order_item_id = p_order_item_id,
          delivery_type = coalesce(nullif(trim(p_delivery_type), ''), v_order.delivery_type),
          delivery_content = nullif(trim(p_delivery_content), ''),
          delivery_status = coalesce(nullif(trim(p_delivery_status), ''), 'delivered'),
          delivered_at = coalesce(p_delivered_at, now())
    where id = v_delivery.id
    returning * into v_delivery;
  else
    insert into public.order_deliveries (
      order_id,order_item_id,delivery_type,delivery_content,delivery_status,delivered_at
    )
    values (
      p_order_id,p_order_item_id,coalesce(nullif(trim(p_delivery_type), ''), v_order.delivery_type),
      nullif(trim(p_delivery_content), ''),coalesce(nullif(trim(p_delivery_status), ''), 'delivered'),
      coalesce(p_delivered_at, now())
    )
    returning * into v_delivery;
  end if;

  return v_delivery;
end;
$$;
