-- Business ID global search indexes and uniqueness guards.
-- Safe to run manually in Supabase SQL Editor; this file is not executed automatically.

create extension if not exists pg_trgm;

create unique index if not exists orders_order_no_unique_present
  on public.orders (order_no)
  where order_no is not null and btrim(order_no) <> '';
create index if not exists orders_order_no_trgm_idx on public.orders using gin (order_no gin_trgm_ops);
create index if not exists orders_customer_email_trgm_idx on public.orders using gin (customer_email gin_trgm_ops);

create unique index if not exists payment_sessions_session_no_unique_present
  on public.payment_sessions (session_no)
  where session_no is not null and btrim(session_no) <> '';
create index if not exists payment_sessions_business_lookup_idx on public.payment_sessions (business_type, business_id);
create index if not exists payment_sessions_business_no_trgm_idx on public.payment_sessions using gin (business_no gin_trgm_ops);
create index if not exists payment_sessions_provider_order_no_trgm_idx on public.payment_sessions using gin (provider_order_no gin_trgm_ops);
create index if not exists payment_sessions_provider_transaction_id_trgm_idx on public.payment_sessions using gin (provider_transaction_id gin_trgm_ops);

create unique index if not exists order_payments_payment_no_unique_present
  on public.order_payments (payment_no)
  where payment_no is not null and btrim(payment_no) <> '';
create index if not exists order_payments_order_id_idx on public.order_payments (order_id);
create index if not exists order_payments_provider_trade_no_trgm_idx on public.order_payments using gin (provider_trade_no gin_trgm_ops);

create unique index if not exists account_recharges_recharge_no_unique_present
  on public.account_recharges (recharge_no)
  where recharge_no is not null and btrim(recharge_no) <> '';
create index if not exists account_recharges_recharge_no_trgm_idx on public.account_recharges using gin (recharge_no gin_trgm_ops);
create index if not exists account_recharges_user_email_trgm_idx on public.account_recharges using gin (user_email gin_trgm_ops);
create index if not exists account_recharges_provider_trade_no_trgm_idx on public.account_recharges using gin (provider_trade_no gin_trgm_ops);

create unique index if not exists refund_requests_refund_no_unique_present
  on public.refund_requests (refund_no)
  where refund_no is not null and btrim(refund_no) <> '';
create index if not exists refund_requests_order_id_idx on public.refund_requests (order_id);
create index if not exists refund_requests_refund_no_trgm_idx on public.refund_requests using gin (refund_no gin_trgm_ops);

create unique index if not exists balance_transactions_transaction_no_unique_present
  on public.balance_transactions (transaction_no)
  where transaction_no is not null and btrim(transaction_no) <> '';
create index if not exists balance_transactions_business_lookup_idx on public.balance_transactions (business_type, business_id);
create index if not exists balance_transactions_transaction_no_trgm_idx on public.balance_transactions using gin (transaction_no gin_trgm_ops);

create unique index if not exists digital_inventory_batches_batch_no_unique_present
  on public.digital_inventory_batches (batch_no)
  where batch_no is not null and btrim(batch_no) <> '';
create index if not exists digital_inventory_batches_batch_no_trgm_idx on public.digital_inventory_batches using gin (batch_no gin_trgm_ops);
create index if not exists digital_inventory_batches_batch_name_trgm_idx on public.digital_inventory_batches using gin (batch_name gin_trgm_ops);
create index if not exists digital_inventory_reserved_order_id_idx on public.digital_inventory (reserved_order_id);
create index if not exists digital_inventory_delivered_order_id_idx on public.digital_inventory (delivered_order_id);
create index if not exists digital_inventory_batch_no_idx on public.digital_inventory (batch_no);

create unique index if not exists product_skus_sku_code_unique_present
  on public.product_skus (sku_code)
  where sku_code is not null and btrim(sku_code) <> '';
create index if not exists product_skus_sku_code_trgm_idx on public.product_skus using gin (sku_code gin_trgm_ops);
create index if not exists product_skus_sku_title_trgm_idx on public.product_skus using gin (sku_title gin_trgm_ops);

create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_slug_trgm_idx on public.products using gin (slug gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx on public.profiles using gin (display_name gin_trgm_ops);
create index if not exists admin_audit_logs_request_id_idx on public.admin_audit_logs (request_id);
create index if not exists admin_audit_logs_target_lookup_idx on public.admin_audit_logs (target_type, target_id);
