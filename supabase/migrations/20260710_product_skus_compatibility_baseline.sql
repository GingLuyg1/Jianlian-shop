-- Jianlian Shop SKU compatibility baseline.
--
-- Purpose:
--   Backfill only the SKU schema required by later order inventory checks.
--
-- Safety:
--   - Does not replace order, payment, cancellation, expiration, or delivery RPCs.
--   - Does not mutate product, SKU, order, payment, or digital inventory business data.
--   - Handles public.digital_inventory_batches only when the table already exists.

do $$
declare
  v_missing text[];
begin
  select array_remove(array[
    case when to_regclass('public.products') is null then 'public.products' end,
    case when to_regclass('public.categories') is null then 'public.categories' end,
    case when to_regclass('public.order_items') is null then 'public.order_items' end,
    case when to_regclass('public.digital_inventory') is null then 'public.digital_inventory' end,
    case when to_regclass('public.order_deliveries') is null then 'public.order_deliveries' end,
    case when to_regprocedure('public.set_updated_at()') is null then 'public.set_updated_at()' end,
    case when to_regprocedure('public.is_admin()') is null then 'public.is_admin()' end,
    case when to_regprocedure('public.is_admin(uuid)') is null then 'public.is_admin(uuid)' end
  ], null)
  into v_missing;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'SKU compatibility baseline missing required dependency: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_groups_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  value_code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_values_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku_code text,
  sku_title text,
  combination_key text not null,
  price numeric not null default 0,
  original_price numeric,
  stock integer not null default 0,
  status text not null default 'active',
  delivery_type text,
  image_url text,
  sort_order integer not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_skus_price_check check (price >= 0),
  constraint product_skus_original_price_check check (original_price is null or original_price >= 0),
  constraint product_skus_stock_check check (stock >= 0),
  constraint product_skus_status_check check (status in ('active','inactive','sold_out','draft')),
  constraint product_skus_combination_not_blank check (length(btrim(combination_key)) > 0)
);

create table if not exists public.product_sku_values (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.product_skus(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete restrict,
  value_id uuid not null references public.product_option_values(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare
  v_conflict text;
begin
  with expected(indexname, pattern) as (
    values
      ('product_option_groups_product_name_uidx', '%product_option_groups%product_id%lower%btrim%name%'),
      ('product_option_values_group_name_uidx', '%product_option_values%group_id%lower%btrim%name%'),
      ('product_skus_product_code_uidx', '%product_skus%product_id%lower%btrim%sku_code%'),
      ('product_skus_product_combination_uidx', '%product_skus%product_id%combination_key%'),
      ('product_sku_values_sku_group_uidx', '%product_sku_values%sku_id%group_id%'),
      ('product_sku_values_sku_value_uidx', '%product_sku_values%sku_id%value_id%'),
      ('product_option_groups_product_sort_idx', '%product_option_groups%product_id%sort_order%created_at%'),
      ('product_option_values_group_sort_idx', '%product_option_values%group_id%sort_order%created_at%'),
      ('product_skus_product_status_sort_idx', '%product_skus%product_id%status%sort_order%created_at%'),
      ('order_items_sku_idx', '%order_items%sku_id%'),
      ('digital_inventory_product_sku_status_idx', '%digital_inventory%product_id%sku_id%status%updated_at%'),
      ('order_deliveries_sku_idx', '%order_deliveries%sku_id%')
  )
  select e.indexname
  into v_conflict
  from expected e
  join pg_indexes i on i.schemaname = 'public' and i.indexname = e.indexname
  where replace(lower(i.indexdef), ' ', '') not like replace(lower(e.pattern), ' ', '')
  limit 1;

  if v_conflict is not null then
    raise exception 'SKU compatibility baseline found existing index with incompatible definition: %', v_conflict;
  end if;
end;
$$;

create unique index if not exists product_option_groups_product_name_uidx
  on public.product_option_groups(product_id, lower(btrim(name)));

create unique index if not exists product_option_values_group_name_uidx
  on public.product_option_values(group_id, lower(btrim(name)));

create unique index if not exists product_skus_product_code_uidx
  on public.product_skus(product_id, lower(btrim(sku_code)))
  where sku_code is not null and length(btrim(sku_code)) > 0;

create unique index if not exists product_skus_product_combination_uidx
  on public.product_skus(product_id, combination_key);

create unique index if not exists product_sku_values_sku_group_uidx
  on public.product_sku_values(sku_id, group_id);

create unique index if not exists product_sku_values_sku_value_uidx
  on public.product_sku_values(sku_id, value_id);

create index if not exists product_option_groups_product_sort_idx
  on public.product_option_groups(product_id, sort_order, created_at);

create index if not exists product_option_values_group_sort_idx
  on public.product_option_values(group_id, sort_order, created_at);

create index if not exists product_skus_product_status_sort_idx
  on public.product_skus(product_id, status, sort_order, created_at);

drop trigger if exists product_option_groups_set_updated_at on public.product_option_groups;
create trigger product_option_groups_set_updated_at
before update on public.product_option_groups
for each row execute function public.set_updated_at();

drop trigger if exists product_option_values_set_updated_at on public.product_option_values;
create trigger product_option_values_set_updated_at
before update on public.product_option_values
for each row execute function public.set_updated_at();

drop trigger if exists product_skus_set_updated_at on public.product_skus;
create trigger product_skus_set_updated_at
before update on public.product_skus
for each row execute function public.set_updated_at();

create or replace function public.validate_product_option_group_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.product_option_groups
  where product_id = new.product_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and is_active = true;

  if coalesce(new.is_active, true) and v_count >= 3 then
    raise exception 'A product can have at most 3 active option groups';
  end if;

  return new;
end;
$$;

drop trigger if exists product_option_group_limit on public.product_option_groups;
create trigger product_option_group_limit
before insert or update of product_id, is_active on public.product_option_groups
for each row execute function public.validate_product_option_group_limit();

alter table public.order_items
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null,
  add column if not exists sku_code text,
  add column if not exists sku_title text,
  add column if not exists option_snapshot jsonb;

create index if not exists order_items_sku_idx
  on public.order_items(sku_id)
  where sku_id is not null;

alter table public.digital_inventory
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

alter table public.order_deliveries
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

create index if not exists digital_inventory_product_sku_status_idx
  on public.digital_inventory(product_id, sku_id, status, updated_at desc);

create index if not exists order_deliveries_sku_idx
  on public.order_deliveries(sku_id)
  where sku_id is not null;

do $$
begin
  if to_regclass('public.digital_inventory_batches') is not null then
    execute 'alter table public.digital_inventory_batches add column if not exists sku_id uuid references public.product_skus(id) on delete set null';

    if exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'digital_inventory_batches_product_sku_idx'
        and replace(lower(indexdef), ' ', '') not like '%digital_inventory_batches%product_id%sku_id%created_at%'
    ) then
      raise exception 'SKU compatibility baseline found existing index with incompatible definition: digital_inventory_batches_product_sku_idx';
    end if;

    execute 'create index if not exists digital_inventory_batches_product_sku_idx on public.digital_inventory_batches(product_id, sku_id, created_at desc)';
    raise notice 'SKU compatibility baseline added digital_inventory_batches.sku_id support';
  else
    raise notice 'SKU compatibility baseline skipped optional public.digital_inventory_batches because the table does not exist';
  end if;
end;
$$;

alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_skus enable row level security;
alter table public.product_sku_values enable row level security;

drop policy if exists "public can read active option groups" on public.product_option_groups;
create policy "public can read active option groups"
on public.product_option_groups for select
using (is_active = true);

drop policy if exists "public can read active option values" on public.product_option_values;
create policy "public can read active option values"
on public.product_option_values for select
using (
  is_active = true
  and exists (
    select 1
    from public.product_option_groups g
    where g.id = product_option_values.group_id
      and g.product_id = product_option_values.product_id
      and g.is_active = true
  )
);

drop policy if exists "public can read active skus" on public.product_skus;
create policy "public can read active skus"
on public.product_skus for select
using (status in ('active','sold_out'));

drop policy if exists "public can read sku values" on public.product_sku_values;
create policy "public can read sku values"
on public.product_sku_values for select
using (
  exists (
    select 1
    from public.product_skus s
    join public.product_option_groups g on g.id = product_sku_values.group_id
    join public.product_option_values v on v.id = product_sku_values.value_id
    where s.id = product_sku_values.sku_id
      and s.product_id = product_sku_values.product_id
      and s.status in ('active','sold_out')
      and g.product_id = product_sku_values.product_id
      and g.is_active = true
      and v.product_id = product_sku_values.product_id
      and v.group_id = product_sku_values.group_id
      and v.is_active = true
  )
);

drop policy if exists "admins manage option groups" on public.product_option_groups;
create policy "admins manage option groups"
on public.product_option_groups for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage option values" on public.product_option_values;
create policy "admins manage option values"
on public.product_option_values for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage product skus" on public.product_skus;
create policy "admins manage product skus"
on public.product_skus for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage sku values" on public.product_sku_values;
create policy "admins manage sku values"
on public.product_sku_values for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke insert, update, delete, truncate, references, trigger on table
  public.product_option_groups,
  public.product_option_values,
  public.product_skus,
  public.product_sku_values
from anon, authenticated;

grant select on table public.product_option_groups to anon, authenticated;
grant select on table public.product_option_values to anon, authenticated;
grant select on table public.product_skus to anon, authenticated;
grant select on table public.product_sku_values to anon, authenticated;

grant all on table public.product_option_groups to service_role;
grant all on table public.product_option_values to service_role;
grant all on table public.product_skus to service_role;
grant all on table public.product_sku_values to service_role;
