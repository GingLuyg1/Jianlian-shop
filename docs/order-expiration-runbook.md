# Order Expiration Runbook

## Scope

This runbook covers unpaid order expiration only. It does not process payment callbacks, refunds, or provider reconciliation.

## Manual Internal API Test

Use only in a configured test environment:

```bash
curl -X POST http://localhost:3000/api/internal/orders/expire \
  -H "Content-Type: application/json" \
  -H "x-internal-job-secret: <test-job-secret>" \
  -d '{"limit":20,"reason":"manual_test"}'
```

Expected response fields:

- `processed`
- `skipped`
- `failed`
- per-order `code`
- released inventory counters

## Database RPCs

- `public.list_expirable_unpaid_orders(limit)`
- `public.expire_unpaid_order(order_id, reason)`
- `public.release_order_inventory(order_id, reason)`

## Safety Checks

- Paid orders are skipped.
- Cancelled orders are skipped.
- Already expired orders are idempotent.
- Expired orders are not deleted.
- Release failure for one order is returned for that order and does not stop the whole batch.

## Before Production Scheduling

1. Confirm `ORDER_EXPIRATION_JOB_SECRET` or `INTERNAL_JOB_SECRET` exists.
2. Confirm migration `20260709_order_lifecycle_non_payment_hardening.sql` has executed.
3. Test one known unpaid order in a non-production database.
4. Confirm stock returns after expiration.
5. Confirm paid orders are not touched.
