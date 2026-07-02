-- Jianlian Shop database schema and RLS compatibility checks.
-- Execute manually after all earlier migrations. This file is additive and idempotent.
-- It does not delete data, does not rewrite business records, and does not execute data cleanup.

create extension if not exists pgcrypto;

-- Core catalog compatibility -------------------------------------------------
do $$
begin
  if to_regclass('public.categories') is not null then
    alter table public.categories
      add column if not exists parent_id uuid,
      add column if not exists level integer not null default 1,
      add column if not exists icon text,
      add column if not exists description text,
      add column if not exists sort_order integer not null default 0,
      add column if not exists status text not null default 'active',
      add column if not exists is_active boolean not null default true,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists categories_parent_level_sort_idx on public.categories(parent_id, level, sort_order, name);
    create index if not exists categories_slug_lookup_idx on public.categories(slug);
    create index if not exists categories_active_level_idx on public.categories(is_active, status, level, sort_order);
  end if;

  if to_regclass('public.products') is not null then
    alter table public.products
      add column if not exists category_id uuid,
      add column if not exists name text,
      add column if not exists slug text,
      add column if not exists short_description text,
      add column if not exists description text,
      add column if not exists image_url text,
      add column if not exists gallery jsonb not null default '[]'::jsonb,
      add column if not exists price numeric not null default 0,
      add column if not exists original_price numeric,
      add column if not exists stock integer not null default 0,
      add column if not exists delivery_type text not null default 'manual',
      add column if not exists status text not null default 'draft',
      add column if not exists sort_order integer not null default 0,
      add column if not exists has_skus boolean not null default false,
      add column if not exists metadata jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists products_status_category_sort_idx on public.products(status, category_id, sort_order, created_at desc);
    create index if not exists products_slug_lookup_idx on public.products(slug);
    create index if not exists products_updated_at_idx on public.products(updated_at desc);
  end if;
end $$;

-- Add non-destructive uniqueness only when existing data is clean.
do $$
begin
  if to_regclass('public.products') is not null
     and not exists (
       select 1 from public.products
       where nullif(btrim(slug), '') is not null
       group by lower(btrim(slug)) having count(*) > 1
     ) then
    create unique index if not exists products_slug_unique_idx
      on public.products(lower(btrim(slug)))
      where nullif(btrim(slug), '') is not null;
  end if;

  if to_regclass('public.categories') is not null
     and not exists (
       select 1 from public.categories
       where nullif(btrim(slug), '') is not null
       group by lower(btrim(slug)) having count(*) > 1
     ) then
    create unique index if not exists categories_slug_unique_idx
      on public.categories(lower(btrim(slug)))
      where nullif(btrim(slug), '') is not null;
  end if;
end $$;

-- Product SKU compatibility --------------------------------------------------
do $$
begin
  if to_regclass('public.product_skus') is not null then
    alter table public.product_skus
      add column if not exists sku_code text,
      add column if not exists sku_title text,
      add column if not exists combination_key text,
      add column if not exists price numeric not null default 0,
      add column if not exists original_price numeric,
      add column if not exists stock integer not null default 0,
      add column if not exists status text not null default 'active',
      add column if not exists delivery_type text,
      add column if not exists image_url text,
      add column if not exists sort_order integer not null default 0,
      add column if not exists note text,
      add column if not exists metadata jsonb not null default '{}'::jsonb,
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists product_skus_product_status_sort_idx on public.product_skus(product_id, status, sort_order, created_at);
    create index if not exists product_skus_code_lookup_idx on public.product_skus(sku_code);

    if not exists (
      select 1 from public.product_skus
      where nullif(btrim(sku_code), '') is not null
      group by product_id, lower(btrim(sku_code)) having count(*) > 1
    ) then
      create unique index if not exists product_skus_product_code_uidx
        on public.product_skus(product_id, lower(btrim(sku_code)))
        where nullif(btrim(sku_code), '') is not null;
    end if;
  end if;
end $$;

-- Orders and fulfillment compatibility ---------------------------------------
do $$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders
      add column if not exists payment_method text,
      add column if not exists client_request_id text,
      add column if not exists payment_expires_at timestamptz,
      add column if not exists expired_at timestamptz,
      add column if not exists closed_at timestamptz,
      add column if not exists delivery_status text,
      add column if not exists fulfillment_status text,
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
    create index if not exists orders_order_no_lookup_idx on public.orders(order_no);
    create index if not exists orders_status_payment_created_idx on public.orders(status, payment_status, created_at desc);
    create index if not exists orders_payment_method_idx on public.orders(payment_method);

    if not exists (
      select 1 from public.orders
      where nullif(btrim(client_request_id), '') is not null
      group by user_id, client_request_id having count(*) > 1
    ) then
      create unique index if not exists orders_user_client_request_uidx
        on public.orders(user_id, client_request_id)
        where client_request_id is not null and btrim(client_request_id) <> '';
    end if;
  end if;

  if to_regclass('public.order_items') is not null then
    alter table public.order_items
      add column if not exists sku_id uuid,
      add column if not exists sku_code text,
      add column if not exists sku_title text,
      add column if not exists option_snapshot jsonb,
      add column if not exists currency text not null default 'CNY',
      add column if not exists delivery_status text,
      add column if not exists delivery_started_at timestamptz,
      add column if not exists delivery_completed_at timestamptz,
      add column if not exists delivered_quantity integer not null default 0,
      add column if not exists delivery_failure_reason text;

    create index if not exists order_items_order_id_idx on public.order_items(order_id);
    create index if not exists order_items_product_sku_idx on public.order_items(product_id, sku_id);
  end if;

  if to_regclass('public.order_deliveries') is not null then
    alter table public.order_deliveries
      add column if not exists user_id uuid,
      add column if not exists product_id uuid,
      add column if not exists sku_id uuid,
      add column if not exists inventory_id uuid,
      add column if not exists delivery_no text,
      add column if not exists delivery_status text not null default 'pending',
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists order_deliveries_order_item_status_idx on public.order_deliveries(order_id, order_item_id, delivery_status);
    create index if not exists order_deliveries_user_created_idx on public.order_deliveries(user_id, created_at desc);
    create index if not exists order_deliveries_sku_idx on public.order_deliveries(sku_id) where sku_id is not null;
  end if;
end $$;

-- Payment/recharge compatibility ---------------------------------------------
do $$
begin
  if to_regclass('public.order_payments') is not null then
    alter table public.order_payments
      add column if not exists business_type text,
      add column if not exists channel text,
      add column if not exists network text,
      add column if not exists business_amount numeric(18,6),
      add column if not exists fee_amount numeric(18,6) not null default 0,
      add column if not exists payable_amount numeric(18,6),
      add column if not exists received_amount numeric(18,6),
      add column if not exists provider_trade_no text,
      add column if not exists paid_at timestamptz,
      add column if not exists callback_status text,
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists order_payments_provider_trade_idx on public.order_payments(provider_trade_no) where provider_trade_no is not null;
    create index if not exists order_payments_business_idx on public.order_payments(business_type, order_id, created_at desc);
  end if;

  if to_regclass('public.account_recharges') is not null then
    alter table public.account_recharges
      add column if not exists user_email text,
      add column if not exists channel text,
      add column if not exists channel_code text,
      add column if not exists channel_name text,
      add column if not exists network text,
      add column if not exists requested_amount numeric(18,6),
      add column if not exists fee_amount numeric(18,6) not null default 0,
      add column if not exists payable_amount numeric(18,6),
      add column if not exists received_amount numeric(18,6),
      add column if not exists credited_amount numeric(18,6) not null default 0,
      add column if not exists provider_trade_no text,
      add column if not exists callback_status text,
      add column if not exists client_request_id text,
      add column if not exists updated_at timestamptz not null default now();

    create index if not exists account_recharges_user_created_idx on public.account_recharges(user_id, created_at desc);
    create index if not exists account_recharges_no_lookup_idx on public.account_recharges(recharge_no);
    create index if not exists account_recharges_status_created_idx on public.account_recharges(status, created_at desc);
  end if;

  if to_regclass('public.payment_channels') is not null then
    alter table public.payment_channels
      add column if not exists code text,
      add column if not exists channel text,
      add column if not exists enabled boolean not null default false,
      add column if not exists configured boolean not null default false,
      add column if not exists display_name text,
      add column if not exists currency text,
      add column if not exists network text,
      add column if not exists min_amount numeric(18,6),
      add column if not exists minimum_amount numeric(18,6),
      add column if not exists fee_rate numeric(12,6) not null default 0,
      add column if not exists provider text,
      add column if not exists provider_name text,
      add column if not exists public_config jsonb not null default '{}'::jsonb,
      add column if not exists provider_config jsonb not null default '{}'::jsonb,
      add column if not exists secret_config jsonb not null default '{}'::jsonb,
      add column if not exists sort_order integer not null default 0;

    create index if not exists payment_channels_enabled_sort_idx on public.payment_channels(enabled, sort_order, code);
  end if;
end $$;

-- Digital inventory compatibility --------------------------------------------
do $$
begin
  if to_regclass('public.digital_inventory') is not null then
    alter table public.digital_inventory
      add column if not exists sku_id uuid,
      add column if not exists batch_id uuid,
      add column if not exists content_hash text,
      add column if not exists reserved_order_id uuid,
      add column if not exists reserved_order_item_id uuid,
      add column if not exists delivered_order_id uuid,
      add column if not exists delivered_order_item_id uuid,
      add column if not exists delivered_user_id uuid;

    create index if not exists digital_inventory_product_sku_status_idx on public.digital_inventory(product_id, sku_id, status, updated_at desc);
    create index if not exists digital_inventory_reserved_order_idx on public.digital_inventory(reserved_order_id) where reserved_order_id is not null;
    create index if not exists digital_inventory_delivered_order_idx on public.digital_inventory(delivered_order_id) where delivered_order_id is not null;
  end if;
end $$;

-- RLS policy compatibility ----------------------------------------------------
do $$
begin
  if to_regclass('public.products') is not null then
    alter table public.products enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='public can read visible products') then
      create policy "public can read visible products" on public.products for select to anon, authenticated
      using (status in ('active','sold_out'));
    end if;
  end if;

  if to_regclass('public.categories') is not null then
    alter table public.categories enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='categories' and policyname='public can read active categories') then
      create policy "public can read active categories" on public.categories for select to anon, authenticated
      using (coalesce(is_active, true) = true and coalesce(status, 'active') <> 'inactive');
    end if;
  end if;

  if to_regclass('public.orders') is not null then
    alter table public.orders enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname='users can read own orders') then
      create policy "users can read own orders" on public.orders for select to authenticated using (user_id = auth.uid());
    end if;
  end if;

  if to_regclass('public.order_items') is not null then
    alter table public.order_items enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_items' and policyname='users can read own order items') then
      create policy "users can read own order items" on public.order_items for select to authenticated
      using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid()));
    end if;
  end if;

  if to_regclass('public.order_status_logs') is not null then
    alter table public.order_status_logs enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='order_status_logs' and policyname='users can read own order logs') then
      create policy "users can read own order logs" on public.order_status_logs for select to authenticated
      using (exists (select 1 from public.orders o where o.id = order_status_logs.order_id and o.user_id = auth.uid()));
    end if;
  end if;

  if to_regclass('public.digital_inventory') is not null then
    alter table public.digital_inventory enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='digital_inventory' and policyname='deny direct inventory reads compatibility') then
      create policy "deny direct inventory reads compatibility" on public.digital_inventory for select using (false);
    end if;
  end if;
end $$;

-- Read-only verification hints are documented in docs/database-schema-rls-verification.md.
