# Digital Delivery Security

## Sensitive Content

Digital inventory may contain card keys, accounts, passwords, redemption codes, PINs, links, serial numbers, or notes.

Security rules:

- Public catalog APIs must not query `digital_inventory.content`.
- Checkout must not return `digital_inventory.content`.
- Unpaid orders must not return delivery content.
- User delivery APIs only return content for the authenticated user's paid order.
- Delivery content is returned with `Cache-Control: no-store`.
- Raw content must not be written to server logs, audit logs, Request ID logs, or browser localStorage.

## Storage Model

`digital_inventory.content` is the original stock secret.

Successful deliveries create:

- `order_deliveries` row with metadata and `encrypted_content = stored_in_private_table`.
- `digital_delivery_secrets` row with the actual content.

The user-facing RPC joins secrets only after:

1. user is authenticated
2. order belongs to the user
3. order is paid
4. order is not cancelled, expired, or failed
5. delivery is already marked delivered

## User APIs

- `GET /api/orders/[orderNo]/delivery`
- `GET /api/orders/[orderNo]/fulfillment`

Both set:

- `Cache-Control: no-store, max-age=0`
- `Pragma: no-cache`
- `X-Content-Type-Options: nosniff`

## Admin Access

Admin inventory and manual delivery operations require the existing server-side admin context. Ordinary users must not call admin inventory or manual delivery APIs.

Admin audit entries should record:

- action
- target ids
- result
- reason or safe error
- whether delivery content was present

They must not store the actual digital secret.

## Known Verification Points

- `order_deliveries_delivered_inventory_uidx` prevents one inventory row from being delivered more than once.
- `deliver_digital_order` requires service role or admin.
- `get_order_delivery_for_user` and `get_order_fulfillment_for_user` filter by `orders.user_id = auth.uid()`.
- `digital_delivery_secrets` RLS denies direct client reads and writes.
