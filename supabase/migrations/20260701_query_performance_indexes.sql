-- Query performance baseline indexes.
-- Execute manually in Supabase SQL Editor after backup.
-- This migration is idempotent and only creates indexes when the target table/columns exist.

do $$
begin
  if to_regclass('public.products') is not null then
    create index if not exists products_status_category_sort_idx
      on public.products(status, category_id, sort_order, created_at desc);
    create index if not exists products_slug_lookup_idx
      on public.products(slug);
    create index if not exists products_updated_at_idx
      on public.products(updated_at desc);
  end if;

  if to_regclass('public.product_skus') is not null then
    create index if not exists product_skus_product_status_sort_idx
      on public.product_skus(product_id, status, sort_order);
    create index if not exists product_skus_code_lookup_idx
      on public.product_skus(sku_code);
  end if;

  if to_regclass('public.categories') is not null then
    create index if not exists categories_parent_level_sort_idx
      on public.categories(parent_id, level, sort_order);
    create index if not exists categories_slug_lookup_idx
      on public.categories(slug);
  end if;

  if to_regclass('public.orders') is not null then
    create index if not exists orders_user_created_idx
      on public.orders(user_id, created_at desc);
    create index if not exists orders_status_payment_created_idx
      on public.orders(status, payment_status, created_at desc);
    create index if not exists orders_order_no_lookup_idx
      on public.orders(order_no);
  end if;

  if to_regclass('public.order_items') is not null then
    create index if not exists order_items_order_id_idx
      on public.order_items(order_id);
    create index if not exists order_items_product_sku_idx
      on public.order_items(product_id, sku_id);
  end if;

  if to_regclass('public.payment_sessions') is not null then
    create index if not exists payment_sessions_order_status_created_idx
      on public.payment_sessions(order_id, status, created_at desc);
    create index if not exists payment_sessions_payment_no_lookup_idx
      on public.payment_sessions(payment_no);
    create index if not exists payment_sessions_provider_trade_idx
      on public.payment_sessions(provider_transaction_id)
      where provider_transaction_id is not null;
  end if;

  if to_regclass('public.account_recharges') is not null then
    create index if not exists account_recharges_user_created_idx
      on public.account_recharges(user_id, created_at desc);
    create index if not exists account_recharges_status_created_idx
      on public.account_recharges(status, created_at desc);
    create index if not exists account_recharges_no_lookup_idx
      on public.account_recharges(recharge_no);
  end if;

  if to_regclass('public.refund_requests') is not null then
    create index if not exists refund_requests_order_status_created_idx
      on public.refund_requests(order_id, status, created_at desc);
    create index if not exists refund_requests_no_lookup_idx
      on public.refund_requests(refund_no);
  end if;

  if to_regclass('public.balance_transactions') is not null then
    create index if not exists balance_transactions_user_created_idx
      on public.balance_transactions(user_id, created_at desc);
    create index if not exists balance_transactions_no_lookup_idx
      on public.balance_transactions(transaction_no);
  end if;

  if to_regclass('public.digital_inventory') is not null then
    create index if not exists digital_inventory_product_sku_status_idx
      on public.digital_inventory(product_id, sku_id, status);
    create index if not exists digital_inventory_reserved_order_idx
      on public.digital_inventory(reserved_order_id)
      where reserved_order_id is not null;
    create index if not exists digital_inventory_delivered_order_idx
      on public.digital_inventory(delivered_order_id)
      where delivered_order_id is not null;
  end if;

  if to_regclass('public.order_deliveries') is not null then
    create index if not exists order_deliveries_order_item_status_idx
      on public.order_deliveries(order_id, order_item_id, delivery_status);
    create index if not exists order_deliveries_user_created_idx
      on public.order_deliveries(user_id, created_at desc);
  end if;

  if to_regclass('public.admin_audit_logs') is not null then
    create index if not exists admin_audit_logs_action_created_idx
      on public.admin_audit_logs(action, created_at desc);
    create index if not exists admin_audit_logs_target_created_idx
      on public.admin_audit_logs(target_type, target_id, created_at desc);
    create index if not exists admin_audit_logs_business_no_idx
      on public.admin_audit_logs(business_no)
      where business_no is not null;
  end if;

  if to_regclass('public.system_error_events') is not null then
    create index if not exists system_error_events_performance_last_seen_idx
      on public.system_error_events(category, last_seen_at desc)
      where category = 'performance';
    create index if not exists system_error_events_performance_route_idx
      on public.system_error_events(route, last_seen_at desc)
      where category = 'performance' and route is not null;
  end if;
end $$;

