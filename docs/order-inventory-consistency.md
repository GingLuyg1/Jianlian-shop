# Order Inventory Consistency

## Reservation Rules

- Single-spec physical/manual products decrement `products.stock` during order creation.
- SKU products decrement `product_skus.stock` during order creation.
- Automatic digital products reserve rows in `digital_inventory` when the table is present.
- Digital inventory reservation stores the order id, order item id, user id, and reserved timestamp.
- Order creation runs inside the database function transaction; failures roll back the order and stock changes.

## Release Rules

`public.release_order_inventory(order_id, reason)` is the shared release function.

It releases stock only when:

- the order is not paid,
- the order is not fulfilled,
- the reservation has not already been released,
- the relevant order item has no delivered delivery record.

It does not restore delivered digital inventory to `available`.

## Idempotency

- `orders.reservation_released_at` prevents duplicate release.
- `orders.user_id + client_request_id` prevents duplicate order creation.
- User cancellation and internal expiration both call the same release function.

## Remaining Database Test Needs

The SQL migration should be tested with:

- single-spec order creation,
- SKU order creation,
- concurrent last-stock checkout,
- cancellation release,
- expiration release,
- delivered digital inventory not released.
