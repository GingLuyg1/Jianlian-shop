# Database Schema Release Verification

Date: 2026-06-29

## Migration list

The repository currently contains these expected migrations:

- `20260620_referral_system.sql`
- `20260620_digital_inventory_delivery.sql`
- `20260620_order_payments.sql`
- `20260620_site_settings.sql`
- `20260622_fix_referral_signup_and_short_links.sql`
- `20260622_recharge_records.sql`
- `20260622_super_admin_payment_console.sql`
- `20260622_digital_delivery_hardening.sql`
- `20260623_admin_audit_logs.sql`
- `20260623_payment_provider_core.sql`
- `20260623_payment_core_linkage.sql`
- `20260623_payment_balance_transactions_compatibility.sql`
- `20260623_payment_reconciliation_system.sql`
- `20260623_mixed_order_item_fulfillment.sql`
- `20260623_digital_inventory_batches.sql`
- `20260624_admin_visit_analytics.sql`
- `20260629_payment_reconciliation_runs_logs.sql`
- `20260629_account_recharge_client_request_id.sql`
- `20260629_multi_sku_core.sql`
- `20260629_direct_purchase_order_idempotency.sql`
- `20260629_admin_user_controls.sql`
- `20260629_system_error_events.sql`
- `20260629_refund_after_sales.sql`
- `20260629_app_migration_history_and_schema_check.sql`

## Recommended execution order

Use the order listed in `docs/migration-runbook.md`.

## Duplicate or conflict check

Known overlap:

- `release_order_inventory` exists in early inventory migration and is hardened in `20260622_digital_delivery_hardening.sql`.
- Recharge records are introduced early and extended by payment console/linkage migrations.

Current approach:

- Do not edit or delete historical migrations.
- Use additive compatibility migrations.
- Register execution state in `app_migration_history`.

## Schema check result

Implemented:

- `public.app_migration_history`
- `public.app_check_database_structure()`
- `/api/admin/system/database`
- `/admin/system/database`

Runtime database results must be checked manually from `/admin/system/database` after applying the migration.

## Code-field consistency

Checked and documented expected field usage:

- Product availability uses `products.status`, not legacy `is_active`.
- Product category uses `products.category_id`.
- SKU order compatibility uses `order_items.sku_id`.
- Recharge identity uses `account_recharges.recharge_no`.
- Payment identity uses `payment_sessions.session_no` and provider transaction fields.
- Balance audit uses `balance_before` and `balance_after`.
- Digital inventory deduplication requires `content_hash`.

## Key RPC checks

Expected key RPC/function names:

- `handle_new_user`
- `reserve_order_inventory`
- `release_order_inventory`
- `deliver_order_inventory`
- `app_check_database_structure`

The schema check function validates presence only and does not invoke mutating functions.

## Version info

Safe release info is generated from environment names:

- `APP_VERSION` or `NEXT_PUBLIC_APP_VERSION`
- `GIT_COMMIT` or platform commit variables
- `BUILD_TIME`
- `APP_ENV` or `NODE_ENV`

No secrets are exposed.

## Pre-deploy check

Added read-only script:

```bash
node scripts/pre-deploy-check.mjs
```

It checks required files, expected environment variable names, package scripts, and git cleanliness. It does not run SQL or deploy.

## Release and rollback docs

Added:

- `docs/release-management.md`
- `docs/migration-runbook.md`

Existing production backup and rollback documents remain complementary.

## Issues fixed

- Added migration execution history structure.
- Added read-only database structure status API and admin page.
- Added safe release info module.
- Added pre-deploy read-only check script.
- Added manual migration execution and release documentation.

## Open issues requiring manual action

- Execute `20260629_app_migration_history_and_schema_check.sql` manually in Supabase SQL Editor.
- Register already executed migrations into `app_migration_history`.
- Open `/admin/system/database` and run a live check.
- Rotate any exposed secrets if previous logs or deployments leaked them.

## Manual migrations

Execute manually:

```text
supabase/migrations/20260629_app_migration_history_and_schema_check.sql
```

Do not run it from the application.
