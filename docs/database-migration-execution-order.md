# Jianlian Shop 数据库 Migration 执行顺序

本文件只整理当前代码仓库中的 Supabase migration 执行顺序和风险点，不代表已经在线上执行。不要跳过只读核验直接在生产执行修复 SQL。

## 总体原则

1. 先备份数据库，再执行任何 migration。
2. 所有 SQL 均在 Supabase SQL Editor 手动执行，本任务没有自动执行 SQL。
3. 先执行只读检查，确认重复 slug、重复 SKU、重复 client_request_id 等问题为 0 后，再执行兼容约束。
4. 当前 migration 链不是从空库完整可重放：`products`、`categories`、`orders`、`order_items`、`order_status_logs` 基础建表文件不在 `supabase/migrations` 中，线上数据库必须已存在这些基础表。
5. 多个 migration 通过 `create or replace function` 覆盖同名函数，必须按文件名时间顺序执行，不能倒序或单独随机执行。

## 当前 migration 列表

```text
20260620_digital_inventory_delivery.sql
20260620_order_payments.sql
20260620_referral_system.sql
20260620_site_settings.sql
20260622_digital_delivery_hardening.sql
20260622_fix_referral_signup_and_short_links.sql
20260622_recharge_records.sql
20260622_super_admin_payment_console.sql
20260623_admin_audit_logs.sql
20260623_digital_inventory_batches.sql
20260623_mixed_order_item_fulfillment.sql
20260623_payment_balance_transactions_compatibility.sql
20260623_payment_core_linkage.sql
20260623_payment_provider_core.sql
20260623_payment_reconciliation_system.sql
20260624_admin_visit_analytics.sql
20260629_account_recharge_client_request_id.sql
20260629_admin_user_controls.sql
20260629_app_migration_history_and_schema_check.sql
20260629_direct_purchase_order_idempotency.sql
20260629_i18n_currency_timezone_settings.sql
20260629_media_assets.sql
20260629_multi_sku_core.sql
20260629_payment_reconciliation_runs_logs.sql
20260629_refund_after_sales.sql
20260629_system_error_events.sql
20260630_admin_audit_integrity.sql
20260630_backup_runs.sql
20260630_business_id_global_search_indexes.sql
20260630_data_consistency_scan.sql
20260630_data_origin_labels.sql
20260630_order_query_tokens.sql
20260630_privacy_account_controls.sql
20260701_business_compensation_tasks.sql
20260701_email_notifications.sql
20260701_legal_documents_order_evidence.sql
20260701_order_expiration_inventory_release.sql
20260701_order_payment_method_selection.sql
20260701_query_performance_indexes.sql
20260701_request_tracing_enhancements.sql
20260701_risk_events_reviews.sql
20260702_visitor_daily_stats.sql
20260702_schema_rls_consistency_compatibility.sql
```

## 建议手动执行顺序

1. 先确认基础表已存在：`profiles`、`categories`、`products`、`orders`、`order_items`、`order_status_logs`、`order_deliveries`。
2. 按文件名从早到晚执行 `supabase/migrations` 中的文件。
3. 重点注意这些覆盖型 migration 顺序：
   - `20260620_digital_inventory_delivery.sql`
   - `20260622_digital_delivery_hardening.sql`
   - `20260629_multi_sku_core.sql`
   - `20260629_direct_purchase_order_idempotency.sql`
   - `20260701_legal_documents_order_evidence.sql`
   - `20260701_order_expiration_inventory_release.sql`
   后者会覆盖或补充前者的 RPC，不能倒序执行。
4. 最后执行 `20260702_schema_rls_consistency_compatibility.sql`。它只补齐代码依赖字段、索引和 RLS 读取策略，不清理数据。
5. 执行完后运行 `docs/database-schema-rls-verification.md` 中的只读 SQL，确认结构、RLS 和重复数据状态。

## 重复和冲突检查结果

- 文件名无完全重复。
- 存在同日多文件，属于正常排序风险，不是重复文件。
- `create_order_with_item` 在多处 migration 中被覆盖：必须以后续 idempotency 和法律证据版本为准。
- `is_admin` / `is_super_admin_user` 存在多处定义或调用形式差异：新兼容 migration 避免依赖特定签名，只使用基础 RLS 查询策略补齐。
- `recharge_records` 与 `account_recharges` 并存：代码主要使用 `account_recharges`，`recharge_records` 属于早期充值记录表，不建议继续扩展为主链路。

## 必须先只读确认的项目

详见 `docs/database-schema-rls-verification.md`：

- `products.slug` 是否重复。
- `categories.slug` 是否重复。
- `product_skus(product_id, sku_code)` 是否重复。
- `orders(user_id, client_request_id)` 是否重复。
- `payment_sessions` 是否有同业务多个 pending/processing 会话。
- 核心表是否启用 RLS 且策略符合用户隔离。

## 结论

当前代码功能较多，migration 链需要按顺序执行并补跑兼容 migration。正式上线前，必须将基础表建表来源纳入版本管理，或至少在运维文档中固定基础建表 SQL，否则新环境无法从仓库 migration 完整重建数据库。
