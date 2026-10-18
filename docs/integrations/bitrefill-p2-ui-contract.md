# Bitrefill P2 customer order contract (local integration)

This documents the existing API; it introduces no UI fields or public supplier
endpoint. P2 uses synthetic orders, FakeTransport and disposable PostgreSQL only.
Production schema parity and live child/cost evidence remain pending.

The frontend calls Jianlian's existing authenticated order APIs only. It must
never call Bitrefill directly, receive a supplier API key/Authorization header,
or treat a browser payment-success event as authority to purchase or deliver.
Payment `paid` and fulfillment `processing` are independent: successful payment
does not mean the supplier card is ready. Pending means no delivered secret;
Partial means some exact order items are delivered; Delivered for the whole
order requires all relevant item states/fulfillment aggregation to agree.

## Existing endpoints

- `GET /api/orders` and `GET /api/orders/{orderNo}`: authenticated owner order
  data through `lib/orders/order-queries.ts`. Preserve `payment_status`, `status`,
  `fulfillment_status` and existing `order_items` delivery fields. These responses
  are not supplier purchase evidence and must never trigger purchase themselves.
- `GET /api/orders/{orderNo}/delivery`: `auth.getUser()`, account restriction
  check, then `get_order_delivery_for_user(p_order_no)` using the user's client.
  Never query private secrets with a browser/service-role key.
  Response is `{ status: "pending" | "delivered", deliveries: [...] }`.
  Each delivery exposes `id`, `product_name`, `delivery_status`, `delivery_type`,
  `delivered_at`, `viewed_at`, `masked_content`, `content`, `delivery_note`.
  `content` is the existing private delivery payload, possibly a JSON string
  with `code`, `pin`, `url`, `instructions`; do not log it or persist it in
  analytics. The route sets `Cache-Control: no-store`, `Pragma: no-cache`.
- Errors retain existing contracts: missing login 401, unpaid/access-blocked 403,
  absent/not-owner order 404, temporary database failure 500 plus request ID.
- `POST /api/refunds`: existing guarded `create_refund_request` flow. P2 does
  not create an automatic supplier refund, customer credit or dispute resolver.

## Display mapping

| Existing persisted field | Meaning for UI |
| --- | --- |
| `orders.payment_status=unpaid` | Payment pending; no fulfillment or secret access |
| item `delivery_status=pending` | Waiting for existing fulfillment workflow |
| root `PURCHASING` | Claimed or supplier work pending; not proof of a debit |
| purchase attempt `SUBMITTING` / `UNCERTAIN` | Internal manual-review condition; never offer “buy again” |
| external child `PENDING` / `PROCESSING` | Supplier processing, continue bounded existing polling |
| item `delivery_status=delivered` | Private delivery transaction committed |
| `delivery_completed_at` / delivery `delivered_at` | Completion time; do not invent from invoice creation time |
| item `delivery_status=failed`, `delivery_failure_reason` | Existing failure message; use existing support entry |
| root `FAILED`, `FAILED_VALIDATION`, `NEEDS_INPUT`, `RECONCILIATION`, `UNCERTAIN` | Existing internal states; no new customer enum |

The existing delivery route sets its top-level `status=delivered` if **any**
delivery row is delivered. That does not prove a multi-item order is complete;
use item states and `fulfillment_status` for whole-order presentation. P2 does
not change `orders.status` to `completed`: the existing refresh helper controls
fulfillment aggregation, and its production definition still needs DB8 parity.

No existing API exposes a dedicated supplier manual-review status to customers.
Use the current pending/failure/support presentation; a future extra field needs
its own reviewed API change. Do not expose invoice IDs, procurement cost,
semantic hashes, service-role data, or webhook payloads in customer UI.

## Permissions and evidence limitations

Repository `20260810190000_user_delivery_compatibility.sql` checks `auth.uid()`,
order ownership, paid state and forbidden order states before reading the
existing private secret store. Production's authoritative definition has not
been asserted by P2. Local DB5 tests verify private storage/atomicity and RLS.
P2 additionally runs the repository owner-query RPC with owner, other-user and
anonymous identities; it does not boot a logged-in browser or prove a
Production HTTP response.
Refunded/disputed orders use the existing access and manual-after-sales policy;
the UI must not infer a new supplier refund capability.
