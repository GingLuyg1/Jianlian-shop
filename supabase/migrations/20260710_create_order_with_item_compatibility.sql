-- Add the current 10-argument direct-order RPC without replacing the legacy
-- 7-argument overload. Execute manually after the SKU and lifecycle
-- compatibility migrations.

do $$
declare
  v_missing text[];
begin
  select array_remove(array[
    case when to_regclass('public.categories') is null then 'public.categories' end,
    case when to_regclass('public.products') is null then 'public.products' end,
    case when to_regclass('public.product_skus') is null then 'public.product_skus' end,
    case when to_regclass('public.product_option_groups') is null then 'public.product_option_groups' end,
    case when to_regclass('public.product_option_values') is null then 'public.product_option_values' end,
    case when to_regclass('public.product_sku_values') is null then 'public.product_sku_values' end,
    case when to_regclass('public.orders') is null then 'public.orders' end,
    case when to_regclass('public.order_items') is null then 'public.order_items' end,
    case when to_regclass('public.digital_inventory') is null then 'public.digital_inventory' end,
    case when to_regclass('public.order_status_logs') is null then 'public.order_status_logs' end
  ], null)
  into v_missing;

  if cardinality(v_missing) > 0 then
    raise exception 'create_order_with_item compatibility missing required tables: %', array_to_string(v_missing, ', ');
  end if;

  select array_remove(array[
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='id') then 'categories.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='name') then 'categories.name' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='is_active') then 'categories.is_active' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='id') then 'products.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='name') then 'products.name' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='slug') then 'products.slug' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='image_url') then 'products.image_url' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='category_id') then 'products.category_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='price') then 'products.price' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='original_price') then 'products.original_price' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='stock') then 'products.stock' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='status') then 'products.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='delivery_type') then 'products.delivery_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='updated_at') then 'products.updated_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='id') then 'product_skus.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='product_id') then 'product_skus.product_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='sku_code') then 'product_skus.sku_code' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='sku_title') then 'product_skus.sku_title' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='price') then 'product_skus.price' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='original_price') then 'product_skus.original_price' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='stock') then 'product_skus.stock' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='status') then 'product_skus.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='delivery_type') then 'product_skus.delivery_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='image_url') then 'product_skus.image_url' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_skus' and column_name='updated_at') then 'product_skus.updated_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='id') then 'orders.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='order_no') then 'orders.order_no' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='user_id') then 'orders.user_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='status') then 'orders.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='payment_status') then 'orders.payment_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='subtotal') then 'orders.subtotal' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_amount') then 'orders.discount_amount' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total_amount') then 'orders.total_amount' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='currency') then 'orders.currency' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_email') then 'orders.customer_email' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_name') then 'orders.customer_name' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_phone') then 'orders.customer_phone' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_address') then 'orders.shipping_address' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_note') then 'orders.customer_note' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='delivery_type') then 'orders.delivery_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='payment_method') then 'orders.payment_method' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='payment_expires_at') then 'orders.payment_expires_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='id') then 'order_items.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='order_id') then 'order_items.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_id') then 'order_items.product_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_name') then 'order_items.product_name' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_slug') then 'order_items.product_slug' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_image_url') then 'order_items.product_image_url' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='category_name') then 'order_items.category_name' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='unit_price') then 'order_items.unit_price' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='quantity') then 'order_items.quantity' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='line_total') then 'order_items.line_total' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='delivery_type') then 'order_items.delivery_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_snapshot') then 'order_items.product_snapshot' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='sku_id') then 'order_items.sku_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='sku_code') then 'order_items.sku_code' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='sku_title') then 'order_items.sku_title' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='option_snapshot') then 'order_items.option_snapshot' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='id') then 'digital_inventory.id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='product_id') then 'digital_inventory.product_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='sku_id') then 'digital_inventory.sku_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='status') then 'digital_inventory.status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='order_id') then 'digital_inventory.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='reserved_order_id') then 'digital_inventory.reserved_order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='reserved_order_item_id') then 'digital_inventory.reserved_order_item_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='reserved_at') then 'digital_inventory.reserved_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='expires_at') then 'digital_inventory.expires_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='digital_inventory' and column_name='created_at') then 'digital_inventory.created_at' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='order_id') then 'order_status_logs.order_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='from_status') then 'order_status_logs.from_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='to_status') then 'order_status_logs.to_status' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='operator_id') then 'order_status_logs.operator_id' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='operator_type') then 'order_status_logs.operator_type' end,
    case when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_status_logs' and column_name='note') then 'order_status_logs.note' end
  ], null)
  into v_missing;

  if cardinality(v_missing) > 0 then
    raise exception 'create_order_with_item compatibility missing required columns: %', array_to_string(v_missing, ', ');
  end if;

end;
$$;

-- The current API requires a durable per-user idempotency key. This nullable
-- column is safe for legacy orders and does not rewrite existing rows.
alter table public.orders
  add column if not exists client_request_id text;

do $$
declare
  v_duplicate record;
  v_index_definition text;
begin
  select o.user_id, o.client_request_id, count(*)::bigint as duplicate_count
    into v_duplicate
  from public.orders as o
  where o.client_request_id is not null
    and btrim(o.client_request_id) <> ''
  group by o.user_id, o.client_request_id
  having count(*) > 1
  order by count(*) desc
  limit 1;

  if found then
    raise exception
      'create_order_with_item compatibility found duplicate (user_id, client_request_id): user_id=%, client_request_id=%, count=%',
      v_duplicate.user_id, v_duplicate.client_request_id, v_duplicate.duplicate_count;
  end if;

  select i.indexdef
    into v_index_definition
  from pg_indexes as i
  where i.schemaname = 'public'
    and i.indexname = 'orders_user_client_request_uidx';

  if v_index_definition is not null and not (
    v_index_definition ilike 'create unique index%'
    and replace(lower(v_index_definition), ' ', '') like '%onpublic.ordersusingbtree(user_id,client_request_id)%'
    and replace(lower(v_index_definition), ' ', '') like '%where((client_request_idisnotnull)%'
    and replace(lower(v_index_definition), ' ', '') like '%btrim(client_request_id)<>''%'
  ) then
    raise exception 'orders_user_client_request_uidx exists with an incompatible definition: %', v_index_definition;
  end if;
end;
$$;

create unique index if not exists orders_user_client_request_uidx
  on public.orders(user_id, client_request_id)
  where client_request_id is not null and btrim(client_request_id) <> '';

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
  v_quantity integer := coalesce(p_quantity, 1);
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
  v_option_snapshot jsonb := '[]'::jsonb;
  v_sku_title text;
  v_sku_code text;
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
    -- Serialize retries for one user/request before any stock mutation.
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_request_id, 0));

    select o.id, o.order_no, o.status, o.payment_status, o.total_amount
      into v_existing_order
    from public.orders as o
    where o.user_id = v_user_id
      and o.client_request_id = v_request_id
    limit 1;

    if found then
      return query
      select v_existing_order.id, v_existing_order.order_no, v_existing_order.status,
             v_existing_order.payment_status, v_existing_order.total_amount;
      return;
    end if;
  end if;

  select p.*
    into v_product
  from public.products as p
  where p.id = p_product_id
    and p.status = 'active'
  for update;

  if not found then
    raise exception 'Product does not exist or is unavailable';
  end if;

  if p_sku_id is null then
    select exists (
      select 1
      from public.product_skus as active_sku
      where active_sku.product_id = p_product_id
        and active_sku.status = 'active'
    ) into v_has_active_skus;

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
    select s.*
      into v_sku
    from public.product_skus as s
    where s.id = p_sku_id
      and s.product_id = p_product_id
      and s.status = 'active'
    for update;

    if not found then
      raise exception 'Selected SKU does not exist or is unavailable';
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
        ) order by coalesce(sv.sort_order, g.sort_order, 0), g.created_at
      ),
      '[]'::jsonb
    )
      into v_option_snapshot
    from public.product_sku_values as sv
    join public.product_option_groups as g on g.id = sv.group_id
    join public.product_option_values as ov on ov.id = sv.value_id
    where sv.sku_id = p_sku_id;

    if v_sku_title is null then
      select nullif(string_agg(option_row.value_name, ' / ' order by option_row.sort_order), '')
        into v_sku_title
      from (
        select ov.name as value_name, coalesce(sv.sort_order, g.sort_order, 0) as sort_order
        from public.product_sku_values as sv
        join public.product_option_groups as g on g.id = sv.group_id
        join public.product_option_values as ov on ov.id = sv.value_id
        where sv.sku_id = p_sku_id
      ) as option_row;
    end if;
  end if;

  v_auto_delivery := lower(coalesce(v_delivery_type, '')) in
    ('automatic','auto','card','account','auto_delivery');

  if not v_auto_delivery and v_stock < v_quantity then
    raise exception 'Insufficient stock';
  end if;

  if v_auto_delivery then
    select count(*)::integer
      into v_stock
    from public.digital_inventory as di_count
    where di_count.product_id = p_product_id
      and ((p_sku_id is null and di_count.sku_id is null) or di_count.sku_id = p_sku_id)
      and di_count.status = 'available'
      and (di_count.expires_at is null or di_count.expires_at > now());

    if v_stock < v_quantity then
      raise exception 'Insufficient digital inventory';
    end if;
  end if;

  select c.*
    into v_category
  from public.categories as c
  where c.id = v_product.category_id
    and coalesce(c.is_active, true) = true;

  if not found then
    raise exception 'Product category is unavailable';
  end if;

  if v_unit_price <= 0 then
    raise exception 'Product price must be greater than zero';
  end if;

  v_line_total := round((v_unit_price * v_quantity)::numeric, 2);

  loop
    v_try := v_try + 1;
    v_order_no := 'JL' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
      lpad(floor(random() * 10000)::text, 4, '0');

    begin
      insert into public.orders (
        order_no, user_id, status, payment_status, subtotal, discount_amount,
        total_amount, currency, customer_email, customer_name, customer_phone,
        shipping_address, customer_note, delivery_type, payment_method,
        client_request_id, payment_expires_at
      ) values (
        v_order_no, v_user_id, 'pending_payment', 'unpaid', v_line_total, 0,
        v_line_total, 'CNY', nullif(btrim(p_customer_email), ''),
        nullif(btrim(p_customer_name), ''), nullif(btrim(p_customer_phone), ''),
        case when p_shipping_address is null or p_shipping_address = '{}'::jsonb
             then null else p_shipping_address end,
        nullif(btrim(p_customer_note), ''), v_delivery_type, v_payment_method,
        v_request_id, now() + interval '30 minutes'
      ) returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_request_id is not null then
        select o.id, o.order_no, o.status, o.payment_status, o.total_amount
          into v_existing_order
        from public.orders as o
        where o.user_id = v_user_id
          and o.client_request_id = v_request_id
        limit 1;

        if found then
          return query
          select v_existing_order.id, v_existing_order.order_no, v_existing_order.status,
                 v_existing_order.payment_status, v_existing_order.total_amount;
          return;
        end if;
      end if;

      if v_try >= 5 then
        raise exception 'Order number generation failed. Please retry';
      end if;
    end;
  end loop;

  if v_auto_delivery then
    null;
  elsif p_sku_id is not null then
    update public.product_skus as s
       set stock = s.stock - v_quantity,
           status = case when s.stock - v_quantity <= 0 and s.status = 'active' then 'sold_out' else s.status end,
           updated_at = now()
     where s.id = p_sku_id
       and s.product_id = p_product_id
       and s.status = 'active'
       and s.stock >= v_quantity
     returning s.stock into v_stock;

    if not found then
      raise exception 'Insufficient stock';
    end if;
  else
    update public.products as p
       set stock = p.stock - v_quantity,
           status = case when p.stock - v_quantity <= 0 and p.status = 'active' then 'sold_out' else p.status end,
           updated_at = now()
     where p.id = p_product_id
       and p.status = 'active'
       and p.stock >= v_quantity
     returning p.stock into v_stock;

    if not found then
      raise exception 'Insufficient stock';
    end if;
  end if;

  insert into public.order_items (
    order_id, product_id, sku_id, sku_code, sku_title, option_snapshot,
    product_name, product_slug, product_image_url, category_name,
    unit_price, quantity, line_total, delivery_type, product_snapshot
  ) values (
    v_order_id, v_product.id, p_sku_id, v_sku_code, v_sku_title, v_option_snapshot,
    v_product.name, v_product.slug, v_image_url, v_category.name,
    v_unit_price, v_quantity, v_line_total, v_delivery_type,
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
  ) returning id into v_order_item_id;

  if v_auto_delivery then
    with picked as (
      select di_pick.id
      from public.digital_inventory as di_pick
      where di_pick.product_id = p_product_id
        and ((p_sku_id is null and di_pick.sku_id is null) or di_pick.sku_id = p_sku_id)
        and di_pick.status = 'available'
        and (di_pick.expires_at is null or di_pick.expires_at > now())
      order by di_pick.created_at asc
      limit v_quantity
      for update skip locked
    )
    update public.digital_inventory as di_update
       set status = 'reserved',
           order_id = v_order_id,
           reserved_order_id = v_order_id,
           reserved_order_item_id = v_order_item_id,
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
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    v_order_id, null, 'pending_payment', v_user_id, 'user', 'user created order'
  );

  return query
  select v_order_id, v_order_no, 'pending_payment'::text, 'unpaid'::text, v_line_total;
end;
$$;

revoke all on function public.create_order_with_item(uuid, integer, text, text, text, text, jsonb, uuid, text, text)
  from public, anon;
grant execute on function public.create_order_with_item(uuid, integer, text, text, text, text, jsonb, uuid, text, text)
  to authenticated, service_role;
