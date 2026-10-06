\set ON_ERROR_STOP on

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.ci_admin_local_inventory_guard (
  marker text primary key check (marker = 'JOB_LOCAL_ADMIN_INVENTORY_DB')
);
insert into public.ci_admin_local_inventory_guard(marker) values ('JOB_LOCAL_ADMIN_INVENTORY_DB');

create table public.products (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  has_skus boolean not null default false,
  delivery_type text not null default 'automatic',
  updated_at timestamptz not null default now()
);

create table public.product_skus (
  id uuid primary key,
  product_id uuid not null references public.products(id),
  sku_code text,
  sku_title text,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  status text not null default 'draft',
  delivery_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key
);

create table public.digital_inventory_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_no text not null unique,
  product_id uuid not null references public.products(id),
  sku_id uuid references public.product_skus(id),
  batch_name text,
  content_type text not null default 'plain_text',
  total_count integer not null default 0,
  available_count integer not null default 0,
  reserved_count integer not null default 0,
  delivered_count integer not null default 0,
  invalid_count integer not null default 0,
  source_filename text,
  import_status text not null default 'processing',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.digital_inventory (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku_id uuid references public.product_skus(id) on delete set null,
  content text not null check (length(btrim(content)) > 0),
  content_hash text,
  content_type text not null default 'plain_text',
  status text not null default 'available'
    check (status in ('available','reserved','delivered','disabled','expired','invalid')),
  order_id uuid references public.orders(id) on delete set null,
  reserved_order_id uuid references public.orders(id) on delete set null,
  reserved_order_item_id uuid,
  reserved_user_id uuid,
  reserved_at timestamptz,
  delivered_order_id uuid references public.orders(id) on delete set null,
  delivered_order_item_id uuid,
  delivered_user_id uuid,
  delivered_at timestamptz,
  expires_at timestamptz,
  batch_id uuid references public.digital_inventory_batches(id) on delete set null,
  batch_no text,
  remark text,
  disabled_at timestamptz,
  disabled_by uuid,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index digital_inventory_product_content_uidx
  on public.digital_inventory(product_id, md5(content));
create index digital_inventory_product_sku_status_idx
  on public.digital_inventory(product_id, sku_id, status, updated_at desc);

create table public.order_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  inventory_id uuid references public.digital_inventory(id) on delete set null,
  delivery_status text not null default 'pending'
);

create table public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text not null,
  module text not null,
  target_type text,
  target_id text,
  target_label text,
  request_id text not null,
  result text not null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger digital_inventory_set_updated_at
before update on public.digital_inventory
for each row execute function public.set_updated_at();

create or replace function public.is_admin(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select p_user_id = '90000000-0000-4000-8000-000000000001'::uuid
$$;

create or replace function public.normalize_order_item_delivery_type(p_delivery_type text)
returns text language sql immutable security invoker set search_path = pg_catalog as $$
  select case
    when lower(coalesce(p_delivery_type, '')) in ('auto_delivery','automatic','auto','card','account','digital') then 'auto_delivery'
    when lower(coalesce(p_delivery_type, '')) in ('manual_delivery','manual') then 'manual_delivery'
    when lower(coalesce(p_delivery_type, '')) in ('service','none','not_required') then 'service'
    when lower(coalesce(p_delivery_type, '')) in ('physical','shipping') then 'physical'
    else coalesce(nullif(lower(btrim(p_delivery_type)), ''), 'manual_delivery')
  end
$$;

create or replace function public.mask_delivery_secret(p_content text)
returns text language sql immutable security invoker set search_path = pg_catalog as $$
  select case
    when p_content is null or p_content = '' then '-'
    when length(p_content) <= 8 then repeat('*', greatest(length(p_content), 4))
    else left(p_content, 4) || repeat('*', 8) || right(p_content, 4)
  end
$$;

create or replace function public.sync_product_available_stock(p_product_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare v_available integer;
begin
  select count(*)::integer into v_available
  from public.digital_inventory as inventory
  where inventory.product_id = p_product_id
    and inventory.status = 'available'
    and (inventory.expires_at is null or inventory.expires_at > now());
  update public.products set stock = v_available where id = p_product_id;
  return v_available;
end
$$;

create or replace function public.refresh_digital_inventory_batch_counts(p_batch_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.digital_inventory_batches as batch
  set total_count = counts.total_count,
      available_count = counts.available_count,
      reserved_count = counts.reserved_count,
      delivered_count = counts.delivered_count,
      invalid_count = counts.invalid_count,
      updated_at = now()
  from (
    select count(*)::integer as total_count,
      count(*) filter (where status = 'available')::integer as available_count,
      count(*) filter (where status = 'reserved')::integer as reserved_count,
      count(*) filter (where status = 'delivered')::integer as delivered_count,
      count(*) filter (where status in ('disabled','invalid','expired'))::integer as invalid_count
    from public.digital_inventory where batch_id = p_batch_id
  ) as counts
  where batch.id = p_batch_id;
end
$$;

insert into public.products(id, name, slug, has_skus, delivery_type) values
  ('10000000-0000-4000-8000-000000000001', 'SKU Product', 'sku-product', true, 'automatic'),
  ('10000000-0000-4000-8000-000000000002', 'Other SKU Product', 'other-sku-product', true, 'automatic'),
  ('10000000-0000-4000-8000-000000000003', 'Single Product', 'single-product', false, 'automatic'),
  ('10000000-0000-4000-8000-000000000004', 'Manual Product', 'manual-product', false, 'manual');

insert into public.product_skus(id, product_id, sku_code, sku_title) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'sku-1', 'SKU 1'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'sku-2', 'SKU 2'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'other', 'Other');

grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;
