-- Jianlian Shop catalog-only import template.
-- Run this ONLY in Jianlian-shop-test after reviewing the exported JSON.
-- Paste the JSON produced by catalog_export.sql into v_catalog below.
--
-- This script uses upsert only. It does not delete rows that are absent from
-- the export, and it does not touch users, orders, payments, balances,
-- digital_inventory or card/account secret pools.

do $$
declare
  v_catalog jsonb := $catalog$
{
  "paste": "catalog_export.sql JSON result here"
}
$catalog$::jsonb;
  v_gallery_type text;
begin
  if coalesce(v_catalog->>'source', '') <> 'production_catalog_export' then
    raise exception 'Invalid catalog export payload: expected source=production_catalog_export';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into v_gallery_type
  from pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname = 'gallery'
    and not a.attisdropped;

  insert into public.categories (
    id, parent_id, level, name, slug, icon, description, sort_order,
    status, is_active, metadata, created_at, updated_at
  )
  select
    id,
    parent_id,
    level,
    name,
    case
      when coalesce(slug, '') ~ '^[a-z0-9][a-z0-9-]*$' then slug
      else 'category-' || id::text
    end,
    icon,
    description,
    sort_order,
    coalesce(status, case when coalesce(is_active, true) then 'active' else 'inactive' end),
    coalesce(is_active, coalesce(status, 'active') <> 'inactive'),
    coalesce(metadata, '{}'::jsonb),
    coalesce(created_at, now()),
    coalesce(updated_at, now())
  from jsonb_to_recordset(v_catalog->'categories') as x(
    id uuid,
    parent_id uuid,
    level integer,
    name text,
    slug text,
    icon text,
    description text,
    sort_order integer,
    status text,
    is_active boolean,
    metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  order by level, sort_order, name
  on conflict (id) do update set
    parent_id = excluded.parent_id,
    level = excluded.level,
    name = excluded.name,
    slug = excluded.slug,
    icon = excluded.icon,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status,
    is_active = excluded.is_active,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  insert into public.products (
    id, category_id, subcategory_id, name, slug, short_description,
    description, image_url, price, original_price, stock, delivery_type,
    status, sort_order, has_skus, metadata, created_at, updated_at
  )
  select
    id,
    category_id,
    subcategory_id,
    name,
    case
      when coalesce(slug, '') ~ '^[a-z0-9][a-z0-9-]*$' then slug
      else 'product-' || id::text
    end,
    short_description,
    description, image_url, coalesce(price, 0), original_price, coalesce(stock, 0),
    coalesce(delivery_type, 'manual'),
    coalesce(status, case when coalesce(is_active, true) then 'active' else 'inactive' end),
    coalesce(sort_order, 0),
    coalesce(has_skus, false),
    coalesce(metadata, '{}'::jsonb),
    coalesce(created_at, now()),
    coalesce(updated_at, now())
  from jsonb_to_recordset(v_catalog->'products') as x(
    id uuid,
    category_id uuid,
    subcategory_id uuid,
    name text,
    slug text,
    short_description text,
    description text,
    image_url text,
    gallery jsonb,
    price numeric,
    original_price numeric,
    stock integer,
    delivery_type text,
    status text,
    is_active boolean,
    sort_order integer,
    has_skus boolean,
    metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  order by sort_order, created_at, name
  on conflict (id) do update set
    category_id = excluded.category_id,
    subcategory_id = excluded.subcategory_id,
    name = excluded.name,
    slug = excluded.slug,
    short_description = excluded.short_description,
    description = excluded.description,
    image_url = excluded.image_url,
    price = excluded.price,
    original_price = excluded.original_price,
    stock = excluded.stock,
    delivery_type = excluded.delivery_type,
    status = excluded.status,
    sort_order = excluded.sort_order,
    has_skus = excluded.has_skus,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  if v_gallery_type = 'text[]' then
    update public.products p
      set gallery = coalesce(g.gallery_text, '{}'::text[])
    from (
      select
        id,
        array(select jsonb_array_elements_text(coalesce(gallery, '[]'::jsonb))) as gallery_text
      from jsonb_to_recordset(v_catalog->'products') as x(id uuid, gallery jsonb)
    ) as g
    where p.id = g.id;
  elsif v_gallery_type = 'jsonb' then
    update public.products p
      set gallery = coalesce(g.gallery_json, '[]'::jsonb)
    from (
      select id, gallery as gallery_json
      from jsonb_to_recordset(v_catalog->'products') as x(id uuid, gallery jsonb)
    ) as g
    where p.id = g.id;
  end if;

  insert into public.product_option_groups (
    id, product_id, name, sort_order, is_active, created_at, updated_at
  )
  select
    id,
    product_id,
    name,
    coalesce(sort_order, 0),
    coalesce(is_active, true),
    coalesce(created_at, now()),
    coalesce(updated_at, now())
  from jsonb_to_recordset(v_catalog->'product_option_groups') as x(
    id uuid,
    product_id uuid,
    name text,
    sort_order integer,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
  )
  order by product_id, sort_order, name
  on conflict (id) do update set
    product_id = excluded.product_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  insert into public.product_option_values (
    id, product_id, group_id, name, value_code, sort_order, is_active,
    created_at, updated_at
  )
  select
    id,
    product_id,
    group_id,
    name,
    value_code,
    coalesce(sort_order, 0),
    coalesce(is_active, true),
    coalesce(created_at, now()),
    coalesce(updated_at, now())
  from jsonb_to_recordset(v_catalog->'product_option_values') as x(
    id uuid,
    product_id uuid,
    group_id uuid,
    name text,
    value_code text,
    sort_order integer,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
  )
  order by product_id, group_id, sort_order, name
  on conflict (id) do update set
    product_id = excluded.product_id,
    group_id = excluded.group_id,
    name = excluded.name,
    value_code = excluded.value_code,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  insert into public.product_skus (
    id, product_id, sku_code, sku_title, combination_key, price,
    original_price, stock, status, delivery_type, image_url, sort_order,
    note, metadata, created_at, updated_at
  )
  select
    id,
    product_id,
    sku_code,
    sku_title,
    coalesce(nullif(combination_key, ''), nullif(sku_code, ''), id::text),
    coalesce(price, 0),
    original_price,
    coalesce(stock, 0),
    coalesce(status, case when coalesce(is_active, true) then 'active' else 'inactive' end),
    delivery_type,
    image_url,
    coalesce(sort_order, 0),
    note,
    coalesce(metadata, '{}'::jsonb),
    coalesce(created_at, now()),
    coalesce(updated_at, now())
  from jsonb_to_recordset(v_catalog->'product_skus') as x(
    id uuid,
    product_id uuid,
    sku_code text,
    sku_title text,
    combination_key text,
    price numeric,
    original_price numeric,
    stock integer,
    status text,
    is_active boolean,
    delivery_type text,
    image_url text,
    sort_order integer,
    note text,
    metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz
  )
  order by product_id, sort_order, sku_code
  on conflict (id) do update set
    product_id = excluded.product_id,
    sku_code = excluded.sku_code,
    sku_title = excluded.sku_title,
    combination_key = excluded.combination_key,
    price = excluded.price,
    original_price = excluded.original_price,
    stock = excluded.stock,
    status = excluded.status,
    delivery_type = excluded.delivery_type,
    image_url = excluded.image_url,
    sort_order = excluded.sort_order,
    note = excluded.note,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  insert into public.product_sku_values (
    id, sku_id, product_id, group_id, value_id, sort_order, created_at
  )
  select id, sku_id, product_id, group_id, value_id, sort_order, created_at
  from jsonb_to_recordset(v_catalog->'product_sku_values') as x(
    id uuid,
    sku_id uuid,
    product_id uuid,
    group_id uuid,
    value_id uuid,
    sort_order integer,
    created_at timestamptz
  )
  order by product_id, sku_id, sort_order
  on conflict (id) do update set
    sku_id = excluded.sku_id,
    product_id = excluded.product_id,
    group_id = excluded.group_id,
    value_id = excluded.value_id,
    sort_order = excluded.sort_order;

  raise notice 'Catalog import upsert completed: categories %, products %, skus %',
    jsonb_array_length(coalesce(v_catalog->'categories', '[]'::jsonb)),
    jsonb_array_length(coalesce(v_catalog->'products', '[]'::jsonb)),
    jsonb_array_length(coalesce(v_catalog->'product_skus', '[]'::jsonb));
end $$;
