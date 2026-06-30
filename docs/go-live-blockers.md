# Jianlian Shop Go-Live Blockers

Date: 2026-06-30
Severity scale: P0 = do not launch, P1 = fix before production launch, P2 = fix soon after launch, P3 = experience optimization.

## P0: Do Not Launch

| ID | Issue | Impact | Related files | Fixed? | Migration? | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Production Supabase migration execution is not verified. | Code references payment sessions, SKU fields, digital inventory batches, refunds, monitoring and schema checker tables/functions. Missing production schema can break orders, payment, inventory and admin pages. | `supabase/migrations/*`, `app/api/admin/payments/readiness/route.ts`, `lib/system/database-contract.ts` | No | Yes | Execute migrations in order on staging, then run schema probes before production. |
| P0-02 | Real payment Provider is not connected or live-tested. | The site cannot formally collect money. Generating payment sessions without real provider configuration must not be treated as payable. | `lib/payments/payment-session-service.ts`, `lib/payments/provider-adapters.ts`, `app/api/payments/callback/[channel]/route.ts` | No | No | Configure a real provider sandbox, verify signature, query, close, callback and reconciliation before collection. |
| P0-03 | Multi-SKU commercial chain is incomplete for SKU products. | SKU product purchase can be blocked or inconsistent because real frontend SKU picker and admin SKU editor are not complete. | `docs/multi-sku-verification.md`, `app/products/[id]/page.tsx`, `app/admin/products/page.tsx`, `supabase/migrations/20260629_multi_sku_core.sql` | No | Partly | Either disable multi-SKU products for launch or complete admin SKU editor, frontend selector and inventory import UI. |
| P0-04 | Some admin/catalog files contain mojibake Chinese strings in the current worktree. | Admin UX can show unreadable Chinese text, and malformed strings are historically a source of runtime/build failures. | `app/admin/products/page.tsx`, `app/admin/categories/page.tsx`, `app/api/admin/catalog/products/[productId]/route.ts` | No | No | Normalize affected files to UTF-8 Chinese text and rerun build. |
| P0-05 | Product-save browser behavior still requires final live verification. | If the unsaved-change dialog still appears after a successful save, admins may lose confidence or accidentally discard changes. | `app/admin/products/page.tsx`, `app/api/admin/catalog/products/[productId]/route.ts` | Partially | No | Run browser test: open, edit, save, close, reopen. Treat failure as immediate blocker. |

## P1: Must Fix Before Production Launch

| ID | Issue | Impact | Related files | Fixed? | Migration? | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P1-01 | SKU-aware inventory import UI is incomplete. | Digital inventory may not be assigned to the correct SKU from admin UI, risking SKU delivery gaps. | `app/api/admin/inventory/route.ts`, `lib/inventory/import-service.ts`, `docs/multi-sku-verification.md` | No | Partly | Add SKU selector to import flow and verify per-SKU delivery. |
| P1-02 | Automatic delivery concurrency and duplicate callback tests are not live-verified. | A race condition could cause duplicate delivery or failed fulfillment recovery issues. | `supabase/migrations/20260622_digital_delivery_hardening.sql`, `supabase/migrations/20260629_multi_sku_core.sql`, `lib/delivery/delivery-service.ts` | Partially | Yes | Run staging tests with duplicate callbacks, insufficient inventory and mixed orders. |
| P1-03 | RLS and RPC grants need real non-admin verification. | Static policies exist, but a misconfigured Supabase project can expose admin/user data. | `supabase/migrations/*`, `app/api/admin/*`, `app/api/account/*` | No | Yes | Test ordinary user access to admin APIs, other users' orders, payments, recharges, deliveries and inventory. |
| P1-04 | Refund flow needs over-refund and permission tests. | Incorrect refund processing can over-refund or corrupt order/payment status. | `supabase/migrations/20260629_refund_after_sales.sql`, `app/api/refunds/route.ts`, `app/api/admin/refunds/route.ts` | No | Yes | Verify partial/full refund limits, status transitions and audit logs. |
| P1-05 | Payment channel secret handling must be verified. | Secrets must not be returned to browser or cleared accidentally on save. | `app/admin/settings`, `lib/payments/channels.ts`, `supabase/migrations/20260622_super_admin_payment_console.sql` | Partially | Yes | Test save-without-retyping secrets and inspect frontend responses for secret leakage. |
| P1-06 | Backup and rollback runbook is documentation-only. | Production launch lacks proven rollback drill. | `docs/database-backup-restore.md`, `docs/production-rollback.md` | Partial | No | Run a staging backup/restore drill and document exact commands. |

## P2: Can Fix Soon After Test Launch

| ID | Issue | Impact | Related files | Fixed? | Migration? | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P2-01 | Public catalog API caps internal product scan at 1000 rows. | Large catalogs should move to SQL/RPC search for better performance. | `app/api/catalog/products/route.ts` | Partially | Optional | Add database-side search/ranking once product volume grows. |
| P2-02 | Audit log coverage is not proven for every sensitive operation. | Some admin actions may be missing audit entries. | `lib/admin/audit-log-service.ts`, `app/api/admin/*` | Partially | Yes | Add route-level audit checklist tests. |
| P2-03 | Monitoring and alerts are reserved but not connected to external notification channels. | Errors are visible in admin but may not trigger active operations alerts. | `app/api/health/readiness/route.ts`, `app/admin/system-errors`, `lib/monitoring/*` | Partially | Yes | Add email/Telegram/webhook alert integration later. |
| P2-04 | Media/resources and reports modules are present in a dirty worktree. | They may be useful but are not fully RC-verified. | `app/admin/media`, `app/admin/reports`, `lib/media`, `lib/reports` | No | Yes | Verify after migration execution and separate commits. |\n| P2-05 | Several admin UI files still contain mojibake Chinese labels, although syntax-breaking strings were fixed and build now passes. | Admin operators may see unreadable labels or messages. | `app/admin/products/page.tsx`, `app/admin/categories/page.tsx` | Partially | No | Re-save affected UI files as UTF-8 Chinese and verify pages visually. |

## P3: Experience Optimization

| ID | Issue | Impact | Related files | Fixed? | Migration? | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P3-01 | Some reports/docs contain encoding damage. | Engineering docs are harder to read. | `docs/payment-core-verification.md` and possibly older Chinese docs | No | No | Re-save docs as UTF-8 and replace mojibake text. |
| P3-02 | Admin dense-table layout should be browser-verified at 1600x900 and 1920x1080. | UI may still have scroll/spacing issues. | `components/admin/*`, `app/admin/*` | Partial | No | Run visual pass after blockers are fixed. |

## Final Launch Gates

Before production launch, all of the following must be true:

1. `tsc --noEmit` passes.
2. `npm run build` passes.
3. Supabase migrations are executed in staging and production in the documented order.
4. Readiness/schema probes show required tables, fields and RPCs exist.
5. Product save browser test passes without stale dirty-state prompts.
6. Multi-SKU products are either disabled or fully implemented and verified.
7. Real payment Provider sandbox has passed create/query/close/callback/reconciliation tests.
8. RLS isolation tests pass for ordinary users and admins.
9. Digital inventory duplicate/cross-SKU delivery tests pass.

## Current Decision

- Deploy to test environment: allowed after migrations are applied to the test Supabase project.
- Formal production launch: not allowed yet.
- Real payment collection: not allowed yet.

## Verification Run

- 
pm run build: passed on 2026-06-30 with existing Supabase dynamic dependency and CSR deopt warnings.
- 	sc --noEmit: passed on 2026-06-30 after build regenerated Next types.
- Fixed during this RC pass: syntax-breaking category route strings, audit module union corruption, literal backtick newline tokens, and Supabase query-builder .catch() type errors in privacy routes.

