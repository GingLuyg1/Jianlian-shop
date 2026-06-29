# Jianlian Shop Multi-SKU Verification

Date: 2026-06-29

## Summary

This pass found that the current codebase does not yet contain the real multi-SKU database tables or a cart UI/data flow. The checkout page has a small local SKU-like option map for a few legacy products, but those options are not connected to database SKU records and are only written into the order note.

The implemented fix adds the compatible database foundation and server-side order/delivery safeguards so SKU-aware checkout can safely submit `sku_id` after the migration is executed.

## Database Structure Result

Checked objects:

- `products`: existing single-product catalog table.
- `product_option_groups`: missing before this pass.
- `product_option_values`: missing before this pass.
- `product_skus`: missing before this pass.
- `product_sku_values`: missing before this pass.
- `cart_items`: missing before this pass.
- `order_items`: existed, but lacked `sku_id`, `sku_code`, `sku_title`, `option_snapshot`.
- `digital_inventory`: existed, but lacked `sku_id`.
- `digital_inventory_batches`: existed, but lacked `sku_id`.
- `order_deliveries`: existed, but lacked `sku_id`.

Added migration:

- `supabase/migrations/20260629_multi_sku_core.sql`

The migration adds:

- SKU option group/value tables.
- SKU table and SKU-value mapping table.
- SKU uniqueness constraints:
  - SKU code unique per product when present.
  - Combination key unique per product.
  - One option value per group per SKU.
- Optional `sku_id` compatibility fields on order items, digital inventory, inventory batches and deliveries.
- `cart_items` table with unique `(user_id, product_id, sku_id)` semantics.
- RLS policies for public active SKU reads and admin management.
- A replacement `create_order_with_item` RPC with optional `p_sku_id`.
- A replacement `deliver_digital_order` RPC that only allocates digital inventory matching the order item `sku_id`.

Manual execution order:

1. Execute all existing migrations through `20260623_mixed_order_item_fulfillment.sql`.
2. Execute `20260629_multi_sku_core.sql`.

## Option Groups and Values Result

Current application state:

- No complete admin UI for real `product_option_groups` and `product_option_values` was found.
- No existing CRUD route for those tables was found.

Implemented compatibility:

- Database supports up to 3 active option groups per product through trigger validation.
- Option group names are required.
- Option value names are required.
- Duplicate option values in the same group are blocked by unique index.

Still required:

- Admin product editor UI for option group/value creation, editing, deletion and ordering.
- Audit log wiring for SKU option operations.
- UI warning before deleting option values that affect existing SKUs.

## SKU Combination Result

Current application state:

- No SKU combination generator was found in the admin product editor.

Implemented compatibility:

- `product_skus.combination_key` provides a stable combination identity.
- Unique `(product_id, combination_key)` prevents duplicate combinations.
- `product_sku_values` preserves the exact option values used by a SKU.

Still required:

- Admin combination generator that preserves existing SKU IDs and prices.
- Safe deactivation flow for SKUs referenced by historical orders.

## SKU Save Result

Implemented compatibility:

- `product_skus` supports independent:
  - `sku_code`
  - `sku_title`
  - `price`
  - `original_price`
  - `stock`
  - `status`
  - `delivery_type`
  - `image_url`
  - `sort_order`
  - `note`
  - `metadata`
- Negative price and stock are blocked by database constraints.
- SKU code uniqueness per product is enforced when code is present.

Still required:

- Admin SKU row editor.
- Batch set price/stock/status/delivery type UI.
- SKU save dirty-state reset similar to the product form fix.

## Frontend SKU Selection Result

Current application state:

- Product detail and checkout do not yet read real SKU tables.
- Checkout has local hardcoded options for a few products, but they are not database SKU records.

Implemented compatibility:

- `/api/orders` now accepts optional `sku_id` or `skuId`.
- If `sku_id` is present, the server-side RPC re-reads the real SKU price, stock, status, image and delivery type.
- Frontend price is still not trusted.

Still required:

- Product detail query for option groups, option values and SKU matrix.
- SKU selection UI that sends real `sku_id`.
- Disabled states for invalid, inactive or sold-out SKU combinations.

## Cart and Checkout Result

Current application state:

- No active cart UI/data flow was found.
- Direct checkout remains the active flow.

Implemented compatibility:

- Migration creates `cart_items`.
- Unique cart index distinguishes same product with different SKU and merges the same SKU.
- Server order creation can accept `sku_id` and validates it against the product.

Still required:

- Cart API and UI using `(product_id, sku_id)`.
- Quantity validation against SKU stock.

## Order Snapshot Result

Implemented:

- `order_items` gains:
  - `sku_id`
  - `sku_code`
  - `sku_title`
  - `option_snapshot`
- `create_order_with_item` stores SKU fields and an immutable option snapshot when `p_sku_id` is provided.
- `product_snapshot` also includes SKU snapshot fields.
- `lib/orders/order-types.ts` and `lib/orders/order-queries.ts` now normalize optional SKU snapshot fields without breaking old orders.

Compatibility:

- Old orders with no SKU fields continue to normalize safely.
- Old single-product checkout continues to call the RPC without `p_sku_id`.

## Digital Inventory Result

Implemented:

- `digital_inventory.sku_id`
- `digital_inventory_batches.sku_id`
- `order_deliveries.sku_id`
- SKU-aware inventory indexes.
- `deliver_digital_order` now allocates:
  - only `sku_id = order_item.sku_id` for SKU orders.
  - only `sku_id is null` for legacy single-product orders.

This prevents cross-SKU automatic delivery after SKU inventory is imported with `sku_id`.

Still required:

- Inventory import UI/API must allow selecting a specific SKU.
- Inventory batch and item views should display SKU summaries.

## Automatic Delivery Result

Implemented:

- The replacement `deliver_digital_order` prevents SKU inventory mixing.
- Repeated delivery still depends on existing delivered/reserved inventory state.
- Delivery records now save `sku_id` when available.

Still required:

- Re-verify all admin retry delivery paths after executing the migration in Supabase.
- Extend delivery panels to display SKU summary from order item snapshot.

## Found Issues

1. Real multi-SKU tables were absent.
2. The checkout page had local SKU-like options that were not database-backed.
3. Order items had no SKU snapshot fields.
4. Digital inventory allocation used only `product_id`, which would cause cross-SKU delivery if SKU inventory were added without extra filtering.
5. No cart data model existed for distinguishing SKUs.

## Fixed Issues

1. Added multi-SKU core schema migration.
2. Added SKU fields to order, inventory and delivery compatibility schema.
3. Added cart item schema with SKU-aware uniqueness.
4. Added optional SKU support in order API payload.
5. Added order query/type support for SKU snapshots.
6. Added SKU-aware order creation RPC.
7. Added SKU-aware automatic digital delivery RPC.

## Remaining Issues

These are not completed in this pass because the current project does not yet have the relevant UI/API foundations:

1. Admin option group/value editor.
2. Admin SKU combination generator.
3. Admin SKU row editor and batch operations.
4. Frontend real SKU selector.
5. Cart API/UI.
6. SKU-aware inventory import UI.
7. SKU summary display in admin inventory and delivery panels.

## Build Verification

Run after this document was updated:

- `tsc --noEmit`
- `npm run build`

