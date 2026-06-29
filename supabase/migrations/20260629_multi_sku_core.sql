-- Jianlian Shop multi-SKU compatibility layer.
-- Execute after the existing product, order and digital inventory migrations.
-- This migration is intentionally additive: it does not delete existing data.

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_groups_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  value_code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_values_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku_code text,
  sku_title text,
  combination_key text not null,
  price numeric not null default 0,
  original_price numeric,
  stock integer not null default 0,
  status text not null default 'active',
  delivery_type text,
  image_url text,
  sort_order integer not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_skus_price_check check (price >= 0),
  constraint product_skus_original_price_check check (original_price is null or original_price >= 0),
  constraint product_skus_stock_check check (stock >= 0),
  constraint product_skus_status_check check (status in ('active','inactive','sold_out','draft')),
  constraint product_skus_combination_not_blank check (length(btrim(combination_key)) > 0)
);

create table if not exists public.product_sku_values (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.product_skus(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete restrict,
  value_id uuid not null references public.product_option_values(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists product_option_groups_product_name_uidx
  on public.product_option_groups(product_id, lower(btrim(name)));

create unique index if not exists product_option_values_group_name_uidx
  on public.product_option_values(group_id, lower(btrim(name)));

create unique index if not exists product_skus_product_code_uidx
  on public.product_skus(product_id, lower(btrim(sku_code)))
  where sku_code is not null and length(btrim(sku_code)) > 0;

create unique index if not exists product_skus_product_combination_uidx
  on public.product_skus(product_id, combination_key);

create unique index if not exists product_sku_values_sku_group_uidx
  on public.product_sku_values(sku_id, group_id);

create unique index if not exists product_sku_values_sku_value_uidx
  on public.product_sku_values(sku_id, value_id);

create index if not exists product_option_groups_product_sort_idx
  on public.product_option_groups(product_id, sort_order, created_at);

create index if not exists product_option_values_group_sort_idx
  on public.product_option_values(group_id, sort_order, created_at);

create index if not exists product_skus_product_status_sort_idx
  on public.product_skus(product_id, status, sort_order, created_at);

drop trigger if exists product_option_groups_set_updated_at on public.product_option_groups;
create trigger product_option_groups_set_updated_at
before update on public.product_option_groups
for each row execute function public.set_updated_at();

drop trigger if exists product_option_values_set_updated_at on public.product_option_values;
create trigger product_option_values_set_updated_at
before update on public.product_option_values
for each row execute function public.set_updated_at();

drop trigger if exists product_skus_set_updated_at on public.product_skus;
create trigger product_skus_set_updated_at
before update on public.product_skus
for each row execute function public.set_updated_at();

alter table public.order_items
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null,
  add column if not exists sku_code text,
  add column if not exists sku_title text,
  add column if not exists option_snapshot jsonb;

create index if not exists order_items_sku_idx
  on public.order_items(sku_id)
  where sku_id is not null;

alter table public.digital_inventory
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

alter table public.digital_inventory_batches
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

alter table public.order_deliveries
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

create index if not exists digital_inventory_product_sku_status_idx
  on public.digital_inventory(product_id, sku_id, status, updated_at desc);

create index if not exists digital_inventory_batches_product_sku_idx
  on public.digital_inventory_batches(product_id, sku_id, created_at desc);

create index if not exists order_deliveries_sku_idx
  on public.order_deliveries(sku_id)
  where sku_id is not null;

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku_id uuid references public.product_skus(id) on delete set null,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_check check (quantity > 0)
);

create unique index if not exists cart_items_user_product_sku_uidx
  on public.cart_items(user_id, product_id, coalesce(sku_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
before update on public.cart_items
for each row execute function public.set_updated_at();

alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_skus enable row level security;
alter table public.product_sku_values enable row level security;
alter table public.cart_items enable row level security;

drop policy if exists "public can read active option groups" on public.product_option_groups;
create policy "public can read active option groups"
on public.product_option_groups for select
using (is_active = true);

drop policy if exists "public can read active option values" on public.product_option_values;
create policy "public can read active option values"
on public.product_option_values for select
using (is_active = true);

drop policy if exists "public can read active skus" on public.product_skus;
create policy "public can read active skus"
on public.product_skus for select
using (status in ('active','sold_out'));

drop policy if exists "public can read sku values" on public.product_sku_values;
create policy "public can read sku values"
on public.product_sku_values for select
using (true);

drop policy if exists "admins manage option groups" on public.product_option_groups;
create policy "admins manage option groups"
on public.product_option_groups for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage option values" on public.product_option_values;
create policy "admins manage option values"
on public.product_option_values for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage product skus" on public.product_skus;
create policy "admins manage product skus"
on public.product_skus for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage sku values" on public.product_sku_values;
create policy "admins manage sku values"
on public.product_sku_values for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own cart items" on public.cart_items;
create policy "users read own cart items"
on public.cart_items for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users insert own cart items" on public.cart_items;
create policy "users insert own cart items"
on public.cart_items for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own cart items" on public.cart_items;
create policy "users update own cart items"
on public.cart_items for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users delete own cart items" on public.cart_items;
create policy "users delete own cart items"
on public.cart_items for delete
to authenticated
using (user_id = auth.uid());

grant select on table public.product_option_groups to anon, authenticated;
grant select on table public.product_option_values to anon, authenticated;
grant select on table public.product_skus to anon, authenticated;
grant select on table public.product_sku_values to anon, authenticated;
grant all on table public.product_option_groups to service_role;
grant all on table public.product_option_values to service_role;
grant all on table public.product_skus to service_role;
grant all on table public.product_sku_values to service_role;
grant all on table public.cart_items to service_role;

create or replace function public.validate_product_option_group_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.product_option_groups
  where product_id = new.product_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and is_active = true;

  if coalesce(new.is_active, true) and v_count >= 3 then
    raise exception '同一商品最多只能启用 3 个规格组';
  end if;

  return new;
end;
$$;

drop trigger if exists product_option_group_limit on public.product_option_groups;
create trigger product_option_group_limit
before insert or update of product_id, is_active on public.product_option_groups
for each row execute function public.validate_product_option_group_limit();

drop function if exists public.create_order_with_item(uuid, integer, text, text, text, text, jsonb);

create or replace function public.create_order_with_item(
  p_product_id uuid,
  p_quantity integer default 1,
  p_customer_email text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_note text default null,
  p_shipping_address jsonb default null,
  p_sku_id uuid default null
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
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_order_id uuid;
  v_order_no text;
  v_order_prefix text := public.get_site_setting_text('order_no_prefix', 'JL');
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

  v_unit_price := coalesce(v_product.price, 0)::numeric;
  v_original_price := v_product.original_price;
  v_stock := coalesce(v_product.stock, 0);
  v_delivery_type := v_product.delivery_type;
  v_image_url := v_product.image_url;

  if p_sku_id is not null then
    select s.*
      into v_sku
    from public.product_skus s
    where s.id = p_sku_id
      and s.product_id = p_product_id
      and s.status = 'active'
    limit 1;

    if not found then
      raise exception '所选规格不存在或不可购买';
    end if;

    v_unit_price := coalesce(v_sku.price, 0)::numeric;
    v_original_price := v_sku.original_price;
    v_stock := coalesce(v_sku.stock, 0);
    v_delivery_type := coalesce(v_sku.delivery_type, v_product.delivery_type);
    v_image_url := coalesce(nullif(v_sku.image_url, ''), v_product.image_url);
    v_sku_title := nullif(v_sku.sku_title, '');
    v_sku_code := nullif(v_sku.sku_code, '');

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
      into v_option_snapshot
    from public.product_sku_values sv
    join public.product_option_groups g on g.id = sv.group_id
    join public.product_option_values ov on ov.id = sv.value_id
    where sv.sku_id = p_sku_id;

    if v_sku_title is null then
      select nullif(string_agg(value_name, ' / ' order by sort_order), '')
        into v_sku_title
      from (
        select ov.name as value_name, coalesce(sv.sort_order, g.sort_order, 0) as sort_order
        from public.product_sku_values sv
        join public.product_option_groups g on g.id = sv.group_id
        join public.product_option_values ov on ov.id = sv.value_id
        where sv.sku_id = p_sku_id
      ) option_rows;
    end if;
  end if;

  if v_stock < v_quantity then
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

  v_order_prefix := regexp_replace(upper(coalesce(v_order_prefix, 'JL')), '[^A-Z0-9]', '', 'g');
  if v_order_prefix = '' then
    v_order_prefix := 'JL';
  end if;

  v_line_total := round((v_unit_price * v_quantity)::numeric, 2);

  loop
    v_try := v_try + 1;
    v_order_no := v_order_prefix || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
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
        v_delivery_type
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
    order_id,product_id,sku_id,sku_code,sku_title,option_snapshot,
    product_name,product_slug,product_image_url,category_name,
    unit_price,quantity,line_total,delivery_type,product_snapshot
  )
  values (
    v_order_id,v_product.id,p_sku_id,v_sku_code,v_sku_title,v_option_snapshot,
    v_product.name,v_product.slug,v_image_url,v_category.name,
    v_unit_price,v_quantity,v_line_total,v_delivery_type,
    jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'slug', v_product.slug,
      'image_url', v_image_url,
      'price', v_unit_price,
      'original_price', v_original_price,
      'delivery_type', v_delivery_type,
      'category_id', v_product.category_id,
      'category_name', v_category.name,
      'sku_id', p_sku_id,
      'sku_code', v_sku_code,
      'sku_title', v_sku_title,
      'option_snapshot', v_option_snapshot
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

grant execute on function public.create_order_with_item(uuid, integer, text, text, text, text, jsonb, uuid)
  to authenticated;

create or replace function public.deliver_digital_order(
  p_order_id uuid,
  p_operator_type text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_inventory public.digital_inventory;
  v_delivered_count integer := 0;
  v_failed_count integer := 0;
  v_total_auto_items integer := 0;
  v_now timestamptz := now();
  v_delivery_status text;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', '订单不存在', 'delivered_count', 0, 'failed_count', 0);
  end if;

  for v_item in
    select * from public.order_items
    where order_id = p_order_id
      and lower(coalesce(delivery_type, '')) in ('automatic','auto','card','account','auto_delivery')
    order by created_at asc
  loop
    v_total_auto_items := v_total_auto_items + 1;

    update public.order_items
      set delivery_status = 'processing',
          delivery_started_at = coalesce(delivery_started_at, v_now)
    where id = v_item.id
      and coalesce(delivery_status, 'pending') in ('pending','failed','partial')
    returning * into v_item;

    select * into v_inventory
    from public.digital_inventory
    where product_id = v_item.product_id
      and (
        (v_item.sku_id is null and sku_id is null)
        or sku_id = v_item.sku_id
      )
      and status in ('reserved','available')
      and (status = 'available' or coalesce(reserved_order_id, order_id) = p_order_id)
      and (expires_at is null or expires_at > now())
    order by
      case when status = 'reserved' then 0 else 1 end,
      created_at asc
    limit 1
    for update skip locked;

    if not found then
      v_failed_count := v_failed_count + 1;
      update public.order_items
        set delivery_status = 'failed',
            delivery_failure_reason = case
              when v_item.sku_id is null then '数字库存不足'
              else '当前 SKU 数字库存不足'
            end
      where id = v_item.id;
      continue;
    end if;

    update public.digital_inventory
      set status = 'delivered',
          order_id = p_order_id,
          reserved_order_id = null,
          delivered_order_id = p_order_id,
          delivered_order_item_id = v_item.id,
          delivered_user_id = v_order.user_id,
          delivered_at = v_now
    where id = v_inventory.id;

    insert into public.order_deliveries (
      order_id, order_item_id, user_id, product_id, sku_id, inventory_id,
      delivery_type, delivery_status, delivered_at, created_at, updated_at
    )
    values (
      p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_item.sku_id, v_inventory.id,
      v_item.delivery_type, 'delivered', v_now, v_now, v_now
    )
    on conflict do nothing;

    update public.order_items
      set delivery_status = 'delivered',
          delivered_quantity = least(coalesce(quantity, 1), coalesce(delivered_quantity, 0) + 1),
          delivery_completed_at = v_now,
          delivery_failure_reason = null
    where id = v_item.id;

    v_delivered_count := v_delivered_count + 1;
  end loop;

  if v_total_auto_items = 0 then
    return jsonb_build_object('ok', true, 'message', '没有需要自动发货的订单项', 'delivered_count', 0, 'failed_count', 0);
  end if;

  if v_failed_count > 0 and v_delivered_count > 0 then
    v_delivery_status := 'partial';
  elsif v_failed_count > 0 then
    v_delivery_status := 'failed';
  else
    v_delivery_status := 'delivered';
  end if;

  update public.orders
    set delivery_status = v_delivery_status,
        fulfillment_status = case
          when v_delivery_status = 'delivered' then 'fulfilled'
          when v_delivery_status = 'partial' then 'partial'
          else coalesce(fulfillment_status, 'pending')
        end,
        updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'ok', v_failed_count = 0,
    'message', case when v_failed_count = 0 then '自动发货完成' else '部分订单项自动发货失败' end,
    'delivered_count', v_delivered_count,
    'failed_count', v_failed_count
  );
end;
$$;

grant execute on function public.deliver_digital_order(uuid, text) to authenticated;
