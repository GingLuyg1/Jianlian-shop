\set ON_ERROR_STOP on

create table public.ci_admin_catalog_guard (
  marker text primary key check (marker = 'JOB_LOCAL_ADMIN_CATALOG_DB')
);
insert into public.ci_admin_catalog_guard(marker) values ('JOB_LOCAL_ADMIN_CATALOG_DB');

create table public.products (
  id uuid primary key,
  price numeric(12,2) not null,
  stock integer not null default 0,
  has_skus boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.product_skus (
  id uuid primary key,
  product_id uuid not null references public.products(id),
  sku_code text,
  sku_title text,
  combination_key text,
  price numeric(12,2) not null,
  original_price numeric(12,2),
  stock integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'sold_out', 'draft')),
  delivery_type text,
  image_url text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger product_skus_set_updated_at before update on public.product_skus
for each row execute function public.set_updated_at();

insert into public.products(id, price, stock, has_skus) values
  ('10000000-0000-4000-8000-000000000001', 99, 55, true),
  ('10000000-0000-4000-8000-000000000002', 88, 1, true);

insert into public.product_skus(id, product_id, sku_code, sku_title, price, stock, status, sort_order)
select
  ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  i || '-usd', i || ' USD', i, i, 'active', i
from generate_series(1, 10) as generated(i);

insert into public.product_skus(id, product_id, sku_code, sku_title, price, stock, status, sort_order)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'other', 'Other', 1, 1, 'active', 1);
