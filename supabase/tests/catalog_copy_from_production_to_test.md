# Catalog Copy From Production To Test

This runbook describes how to copy only the Jianlian Shop product catalog from the production Supabase project to `Jianlian-shop-test`.

Do not copy users, orders, payments, balances, digital inventory, card/account secret pools, audit logs or callbacks.

## Current Catalog Read Path

The public product list and checkout/detail pages currently read these catalog tables:

- `public.categories`
- `public.products`
- `public.product_skus`

The multi-SKU administration and historical SKU structure also use these specification tables:

- `public.product_option_groups`
- `public.product_option_values`
- `public.product_sku_values`

No current frontend catalog/detail route reads `product_images` or `product_variants`. Those table names were not found as concrete table definitions in the current repository. If production has custom tables with those names, audit them separately before importing them.

## Product Detail Fields

`app/api/catalog/products/[identifier]/route.ts` reads:

- `products.id`
- `products.category_id`
- `products.name`
- `products.slug`
- `products.short_description`
- `products.description`
- `products.image_url`
- `products.price`
- `products.original_price`
- `products.stock`
- `products.delivery_type`
- `products.status`
- `products.sort_order`
- `products.metadata`
- `products.created_at`
- `products.updated_at`

It reads SKU rows from `product_skus`:

- `product_skus.id`
- `product_skus.product_id`
- `product_skus.sku_code`
- `product_skus.sku_title`
- `product_skus.price`
- `product_skus.original_price`
- `product_skus.stock`
- `product_skus.status`
- `product_skus.delivery_type`
- `product_skus.image_url`
- `product_skus.sort_order`
- `product_skus.metadata`

The public list route additionally reads `categories.id,parent_id,level,name,slug,sort_order`.

## Image Storage

Product and SKU images are stored in the database as URL/path strings:

- `products.image_url`
- `products.gallery`
- `product_skus.image_url`

The scripts copy these string values only. They do not copy Supabase Storage objects.

Image behavior after import:

- `https://...` external URLs should continue to work if the remote source remains public.
- `/assets/...` paths should work if the referenced file exists in the repository/public assets.
- Supabase Storage public URLs pointing at the production project will still point at production storage. They will work only if the production bucket/object is public and allowed.
- Private/signed Supabase Storage URLs will usually fail in the test project and must be copied separately with a storage-specific process. After copying, update `image_url`/`gallery` values to the test storage URLs.

## Tables To Copy

Required:

- `categories`
- `products`

Recommended for multi-SKU compatibility:

- `product_option_groups`
- `product_option_values`
- `product_skus`
- `product_sku_values`

These tables contain catalog structure, product text, prices, visible stock counters, display images and SKU metadata. They do not contain card/account secret inventory.

## Tables Not To Copy

Never copy these from production to test for this task:

- `auth.users`
- `profiles`
- `orders`
- `order_items`
- `payment_sessions`
- `order_payments`
- `payments`
- `balance_transactions`
- `user_balances`
- `account_recharges`
- `refunds`
- `refund_requests`
- `digital_inventory`
- `digital_inventory_batches`
- `order_deliveries`
- `chain_payment_sessions`
- `chain_transactions`
- `chain_transaction_claims`
- callback/raw payment event tables
- audit logs
- any card, account, password, token, key or delivery secret pools

## Safe Execution Steps

1. Confirm the destination project is `Jianlian-shop-test`.
2. Confirm the test database already has the catalog schema migrations:
   - `20260619_products_categories_baseline.sql`
   - `20260629_multi_sku_core.sql`
3. In the production Supabase SQL Editor, run `supabase/tests/catalog_export.sql`.
4. Copy the single JSON result locally. Do not paste it into chat tools or public trackers.
5. Open `supabase/tests/catalog_import_template.sql`.
6. Replace the placeholder JSON in `v_catalog` with the production export JSON.
7. In the `Jianlian-shop-test` Supabase SQL Editor, run the edited import template.
8. Verify counts:

```sql
select count(*) as categories_count from public.categories;
select count(*) as products_count from public.products;
select count(*) as skus_count from public.product_skus;
select count(*) as option_groups_count from public.product_option_groups;
select count(*) as option_values_count from public.product_option_values;
```

9. Verify visible products:

```sql
select id, name, slug, status, price, stock
from public.products
order by sort_order, updated_at desc
limit 20;
```

10. In local app connected to `Jianlian-shop-test`, verify:
    - first-level category list
    - second/third-level product list
    - product detail by slug
    - product detail by id
    - checkout page
    - SKU selection if a product has SKUs

## Upsert Behavior

The import template uses `on conflict (id) do update`.

It does not delete destination rows that are missing from production export. This avoids accidental removal of test-only rows. If a clean clone is required, make a test database backup first and perform manual deletion only in `Jianlian-shop-test`.

## Expected UI Losses

Catalog text, prices, stock counters and main images should survive if copied fields are valid.

Potential losses:

- Image files are not copied if they live in Supabase Storage.
- Any production-only custom product image/variant tables not present in this repository are not copied.
- Digital delivery content, card/account inventory and delivered secrets are intentionally not copied.

## Production Safety

The export script is read-only.

The import template must never be run against production. It is intended only for `Jianlian-shop-test`.
