-- Fix create_order_with_item() ambiguous column references.
--
-- The function returns a table with an OUT column named "status". In PL/pgSQL,
-- an unqualified "status" reference inside SQL statements can be resolved as
-- either that OUT parameter or a table column. Qualify inventory columns to keep
-- the existing function signature while avoiding runtime ambiguity.

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
    raise exception 'Please sign in before creating an order';
  end if;

  select p.*
    into v_product
  from public.products p
  where p.id = p_product_id
    and p.status = 'active'
  limit 1;

  if not found then
    raise exception 'Product does not exist or is unavailable';
  end if;

  if v_product.delivery_type in ('automatic','auto','card','account') then
    select count(*)::integer
      into v_available
    from public.digital_inventory di_count
    where di_count.product_id = p_product_id
      and di_count.status = 'available'
      and (di_count.expires_at is null or di_count.expires_at > now());

    if coalesce(v_available, 0) < v_quantity then
      raise exception 'Insufficient stock';
    end if;
  elsif coalesce(v_product.stock, 0) < v_quantity then
    raise exception 'Insufficient stock';
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
        raise exception 'Order number generation failed. Please retry';
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
      select di_pick.id
      from public.digital_inventory di_pick
      where di_pick.product_id = p_product_id
        and di_pick.status = 'available'
        and (di_pick.expires_at is null or di_pick.expires_at > now())
      order by di_pick.created_at asc
      limit v_quantity
      for update skip locked
    )
    update public.digital_inventory di_update
      set status = 'reserved',
          order_id = v_order_id,
          reserved_at = now()
    from picked
    where di_update.id = picked.id;

    get diagnostics v_reserved = row_count;

    if v_reserved <> v_quantity then
      raise exception 'Insufficient stock';
    end if;

    perform public.sync_product_available_stock(p_product_id);
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
