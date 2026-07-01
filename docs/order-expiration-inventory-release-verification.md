# Order Expiration and Inventory Release Verification

Date: 2026-07-01

## Current logic before this change
- Direct purchase order creation deducts product or SKU stock immediately.
- Payment sessions have `expires_at`, but there was no single protected order-expiration job that closes overdue unpaid orders and releases reservations.
- Existing `release_order_inventory` covers reserved digital inventory, but ordinary product/SKU stock needed a release guard for unpaid timeout paths.

## Added migration
Manual SQL file:

- `supabase/migrations/20260701_order_expiration_inventory_release.sql`

It adds:

- `orders.payment_expires_at`
- `orders.expired_at`
- `orders.reservation_released_at`
- `orders.reservation_release_reason`
- `public.expire_unpaid_order(order_id, reason)`
- `public.list_expirable_unpaid_orders(limit)`
- `trg_orders_set_payment_expiration`

## Unified effective-time rules
- Default payment timeout: `ORDER_PAYMENT_TIMEOUT_MINUTES`, default 30 minutes.
- Database trigger sets `payment_expires_at` for new pending unpaid orders.
- Historical rows without `payment_expires_at` are scanned as `created_at + 30 minutes`.
- Server time is authoritative; frontend countdowns are display-only.

## Expiration service
- `lib/orders/order-expiration.ts` calls service-role RPCs only on the server.
- `expireUnpaidOrder` handles one order idempotently.
- `processExpiredOrders` processes a bounded batch and isolates per-order failures.
- `app/api/internal/orders/expire/route.ts` exposes a protected internal task endpoint.

## Inventory release behavior
- Product stock is restored from `order_items.quantity` for non-digital single-spec items.
- SKU stock is restored to the original `sku_id` from `order_items`.
- Reserved digital inventory is restored to `available` only when it belongs to the current order and was not delivered.
- `orders.reservation_released_at` prevents duplicate release on repeated execution.
- Delivered digital inventory is never restored.

## Payment-session behavior
- Pending/processing order payment sessions are marked `expired` with `closed_at`.
- Paid sessions cause the order expiration RPC to skip the order.
- Provider close is intentionally not required in this migration because real Providers are not connected; the Provider-close hook remains in the payment session service.

## Concurrency handling
- `expire_unpaid_order` locks the order row with `FOR UPDATE`.
- It rechecks `payment_status`, order status, and paid payment sessions before releasing inventory.
- Paid/final orders are skipped.
- Repeated calls return stable skip/already-closed results.

## Backend manual handling
- Existing admin order action API accepts `expire_unpaid_order` with a required reason.
- The action calls the same `expireUnpaidOrder` service and writes `admin_audit_logs`.
- It does not expose free-form arbitrary status mutation.

## Internal task authentication
- Endpoint: `POST /api/internal/orders/expire`
- Header: `x-internal-job-secret: <ORDER_EXPIRATION_JOB_SECRET>` or `Authorization: Bearer <INTERNAL_JOB_SECRET>`
- Batch limit is clamped to 1-200.
- Response returns counts and safe order ids/order numbers only; no user contact, payment secrets, or delivery content.

## Required manual migration
1. `supabase/migrations/20260701_order_expiration_inventory_release.sql`

## Required manual scheduled task
Configure an external scheduler or server Cron manually after deployment, for example every 5 minutes:

```bash
curl -X POST https://www.jianlian.shop/api/internal/orders/expire \
  -H "Content-Type: application/json" \
  -H "x-internal-job-secret: $ORDER_EXPIRATION_JOB_SECRET" \
  -d '{"limit":50,"reason":"scheduled_timeout"}'
```

Do not store the secret in frontend code.

## Remaining items
- Checkout/payment pages should display `payment_expires_at` and refresh server status when countdown reaches zero.
- If a real Provider supports final query-before-close, wire it into `expireUnpaidOrder` before releasing orders with provider sessions.
