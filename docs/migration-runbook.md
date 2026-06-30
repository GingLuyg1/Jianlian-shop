# Jianlian Shop Migration Runbook

Migrations are executed manually in Supabase SQL Editor. The application must not auto-run SQL.

## Before running SQL

1. Confirm the target environment.
2. Export or back up critical tables.
3. Pause risky write operations if the migration touches orders, payments, balances, or inventory.
4. Read the SQL file and confirm it is compatible and idempotent.
5. Run in staging first when available.

## Recommended manual execution order

Use this order for a fresh environment or structure reconciliation:

1. `20260620_referral_system.sql`
2. `20260620_digital_inventory_delivery.sql`
3. `20260620_order_payments.sql`
4. `20260620_site_settings.sql`
5. `20260622_fix_referral_signup_and_short_links.sql`
6. `20260622_recharge_records.sql`
7. `20260622_super_admin_payment_console.sql`
8. `20260622_digital_delivery_hardening.sql`
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

## Migration registration

After a migration is successfully executed, register it manually:

```sql
insert into public.app_migration_history (
  migration_name,
  checksum,
  applied_at,
  applied_by,
  environment,
  status,
  notes
) values (
  '20260629_app_migration_history_and_schema_check.sql',
  null,
  now(),
  auth.uid(),
  'production',
  'success',
  'Executed manually from Supabase SQL Editor'
)
on conflict (migration_name)
do update set
  applied_at = excluded.applied_at,
  applied_by = excluded.applied_by,
  environment = excluded.environment,
  status = excluded.status,
  notes = excluded.notes;
```

Do not store secrets in `notes`.

## Duplicate and superseded migrations

- `20260620_digital_inventory_delivery.sql` is superseded by `20260622_digital_delivery_hardening.sql` for hardened delivery behavior.
- `20260622_recharge_records.sql` is extended by later payment console and linkage migrations.
- Compatibility migrations are additive and must not be deleted from history.

## Verification after SQL

1. Open `/admin/system/database`.
2. Click `重新检查`.
3. Confirm missing table, field, function, and constraint counts are acceptable.
4. Confirm `app_migration_history` contains the executed migration.
5. Run application smoke tests.

## Rollback principles

Prefer forward-compatible corrective migrations. Avoid destructive rollbacks on tables containing orders, payments, balances, digital inventory, or delivery content.

If a migration must be reverted:

1. Stop new writes.
2. Back up affected tables.
3. Confirm no new data depends on the new structure.
4. Apply a reviewed rollback SQL manually.
5. Record the rollback in `app_migration_history` with `status = 'failed'` or a corrective migration record.
