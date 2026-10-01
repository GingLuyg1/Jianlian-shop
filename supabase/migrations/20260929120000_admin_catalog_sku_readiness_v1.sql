-- Forward-only: restore the products.has_skus readiness contract without creating SKU or stock data.
begin;

do $$
declare
  v_data_type text;
begin
  if to_regclass('public.products') is null then
    raise exception 'catalog SKU readiness requires public.products';
  end if;
  if to_regclass('public.product_skus') is null then
    raise exception 'catalog SKU readiness requires public.product_skus';
  end if;

  select data_type
    into v_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products'
    and column_name = 'has_skus';

  if v_data_type is not null and v_data_type <> 'boolean' then
    raise exception 'public.products.has_skus exists with incompatible type: %', v_data_type;
  end if;

  if exists (
    select 1
    from (values
      ('id'), ('product_id'), ('sku_code'), ('sku_title'), ('combination_key'),
      ('price'), ('original_price'), ('stock'), ('status'), ('delivery_type'),
      ('image_url'), ('sort_order'), ('metadata'), ('created_at'), ('updated_at')
    ) required(column_name)
    where not exists (
      select 1
      from information_schema.columns actual
      where actual.table_schema = 'public'
        and actual.table_name = 'product_skus'
        and actual.column_name = required.column_name
    )
  ) then
    raise exception 'public.product_skus is missing one or more required catalog columns';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'product_skus_product_code_uidx'
      and replace(lower(indexdef), ' ', '') not like '%product_skus%product_id%lower(btrim(sku_code))%'
  ) then
    raise exception 'product_skus_product_code_uidx has an incompatible definition';
  end if;
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'product_skus_product_combination_uidx'
      and replace(lower(indexdef), ' ', '') not like '%product_skus%product_id%combination_key%'
  ) then
    raise exception 'product_skus_product_combination_uidx has an incompatible definition';
  end if;
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'products_has_skus_idx'
      and replace(lower(indexdef), ' ', '') not like '%products%has_skus%'
  ) then
    raise exception 'products_has_skus_idx has an incompatible definition';
  end if;
end;
$$;

create unique index if not exists product_skus_product_code_uidx
  on public.product_skus(product_id, lower(btrim(sku_code)))
  where sku_code is not null and length(btrim(sku_code)) > 0;

create unique index if not exists product_skus_product_combination_uidx
  on public.product_skus(product_id, combination_key);

alter table public.products
  add column if not exists has_skus boolean;

update public.products
set has_skus = exists (
  select 1
  from public.product_skus sku
  where sku.product_id = products.id
)
where has_skus is distinct from exists (
  select 1
  from public.product_skus sku
  where sku.product_id = products.id
);

alter table public.products
  alter column has_skus set default false,
  alter column has_skus set not null;

create index if not exists products_has_skus_idx
  on public.products(has_skus);

comment on column public.products.has_skus is
  'Derived readiness flag: true only when at least one real public.product_skus row exists.';

commit;
