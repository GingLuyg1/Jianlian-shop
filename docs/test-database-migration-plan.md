# Test Database Migration Plan

This plan is for `Jianlian-shop-test`. It does not execute SQL. Run each migration manually in Supabase SQL Editor or through a controlled migration runner only after the preflight checks pass.

## Migration Inventory

Total migration files in `supabase/migrations`: 61.

1. `20260619_products_categories_baseline.sql`
2. `20260620_digital_inventory_delivery.sql`
3. `20260620_order_payments.sql`
4. `20260620_referral_system.sql`
5. `20260620_site_settings.sql`
6. `20260622_digital_delivery_hardening.sql`
7. `20260622_fix_referral_signup_and_short_links.sql`
8. `20260622_recharge_records.sql`
9. `20260622_super_admin_payment_console.sql`
10. `20260623_admin_audit_logs.sql`
11. `20260623_digital_inventory_batches.sql`
12. `20260623_mixed_order_item_fulfillment.sql`
13. `20260623_payment_balance_transactions_compatibility.sql`
14. `20260623_payment_core_linkage.sql`
15. `20260623_payment_provider_core.sql`
16. `20260623_payment_reconciliation_system.sql`
17. `20260624_admin_visit_analytics.sql`
18. `20260629_account_recharge_client_request_id.sql`
19. `20260629_admin_user_controls.sql`
20. `20260629_app_migration_history_and_schema_check.sql`
21. `20260629_direct_purchase_order_idempotency.sql`
22. `20260629_i18n_currency_timezone_settings.sql`
23. `20260629_media_assets.sql`
24. `20260629_multi_sku_core.sql`
25. `20260629_payment_reconciliation_runs_logs.sql`
26. `20260629_refund_after_sales.sql`
27. `20260629_system_error_events.sql`
28. `20260630_admin_audit_integrity.sql`
29. `20260630_backup_runs.sql`
30. `20260630_business_id_global_search_indexes.sql`
31. `20260630_data_consistency_scan.sql`
32. `20260630_data_origin_labels.sql`
33. `20260630_order_query_tokens.sql`
34. `20260630_privacy_account_controls.sql`
35. `20260701_business_compensation_tasks.sql`
36. `20260701_email_notifications.sql`
37. `20260701_legal_documents_order_evidence.sql`
38. `20260701_order_expiration_inventory_release.sql`
39. `20260701_order_payment_method_selection.sql`
40. `20260701_query_performance_indexes.sql`
41. `20260701_request_tracing_enhancements.sql`
42. `20260701_risk_events_reviews.sql`
43. `20260702_schema_rls_consistency_compatibility.sql`
44. `20260702_visitor_daily_stats.sql`
45. `20260703_balance_order_payment.sql`
46. `20260703_digital_delivery_atomic_hardening.sql`
47. `20260703_refund_flow_hardening.sql`
48. `20260703_system_settings_announcements_maintenance.sql`
49. `20260704_000_bep20_phase1_preflight.sql`
50. `20260704_bep20_chain_payment_phase1.sql`
51. `20260704_products_admin_write_policy.sql`
52. `20260704_recharge_review_flow.sql`
53. `20260708_bep20_phase1_atomic_hardening.sql`
54. `20260708_bep20_phase1_completion_hardening.sql`
55. `20260708_bep20_phase1_manual_review_decision.sql`
56. `20260708_order_payment_currency_snapshot_fix.sql`
57. `20260709_create_order_status_ambiguity_fix.sql`
58. `20260709_digital_delivery_reserved_fulfillment_hardening.sql`
59. `20260709_legal_documents_seed.sql`
60. `20260709_order_lifecycle_non_payment_hardening.sql`
61. `20260709_profiles_schema_alignment.sql`

Re-run the inventory command before execution and use the actual count from the filesystem as authoritative.

## Known Execution Status

Confirmed by previous manual test-database work in this thread:

- `schema.sql`
- `20260619_products_categories_baseline.sql`
- `orders-schema.sql`
- `20260620_order_payments.sql`
- `20260620_digital_inventory_delivery.sql`
- `20260622_super_admin_payment_console.sql`
- `20260623_payment_balance_transactions_compatibility.sql`
- `20260623_payment_provider_core.sql`
- `20260623_payment_core_linkage.sql`
- `20260701_legal_documents_order_evidence.sql`
- `20260704_000_bep20_phase1_preflight.sql`
- `20260704_bep20_chain_payment_phase1.sql`
- `20260708_bep20_phase1_atomic_hardening.sql`
- `20260708_bep20_phase1_completion_hardening.sql`
- `20260708_bep20_phase1_manual_review_decision.sql`
- `20260709_legal_documents_seed.sql`

Explicitly still requiring manual confirmation or execution in the test database:

- `20260709_profiles_schema_alignment.sql`
- `20260709_order_lifecycle_non_payment_hardening.sql`
- `20260709_digital_delivery_reserved_fulfillment_hardening.sql`
- Any 20260620-20260704 operational/admin/refund/recharge migrations not listed as confirmed above.

Do not infer execution from file presence in the repository.

## Dependency Graph Summary

- `schema.sql` and `orders-schema.sql` are base inputs for an empty test database.
- `20260619_products_categories_baseline.sql` creates `categories`, `products`, `public.is_admin()`, and `public.set_updated_at()`. Many later policies depend on these helpers.
- `20260620_order_payments.sql` and `20260623_payment_*` establish payment tables and core functions.
- `20260620_digital_inventory_delivery.sql` establishes digital inventory and early delivery functions.
- Digital delivery hardening files overwrite earlier `deliver_digital_order()` and `release_order_inventory()` behavior. The latest delivery implementation must be applied last.
- Order lifecycle hardening overwrites earlier `create_order_with_item()` and `release_order_inventory()` implementations. It must run after earlier order creation and expiration migrations.
- BEP20 files must run in this order: preflight, phase1 tables, atomic hardening, completion hardening, currency snapshot fix, manual review decision.
- `20260709_profiles_schema_alignment.sql` depends on the existing `profiles` table and must not be run before the base auth/profile schema exists.
- `20260709_legal_documents_seed.sql` depends on `legal_documents`.

## Function Replacement Conflicts

The following functions are intentionally replaced by later migrations:

- `public.create_order_with_item`: latest expected implementation is from `20260709_order_lifecycle_non_payment_hardening.sql`.
- `public.release_order_inventory`: latest expected implementation is from `20260709_order_lifecycle_non_payment_hardening.sql`.
- `public.deliver_digital_order`: latest expected implementation is from `20260709_digital_delivery_reserved_fulfillment_hardening.sql`.
- `public.complete_payment_session`: latest expected implementation is from `20260708_order_payment_currency_snapshot_fix.sql`.
- `public.claim_bep20_chain_transaction`: latest expected implementation is from `20260708_bep20_phase1_completion_hardening.sql`.
- `public.prepare_bep20_payment_completion`: latest expected implementation is from `20260708_bep20_phase1_manual_review_decision.sql`.

Running an older migration after the hardening migration can silently downgrade behavior.

## Recommended Batch Plan

### Batch A: Base Catalog And Core Helpers

Run only after confirming the target is the test database.

1. `schema.sql`
2. `20260619_products_categories_baseline.sql`
3. `orders-schema.sql`
4. `20260620_site_settings.sql`
5. `20260620_referral_system.sql`
6. `20260622_fix_referral_signup_and_short_links.sql`
7. `20260629_app_migration_history_and_schema_check.sql`

Verify: `categories`, `products`, `orders`, `order_items`, `profiles`, `public.is_admin()`, and `public.set_updated_at()` exist.

### Batch B: Profiles, Privacy, And Account Compatibility

1. `20260630_privacy_account_controls.sql`
2. `20260709_profiles_schema_alignment.sql`

Verify: `profiles` has the fields expected by application code; no query still selects nonexistent `profiles.country` unless the migration added it.

### Batch C: Order Lifecycle And Legal Evidence

1. `20260620_order_payments.sql`
2. `20260629_direct_purchase_order_idempotency.sql`
3. `20260701_legal_documents_order_evidence.sql`
4. `20260701_order_payment_method_selection.sql`
5. `20260701_order_expiration_inventory_release.sql`
6. `20260709_create_order_status_ambiguity_fix.sql`
7. `20260709_order_lifecycle_non_payment_hardening.sql`
8. `20260709_legal_documents_seed.sql`

Verify: `create_order_with_item()` has the latest signature, legal documents have four published rows, and order statuses accept `expired`.

### Batch D: Digital Inventory And Delivery

1. `20260620_digital_inventory_delivery.sql`
2. `20260622_digital_delivery_hardening.sql`
3. `20260623_digital_inventory_batches.sql`
4. `20260623_mixed_order_item_fulfillment.sql`
5. `20260629_multi_sku_core.sql`
6. `20260703_digital_delivery_atomic_hardening.sql`
7. `20260709_digital_delivery_reserved_fulfillment_hardening.sql`

Verify: `digital_inventory.status` supports `reserved`; `deliver_digital_order()` is the latest reserved-fulfillment implementation.

### Batch E: Payment, Balance, Refund, Recharge, And BEP20

1. `20260622_recharge_records.sql`
2. `20260623_payment_balance_transactions_compatibility.sql`
3. `20260623_payment_provider_core.sql`
4. `20260623_payment_core_linkage.sql`
5. `20260623_payment_reconciliation_system.sql`
6. `20260629_account_recharge_client_request_id.sql`
7. `20260629_payment_reconciliation_runs_logs.sql`
8. `20260629_refund_after_sales.sql`
9. `20260703_balance_order_payment.sql`
10. `20260703_refund_flow_hardening.sql`
11. `20260704_recharge_review_flow.sql`
12. `20260704_000_bep20_phase1_preflight.sql`
13. `20260704_bep20_chain_payment_phase1.sql`
14. `20260708_bep20_phase1_atomic_hardening.sql`
15. `20260708_bep20_phase1_completion_hardening.sql`
16. `20260708_order_payment_currency_snapshot_fix.sql`
17. `20260708_bep20_phase1_manual_review_decision.sql`

Verify: BEP20 tables, claim RPC, completion RPC, manual review decision RPC, and `order_payments` amount/currency snapshot fields.

### Batch F: Admin, Audit, Observability, Search, And System Tools

1. `20260622_super_admin_payment_console.sql`
2. `20260623_admin_audit_logs.sql`
3. `20260624_admin_visit_analytics.sql`
4. `20260629_admin_user_controls.sql`
5. `20260629_i18n_currency_timezone_settings.sql`
6. `20260629_media_assets.sql`
7. `20260629_system_error_events.sql`
8. `20260630_admin_audit_integrity.sql`
9. `20260630_backup_runs.sql`
10. `20260630_business_id_global_search_indexes.sql`
11. `20260630_data_consistency_scan.sql`
12. `20260630_data_origin_labels.sql`
13. `20260630_order_query_tokens.sql`
14. `20260701_business_compensation_tasks.sql`
15. `20260701_email_notifications.sql`
16. `20260701_query_performance_indexes.sql`
17. `20260701_request_tracing_enhancements.sql`
18. `20260701_risk_events_reviews.sql`
19. `20260702_schema_rls_consistency_compatibility.sql`
20. `20260702_visitor_daily_stats.sql`
21. `20260703_system_settings_announcements_maintenance.sql`
22. `20260704_products_admin_write_policy.sql`

Verify: admin policies, audit tables, indexes, and readonly system pages.

## Safe Retry Notes

Generally safer to retry:

- Migrations using `create table if not exists`.
- Migrations using `alter table ... add column if not exists`.
- Migrations using `create index if not exists`.
- Migrations using `create or replace function`.
- Seed migrations using `on conflict`.

Requires careful preflight before retry:

- Migrations adding unique indexes or constraints.
- Migrations replacing functions that older migrations also replace.
- Migrations with policy creation that does not first drop or check existing policies.
- Migrations with check constraints over existing rows.
- BEP20 claim and completion hardening migrations, because partial execution can leave function/table contracts out of sync.

## Test Database Execution Rules

- Execute one batch at a time.
- Stop immediately on the first error.
- Run the preflight checks after each batch.
- Do not split BEP20 hardening migration bodies unless the migration explicitly says it is safe.
- Do not run production data-copy SQL in the migration batch.
- Do not run test integration SQL outside the test project.

## Post-Execution Smoke Checks

After all selected migrations:

1. Open homepage and product catalog.
2. Open checkout.
3. Create a pending order in the test database.
4. Load `/api/legal/current`.
5. Run BEP20 database integration test in the test project only.
6. Confirm admin product edit/status APIs still work.
