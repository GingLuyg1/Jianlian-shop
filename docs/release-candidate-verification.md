# Jianlian Shop Release Candidate Verification

Date: 2026-06-30
Scope: final release-candidate readiness review from the current codebase. This report is based on static code, migrations, existing verification docs, and build/type checks. It does not claim that Supabase production has executed every migration, because SQL execution is intentionally manual.

## Current Completion Summary

| Area | Status | Notes |
| --- | --- | --- |
| Frontend home | Completed | Home page exists and links to catalog/search flows. No cart flow is introduced. |
| Product categories | Completed | Categories are read from `public.categories`; active category filtering exists. |
| Product search | Completed | Public catalog API supports server-side search/filter/sort/pagination over products, categories, SKU code/options and paid-order sales signals. |
| Product detail | Partially completed | Product detail reads Supabase product data and supports recommendations. Real multi-SKU selector is not fully wired to SKU tables. |
| Multi-SKU | Partially completed | Migration and server-side order/delivery compatibility exist, but admin SKU editor and frontend SKU picker are still incomplete. |
| Direct purchase / checkout | Partially completed | Direct checkout creates real orders through server/RPC and does not trust URL price. Real SKU selection is incomplete. |
| Orders | Completed for basic flow | Order creation/list/detail/admin management exist. Requires production migration verification. |
| Cashier / payment sessions | Partially completed | Payment session, callback, reconciliation and readiness framework exist. Real Provider is not configured, so real collection is blocked. |
| Login/register | Completed | Auth screens/routes exist; admin guard and user access flows exist. |
| User center | Partially completed | Account orders/assets/recharge/balance flows exist, but production DB/RLS and end-to-end payment success still need live verification. |
| Recharge and balance | Partially completed | Recharge/payment session/balance transaction migrations and RPC exist. Real Provider callback verification is not live. |
| Refunds | Partially completed | Refund migration and admin/customer routes exist. Needs production policy and over-refund test before launch. |
| Digital inventory | Partially completed | Batch/import/delivery migrations and admin pages exist. SKU-aware import UI and concurrent live tests remain. |
| Automatic delivery | Partially completed | Server/RPC safeguards exist. Needs live inventory and duplicate-callback verification. |
| Admin product management | Partially completed | Product CRUD exists and update API returns latest product. The update API returns latest saved product and normalized dirty comparison exists. Some admin UI labels still contain mojibake text, but syntax-breaking strings found during this pass were fixed. SKU editor is incomplete. |
| Admin category management | Completed basic | Category management page exists; UI text mojibake risk remains in some files. |
| Admin orders | Completed basic | Admin orders page and status handling exist. Requires live RLS/RPC verification. |
| Admin payments | Partially completed | Payment records/sessions/reconciliation UI exists. Provider not connected. |
| Admin users | Completed basic | User management routes/pages exist; deeper role model intentionally not implemented. |
| Admin reports/dashboard | Partially completed | Business reports/dashboard exist; visitor analytics migration must be executed to avoid partial metrics. |
| Site settings | Completed basic | Settings routes/pages exist; payment channel secret handling must be verified in production. |
| Announcement and agreements | Completed basic | Public static/setting-driven pages exist. |
| Media resources | Partially completed | Media routes/pages and migration exist but are untracked/currently dirty in worktree; requires migration execution. |
| System monitoring | Partially completed | Health/readiness/system errors routes exist. Requires monitoring migration execution. |
| Database status | Partially completed | Schema/status tools exist. Supabase production must be checked manually. |
| Support tickets | Cancelled | `support_tickets`, messages, backend ticket center and ticket attachments are explicitly cancelled. Current search found no active support-ticket module, only customer-service wording on checkout. |

## Feature Matrix

| Module | State | Release note |
| --- | --- | --- |
| Public catalog browsing | Completed | Suitable for test release after DB migrations are aligned. |
| Public search/filter/sort | Completed | Uses server-side API, not full browser-side filtering for large lists. |
| Recommendations | Completed basic | Falls back safely when sales/recommendation data is missing. |
| Product save | Partially completed | API returns saved product; form has normalized dirty comparison. Needs browser verification because admin page contains historical dirty/unrelated edits and mojibake strings. |
| Multi-SKU | Partial / blocker for SKU launch | Schema/RPC foundation exists; UI and live SKU selection are incomplete. |
| Direct purchase order | Completed basic | Server RPC calculates amount and stores snapshots. Depends on migrations. |
| Payment Provider | Not connected | Real payment collection cannot launch until provider credentials, callbacks and sandbox tests pass. |
| Balance recharge | Partial | Atomic RPC exists; real provider callback not live. |
| Digital delivery | Partial | Server-side protections exist; live duplicate/cross-SKU test still required. |
| Admin audit | Partial | Audit migration/service exists; coverage is not proven for every listed sensitive operation. |
| Monitoring/error center | Partial | Error events/health endpoints exist; production alerting is only reserved, not connected. |

## Cancelled Functionality

The following are out of scope and must not be added for this RC:

- Customer support tickets.
- `support_tickets`.
- `support_ticket_messages`.
- Backend ticket center.
- Ticket messages, attachments and assignment.

## Product Save Verification Result

Observed code paths:

- Admin product PATCH route: `app/api/admin/catalog/products/[productId]/route.ts`.
- Admin product page/form: `app/admin/products/page.tsx`.
- Shared catalog helpers: `app/api/admin/catalog/_shared.ts` and `lib/supabase/admin-catalog.ts`.

Result:

- The update API reads the previous product, normalizes payload, updates `products`, selects `PRODUCT_FIELDS`, verifies persisted values and returns `{ product: data }`.
- The form has normalized dirty comparison through `normalizeProductFormValues` and `isProductDirty`.
- The page keeps `productInitialForm` and clears form state on close/save.
- Static review does not prove browser behavior. Because this worktree contains unrelated dirty admin catalog files and mojibake text, final browser validation is still required.

Release assessment:

- If a browser test still shows “unsaved changes” after successful save, classify as P0.
- From current static code, no obvious price-forgery or no-save path was found in the update API.

## Multi-SKU Verification Result

Observed code and report:

- `supabase/migrations/20260629_multi_sku_core.sql`.
- `docs/multi-sku-verification.md`.
- `app/api/orders/route.ts`.
- `lib/orders/order-queries.ts` / `lib/orders/order-types.ts`.

Result:

- Database/RPC foundation exists for option groups, option values, SKUs, SKU order snapshots, `sku_id` inventory and `sku_id` deliveries.
- `/api/orders` accepts optional `sku_id` and requires a SKU when active SKUs exist for a product.
- Existing verification doc states admin SKU editor, SKU combination generator, frontend SKU selector and SKU-aware inventory import UI are still incomplete.

Release assessment:

- Single-spec products can proceed to test release.
- Multi-SKU commercial launch is blocked until the missing UI and live SKU selection are implemented and tested.

## Direct Purchase Verification Result

Observed code:

- `app/api/orders/route.ts`.
- `supabase/migrations/20260629_direct_purchase_order_idempotency.sql`.
- `supabase/migrations/20260629_multi_sku_core.sql`.

Result:

- Order API whitelists request keys.
- It rejects unauthenticated users.
- It does not accept frontend price, subtotal, total amount or status.
- It requires `client_request_id` and calls `create_order_with_item` RPC.
- SKU-aware validation exists when active SKUs exist.

Risk:

- Requires the latest `create_order_with_item` signature to be executed in Supabase.
- If production still has an older RPC signature, direct purchase becomes P0/P1 depending on failure mode.

## Order, Payment and Recharge Verification Result

Observed code/reports:

- `lib/payments/payment-session-service.ts`.
- `lib/payments/payment-callback-service.ts`.
- `lib/payments/complete-payment-service.ts`.
- `lib/payments/reconciliation-service.ts`.
- `app/api/payments/callback/[channel]/route.ts`.
- `app/api/admin/payments/readiness/route.ts`.
- `supabase/migrations/20260623_payment_provider_core.sql`.
- `supabase/migrations/20260623_payment_core_linkage.sql`.
- `supabase/migrations/20260629_payment_reconciliation_runs_logs.sql`.

Result:

- Payment session, callback verification framework, complete-payment dispatch and reconciliation service exist.
- Atomic recharge RPC exists in migrations.
- Provider adapters are placeholders until real provider credentials and callback specs are configured.
- Real payment collection is not available in this RC.

Release assessment:

- Test environment deployment is acceptable for non-real-payment flows.
- Formal paid launch is blocked by missing real Provider integration and verified callback tests.

## Digital Inventory and Auto Delivery Verification Result

Observed code/reports:

- `supabase/migrations/20260620_digital_inventory_delivery.sql`.
- `supabase/migrations/20260622_digital_delivery_hardening.sql`.
- `supabase/migrations/20260623_digital_inventory_batches.sql`.
- `supabase/migrations/20260623_mixed_order_item_fulfillment.sql`.
- `supabase/migrations/20260629_multi_sku_core.sql`.
- `app/api/admin/inventory/route.ts`.
- `lib/inventory/import-service.ts`.
- `lib/delivery/delivery-service.ts`.

Result:

- Inventory import, batch tables, delivery logs and hardened delivery functions exist.
- SKU-aware delivery migration exists.
- Existing SKU report says SKU-aware inventory import UI still needs completion.

Release assessment:

- Digital delivery requires live repeated-callback and insufficient-inventory tests before production.
- Multi-SKU digital delivery is blocked until SKU inventory import/selection is fully wired.

## Permission and Security Verification Result

Static findings:

- Service role helper is server-side in `lib/supabase/service-role.ts`.
- Search did not find a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` style leak.
- Admin APIs use admin guard/service role patterns in multiple routes.
- User order APIs use current Supabase user and user-id filtering.
- Digital inventory migrations deny direct inventory reads and expose controlled RPCs.

Risks:

- RLS and RPC grants must be verified in the actual Supabase project.
- Some admin RPCs are granted to `authenticated` but perform internal admin checks; these checks must be verified with a non-admin account.
- Logs must be checked in production for absence of raw delivery content and secrets.

## Migration State

Repository migrations found:

1. `20260620_site_settings.sql`
2. `20260620_order_payments.sql`
3. `20260620_digital_inventory_delivery.sql`
4. `20260620_referral_system.sql`
5. `20260622_recharge_records.sql`
6. `20260622_super_admin_payment_console.sql`
7. `20260622_fix_referral_signup_and_short_links.sql`
8. `20260622_digital_delivery_hardening.sql`
9. `20260623_payment_balance_transactions_compatibility.sql`
10. `20260623_payment_provider_core.sql`
11. `20260623_payment_core_linkage.sql`
12. `20260623_payment_reconciliation_system.sql`
13. `20260623_mixed_order_item_fulfillment.sql`
14. `20260623_admin_audit_logs.sql`
15. `20260623_digital_inventory_batches.sql`
16. `20260624_admin_visit_analytics.sql`
17. `20260629_account_recharge_client_request_id.sql`
18. `20260629_admin_user_controls.sql`
19. `20260629_direct_purchase_order_idempotency.sql`
20. `20260629_i18n_currency_timezone_settings.sql`
21. `20260629_media_assets.sql`
22. `20260629_multi_sku_core.sql`
23. `20260629_payment_reconciliation_runs_logs.sql`
24. `20260629_refund_after_sales.sql`
25. `20260629_system_error_events.sql`
26. `20260629_app_migration_history_and_schema_check.sql`

Manual dependency order should follow filename order, with the schema checker executed after functional migrations. Any not-yet-executed migration is a blocker for the corresponding feature.

## Real Provider State

- Real Provider: not connected.
- Channels: framework supports Alipay, WeChat, Binance Pay, USDT-TRC20 and USDT-BEP20 configuration patterns.
- Formal real-money collection: not allowed yet.
- Test deployment: allowed if payment UI clearly shows unavailable/unconfigured channel states and no fake payment data is generated.

## Go-Live Recommendation

- Can deploy to test environment: Yes, after executing required migrations in a test Supabase project. `npm run build` and `tsc --noEmit` passed on 2026-06-30.
- Can formally launch production store: No.
- Can collect real money: No.

Main blockers are tracked in `docs/go-live-blockers.md`.

## Verification Commands

- 
pm run build: passed. Warnings remain for Supabase dynamic dependencies and expected CSR deopts.
- 	sc --noEmit: passed after Next generated .next/types during build.

## Build Blockers Fixed In This Pass

1. Fixed unterminated strings in pp/api/admin/catalog/categories/[categoryId]/route.ts.
2. Fixed corrupted audit module union and masking text in lib/admin/audit-log-service.ts.
3. Fixed literal ` 
 ` tokens in components/admin/AdminSidebar.tsx and components/account/AccountShell.tsx.
4. Fixed Supabase query-builder .catch() type errors in privacy request routes.

