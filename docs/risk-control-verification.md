# Jianlian Shop Risk Control Verification

## Existing Risk Capability

| Area | Current coverage | Gap fixed in this task |
| --- | --- | --- |
| Account status | `profiles.account_status`, `profiles.risk_status`, `check_user_business_allowed` | Centralized risk service also reads restricted risk status. |
| Orders | Rate limit, account guard, atomic `create_order_with_item` RPC | Server-side order risk evaluation before order/inventory RPC. |
| Inventory | Digital inventory RLS and delivery RPCs | Repeated SKU reservation signal added; inventory deduction remains atomic RPC-owned. |
| Payments | Payment session reuse, payment status machine, reconciliation `risk_level` | Risk check before creating a new payment session. |
| Recharges | Idempotent client request handling and provider abstraction | Risk check before recharge row/provider payment creation. |
| Refunds | Admin after-sales review and amount validation RPC | Refund risk event for bursts and delivered digital goods. |
| Events | `system_error_events`, `admin_audit_logs` | New `risk_events` and `risk_reviews` migration. |

## Coverage Matrix

| Scenario | Server-side check | Event record | Manual review | Hard block |
| --- | --- | --- | --- | --- |
| Large unpaid order burst | Yes | Yes | Medium+ observed | High/critical blocked before order creation |
| Repeated SKU reservation | Yes | Yes | Medium+ observed | High/critical blocked before order creation |
| Payment session burst | Yes | Yes | High requires review | Payment session creation blocked |
| Recharge request burst | Yes | Yes | High requires review | Recharge creation blocked |
| Refund burst | Yes | Yes | High requires review | Critical blocked |
| Delivered digital refund | Yes | Yes | Review event | Does not alter refund facts |
| Restricted account high-risk API | Existing account guard + risk service | Yes when hit | Reviewable | Existing guard can block |

## Unified Risk Service

Implemented in `lib/risk/risk-service.ts`:

- `evaluateRisk`
- `evaluateOrderRisk`
- `evaluatePaymentRisk`
- `evaluateRechargeRisk`
- `evaluateRefundRisk`
- `recordRiskEvent`

The service uses bounded count queries, hashed source summaries, sanitized metadata, and central rule weights. It never stores full IP, token, callback payload, password, secret, or digital inventory content.

## Default Rules

| Rule | Weight | Window | Threshold |
| --- | ---: | ---: | ---: |
| `ACCOUNT_RECENTLY_CREATED_HIGH_VALUE` | 35 | 24h | 1 |
| `ACCOUNT_RESTRICTED_HIGH_RISK_ACTION` | 70 | 5m | 1 |
| `ORDER_UNPAID_BURST` | 35 | 15m | 5 |
| `ORDER_LARGE_QUANTITY` | 30 | 5m | 50 |
| `ORDER_SKU_REPEATED_RESERVATION` | 30 | 30m | 3 |
| `PAYMENT_SESSION_BURST` | 35 | 15m | 6 |
| `PAYMENT_CHANNEL_SWITCHING` | 25 | 30m | 3 |
| `PAYMENT_DUPLICATE_PROVIDER_TRADE` | 95 | 24h | 1 |
| `RECHARGE_REQUEST_BURST` | 35 | 30m | 5 |
| `RECHARGE_DUPLICATE_CLIENT_REQUEST` | 45 | 24h | 1 |
| `REFUND_REQUEST_BURST` | 40 | 24h | 3 |
| `REFUND_RATIO_HIGH` | 35 | 30d | 1 |
| `REFUND_DELIVERED_DIGITAL` | 30 | 30d | 1 |
| `SOURCE_SHARED_BY_ACCOUNTS` | 20 | 24h | 3 |

## Risk Events

Migration to run manually:

`supabase/migrations/20260701_risk_events_reviews.sql`

Creates:

- `risk_events`
- `risk_reviews`

Both tables use RLS. Admins can read/write through server-authenticated admin APIs; regular users cannot read or mutate risk decisions.

## Verification Result

| Required check | Result |
| --- | --- |
| Risk checks execute on server | Implemented in order/payment/recharge/refund APIs. |
| Regular users cannot modify risk results | Risk APIs require super admin; Migration RLS denies normal users. |
| Provider payment facts are not overwritten | Payment callback/provider result code was not changed. |
| No duplicate charge/credit/inventory release logic added | Risk code blocks before creation or records events only. |
| High-risk refunds and delivery can enter review | Events are recorded and visible in `/admin/risk`. |
| Temporary restrictions have expiry | `expires_at` recorded for review/block actions. |
| Logs avoid secrets | Metadata sanitizer drops sensitive keys and truncates strings. |

## Remaining Issues

- The Migration must be executed manually before production risk event persistence works.
- Some rule placeholders are configured but not fully enforced yet, such as payment channel switching and duplicate provider transaction matching.
- Live concurrency and database-write acceptance tests require a configured Supabase environment; they were not executed automatically.
