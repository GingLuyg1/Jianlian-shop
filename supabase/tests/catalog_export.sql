-- Jianlian Shop catalog-only export script.
-- Run this in the PRODUCTION Supabase SQL Editor as a read-only query.
-- It exports catalog metadata only. It intentionally excludes users, orders,
-- payments, balances, digital inventory, card/account secrets and audit data.
--
-- Copy the single JSON result and paste it into catalog_import_template.sql
-- in the v_catalog placeholder.
--
-- The production project may only have categories/products. Optional multi-SKU
-- tables are exported only when they exist. Missing optional tables return [].

create or replace function pg_temp.catalog_export_table_json(p_table regclass)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if p_table is null then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb) from %s as t',
    p_table
  )
  into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

with catalog_export as (
  select jsonb_build_object(
    'exported_at', to_jsonb(now()),
    'source', 'production_catalog_export',
    'table_presence', jsonb_build_object(
      'categories', to_regclass('public.categories') is not null,
      'products', to_regclass('public.products') is not null,
      'product_skus', to_regclass('public.product_skus') is not null,
      'product_option_groups', to_regclass('public.product_option_groups') is not null,
      'product_option_values', to_regclass('public.product_option_values') is not null,
      'product_sku_values', to_regclass('public.product_sku_values') is not null
    ),
    'categories', pg_temp.catalog_export_table_json(to_regclass('public.categories')),
    'products', pg_temp.catalog_export_table_json(to_regclass('public.products')),
    'product_skus', pg_temp.catalog_export_table_json(to_regclass('public.product_skus')),
    'product_option_groups', pg_temp.catalog_export_table_json(to_regclass('public.product_option_groups')),
    'product_option_values', pg_temp.catalog_export_table_json(to_regclass('public.product_option_values')),
    'product_sku_values', pg_temp.catalog_export_table_json(to_regclass('public.product_sku_values'))
  ) as payload
)
select jsonb_pretty(payload) as catalog_json
from catalog_export;
