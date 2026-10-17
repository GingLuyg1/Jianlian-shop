-- LOCAL DISPOSABLE POSTGRES ONLY. Never run against Test or Production.
-- Narrow existing-Supplier-Core fixture for migration DDL checks; this is not
-- equivalent to replaying the complete Supabase migration history.
\set ON_ERROR_STOP on

do $$ begin
  if current_database() not in (
       'jianlian_bitrefill_v13_test', 'jianlian_bitrefill_v13_db2',
       'jianlian_bitrefill_v13_dirty'
     )
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'V13_ISOLATED_DATABASE_GUARD_FAILED';
  end if;
end $$;

do $$ begin
  if to_regrole('anon') is null then create role anon nologin; end if;
  if to_regrole('authenticated') is null then create role authenticated nologin; end if;
  if to_regrole('service_role') is null then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create table public.orders (
  id uuid primary key,
  payment_status text not null,
  status text not null
);
create table public.order_items (
  id uuid primary key,
  order_id uuid references public.orders(id),
  quantity integer not null default 1,
  delivery_type text,
  product_snapshot jsonb
);
create table public.order_deliveries (
  id uuid primary key,
  order_item_id uuid not null references public.order_items(id),
  delivery_type text not null,
  delivery_status text not null
);
-- Mirrors the unique index defined by the existing Daju migration.
create unique index order_deliveries_supplier_item_delivered_uidx
  on public.order_deliveries(order_item_id)
  where delivery_type = 'supplier_delivery' and delivery_status = 'delivered';
create table public.supplier_fulfillment_requests (
  id uuid primary key,
  order_id uuid references public.orders(id),
  order_item_id uuid not null unique references public.order_items(id),
  supplier text not null,
  supplier_product_id text,
  supplier_sku text,
  request_id text not null unique,
  status text not null,
  provider_order_code text
);
