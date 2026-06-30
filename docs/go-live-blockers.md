# Jianlian Shop Go-Live Blockers

Date: 2026-06-30

Severity scale:

- P0: prohibit testing or launch until resolved.
- P1: must fix before production launch.
- P2: fix soon after launch.
- P3: experience optimization.

## P0 Blockers

| ID | Issue | Impact | Related files | Needs migration? | Current status | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Supabase migration execution is not verified. | Missing tables/RPCs can break orders, payments, inventory, refunds, reports and admin pages. | `supabase/migrations/*`, `docs/migration-status.md`, `app/api/admin/system/project-status/route.ts` | Yes | Open | Execute migrations manually in staging, record results, then run schema check. |
| P0-02 | Real payment Provider is not connected. | The site cannot collect real money. | `lib/payments/providers.ts`, `lib/payments/payment-session-service.ts`, `lib/payments/reconciliation-service.ts` | No | Open | Configure and verify a real provider sandbox before any real collection. |
| P0-03 | Multi-SKU commercial chain is incomplete. | SKU products can lose accurate selection, pricing, inventory isolation or order snapshot data. | `supabase/migrations/20260629_multi_sku_core.sql`, `app/api/orders/route.ts`, `app/products/[id]/page.tsx`, `app/admin/products/page.tsx` | Yes | Partial/open | Keep single-SKU products enabled; do not launch SKU products until migration, admin SKU editor, frontend selector and SKU inventory import are verified. |
| P0-04 | Product save browser behavior remains unverified. | Admins may see stale dirty-state prompts or stale list/detail values after saving. | `app/admin/products/page.tsx`, `app/api/admin/catalog/products/[productId]/route.ts`, `docs/manual-verification-checklist.md` | No | Unverified | Run MV-01 through MV-04. If any fails, keep as P0. |
| P0-05 | Cross-user data isolation is unverified. | Users could access other users' orders, payments, refunds or delivery content if policies/routes are wrong. | `app/api/account/*`, `app/api/orders/*`, `supabase/migrations/*` | Yes | Unverified | Run ordinary-user and admin isolation tests after migrations. |

## P1 Blockers

| ID | Issue | Impact | Related files | Needs migration? | Current status | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| P1-01 | SKU-aware inventory import UI is incomplete. | Digital inventory may be assigned to the wrong SKU or imported only at product level. | `app/api/admin/inventory/route.ts`, `lib/inventory/import-service.ts`, `docs/multi-sku-verification.md` | Yes | Partial | Add SKU selector/display to import and inventory list before SKU launch. |
| P1-02 | Duplicate callback and duplicate delivery tests are not complete. | A race condition could cause duplicate delivery or incorrect fulfillment state. | `lib/delivery/delivery-service.ts`, `supabase/migrations/20260622_digital_delivery_hardening.sql`, `supabase/migrations/20260629_multi_sku_core.sql` | Yes | Unverified | Run staging replay tests with duplicate callbacks and retry delivery. |
| P1-03 | Refund limits and admin permissions are not live-verified. | Over-refund or unauthorized refund processing could corrupt order/payment state. | `app/api/refunds/route.ts`, `app/api/admin/refunds/*`, `supabase/migrations/20260629_refund_after_sales.sql` | Yes | Unverified | Test partial/full refund, status transitions, audit logs and super-admin restrictions. |
| P1-04 | Audit log coverage is not proven for every sensitive operation. | Some admin actions may not be traceable. | `lib/admin/audit-log-service.ts`, `app/api/admin/*` | Yes | Partial | Verify audit entries for product, payment, refund, user, inventory and project status checks. |
| P1-05 | Backup and rollback are documentation-only. | Production rollback confidence is low. | `docs/database-backup-restore.md`, `docs/production-rollback.md`, `supabase/migrations/20260630_backup_runs.sql` | Optional | Partial | Run a staging backup/restore drill and record exact result. |

## P2 / P3 Items

| ID | Issue | Impact | Related files | Current status |
| --- | --- | --- | --- | --- |
| P2-01 | Public catalog API may not scale beyond small catalogs. | Search/filter performance can degrade. | `app/api/catalog/products/route.ts` | Partial |
| P2-02 | Monitoring is internal only. | Operators may miss active alerts. | `lib/monitoring/*`, `app/admin/system-errors` | Partial |
| P3-01 | Some older files still contain mojibake UI text. | Admin UX and docs can be hard to read. | `app/admin/*`, older docs | Open |
| P3-02 | Dense admin layouts need visual pass on common desktop sizes. | Minor layout overflow may remain. | `components/admin/*` | Unverified |

## Cancelled Or Out Of Scope

| Feature | Status | Notes |
| --- | --- | --- |
| Shopping cart | cancelled | Direct purchase is the active flow. `cart_items` may exist as schema compatibility but cart UI/API is not in current scope. |
| Support tickets | cancelled | `support_tickets` and `support_ticket_messages` are excluded from this task. |
| New real payment Provider implementation | excluded from this task | Current conclusion remains `not_configured`. |
| Automatic SQL execution/deployment | excluded from this task | All migrations must be manually executed and recorded. |

## Current Launch Decision

- Can test locally: yes, but only for implemented areas and with manual checklist records.
- Can deploy to test environment: yes, after migrations are manually executed and status is recorded.
- Can deploy to production: no.
- Can collect real money: no.
