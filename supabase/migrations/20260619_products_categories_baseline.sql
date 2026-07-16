-- Jianlian Shop products/categories baseline.
-- Purpose: keep the production products and categories schema in migrations so
-- an empty Supabase test project can be initialized before order, inventory and
-- multi-SKU migrations.
--
-- Manual execution only. This file is intentionally additive and does not
-- delete or rewrite existing product/category data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Compatibility helpers for policies that appear in later migrations. Later
-- project migrations may replace these with stricter project-specific bodies.
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  if auth.uid() is null or to_regclass('public.profiles') is null then
    return false;
  end if;

  execute
    'select exists (select 1 from public.profiles where id = $1 and role = ''admin'')'
    into v_is_admin
    using auth.uid();

  return coalesce(v_is_admin, false);
end;
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  if user_id is null or to_regclass('public.profiles') is null then
    return false;
  end if;

  execute
    'select exists (select 1 from public.profiles where id = $1 and role = ''admin'')'
    into v_is_admin
    using user_id;

  return coalesce(v_is_admin, false);
end;
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  level integer not null default 1,
  name text not null,
  slug text not null,
  icon text,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0),
  constraint categories_slug_not_blank check (length(btrim(slug)) > 0),
  constraint categories_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint categories_level_check check (level in (1, 2, 3)),
  constraint categories_parent_level_check check (
    (level = 1 and parent_id is null)
    or (level in (2, 3) and parent_id is not null)
  ),
  constraint categories_status_check check (status in ('active', 'inactive'))
);

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete restrict,
  add column if not exists level integer not null default 1,
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists icon text,
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_name_not_blank'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_name_not_blank check (length(btrim(name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_slug_not_blank'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_slug_not_blank check (length(btrim(slug)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_slug_format_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]*$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_level_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_level_check check (level in (1, 2, 3));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_parent_level_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_parent_level_check check (
        (level = 1 and parent_id is null)
        or (level in (2, 3) and parent_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_status_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_status_check check (status in ('active', 'inactive'));
  end if;
end $$;

create unique index if not exists categories_slug_uidx
  on public.categories(lower(btrim(slug)));
create index if not exists categories_parent_sort_idx
  on public.categories(parent_id, sort_order, name);
create index if not exists categories_level_sort_idx
  on public.categories(level, sort_order, name);
create index if not exists categories_active_sort_idx
  on public.categories(is_active, status, level, sort_order);

create or replace function public.validate_category_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_level integer;
begin
  if new.level = 1 then
    new.parent_id := null;
    return new;
  end if;

  select level into v_parent_level
  from public.categories
  where id = new.parent_id;

  if v_parent_level is null then
    raise exception 'category parent does not exist';
  end if;

  if new.level <> v_parent_level + 1 then
    raise exception 'category level must be exactly one level below parent';
  end if;

  if new.id = new.parent_id then
    raise exception 'category cannot be its own parent';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_validate_parent on public.categories;
create trigger categories_validate_parent
before insert or update of parent_id, level on public.categories
for each row execute function public.validate_category_parent();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null,
  short_description text,
  description text,
  image_url text,
  gallery text[] not null default '{}'::text[],
  price numeric(12, 2) not null default 0,
  original_price numeric(12, 2),
  stock integer not null default 0,
  delivery_type text not null default 'manual',
  status text not null default 'draft',
  sort_order integer not null default 0,
  has_skus boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_slug_not_blank check (length(btrim(slug)) > 0),
  constraint products_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint products_price_check check (price >= 0),
  constraint products_original_price_check check (original_price is null or original_price >= 0),
  constraint products_stock_check check (stock >= 0),
  constraint products_delivery_type_check check (delivery_type in ('manual', 'automatic', 'shipping')),
  constraint products_status_check check (status in ('draft', 'active', 'inactive', 'sold_out'))
);

alter table public.products
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists subcategory_id uuid references public.categories(id) on delete set null,
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists short_description text,
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists gallery text[] not null default '{}'::text[],
  add column if not exists price numeric(12, 2) not null default 0,
  add column if not exists original_price numeric(12, 2),
  add column if not exists stock integer not null default 0,
  add column if not exists delivery_type text not null default 'manual',
  add column if not exists status text not null default 'draft',
  add column if not exists sort_order integer not null default 0,
  add column if not exists has_skus boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_name_not_blank'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_name_not_blank check (length(btrim(name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_slug_not_blank'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_slug_not_blank check (length(btrim(slug)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_slug_format_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]*$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_price_check check (price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_original_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_original_price_check check (original_price is null or original_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_check check (stock >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_delivery_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_delivery_type_check check (delivery_type in ('manual', 'automatic', 'shipping'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_status_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_status_check check (status in ('draft', 'active', 'inactive', 'sold_out'));
  end if;
end $$;

create unique index if not exists products_slug_uidx
  on public.products(lower(btrim(slug)));
create index if not exists products_category_status_sort_idx
  on public.products(category_id, status, sort_order, updated_at desc);
create index if not exists products_subcategory_idx
  on public.products(subcategory_id)
  where subcategory_id is not null;
create index if not exists products_status_sort_idx
  on public.products(status, sort_order, updated_at desc);
create index if not exists products_delivery_type_idx
  on public.products(delivery_type);
create index if not exists products_has_skus_idx
  on public.products(has_skus);
create index if not exists products_name_lower_idx
  on public.products(lower(name));

create or replace function public.validate_product_categories()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category public.categories%rowtype;
  v_subcategory public.categories%rowtype;
begin
  if new.category_id is not null then
    select * into v_category from public.categories where id = new.category_id;
    if not found then
      raise exception 'product category does not exist';
    end if;
    if coalesce(v_category.is_active, true) = false or v_category.status = 'inactive' then
      raise exception 'product category is inactive';
    end if;
  end if;

  if new.subcategory_id is not null then
    select * into v_subcategory from public.categories where id = new.subcategory_id;
    if not found then
      raise exception 'product subcategory does not exist';
    end if;
    if coalesce(v_subcategory.is_active, true) = false or v_subcategory.status = 'inactive' then
      raise exception 'product subcategory is inactive';
    end if;
    if new.category_id is not null
       and v_subcategory.parent_id is not null
       and v_subcategory.parent_id <> new.category_id then
      raise exception 'product category and subcategory do not match';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_validate_categories on public.products;
create trigger products_validate_categories
before insert or update of category_id, subcategory_id on public.products
for each row execute function public.validate_product_categories();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;

drop policy if exists "public can read active categories" on public.categories;
create policy "public can read active categories"
on public.categories for select
to anon, authenticated
using (is_active = true and status = 'active');

drop policy if exists "admins can manage categories" on public.categories;
create policy "admins can manage categories"
on public.categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
on public.products for select
to anon, authenticated
using (status in ('active', 'sold_out'));

drop policy if exists "admins can read all products" on public.products;
create policy "admins can read all products"
on public.products for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert products" on public.products;
create policy "admins can insert products"
on public.products for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update products" on public.products;
create policy "admins can update products"
on public.products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete products" on public.products;
create policy "admins can delete products"
on public.products for delete
to authenticated
using (public.is_admin());

grant select on table public.categories to anon, authenticated;
grant select on table public.products to anon, authenticated;
grant all on table public.categories to service_role;
grant all on table public.products to service_role;
