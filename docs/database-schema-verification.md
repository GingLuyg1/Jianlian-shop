# Database Schema Verification

## Scope

This document verifies the database structures currently referenced by Jianlian Shop code. It is a local code and migration audit only. No production SQL was executed.

## Migration Complete List

Recommended execution order is filename order under `supabase/migrations`:

1. `20260620_digital_inventory_delivery.sql`
2. `20260620_order_payments.sql`
3. `20260620_referral_system.sql`
4. `20260620_site_settings.sql`
5. `20260622_digital_delivery_hardening.sql`
6. `20260622_fix_referral_signup_and_short_links.sql`
7. `20260622_recharge_records.sql`
8. `20260622_super_admin_payment_console.sql`
9. `20260623_admin_audit_logs.sql`
10. `20260623_payment_provider_core.sql`
11. `20260623_payment_core_linkage.sql`
12. `20260623_payment_balance_transactions_compatibility.sql`
13. `20260623_payment_reconciliation_system.sql`
14. `20260623_mixed_order_item_fulfillment.sql`
15. `20260623_digital_inventory_batches.sql`
16. `20260624_admin_visit_analytics.sql`
17. `20260629_payment_reconciliation_runs_logs.sql`
18. `20260629_account_recharge_client_request_id.sql`
19. `20260629_multi_sku_core.sql`
20. `20260629_direct_purchase_order_idempotency.sql`
21. `20260629_admin_user_controls.sql`
22. `20260629_system_error_events.sql`
23. `20260629_refund_after_sales.sql`
24. `20260629_app_migration_history_and_schema_check.sql`
25. `20260629_i18n_currency_timezone_settings.sql`
26. `20260629_media_assets.sql`
27. `20260630_admin_audit_integrity.sql`
28. `20260630_backup_runs.sql`
29. `20260630_business_id_global_search_indexes.sql`
30. `20260630_data_consistency_scan.sql`
31. `20260630_data_origin_labels.sql`
32. `20260630_order_query_tokens.sql`
33. `20260630_privacy_account_controls.sql`
34. `20260701_business_compensation_tasks.sql`
35. `20260701_email_notifications.sql`
36. `20260701_legal_documents_order_evidence.sql`
37. `20260701_order_expiration_inventory_release.sql`
38. `20260701_order_payment_method_selection.sql`
39. `20260701_query_performance_indexes.sql`
40. `20260701_request_tracing_enhancements.sql`
41. `20260701_risk_events_reviews.sql`
42. `20260702_visitor_daily_stats.sql`

No `migrations`, `database/migrations`, or `sql` directory with additional SQL files was found in the local project.

## Duplicate or Conflict Findings

- Duplicate numbering: none. Multiple files share the same date prefix by design.
- Repeated compatibility columns: `profiles.invite_code`, `profiles.referred_by`, and `profiles.promotion_balance` appear in referral compatibility migrations with `add column if not exists`.
- Repeated inventory indexes: some digital inventory indexes are reintroduced in hardening and performance migrations with `create index if not exists`.
- Repeated RLS policies: migrations generally use `drop policy if exists` before `create policy`, which is repeat-safe.
- Constraint rewrites: several files use `drop constraint if exists` followed by `add constraint`; this is intentional compatibility hardening and must be reviewed before manual execution on production.
- `recharge_records` and `account_recharges` both exist as historical and current recharge structures. Current payment console code primarily uses `account_recharges`.

## Core Table Verification Matrix

| Area | Expected object | Migration source | Local code status |
| --- | --- | --- | --- |
| Products | `products` | Pre-existing base schema, plus indexes in `20260701_query_performance_indexes.sql` | Required by public catalog and admin catalog. Base table creation is not in current migration set, so production must verify it exists before deployment. |
| Categories | `categories` | Pre-existing base schema, plus indexes in `20260701_query_performance_indexes.sql` | Current category hierarchy uses `categories.parent_id` and `categories.level`; there is no separate `subcategories` table requirement. |
| Subcategories | `categories` level 2 | `categories` base schema | Code treats subcategories as level-2 rows in `categories`. |
| Product SKUs | `product_skus`, option tables | `20260629_multi_sku_core.sql` | Required for multi-SKU purchase and admin SKU management. |
| Orders | `orders` | Pre-existing base schema plus compatibility migrations | Required fields are extended by order idempotency, fulfillment, query token, expiration, and payment method migrations. |
| Order items | `order_items` | Pre-existing base schema plus SKU and fulfillment migrations | Must include SKU snapshot and delivery status fields for current order flows. |
| Payments | `payment_sessions`, `order_payments` | `20260620_order_payments.sql`, `20260623_payment_provider_core.sql` | Current payment core uses `payment_sessions`; there is no standalone `payments` table dependency in current core path. |
| Recharges | `account_recharges`, legacy `recharge_records` | `20260622_super_admin_payment_console.sql`, `20260622_recharge_records.sql` | Current admin and client recharge pages use `account_recharges`. |
| Refunds | `refund_requests` | `20260629_refund_after_sales.sql` | Required for refund pages and admin refund management. |
| User balances | `profiles.balance`, balance helpers | base profiles schema and compatibility code | No standalone `user_balances` table is required by current code. |
| Balance transactions | `balance_transactions` | `20260623_payment_balance_transactions_compatibility.sql` | Required for auditable balance changes and user balance history. |
| Digital inventory | `digital_inventory`, `digital_inventory_batches` | `20260620_digital_inventory_delivery.sql`, hardening and batch migrations | Raw content is protected from browser access by RLS and server-only APIs. |
| Deliveries | `order_deliveries`, `delivery_logs` | `20260620_digital_inventory_delivery.sql`, `20260622_digital_delivery_hardening.sql` | Required for auto/manual fulfillment and user delivery display. |
| Admin audit logs | `admin_audit_logs` | `20260623_admin_audit_logs.sql`, `20260630_admin_audit_integrity.sql` | Required for admin write operations and integrity checks. |
| Settings | `site_settings` | `20260620_site_settings.sql`, `20260629_i18n_currency_timezone_settings.sql` | Required for public settings and admin settings. |

## Product Save Dependency Verification

Current admin product API submits only the database-safe product payload:

- `name`
- `slug`
- `category_id`
- `short_description`
- `description`
- `image_url`
- `price`
- `original_price`
- `stock`
- `delivery_type`
- `status`
- `sort_order`
- `metadata`

Important notes:

- `subcategory_id` is accepted only as a form compatibility input and is mapped to `category_id`.
- `metadata.note` is converted into the `metadata` JSON object and is not submitted as an independent database column.
- `gallery` is not in the final database update whitelist.
- The update route validates a UUID `productId`, reads the existing product, updates with `.select(PRODUCT_FIELDS).single()`, verifies persisted values, logs audit results, and revalidates product cache.
- Anonymous and normal users cannot use the admin catalog API because it calls `requireCatalogAdmin()` server-side.

P0 if missing in production: any product field in `PRODUCT_FIELDS`, `categories.id`, admin RLS/admin service access, or the `products` base table.

## Public Product RLS

Expected public behavior:

- Anonymous and logged-in users may read active public products, active categories, and safe public SKU fields.
- Digital inventory content, payment records, order records, admin notes, cost data, and audit logs must not be exposed.
- Current code reads products through safe public catalog fields and SKU public fields; it does not fetch inventory content for storefront product lists.
- Production RLS must be manually verified because the base `products` and `categories` table creation/policies are not fully represented in this migration folder.

## Order and User Isolation

Expected behavior:

- User order, recharge, refund, balance, and delivery endpoints must bind queries to the current authenticated user.
- Admin APIs must call server-side admin checks.
- Digital inventory raw content must be server-only.
- Service Role must exist only in server environment variables and never under `NEXT_PUBLIC_*`.

No cross-user access issue was proven from local static inspection, but production RLS policies must still be verified using `/api/admin/system/database` and Supabase SQL checks.

## Required Manual SQL Checks

Run in Supabase SQL Editor before production deployment:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'products','categories','product_skus','orders','order_items',
    'payment_sessions','order_payments','account_recharges','refund_requests',
    'balance_transactions','digital_inventory','digital_inventory_batches',
    'order_deliveries','delivery_logs','admin_audit_logs','site_settings'
  )
order by table_name;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products','categories','product_skus','orders','order_items')
order by table_name, ordinal_position;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'products','categories','product_skus','orders','order_items',
    'payment_sessions','account_recharges','refund_requests',
    'balance_transactions','digital_inventory','digital_inventory_batches',
    'order_deliveries','admin_audit_logs','site_settings'
  )
order by tablename;
```

## Required Manual Migrations

If Supabase has not yet run the latest local SQL, execute in the recommended order above. Do not skip compatibility migrations unless the schema check proves they are already applied.
