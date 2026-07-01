# Order Expiration Job Runbook

Date: 2026-07-01

## Purpose
Close overdue unpaid orders, expire local payment sessions, and release stock reservations safely.

## Preconditions
- Execute `supabase/migrations/20260701_order_expiration_inventory_release.sql`.
- Configure one server-side secret:
  - `ORDER_EXPIRATION_JOB_SECRET`, or
  - `INTERNAL_JOB_SECRET`

## Endpoint
`POST /api/internal/orders/expire`

Headers:

- `x-internal-job-secret: <secret>` or `Authorization: Bearer <secret>`

Body:

```json
{
  "limit": 50,
  "reason": "scheduled_timeout"
}
```

## Expected response
```json
{
  "requestId": "...",
  "processed": 1,
  "skipped": 0,
  "failed": 0,
  "results": []
}
```

## Operational rules
- Do not expose the endpoint publicly without the secret header.
- Do not run with unlimited batch size.
- A single failed order does not stop the batch.
- Re-running the job is safe and should not double-release inventory.
- Paid or delivered orders are skipped.

## Manual admin handling
Use the existing admin order action API with action `expire_unpaid_order` and a mandatory reason. This path writes audit logs and calls the same server service.

## Troubleshooting
- `订单超时任务密钥未配置`: configure the server-side secret.
- `LIST_FAILED`: migration may be missing or database permissions are incomplete.
- `SKIPPED_PAID_OR_FINAL`: order has already moved beyond unpaid pending state.
- `NOT_DUE`: order has not reached `payment_expires_at`.
