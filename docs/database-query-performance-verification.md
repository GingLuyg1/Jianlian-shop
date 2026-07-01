# Jianlian Shop Database Query Performance Verification

Last updated: 2026-07-01

## Scope

This audit covers database query patterns, pagination, sorting, aggregation, indexing, slow request logging, and the new admin performance page. No production SQL was executed and no production load test was run.

## High-frequency Query Inventory

| Area | Entry | Tables | Filters / Sorting / Pagination | Risk |
| --- | --- | --- | --- | --- |
| Homepage products | `/`, `/api/catalog/products` | `products`, `categories`, `product_skus`, `order_items`, `orders` | category, status, search, sort, page/pageSize | Medium: joins and SKU aggregation need indexes. |
| Category products | `/products/*`, `/api/catalog/products` | `products`, `categories`, `product_skus` | category slug/id, status, sort_order | Medium: descendant category lookups must not loop per product. |
| Product detail | `/products/[id]` | `products`, `categories`, `product_skus` | id/slug exact lookup | Low if slug/id index exists. |
| Admin product list | `/admin/products`, `/api/admin/catalog/products` | `products`, `categories`, `product_skus`, `media_assets` | search, category, status, delivery, sort, page | Medium: search must be bounded. |
| Category three-column admin | `/admin/categories` | `categories`, `products`, `product_skus` | parent_id, selected category, status | Medium: product panel must be paginated for large categories. |
| Order list | `/admin/orders`, `/api/admin/orders` | `orders`, `order_items`, `profiles` | status, payment_status, delivery_type, dates, search, page | Medium: needs user/date/status indexes. |
| Order detail | `/admin/orders/[id]`, drawer APIs | `orders`, `order_items`, `order_deliveries`, `payment_sessions`, `refund_requests`, `admin_audit_logs` | order_id exact | Low/Medium: modules should load independently. |
| User orders | `/account/orders`, `/api/orders` | `orders`, `order_items` | current user, status, search, page | Low with `orders(user_id, created_at)`. |
| Payments | `/admin/payments`, payment APIs | `payment_sessions`, `payment_callback_logs`, `orders` | status, channel, date, payment_no | Medium: callback logs can grow quickly. |
| Recharges | `/admin/recharges`, `/api/recharges` | `account_recharges`, `payment_sessions` | user, channel, status, date, page | Medium. |
| Refunds | `/admin/refunds`, `/api/refunds` | `refund_requests`, `orders`, `profiles` | status, method, search, date | Medium. |
| User list/detail | `/admin/users`, `/api/admin/users` | `profiles`, `orders`, `account_recharges`, `balance_transactions` | search, role, status, page | Medium: detail modules should be limited. |
| Digital inventory | `/admin/inventory`, `/api/admin/inventory` | `digital_inventory`, `digital_inventory_batches`, `products`, `product_skus` | product, sku, status, batch, page | High: sensitive and potentially large. |
| Delivery records | order detail, inventory detail | `order_deliveries`, `digital_inventory` | order_id, item_id, user_id | Medium. |
| Audit logs | `/admin/audit-logs` | `admin_audit_logs` | admin, action, target, date, page | High: append-only table needs strict date/page limits. |
| System errors | `/admin/system-errors` | `system_error_events` | category, level, status, route, date, page | Medium. |
| Global search | `/api/admin/global-search` | products, skus, orders, users, payments | keyword exact/fuzzy | High: must limit keyword length and result count. |
| Reports | `/admin/reports` | orders, payments, refunds, products, inventory | date range, type | High: should not load unlimited history. |

## Performance Risk Matrix

| Risk | Status | Evidence | Recommendation |
| --- | --- | --- | --- |
| Unbounded list reads | PARTIAL | Most list APIs use page/pageSize. Reports and admin detail modules need continued review. | Cap page size and date span on large tables. |
| N+1 order list queries | PARTIAL | Order query service centralizes order reads; detail modules use separate APIs. | Keep list summary separate from detail payloads. |
| Frontend filtering after large fetch | RISK | Some admin pages still need manual review for client-only filtering. | Move large filters to API query params. |
| Product/SKU search full scan | RISK | `ilike %keyword%` appears in search paths. | Add trigram/full-text only if search scale requires it; otherwise limit keyword and count. |
| Audit/system log growth | RISK | Append-only tables exist. | Enforce date filters, max page size, retention/archival. |
| Dashboard/report aggregation in Node | RISK | Reports aggregate multiple tables in server code. | Use database grouped aggregates or materialized rollups for production scale. |
| Performance logging leaks sensitive data | PASS | New tooling records operation, route, duration, count, status only. | Keep SQL/user input out of logs. |
| Performance page public access | PASS | `/api/admin/system/performance` uses `requireApiAdmin`. | Keep admin-only. |

## Fixes Implemented

1. Added `lib/monitoring/performance.ts`:
   - `withPerformanceTrace`
   - `measureQuery`
   - safe slow request recording wrapper
   - no raw SQL, no full user input, no secrets

2. Updated `recordPerformance` in `lib/monitoring/logger.ts`:
   - stores `duration_ms`, `route`, and `method` in sanitized metadata
   - keeps performance logging non-blocking for business requests

3. Added `/api/admin/system/performance`:
   - admin-only
   - paginated
   - max `pageSize = 100`
   - safe filters for route, operation, level, and time
   - summary uses at most the latest 500 events

4. Added `/admin/system/performance`:
   - admin-only through existing admin layout
   - shows slow request count, average, P95, errors, top routes, and recent events
   - no SQL or sensitive payloads displayed

5. Added `20260701_query_performance_indexes.sql`:
   - idempotent
   - uses table existence checks
   - creates targeted indexes for high-frequency query patterns
   - must be executed manually after backup

## Pagination and Boundary Rules

Recommended baseline:

| Parameter | Rule |
| --- | --- |
| `page` | Integer, min 1. |
| `pageSize` / `page_size` | Default 20, max 100 for normal pages. |
| `sort_by` | Whitelist only. |
| `sort_order` | `asc` or `desc` only. |
| `keyword` | Trim, max 80-120 chars by use case. |
| Date span | Large tables should cap broad analytics ranges or require export jobs. |
| Cursor pagination | Prefer for audit logs, payment callbacks, inventory, visitor events at high volume. |

## Known Remaining Issues

| Issue | Severity | Notes |
| --- | --- | --- |
| Real DB `EXPLAIN ANALYZE` not executed | BLOCKED | Supabase SQL execution was intentionally not performed. |
| Production index state unknown | BLOCKED | Requires manual Supabase inspection. |
| Browser runtime performance not measured | BLOCKED | No dev/staging server was started in this task. |
| Search uses broad `ilike` in some paths | P1 | Limit count and consider trigram/full-text later. |
| Reports may still aggregate large datasets in Node | P1 | Use grouped database aggregates or rollups before high traffic. |

## Test Result

To be used with:

```powershell
node --test tests/unit/catalog-logic.test.mjs tests/unit/order-payment-logic.test.mjs tests/unit/inventory-permission-logic.test.mjs tests/regression/core-logic.test.mjs tests/regression/source-contract.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

Runtime/browser checks remain manual or staging-only.

