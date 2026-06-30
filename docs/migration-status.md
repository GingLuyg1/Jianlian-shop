# Jianlian Shop Migration Status

Date: 2026-06-30

Rules:

- Do not execute SQL automatically from this document.
- Do not infer execution from file existence.
- Mark execution as `待确认` until the target Supabase project has an `app_migration_history` record or another trusted release record.
- Do not edit old migrations after they may have been executed. Add a compatible follow-up migration instead.
- Never record database passwords, service role keys, or raw environment values here.

## Manual Execution Register

| Order | Migration file | Functional module | Depends on | Local code references | Executed? | Environment | Executed at | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | `20260620_referral_system.sql` | referrals | base `profiles`, `orders` | yes | 待确认 |  |  |  | Adds referral profile fields, `referrals`, `referral_commissions`, referral functions/policies. |
| 20 | `20260620_digital_inventory_delivery.sql` | digital inventory, delivery, orders | base catalog/orders | yes | 待确认 |  |  |  | Creates `digital_inventory`; old delivery/order RPCs are superseded by later hardening. |
| 30 | `20260620_order_payments.sql` | legacy order payment proof | base orders/profiles | yes | 待确认 |  |  |  | Creates `order_payments`; payment session system is added later. |
| 40 | `20260620_site_settings.sql` | site settings | base profiles/orders | yes | 待确认 |  |  |  | Creates `site_settings`, `site_setting_logs`; also replaces `create_order_with_item`. |
| 50 | `20260622_fix_referral_signup_and_short_links.sql` | referrals | `20260620_referral_system.sql` | yes | 待确认 |  |  |  | Refines referral signup/short links. |
| 60 | `20260622_recharge_records.sql` | recharge | base profiles | yes | 待确认 |  |  |  | Creates legacy `recharge_records`; later payment console/linkage extends recharge model. |
| 70 | `20260622_super_admin_payment_console.sql` | payment channels | `20260622_recharge_records.sql` | yes | 待确认 |  |  |  | Adds payment channel/admin console foundation. |
| 80 | `20260622_digital_delivery_hardening.sql` | delivery hardening | `20260620_digital_inventory_delivery.sql` | yes | 待确认 |  |  |  | Replaces delivery RPCs, adds delivery logs/secrets and content protection. Blocking if missing. |
| 90 | `20260623_admin_audit_logs.sql` | audit logs | admin/profile role support | yes | 待确认 |  |  |  | Creates `admin_audit_logs`; required by admin sensitive actions. Blocking if missing. |
| 100 | `20260623_payment_provider_core.sql` | payment provider core | payment console | yes | 待确认 |  |  |  | Adds provider/channel/session core fields and functions. Blocking for payment pages. |
| 110 | `20260623_payment_core_linkage.sql` | order/recharge payment linkage | provider core, orders/recharge | yes | 待确认 |  |  |  | Links `payment_sessions` to order/recharge business records. |
| 120 | `20260623_payment_balance_transactions_compatibility.sql` | balance ledger | payment linkage | yes | 待确认 |  |  |  | Adds/normalizes `balance_transactions`. |
| 130 | `20260623_payment_reconciliation_system.sql` | reconciliation | provider core | yes | 待确认 |  |  |  | Creates `payment_reconciliations` and reconciliation functions. |
| 140 | `20260623_mixed_order_item_fulfillment.sql` | mixed fulfillment | inventory and orders | yes | 待确认 |  |  |  | Adds mixed physical/digital order item fulfillment support. |
| 150 | `20260623_digital_inventory_batches.sql` | inventory batches | inventory hardening | yes | 待确认 |  |  |  | Adds `digital_inventory_batches` and batch list/import RPCs. |
| 160 | `20260624_admin_visit_analytics.sql` | analytics | base profiles | yes | 待确认 |  |  |  | Adds `visitor_events` and admin visit analytics. |
| 170 | `20260629_account_recharge_client_request_id.sql` | recharge idempotency | recharge/payment sessions | yes | 待确认 |  |  |  | Adds client request id support to prevent duplicate recharge. |
| 180 | `20260629_admin_user_controls.sql` | admin user controls | profiles, audit logs | yes | 待确认 |  |  |  | Adds user status/risk fields, history tables and admin RPCs. |
| 190 | `20260629_app_migration_history_and_schema_check.sql` | release/schema check | all prior key migrations | yes | 待确认 |  |  |  | Creates `app_migration_history` and `app_check_database_structure`. Required by status panels. |
| 200 | `20260629_direct_purchase_order_idempotency.sql` | order idempotency | orders, order RPCs | yes | 待确认 |  |  |  | Adds direct purchase duplicate request protection. |
| 210 | `20260629_i18n_currency_timezone_settings.sql` | i18n/settings | `site_settings` | yes | 待确认 |  |  |  | Adds currency/timezone settings. |
| 220 | `20260629_media_assets.sql` | media assets | storage, admin audit | yes | 待确认 |  |  |  | Creates `media_assets` and media management policies. |
| 230 | `20260629_multi_sku_core.sql` | multi-SKU | products, orders, inventory | yes | 待确认 |  |  |  | Creates SKU tables, `cart_items`, SKU snapshots and SKU-aware delivery RPC. Blocking for SKU launch. |
| 240 | `20260629_payment_reconciliation_runs_logs.sql` | reconciliation runs | reconciliation system | yes | 待确认 |  |  |  | Creates `payment_reconciliation_runs` and logs. |
| 250 | `20260629_refund_after_sales.sql` | refunds | orders, payments, audit | yes | 待确认 |  |  |  | Creates `refund_requests`, `refund_status_logs`, `site_notifications`, refund RPCs. |
| 260 | `20260629_system_error_events.sql` | monitoring | audit/admin role | yes | 待确认 |  |  |  | Creates `system_error_events` and upsert function. |
| 270 | `20260630_backup_runs.sql` | backup register | admin role | yes | 待确认 |  |  |  | Creates `backup_runs`. |
| 280 | `20260630_privacy_account_controls.sql` | privacy/account deletion | profiles, audit logs | yes | 待确认 |  |  |  | Creates `privacy_requests`, `privacy_request_events`, anonymization RPC. |

## Objects Checked From Current SQL

Required objects include at least:

- Payment/order: `order_payments`, `payment_sessions`, `payment_channels`, `payment_callback_logs`, `payment_reconciliations`, `payment_reconciliation_runs`, `payment_reconciliation_logs`, `balance_transactions`.
- Inventory/delivery: `digital_inventory`, `digital_inventory_batches`, `digital_delivery_secrets`, `delivery_logs`, `order_deliveries.sku_id`.
- SKU: `product_option_groups`, `product_option_values`, `product_skus`, `product_sku_values`, `cart_items`, `order_items.sku_id`, `order_items.sku_code`, `order_items.sku_title`, `order_items.option_snapshot`.
- Admin/system: `admin_audit_logs`, `visitor_events`, `system_error_events`, `media_assets`, `backup_runs`, `app_migration_history`.
- User/account: `refund_requests`, `refund_status_logs`, `site_notifications`, `privacy_requests`, `privacy_request_events`, `user_account_status_history`, `user_risk_records`.

## Potential Duplicate Or Replaced Functions

These functions are intentionally replaced by later migrations. Re-running old migrations on a live database can override newer behavior:

- `create_order_with_item`: appears in early order/settings migrations and is replaced again by direct-purchase and SKU migrations.
- `deliver_digital_order`, `auto_deliver_order`, `admin_retry_auto_delivery`, `admin_update_order_status`: early inventory functions are replaced by delivery hardening and SKU-aware delivery.
- `admin_list_digital_inventory_summary`, `admin_list_digital_inventory_items`, `admin_import_digital_inventory`: early versions are extended by batch/SKU migrations.
- `handle_new_user`: referral migration changes signup behavior.

## Possible Production Conflicts

- Existing tables with incompatible columns or constraints may conflict with `alter table ... add constraint` and function replacement statements.
- Old production data may violate new `status` check constraints.
- Re-running superseded functions can remove SKU-aware or hardened logic.
- `app_migration_history` may be absent, so execution status must be confirmed manually before production launch.

## Recommended Manual Order

Use the table order above. Minimum order for currently blocking runtime checks:

1. Execute all migrations through `20260623_mixed_order_item_fulfillment.sql`.
2. Execute `20260623_digital_inventory_batches.sql`.
3. Execute `20260629_multi_sku_core.sql`.
4. Execute `20260629_direct_purchase_order_idempotency.sql`.
5. Execute `20260629_app_migration_history_and_schema_check.sql`.
6. Execute admin/user/refund/media/monitoring/privacy/backup migrations as listed before enabling those pages.

## Manual Update Method

After executing each migration manually:

1. Fill `Executed?`, `Environment`, `Executed at`, and `Result`.
2. Add the database `request_id` or release ticket in `Notes`.
3. If execution fails, record the exact migration file, failed statement summary, error code/message, and rollback/follow-up decision.
4. Do not paste secrets or service keys.
