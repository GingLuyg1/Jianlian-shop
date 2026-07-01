# Jianlian Shop Database Index Plan

Last updated: 2026-07-01

## Migration

New migration:

```text
supabase/migrations/20260701_query_performance_indexes.sql
```

Execution:

1. Backup database.
2. Open Supabase SQL Editor.
3. Run the migration manually.
4. Verify no index creation errors.
5. Run selected `EXPLAIN ANALYZE` checks on staging or a read replica.

This migration does not delete data, does not drop indexes, and does not change business rules.

## Proposed Indexes and Query Mapping

| Index | Query Pattern |
| --- | --- |
| `products_status_category_sort_idx` | Frontend/admin product list filtered by status/category and sorted by sort/created. |
| `products_slug_lookup_idx` | Product detail exact slug lookup. |
| `products_updated_at_idx` | Admin recent product updates. |
| `product_skus_product_status_sort_idx` | Product detail/list SKU summaries and purchasable SKU filtering. |
| `product_skus_code_lookup_idx` | SKU code search and admin lookup. |
| `categories_parent_level_sort_idx` | Category tree and two-level category panel. |
| `categories_slug_lookup_idx` | Category route lookup. |
| `orders_user_created_idx` | User order list. |
| `orders_status_payment_created_idx` | Admin order filtering and pending/paid dashboards. |
| `orders_order_no_lookup_idx` | Order detail/query by order number. |
| `order_items_order_id_idx` | Order detail item loading. |
| `order_items_product_sku_idx` | Sales/product/SKU report joins. |
| `payment_sessions_order_status_created_idx` | Order payment state lookup and admin payment filters. |
| `payment_sessions_payment_no_lookup_idx` | Payment detail lookup. |
| `payment_sessions_provider_trade_idx` | Callback/reconciliation provider transaction lookup. |
| `account_recharges_user_created_idx` | User recharge record list. |
| `account_recharges_status_created_idx` | Admin recharge status filter. |
| `account_recharges_no_lookup_idx` | Recharge detail by number. |
| `refund_requests_order_status_created_idx` | Order refund detail and admin refund filter. |
| `refund_requests_no_lookup_idx` | Refund detail by number. |
| `balance_transactions_user_created_idx` | User balance transaction list. |
| `balance_transactions_no_lookup_idx` | Balance transaction lookup. |
| `digital_inventory_product_sku_status_idx` | Available/reserved/delivered inventory by product/SKU. |
| `digital_inventory_reserved_order_idx` | Reserved inventory by order. |
| `digital_inventory_delivered_order_idx` | Delivered inventory by order. |
| `order_deliveries_order_item_status_idx` | Delivery detail and retry checks. |
| `order_deliveries_user_created_idx` | User delivery summaries. |
| `admin_audit_logs_action_created_idx` | Audit log action filter. |
| `admin_audit_logs_target_created_idx` | Audit log target lookup. |
| `admin_audit_logs_business_no_idx` | Business number search. |
| `system_error_events_performance_last_seen_idx` | Performance page recent event list. |
| `system_error_events_performance_route_idx` | Performance route filter. |

## Duplicate Index Review

No destructive duplicate-index cleanup is included. After production stats are available, review:

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

Do not drop indexes without checking query plans and write overhead.

## Recommended Explain Checks

Run on staging or a read replica:

```sql
explain analyze
select id, name, slug, price, stock
from public.products
where status = 'active' and category_id = '<category-id>'
order by sort_order asc, created_at desc
limit 20;

explain analyze
select id, order_no, status, payment_status, total_amount, created_at
from public.orders
where user_id = '<user-id>'
order by created_at desc
limit 20;

explain analyze
select id, product_id, sku_id, status
from public.digital_inventory
where product_id = '<product-id>' and sku_id = '<sku-id>' and status = 'available'
limit 20;
```

Never run high-load tests against production during business hours.

## Remaining Work

- Add true full-text or trigram search only after real query volume justifies it.
- Convert heavy reports to database aggregates or scheduled rollups.
- Consider cursor pagination for audit logs, payment callbacks, visitor events, and inventory history.
- Record slow query baselines for at least 7 days before dropping any existing index.

