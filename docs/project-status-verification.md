# Jianlian Shop Project Status Verification

Date: 2026-06-30

This document is the unified acceptance record for currently implemented code. A page or prompt is not treated as completed unless the page, API/service path, and required database structure are all present and verifiable.

## Current Actual Completion

- Completed: 8 functional areas.
- Partial: 10 functional areas.
- Blocked: 1 functional area.
- Not configured: 2 functional areas.
- Cancelled/out of scope: shopping cart and support tickets.
- Local testing: allowed for completed and partial areas only.
- Test environment deployment: allowed only after migrations are manually executed and recorded.
- Production deployment: not allowed.
- Real payment collection: not allowed because real Provider adapters are not configured.

## Feature Matrix

| Feature | Status | Pages | APIs/services | Tables | Current conclusion |
| --- | --- | --- | --- | --- | --- |
| Frontend home | completed | `/` | `/api/settings/public`, `/api/catalog/products` | `products`, `categories`, `site_settings` | Public page and catalog loaders exist. |
| Product categories | completed | `/products/*`, `/admin/categories` | catalog/category services | `categories`, `products` | Frontend and admin category flow exists. |
| Product search | partial | `/products/*` | `/api/catalog/products` | `products`, `categories` | Works at current scale; database-side search is still recommended for large catalogs. |
| Product detail | partial | `/products/[id]` | public catalog service | `products`, `product_skus` | Single-product detail exists; real SKU matrix is incomplete. |
| Single-SKU products | completed | `/products/[id]`, `/checkout` | `/api/orders` | `products`, `orders`, `order_items` | Legacy direct purchase remains compatible without `sku_id`. |
| Multi-SKU products | blocked | `/products/[id]`, `/admin/products` | `/api/orders`, delivery service | `product_option_groups`, `product_option_values`, `product_skus`, `product_sku_values`, `order_items.sku_id` | Database compatibility exists, but SKU editor and real frontend SKU selector are incomplete. |
| Direct purchase | partial | `/checkout`, `/payment`, `/order-success` | `/api/orders`, payment session service | `orders`, `order_items`, `payment_sessions` | Order creation exists; payment is Provider-blocked. |
| Order confirmation | completed | `/checkout`, `/order-success`, `/my-orders` | order APIs | `orders`, `order_items` | Create/list/detail paths exist. |
| Cashier | not_configured | `/payment` | payment provider/session service | `payment_channels`, `payment_sessions` | Cannot collect real money. |
| Register/login | completed | `/register`, `/login`, `/auth/callback` | account profile API | `profiles` | Supabase auth flow exists. |
| Password recovery | completed | `/forgot-password`, `/reset-password` | Supabase auth | `auth.users` | Reset pages exist. |
| User center | completed | `/account`, `/account/security`, `/account/privacy` | account/privacy APIs | `profiles`, `privacy_requests` | Privacy controls require 20260630 migration. |
| User orders | completed | `/my-orders`, `/order-tracking` | order/fulfillment APIs | `orders`, `order_items`, `order_deliveries` | User order lookup exists. |
| Recharge | partial | `/products/account-recharge`, `/admin/recharges` | admin recharge/payment APIs | `account_recharges`, `balance_transactions`, `payment_sessions` | Real settlement remains Provider-blocked. |
| Balance ledger | partial | `/account` | `/api/account/balance-transactions` | `balance_transactions`, `profiles.balance` | Ledger exists; duplicate settlement needs staging verification. |
| Refunds | partial | `/account/refunds`, `/admin/refunds` | refund APIs | `refund_requests`, `refund_status_logs`, `site_notifications` | Flow exists; over-refund and permission tests remain unverified. |
| Digital inventory | partial | `/admin/inventory` | `/api/admin/inventory` | `digital_inventory`, `digital_inventory_batches` | Import/list paths exist; SKU-aware import UI remains incomplete. |
| Automatic delivery | partial | `/my-orders`, `/admin/orders` | delivery APIs/RPCs | `order_deliveries`, `digital_inventory` | Delivery integration exists; duplicate callback and SKU isolation tests remain unverified. |
| Admin dashboard | completed | `/admin` | `/api/admin/reports` | `orders`, `profiles`, `payment_sessions` | Admin shell and dashboard exist. |
| Product management | partial | `/admin/products` | admin catalog APIs | `products`, `categories`, `media_assets` | Save API requires returned DB row and verifies persisted fields; browser behavior still needs manual test. |
| Payment management | not_configured | `/admin/payments`, `/admin/recharges` | payment admin APIs | `payment_channels`, `payment_sessions`, `payment_reconciliations` | Console exists; Provider adapters are placeholders. |
| Reports | partial | `/admin/reports` | report service | `orders`, `profiles`, `payment_sessions` | Accuracy depends on real migrations and settlement data. |
| Shopping cart | cancelled | none | none | `cart_items` | Explicitly out of current scope. |
| Support tickets | cancelled | none | none | `support_tickets`, `support_ticket_messages` | Explicitly cancelled. |

## Product Save Chain

Current code conclusion: code-fixed, needs manual browser verification.

- `app/api/admin/catalog/products/[productId]/route.ts` updates `products`, then calls `.select(PRODUCT_FIELDS).maybeSingle()`.
- If the update affects 0 rows or no row is returned, the API returns failure instead of reporting success.
- `verifyPersistedProduct(data, payload)` checks that returned database fields match the submitted payload.
- The API returns the persisted product record to the client.
- `app/admin/products/page.tsx` rebuilds the form from the returned saved product, resets the initial dirty snapshot, closes the dialog and reloads products/categories after save.
- `tests/unit/catalog-logic.test.mjs` verifies normalized dirty comparison and product payload validation.
- Remaining risk: real browser account behavior, category column refresh, reopen-after-save, and full page refresh still require manual verification.

## Multi-SKU Status

Current code conclusion: blocked for production SKU products.

- Required tables/fields: `product_option_groups`, `product_option_values`, `product_skus`, `product_sku_values`, `digital_inventory.sku_id`, `order_items.sku_id`, SKU snapshot fields.
- Migration: `supabase/migrations/20260629_multi_sku_core.sql`.
- Server compatibility: `/api/orders` accepts optional `sku_id`; delivery RPC migration is SKU-aware.
- Missing: admin SKU editor, option matrix generator, frontend selector, SKU-aware inventory import UI.
- Single-SKU products remain compatible and should stay enabled.

## Payment Provider Status

Current code conclusion: not configured.

- `lib/payments/providers.ts` exposes Provider interfaces but every concrete provider currently throws `PaymentProviderError`.
- Payment sessions and callbacks must not be treated as real collection readiness.
- Real collection requires a configured provider, signed callback verification, query/close/reconciliation tests, and staging records.

## Current Launch Recommendation

- Local manual testing: yes, for completed/partial areas only.
- Test environment deployment: yes, after manual migration execution and registration.
- Production launch: no.
- Real payment collection: no.

## 2026-06-30 P0/P1集中修复结果

本轮新增本地测试：

- `tests/unit/catalog-logic.test.mjs`
- `tests/unit/order-payment-logic.test.mjs`
- `tests/unit/inventory-permission-logic.test.mjs`

测试覆盖：

- 商品保存输入校验、dirty 状态归一、SKU 组合去重和保留已有 SKU。
- 订单金额只按服务端价格计算，`client_request_id` 幂等返回同一订单。
- Provider 未配置、金额不一致、币种不一致均拒绝支付回调。
- 充值回调重复执行不会重复入账。
- 数字库存按 SKU 隔离，库存预留/交付幂等，已交付库存不可释放。
- 匿名管理员接口返回 401，普通用户管理员接口返回 403，跨用户资源访问返回 403。

最新结论：

- 商品保存链路的代码级 P0 已修复；真实管理员浏览器验证仍不能省略。
- 多 SKU、订单 RPC 幂等、库存/RLS、支付/充值/自动发货仍依赖 migration 和 staging 数据验证。
- Provider 未配置仍是正式收款 P0。
