# Digital Inventory Lifecycle

## Real Tables

- `digital_inventory`: one row per digital stock secret.
- `digital_inventory_batches`: import batch summary.
- `orders`: order header.
- `order_items`: purchased item snapshot and delivery status.
- `order_deliveries`: delivery record.
- `digital_delivery_secrets`: private delivery content linked by `delivery_id`.
- `delivery_logs`: operational delivery events without raw secrets.
- `order_item_delivery_logs`: status history for order item delivery.

## Inventory Fields

Important `digital_inventory` fields:

- `id`
- `product_id`
- `sku_id`
- `content_type`
- `content`
- `content_hash`
- `status`
- `batch_id`
- `batch_no`
- `order_id`
- `reserved_order_id`
- `reserved_order_item_id`
- `reserved_user_id`
- `reserved_at`
- `delivered_order_id`
- `delivered_order_item_id`
- `delivered_user_id`
- `delivered_at`
- `expires_at`
- `created_at`
- `updated_at`

## Status Values

Current compatible status set:

- `available`
- `reserved`
- `delivered`
- `disabled`
- `expired`
- `invalid`

Rules:

- Only `available` can be reserved during order creation.
- Only `reserved` rows owned by the same order and order item can be delivered automatically.
- `delivered` rows must not be restored to `available` by cancellation, expiration, or refund logic.
- `disabled`, `expired`, and `invalid` rows are not eligible for new orders.

## Digital Product Identification

The server decides digital delivery by normalizing `order_items.delivery_type` through `normalize_order_item_delivery_type(text)`.

Values mapped to automatic delivery:

- `automatic`
- `auto`
- `auto_delivery`
- `card`
- `account`
- `digital`

The frontend submitted `delivery_type` is not trusted for final order creation. `create_order_with_item` re-reads product and SKU data server-side.

## Reservation

During `create_order_with_item`:

1. The product/SKU is locked and validated.
2. The requested quantity is checked against available `digital_inventory`.
3. Exactly `quantity` rows are selected with `FOR UPDATE SKIP LOCKED`.
4. Rows are marked `reserved`.
5. Rows are linked to `order_id`, `reserved_order_id`, `reserved_order_item_id`, and `reserved_user_id`.

Retries with the same `client_request_id` return the existing order and do not reserve more inventory.

## Delivery

Payment completion eventually calls `deliverDigitalOrder()` which calls `deliver_digital_order`.

The hardened rule is:

1. Order must be `payment_status = paid`.
2. Order status must not be `cancelled`, `expired`, `refunded`, or `failed`.
3. The function only consumes `digital_inventory.status = reserved` rows for the same order and order item.
4. Delivered content is stored in `digital_delivery_secrets`.
5. `order_deliveries.encrypted_content` remains a placeholder and does not duplicate raw content.

## Release

Cancellation and expiration release only `reserved` rows that still belong to the order. Delivered inventory is never released.

Manual SQL execution is required for:

`supabase/migrations/20260709_digital_delivery_reserved_fulfillment_hardening.sql`
