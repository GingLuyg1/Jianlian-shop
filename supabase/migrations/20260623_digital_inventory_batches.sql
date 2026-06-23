-- Digital inventory batch management compatibility migration.
-- Execute manually in Supabase SQL Editor. This migration is idempotent.

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

do $$
begin
  if to_regclass('public.digital_inventory') is null then
    raise exception 'digital_inventory is missing; run 20260620_digital_inventory_delivery.sql first';
  end if;
end;
$$;

-- 1) Complete the compatibility columns before any index or function uses them.
-- Keep content_type nullable for legacy rows and do not overwrite an existing type.
alter table public.digital_inventory
  add column if not exists content_type text;

alter table public.digital_inventory
  alter column content_type set default 'plain_text';

update public.digital_inventory
set content_type = 'plain_text'
where content_type is null;

alter table public.digital_inventory
  add column if not exists content_hash text;

alter table public.digital_inventory
  add column if not exists reserved_order_id uuid;

alter table public.digital_inventory
  add column if not exists delivered_order_id uuid;

alter table public.digital_inventory
  add column if not exists disabled_at timestamptz;

alter table public.digital_inventory
  add column if not exists disabled_by uuid;

alter table public.digital_inventory
  add column if not exists disabled_reason text;

do $$
begin
  if to_regclass('public.orders') is not null
    and not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.digital_inventory'::regclass
        and conname = 'digital_inventory_reserved_order_id_fkey'
    ) then
    alter table public.digital_inventory
      add constraint digital_inventory_reserved_order_id_fkey
      foreign key (reserved_order_id) references public.orders(id) on delete set null
      not valid;
  end if;

  if to_regclass('public.orders') is not null
    and not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.digital_inventory'::regclass
        and conname = 'digital_inventory_delivered_order_id_fkey'
    ) then
    alter table public.digital_inventory
      add constraint digital_inventory_delivered_order_id_fkey
      foreign key (delivered_order_id) references public.orders(id) on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.digital_inventory'::regclass
      and conname = 'digital_inventory_disabled_by_fkey'
  ) then
    alter table public.digital_inventory
      add constraint digital_inventory_disabled_by_fkey
      foreign key (disabled_by) references auth.users(id) on delete set null
      not valid;
  end if;
end;
$$;

update public.digital_inventory
set reserved_order_id = order_id
where reserved_order_id is null
  and order_id is not null
  and status = 'reserved';

update public.digital_inventory
set delivered_order_id = order_id
where delivered_order_id is null
  and order_id is not null
  and status = 'delivered';

update public.digital_inventory
set content_hash = encode(digest(content, 'sha256'), 'hex')
where content_hash is null
  and content is not null;

-- 2) Create the batch table before adding digital_inventory.batch_id.
create table if not exists public.digital_inventory_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  product_id uuid not null references public.products(id) on delete cascade,
  batch_name text,
  content_type text not null default 'plain_text',
  total_count integer not null default 0 check (total_count >= 0),
  available_count integer not null default 0 check (available_count >= 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  source_filename text,
  import_status text not null default 'processing',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_inventory_batches_content_type_check check (
    content_type in ('card_key','redeem_code','account_password','plain_text')
  ),
  constraint digital_inventory_batches_status_check check (
    import_status in ('processing','completed','partial_failed','failed','disabled')
  )
);

alter table public.digital_inventory
  add column if not exists batch_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.digital_inventory'::regclass
      and conname = 'digital_inventory_batch_id_fkey'
  ) then
    alter table public.digital_inventory
      add constraint digital_inventory_batch_id_fkey
      foreign key (batch_id) references public.digital_inventory_batches(id) on delete set null
      not valid;
  end if;
end;
$$;

-- 3) Indexes and triggers are created only after all referenced columns exist.
create index if not exists digital_inventory_batches_product_idx
  on public.digital_inventory_batches(product_id, created_at desc);

create index if not exists digital_inventory_batches_status_idx
  on public.digital_inventory_batches(import_status, created_at desc);

create index if not exists digital_inventory_batch_id_idx
  on public.digital_inventory(batch_id)
  where batch_id is not null;

create index if not exists digital_inventory_content_hash_idx
  on public.digital_inventory(product_id, content_hash)
  where content_hash is not null;

create index if not exists digital_inventory_content_type_idx
  on public.digital_inventory(content_type, status);

create index if not exists digital_inventory_reserved_order_idx
  on public.digital_inventory(reserved_order_id)
  where reserved_order_id is not null;

create index if not exists digital_inventory_delivered_order_idx
  on public.digital_inventory(delivered_order_id)
  where delivered_order_id is not null;

drop trigger if exists digital_inventory_batches_set_updated_at
  on public.digital_inventory_batches;
create trigger digital_inventory_batches_set_updated_at
before update on public.digital_inventory_batches
for each row execute function public.set_updated_at();

-- 4) Shared stock/count functions. Both invalid and legacy expired states are non-saleable.
create or replace function public.sync_product_available_stock(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
begin
  if p_product_id is null then
    raise exception 'product id is required';
  end if;

  select count(*)::integer
  into v_available
  from public.digital_inventory
  where product_id = p_product_id
    and status = 'available'
    and (expires_at is null or expires_at > now());

  update public.products
  set stock = coalesce(v_available, 0)
  where id = p_product_id;

  if not found then
    raise exception 'product not found';
  end if;

  return coalesce(v_available, 0);
end;
$$;

create or replace function public.refresh_digital_inventory_batch_counts(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_batch_id is null then
    raise exception 'batch id is required';
  end if;

  update public.digital_inventory_batches b
  set
    total_count = s.total_count,
    available_count = s.available_count,
    reserved_count = s.reserved_count,
    delivered_count = s.delivered_count,
    invalid_count = s.invalid_count,
    import_status = case
      when b.import_status = 'disabled' then 'disabled'
      when s.total_count = 0 then 'failed'
      when s.invalid_count > 0 then 'partial_failed'
      else 'completed'
    end,
    updated_at = now()
  from (
    select
      p_batch_id as id,
      count(*)::integer as total_count,
      count(*) filter (where status = 'available')::integer as available_count,
      count(*) filter (where status = 'reserved')::integer as reserved_count,
      count(*) filter (where status = 'delivered')::integer as delivered_count,
      count(*) filter (where status in ('disabled','invalid','expired'))::integer as invalid_count
    from public.digital_inventory
    where batch_id = p_batch_id
  ) s
  where b.id = s.id;

  if not found then
    raise exception 'inventory batch not found';
  end if;
end;
$$;

-- 5) Administrator RPCs expose metadata only, never digital_inventory.content.
create or replace function public.admin_list_digital_inventory_batches(
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid,
  batch_no text,
  product_id uuid,
  product_name text,
  product_slug text,
  batch_name text,
  content_type text,
  total_count integer,
  available_count integer,
  reserved_count integer,
  delivered_count integer,
  invalid_count integer,
  source_filename text,
  import_status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'administrator permission required';
  end if;

  return query
  with filtered as (
    select
      b.id,
      b.batch_no,
      b.product_id,
      p.name as product_name,
      p.slug as product_slug,
      b.batch_name,
      b.content_type,
      b.total_count,
      b.available_count,
      b.reserved_count,
      b.delivered_count,
      b.invalid_count,
      b.source_filename,
      b.import_status,
      b.created_by,
      b.created_at,
      b.updated_at
    from public.digital_inventory_batches b
    join public.products p on p.id = b.product_id
    where (v_status = 'all' or b.import_status = v_status)
      and (
        btrim(coalesce(p_search, '')) = ''
        or lower(b.batch_no) like v_search
        or lower(coalesce(b.batch_name, '')) like v_search
        or lower(p.name) like v_search
        or lower(p.slug) like v_search
      )
  )
  select
    filtered.*,
    count(*) over() as total_rows
  from filtered
  order by filtered.created_at desc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.admin_disable_digital_inventory_batch(
  p_batch_id uuid,
  p_reason text default null
)
returns table(disabled_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_disabled_count integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'administrator permission required';
  end if;

  select product_id
  into v_product_id
  from public.digital_inventory_batches
  where id = p_batch_id
  for update;

  if v_product_id is null then
    raise exception 'inventory batch not found';
  end if;

  update public.digital_inventory
  set
    status = 'disabled',
    disabled_at = now(),
    disabled_by = auth.uid(),
    disabled_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    remark = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), remark),
    updated_at = now()
  where batch_id = p_batch_id
    and status = 'available';

  get diagnostics v_disabled_count = row_count;

  update public.digital_inventory_batches
  set import_status = 'disabled', updated_at = now()
  where id = p_batch_id;

  perform public.refresh_digital_inventory_batch_counts(p_batch_id);
  perform public.sync_product_available_stock(v_product_id);

  return query select v_disabled_count;
end;
$$;

create or replace function public.admin_restore_digital_inventory_item(
  p_inventory_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'administrator permission required';
  end if;

  select
    id,
    product_id,
    batch_id,
    status,
    order_id,
    reserved_order_id,
    delivered_order_id
  into v_item
  from public.digital_inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'inventory item not found';
  end if;

  if v_item.status <> 'disabled' then
    raise exception 'only disabled inventory can be restored';
  end if;

  if v_item.order_id is not null
    or v_item.reserved_order_id is not null
    or v_item.delivered_order_id is not null then
    raise exception 'reserved or delivered inventory cannot be restored';
  end if;

  update public.digital_inventory
  set
    status = 'available',
    disabled_at = null,
    disabled_by = null,
    disabled_reason = null,
    remark = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), remark),
    updated_at = now()
  where id = p_inventory_id;

  if v_item.batch_id is not null then
    update public.digital_inventory_batches
    set import_status = 'processing', updated_at = now()
    where id = v_item.batch_id
      and import_status = 'disabled';

    perform public.refresh_digital_inventory_batch_counts(v_item.batch_id);
  end if;

  perform public.sync_product_available_stock(v_item.product_id);
  return true;
end;
$$;

-- 6) RLS and grants. Raw inventory remains inaccessible to browser clients.
alter table public.digital_inventory enable row level security;
alter table public.digital_inventory_batches enable row level security;

drop policy if exists "Admins can read inventory batches"
  on public.digital_inventory_batches;
create policy "Admins can read inventory batches"
  on public.digital_inventory_batches
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage inventory batches"
  on public.digital_inventory_batches;

drop policy if exists "Deny direct inventory batch writes"
  on public.digital_inventory_batches;
create policy "Deny direct inventory batch writes"
  on public.digital_inventory_batches
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on table public.digital_inventory_batches from anon;
revoke insert, update, delete on table public.digital_inventory_batches from authenticated;
grant select on table public.digital_inventory_batches to authenticated;
grant all on table public.digital_inventory_batches to service_role;

revoke execute on function public.refresh_digital_inventory_batch_counts(uuid)
  from public, anon, authenticated;
revoke execute on function public.sync_product_available_stock(uuid)
  from public, anon;
grant execute on function public.refresh_digital_inventory_batch_counts(uuid)
  to service_role;
grant execute on function public.sync_product_available_stock(uuid)
  to service_role;

revoke execute on function public.admin_list_digital_inventory_batches(text,text,integer,integer)
  from public, anon;
revoke execute on function public.admin_disable_digital_inventory_batch(uuid,text)
  from public, anon;
revoke execute on function public.admin_restore_digital_inventory_item(uuid,text)
  from public, anon;

grant execute on function public.admin_list_digital_inventory_batches(text,text,integer,integer)
  to authenticated, service_role;
grant execute on function public.admin_disable_digital_inventory_batch(uuid,text)
  to authenticated, service_role;
grant execute on function public.admin_restore_digital_inventory_item(uuid,text)
  to authenticated, service_role;
