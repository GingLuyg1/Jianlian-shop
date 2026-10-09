-- Disposable CI schema only; runtime function bodies are extracted unchanged
-- from repository migrations by snpay-order-db-matrix.mjs, not reimplemented.
alter table public.orders
 add column order_no text unique, add column user_id uuid references auth.users(id),
 add column status text, add column payment_method text, add column created_at timestamptz,
 add column payment_expires_at timestamptz, add column reservation_released_at timestamptz,
 add column updated_at timestamptz, add column paid_at timestamptz,
 add column cancelled_at timestamptz, add column expired_at timestamptz,
 add column processed_at timestamptz, add column completed_at timestamptz,
 add column admin_note text, add column fulfillment_status text,
 add column customer_email text, add column customer_name text, add column customer_phone text, add column customer_note text;
alter table public.payment_sessions add column closed_at timestamptz;
alter table public.order_payments
 add column order_id uuid references public.orders(id), add column user_id uuid,
 add column payment_method text, add column status text, add column provider_trade_no text,
 add column transaction_reference text, add column submitted_at timestamptz, add column reviewed_at timestamptz,
 add column business_type text, add column channel text, add column fee_amount numeric default 0;
create unique index ci_order_provider_tx on public.order_payments(provider_trade_no);
create table public.products(id uuid primary key, stock integer, status text, updated_at timestamptz);
create table public.product_skus(id uuid primary key, stock integer, status text, updated_at timestamptz);
create table public.order_items(
 id uuid primary key, order_id uuid references public.orders(id), product_id uuid references public.products(id), sku_id uuid,
 quantity integer, delivery_type text, delivery_status text default 'pending', product_snapshot jsonb default '{}',
 created_at timestamptz default now(), delivery_started_at timestamptz, delivery_status_updated_at timestamptz,
 delivery_completed_at timestamptz, delivery_failure_reason text, delivered_quantity integer default 0);
create table public.digital_inventory(
 id uuid primary key, product_id uuid, sku_id uuid, status text, content text, order_id uuid,
 reserved_order_id uuid, reserved_order_item_id uuid, reserved_user_id uuid, reserved_at timestamptz,
 delivered_order_id uuid, delivered_order_item_id uuid, delivered_user_id uuid, delivered_at timestamptz,
 expires_at timestamptz, created_at timestamptz default now(), updated_at timestamptz);
create table public.order_deliveries(
 id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), order_item_id uuid references public.order_items(id),
 user_id uuid, product_id uuid, sku_id uuid, inventory_id uuid unique,
 delivery_type text, encrypted_content text, delivery_status text, delivery_no text,
 failure_reason text, delivered_at timestamptz, created_at timestamptz, updated_at timestamptz);
create unique index ci_supplier_delivery_once on public.order_deliveries(order_item_id)
 where delivery_type='supplier_delivery' and delivery_status='delivered';
create table public.digital_delivery_secrets(delivery_id uuid primary key references public.order_deliveries(id), content text);
create table public.order_status_logs(id uuid primary key default gen_random_uuid(), order_id uuid, from_status text,to_status text,operator_id uuid,operator_type text,note text);
create table public.order_item_delivery_logs(id uuid primary key default gen_random_uuid(),order_id uuid,order_item_id uuid,from_status text,to_status text,operator_id uuid,operator_type text,note text);
create table public.delivery_logs(id uuid primary key default gen_random_uuid(),order_id uuid,order_item_id uuid,inventory_id uuid,operator_id uuid,operator_type text,trigger_source text,event_type text,message text,detail jsonb);
create table public.chain_payment_sessions(id uuid primary key,order_id uuid,status text,submitted_tx_hash text,failure_reason text,updated_at timestamptz);
create table public.supplier_fulfillment_requests(
 id uuid primary key default gen_random_uuid(),order_id uuid,order_item_id uuid unique,supplier text,supplier_product_id text,supplier_sku text,
 request_id text unique,status text,retryable boolean default false,attempt_token uuid,attempt_count integer default 0,last_attempt_at timestamptz,
 trigger_source text,last_error_code text,provider_order_code text,supplier_unit_price numeric,supplier_total_price numeric,completed_at timestamptz);
