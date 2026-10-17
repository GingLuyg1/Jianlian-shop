# Bitrefill P3 UI handoff — backend contract only

Local-only, 2026-10-16. No UI implementation, public API change, supplier binding,
Production configuration or enabled purchase worker accompanies this document.
Read with `bitrefill-p2-ui-contract.md`; P3 adds server-side guards, not a second
order status machine. Payment success and card availability remain independent.

## Existing customer APIs

| API / field | Presentation contract |
| --- | --- |
| `GET /api/orders`, `GET /api/orders/{orderNo}` | Existing authenticated owner queries; retain `status`, `payment_status`, `fulfillment_status` and item delivery fields |
| `payment_status=unpaid` | Waiting for payment; do not trigger fulfillment from the browser |
| Paid + pending item | Paid, processing delivery; not an instruction to pay again |
| Delivered item, other items pending/failed | Partial delivery; show each item independently |
| Aggregate fulfillment delivered + all relevant items delivered | Whole-order delivered; do not infer this from the supplier invoice |
| `delivery_status=failed` / failure reason | Existing safe failure/support presentation; no automatic refund promise |
| `GET /api/orders/{orderNo}/delivery` | Owner-authorized private delivery; never fetch private tables directly |

The delivery route returns `{status: "pending" | "delivered", deliveries: [...]}`.
Each delivery has `id`, `product_name`, `delivery_status`, `delivery_type`,
`delivered_at`, `viewed_at`, `masked_content`, `content`, `delivery_note`.
Important: its top-level `delivered` means **any** delivered row, not necessarily
the entire order. The actual delivery timestamp must come from the delivery row.
`content` may contain the existing JSON payload with `code`, `pin`, `url`,
`instructions`; render safely as data, not HTML. Do not send it to logs,
analytics, error reports, browser persistence or shared caches.

The route uses `auth.getUser()`, the existing account business restriction check
and `get_order_delivery_for_user`. It sends `Cache-Control: no-store`,
`Pragma: no-cache` and `X-Content-Type-Options: nosniff`. Missing login is 401;
unpaid/forbidden order state is 403; missing/not-owner is 404; temporary storage
failure is 500 with request ID. Retain existing handling rather than add a
service-role fallback. Local tests run the repository owner RPC as owner,
another customer and anonymous. They do not prove a Production HTTP session.

## Procurement and manual-review semantics

These are existing **internal** states, not new customer API enums:

| Internal state | Operator meaning / safe customer message |
| --- | --- |
| Root `PURCHASING`, attempt `CLAIMED` | Reserved logical work; not proof supplier funds were debited / processing |
| Attempt `SUBMITTING` | Submit boundary persisted; never offer customer/operator “buy again” |
| Root/attempt `UNCERTAIN` | Possibly submitted or child identity unverified / processing, contact support |
| Root `FAILED_VALIDATION`, retryable false | Cost/quote/balance guard blocked before purchase / needs manual handling |
| Child `PENDING` / `PROCESSING` | Supplier GET has not confirmed usable redemption / still processing |
| Root `FULFILLED`, delivered item | Existing private delivery transaction committed |
| Root `FAILED`, `NEEDS_INPUT`, `RECONCILIATION` | Use existing failure/input/support workflow; no invented refund or SLA |

No customer API currently exposes a dedicated procurement manual-review enum.
The UI must not infer it from an internal invoice ID or expose cost, semantic
hash, supplier balance, API credentials or webhook payload. A future explicit
safe customer status would require a separately reviewed API change.
Use the site's existing support entry, referencing the Jianlian order number
and safe request ID only. Do not request card/PIN or API keys in ordinary chat.

## Operator follow-up (not implemented here)

Existing admin `retry_auto_delivery` calls the normal delivery service; the
active supplier registry remains Daju-only. Existing Daju reconciliation is
not a Bitrefill manual-purchase button. P3 creates no Bitrefill admin endpoint,
UI panel or privilege bypass. A future read-only procurement panel needs the
existing admin authorization/audit controls and safe IDs/state/error codes.

- Missing/expired cost or insufficient/unknown supplier balance: stop; review
  trusted quote/funding outside this application. Never debit the customer twice.
- Unknown submission without invoice ID: investigate with supplier support;
  do not reset the attempt, delete its uniqueness evidence or send another POST.
- Known invoice: use only separately authorized bounded GET reconciliation.
- Invalid/multiple/wrong child: stop automatic delivery and verify identity;
  invoice `complete` does not resolve the mismatch.
- Delay, invalid-card complaint, cancellation/refund/dispute: follow existing
  order permissions and after-sales policy; no automatic supplier repurchase,
  balance credit or refund. Preserve private evidence without logging secrets.

The frontend never calls Bitrefill, supplies `paid=true`, chooses supplier child
identity or receives Bitrefill Key/Authorization. Read-only customer refresh is
not purchase authority. No polling schedule or UI code was added this round.
