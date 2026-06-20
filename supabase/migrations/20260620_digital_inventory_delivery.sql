-- Digital inventory and automatic delivery support.
-- Execute manually in Supabase SQL Editor. This migration does not disable RLS.

create extension if not exists pgcrypto;

create table if not exists public.digital_inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  content text not null,
  status text not null default 'available',
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reserved_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz,
  batch_no text,
  remark text,
  constraint digital_inventory_status_check check (
    status in ('available','reserved','delivered','disabled','expired')
  ),
  constraint digital_inventory_content_not_blank check (length(btrim(content)) > 0)
);

create unique index if not exists digital_inventory_product_content_uidx
  on public.digital_inventory(product_id, md5(content));
create index if not exists digital_inventory_product_status_idx
  on public.digital_inventory(product_id, status, updated_at desc);
create index if not exists digital_inventory_order_idx
  on public.digital_inventory(order_id)
  where order_id is not null;
create index if not exists digital_inventory_batch_idx
  on public.digital_inventory(batch_no)
  where batch_no is not null;

drop trigger if exists digital_inventory_set_updated_at on public.digital_inventory;
create trigger digital_inventory_set_updated_at
before update on public.digital_inventory
for each row execute function public.set_updated_at();

alter table public.digital_inventory enable row level security;

drop policy if exists "deny direct inventory reads" on public.digital_inventory;
create policy "deny direct inventory reads"
on public.digital_inventory for select
using (false);

drop policy if exists "deny direct inventory inserts" on public.digital_inventory;
create policy "deny direct inventory inserts"
on public.digital_inventory for insert
with check (false);

drop policy if exists "deny direct inventory updates" on public.digital_inventory;
create policy "deny direct inventory updates"
on public.digital_inventory for update
using (false)
with check (false);

drop policy if exists "deny direct inventory deletes" on public.digital_inventory;
create policy "deny direct inventory deletes"
on public.digital_inventory for delete
using (false);

create or replace function public.sync_product_available_stock(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
begin
  select count(*)::integer
    into v_available
  from public.digital_inventory
  where product_id = p_product_id
    and status = 'available'
    and (expires_at is null or expires_at > now());

  update public.products
    set stock = coalesce(v_available, 0)
  where id = p_product_id;

  return coalesce(v_available, 0);
end;
$$;

create or replace function public.admin_list_digital_inventory_summary(
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  product_id uuid,
  product_name text,
  product_slug text,
  batch_no text,
  available_count integer,
  reserved_count integer,
  delivered_count integer,
  disabled_count integer,
  expired_count integer,
  total_count integer,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  return query
  with grouped as (
    select
      di.product_id,
      p.name as product_name,
      p.slug as product_slug,
      coalesce(di.batch_no, '') as batch_no,
      count(*) filter (where di.status = 'available')::integer as available_count,
      count(*) filter (where di.status = 'reserved')::integer as reserved_count,
      count(*) filter (where di.status = 'delivered')::integer as delivered_count,
      count(*) filter (where di.status = 'disabled')::integer as disabled_count,
      count(*) filter (where di.status = 'expired')::integer as expired_count,
      count(*)::integer as total_count,
      max(di.updated_at) as updated_at
    from public.digital_inventory di
    join public.products p on p.id = di.product_id
    where (
        coalesce(nullif(btrim(p_search), ''), '') = ''
        or p.name ilike '%' || btrim(p_search) || '%'
        or p.slug ilike '%' || btrim(p_search) || '%'
      )
      and (v_status = 'all' or di.status = v_status)
    group by di.product_id, p.name, p.slug, coalesce(di.batch_no, '')
  ),
  counted as (
    select grouped.*, count(*) over() as total_rows
    from grouped
  )
  select *
  from counted
  order by updated_at desc nulls last
  offset (v_from - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_list_digital_inventory_items(
  p_product_id uuid,
  p_batch_no text default null,
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  product_id uuid,
  masked_content text,
  status text,
  order_id uuid,
  batch_no text,
  remark text,
  reserved_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  return query
  with filtered as (
    select di.*
    from public.digital_inventory di
    where di.product_id = p_product_id
      and (p_batch_no is null or coalesce(di.batch_no, '') = coalesce(p_batch_no, ''))
      and (v_status = 'all' or di.status = v_status)
  ),
  counted as (
    select filtered.*, count(*) over() as total_rows
    from filtered
  )
  select
    counted.id,
    counted.product_id,
    case
      when length(counted.content) <= 8 then repeat('*', greatest(length(counted.content), 4))
      else left(counted.content, 4) || repeat('*', 8) || right(counted.content, 4)
    end as masked_content,
    counted.status,
    counted.order_id,
    counted.batch_no,
    counted.remark,
    counted.reserved_at,
    counted.delivered_at,
    counted.expires_at,
    counted.created_at,
    counted.updated_at,
    counted.total_rows
  from counted
  order by counted.updated_at desc
  offset (v_from - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_import_digital_inventory(
  p_product_id uuid,
  p_contents text[],
  p_batch_no text default null,
  p_remark text default null,
  p_expires_at timestamptz default null
)
returns table (
  inserted_count integer,
  skipped_count integer,
  available_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_available integer := 0;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  if p_product_id is null then
    raise exception '请选择商品';
  end if;

  if coalesce(array_length(p_contents, 1), 0) > 1000 then
    raise exception '单次最多导入 1000 条';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception '商品不存在';
  end if;

  foreach v_content in array p_contents loop
    v_content := btrim(coalesce(v_content, ''));
    if v_content = '' then
      v_skipped := v_skipped + 1;
    else
      begin
        insert into public.digital_inventory (
          product_id, content, status, batch_no, remark, expires_at
        )
        values (
          p_product_id, v_content, 'available',
          nullif(btrim(coalesce(p_batch_no, '')), ''),
          nullif(btrim(coalesce(p_remark, '')), ''),
          p_expires_at
        );
        v_inserted := v_inserted + 1;
      exception when unique_violation then
        v_skipped := v_skipped + 1;
      end;
    end if;
  end loop;

  v_available := public.sync_product_available_stock(p_product_id);

  return query select v_inserted, v_skipped, v_available;
end;
$$;

create or replace function public.admin_disable_digital_inventory(
  p_inventory_id uuid,
  p_remark text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  update public.digital_inventory
    set status = 'disabled',
        remark = coalesce(nullif(btrim(p_remark), ''), remark),
        order_id = null,
        reserved_at = null
  where id = p_inventory_id
    and status in ('available','reserved','expired')
  returning product_id into v_product_id;

  if v_product_id is null then
    raise exception '库存不存在，或已交付库存不能禁用';
  end if;

  perform public.sync_product_available_stock(v_product_id);
end;
$$;

create or replace function public.release_order_inventory(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_product_id uuid;
begin
  if not public.is_admin() and not exists (
    select 1 from public.orders
    where id = p_order_id and user_id = auth.uid()
  ) then
    raise exception '无权释放该订单库存';
  end if;

  for v_product_id in
    select distinct product_id
    from public.digital_inventory
    where order_id = p_order_id and status = 'reserved'
  loop
    update public.digital_inventory
      set status = 'available',
          order_id = null,
          reserved_at = null
    where order_id = p_order_id
      and product_id = v_product_id
      and status = 'reserved';

    get diagnostics v_count = row_count;
    perform public.sync_product_available_stock(v_product_id);
  end loop;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.auto_deliver_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_inventory public.digital_inventory;
  v_delivered integer := 0;
  v_item_delivered integer := 0;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '订单不存在';
  end if;

  if v_order.status = 'cancelled' then
    raise exception '订单已取消，不能交付';
  end if;

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
      and delivery_type in ('automatic','auto','card','account')
  loop
    v_item_delivered := 0;

    if exists (
      select 1
      from public.order_deliveries od
      where od.order_id = p_order_id
        and od.order_item_id = v_item.id
        and od.delivery_status = 'delivered'
    ) then
      continue;
    end if;

    for v_inventory in
      select *
      from public.digital_inventory
      where order_id = p_order_id
        and product_id = v_item.product_id
        and status = 'reserved'
      order by reserved_at asc
      limit v_item.quantity
      for update
    loop
      insert into public.order_deliveries (
        order_id, order_item_id, delivery_type, delivery_content, delivery_status, delivered_at
      )
      values (
        p_order_id, v_item.id, v_item.delivery_type, v_inventory.content, 'delivered', now()
      );

      update public.digital_inventory
        set status = 'delivered',
            delivered_at = now()
      where id = v_inventory.id;

      v_delivered := v_delivered + 1;
      v_item_delivered := v_item_delivered + 1;
    end loop;

    if v_item_delivered < v_item.quantity then
      insert into public.order_status_logs (
        order_id, from_status, to_status, operator_id, operator_type, note
      )
      values (
        p_order_id, v_order.status, 'processing', auth.uid(), 'system',
        '自动发货库存不足或预留缺失'
      );

      update public.orders
        set status = 'processing',
            processed_at = coalesce(processed_at, now())
      where id = p_order_id;

      raise exception '自动发货库存不足或预留缺失';
    end if;

    perform public.sync_product_available_stock(v_item.product_id);
  end loop;

  if v_delivered > 0 then
    update public.orders
      set status = 'delivered',
          payment_status = 'paid',
          paid_at = coalesce(paid_at, now()),
          processed_at = coalesce(processed_at, now()),
          completed_at = coalesce(completed_at, now())
    where id = p_order_id
    returning * into v_order;

    insert into public.order_status_logs (
      order_id, from_status, to_status, operator_id, operator_type, note
    )
    values (
      p_order_id, 'paid', 'delivered', auth.uid(), 'system',
      '自动发货完成'
    );
  end if;

  return v_delivered;
end;
$$;

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
  v_available integer := 0;
  v_reserved integer := 0;
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

  if v_product.delivery_type in ('automatic','auto','card','account') then
    select count(*)::integer
      into v_available
    from public.digital_inventory
    where product_id = p_product_id
      and status = 'available'
      and (expires_at is null or expires_at > now());

    if coalesce(v_available, 0) < v_quantity then
      raise exception '库存不足';
    end if;
  elsif coalesce(v_product.stock, 0) < v_quantity then
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

  if v_product.delivery_type in ('automatic','auto','card','account') then
    with picked as (
      select id
      from public.digital_inventory
      where product_id = p_product_id
        and status = 'available'
        and (expires_at is null or expires_at > now())
      order by created_at asc
      limit v_quantity
      for update skip locked
    )
    update public.digital_inventory di
      set status = 'reserved',
          order_id = v_order_id,
          reserved_at = now()
    from picked
    where di.id = picked.id;

    get diagnostics v_reserved = row_count;

    if v_reserved <> v_quantity then
      raise exception '库存不足';
    end if;

    perform public.sync_product_available_stock(p_product_id);
  end if;

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

  if p_to_status = 'cancelled' then
    perform public.release_order_inventory(p_order_id);
  end if;

  if v_order.status = 'pending_payment' and p_to_status = 'paid' then
    select bool_and(
      case
        when oi.delivery_type in ('automatic','auto','card','account') then
          (
            select count(*)::integer
            from public.digital_inventory di
            where di.order_id = p_order_id
              and di.product_id = oi.product_id
              and di.status = 'reserved'
          ) >= oi.quantity
        else p.stock >= oi.quantity
      end
    )
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
      and oi.product_id = p.id
      and coalesce(oi.delivery_type, '') not in ('automatic','auto','card','account');
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

  if p_to_status = 'paid' then
    begin
      perform public.auto_deliver_order(p_order_id);
      select * into v_order from public.orders where id = p_order_id;
    exception when others then
      update public.orders
        set status = 'processing',
            admin_note = coalesce(admin_note || E'\n', '') || '自动发货失败，请人工处理'
      where id = p_order_id
      returning * into v_order;
    end;
  end if;

  return v_order;
end;
$$;

create or replace function public.admin_retry_auto_delivery(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  return public.auto_deliver_order(p_order_id);
end;
$$;

create or replace function public.admin_deliver_inventory_item(
  p_order_id uuid,
  p_order_item_id uuid,
  p_inventory_id uuid,
  p_note text default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_inventory public.digital_inventory;
  v_delivery public.order_deliveries;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status = 'cancelled' then
    raise exception '订单不存在或已取消';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id and order_id = p_order_id
  limit 1;

  if not found then
    raise exception '订单商品不存在';
  end if;

  select * into v_inventory
  from public.digital_inventory
  where id = p_inventory_id
    and product_id = v_item.product_id
    and status = 'available'
  for update;

  if not found then
    raise exception '只能选择可用库存发货';
  end if;

  insert into public.order_deliveries (
    order_id, order_item_id, delivery_type, delivery_content, delivery_status, delivered_at
  )
  values (
    p_order_id, p_order_item_id, coalesce(v_item.delivery_type, v_order.delivery_type),
    v_inventory.content, 'delivered', now()
  )
  returning * into v_delivery;

  update public.digital_inventory
    set status = 'delivered',
        order_id = p_order_id,
        reserved_at = coalesce(reserved_at, now()),
        delivered_at = now()
  where id = p_inventory_id;

  update public.orders
    set status = case when status in ('pending_payment','paid') then 'delivered' else status end,
        processed_at = coalesce(processed_at, now()),
        completed_at = coalesce(completed_at, now())
  where id = p_order_id;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  )
  values (
    p_order_id, v_order.status, 'delivered', auth.uid(), 'admin',
    coalesce(nullif(btrim(p_note), ''), '管理员手动选择库存发货')
  );

  perform public.sync_product_available_stock(v_item.product_id);

  return v_delivery;
end;
$$;

create or replace function public.admin_append_manual_delivery(
  p_order_id uuid,
  p_order_item_id uuid default null,
  p_delivery_type text default null,
  p_delivery_content text default null,
  p_delivery_status text default 'delivered',
  p_note text default null
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

  if nullif(btrim(coalesce(p_delivery_content, '')), '') is null then
    raise exception '请填写交付内容';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status = 'cancelled' then
    raise exception '订单不存在或已取消';
  end if;

  insert into public.order_deliveries (
    order_id, order_item_id, delivery_type, delivery_content, delivery_status, delivered_at
  )
  values (
    p_order_id, p_order_item_id, coalesce(nullif(btrim(p_delivery_type), ''), v_order.delivery_type),
    btrim(p_delivery_content), coalesce(nullif(btrim(p_delivery_status), ''), 'delivered'), now()
  )
  returning * into v_delivery;

  update public.orders
    set status = case when status in ('pending_payment','paid','processing','failed') then 'delivered' else status end,
        processed_at = coalesce(processed_at, now()),
        completed_at = coalesce(completed_at, now())
  where id = p_order_id;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  )
  values (
    p_order_id, v_order.status, 'delivered', auth.uid(), 'admin',
    coalesce(nullif(btrim(p_note), ''), '管理员手动填写交付内容')
  );

  return v_delivery;
end;
$$;

create or replace function public.admin_mark_delivery_failed(
  p_order_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;

  update public.orders
    set status = 'failed',
        admin_note = coalesce(admin_note || E'\n', '') || coalesce(nullif(btrim(p_note), ''), '管理员标记交付失败')
  where id = p_order_id;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  )
  values (
    p_order_id, v_order.status, 'failed', auth.uid(), 'admin',
    coalesce(nullif(btrim(p_note), ''), '管理员标记交付失败')
  );
end;
$$;
