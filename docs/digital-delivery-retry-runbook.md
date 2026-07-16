# Digital Delivery Retry Runbook

## When To Retry

Retry only when:

- the order is paid
- the order contains automatic digital delivery items
- the order is not cancelled, expired, refunded, or failed
- the delivery failed because reserved inventory was unavailable or a transient database error occurred

Do not retry to simulate payment success.

## Retry Path

Use the existing admin order action:

`retry_auto_delivery`

The server calls:

`deliverDigitalOrder(admin.supabase, orderId, "admin_retry")`

The database function is idempotent. Already delivered items are skipped.

## Manual Review

If retry fails because no reserved inventory remains:

1. Confirm the order is paid.
2. Confirm the order item delivery status.
3. Check `delivery_logs` for safe failure summaries.
4. Check `digital_inventory` reservation ownership without copying raw content into logs.
5. If manual content must be provided, use the manual delivery endpoint and record a reason.

## Cancellation And Expiration

Cancellation and expiration only release `reserved` inventory owned by the order. They must not restore delivered rows.

## Failure Classification

Recoverable:

- temporary database failure
- missing delivery aggregation status
- reserved inventory temporarily locked

Manual review:

- reserved inventory is insufficient
- order/item status conflict
- inventory ownership mismatch

Not recoverable by retry:

- order is unpaid
- order is cancelled or expired
- inventory has already been delivered to another order

## Verification After Retry

Check:

- `order_items.delivery_status`
- `order_items.delivered_quantity`
- `order_deliveries.delivery_status`
- `digital_inventory.status`
- `digital_inventory.delivered_order_id`
- `delivery_logs`

Do not paste raw digital inventory content into incident tickets, audit notes, or chat.
