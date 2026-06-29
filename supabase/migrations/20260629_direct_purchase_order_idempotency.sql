-- Direct purchase order idempotency.
-- Safe to execute manually. Does not delete or rewrite existing orders.

alter table public.orders
  add column if not exists client_request_id text;

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
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
  v_request_id text := nullif(left(btrim(coalesce(p_client_request_id, '')), 120), '');
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

  if v_quantity <= 0 or v_quantity > 999 then
    raise exception '购买数量不正确';
  end if;

  if v_request_id is not null then
    select id, order_no, status, payment_status, total_amount
      into v_existing_order
    from public.orders
    where user_id = v_user_id
      and client_request_id = v_request_id
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
    raise exception '商品不存在或已下架';
  end if;

  if p_sku_id is null and exists (
    select 1
    from public.product_skus s
    where s.product_id = p_product_id
      and s.status = 'active'
  ) then
    raise exception '请选择完整商品规格';
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
    limit 1
    for update;

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

  if p_sku_id is not null then
    update public.product_skus
       set stock = stock - v_quantity,
           status = case when stock - v_quantity <= 0 and status = 'active' then 'sold_out' else status end,
           updated_at = now()
     where id = p_sku_id
       and stock >= v_quantity
     returning stock into v_stock;

    if not found then
      raise exception '库存不足';
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
      raise exception '库存不足';
    end if;
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
        customer_email,customer_name,customer_phone,shipping_address,customer_note,delivery_type,client_request_id
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
        v_request_id
      )
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_request_id is not null then
        select id, order_no, status, payment_status, total_amount
          into v_existing_order
        from public.orders
        where user_id = v_user_id
          and client_request_id = v_request_id
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

grant execute on function public.create_order_with_item(uuid, integer, text, text, text, text, jsonb, uuid, text)
  to authenticated;
