-- Mixed order item fulfillment support for Jianlian Shop.
-- Execute manually in Supabase SQL Editor. This migration is idempotent and keeps existing data.

create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists fulfillment_status text not null default 'pending';

alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders
  add constraint orders_fulfillment_status_check
  check (fulfillment_status in ('pending','partially_delivered','processing','delivered','delivery_failed'));

alter table public.order_items
  add column if not exists delivery_status text,
  add column if not exists delivered_quantity integer not null default 0,
  add column if not exists delivery_failure_reason text,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_completed_at timestamptz,
  add column if not exists delivery_status_updated_at timestamptz not null default now();

alter table public.order_items drop constraint if exists order_items_delivery_status_check;
alter table public.order_items
  add constraint order_items_delivery_status_check
  check (delivery_status is null or delivery_status in ('pending','processing','delivered','failed','not_required','cancelled'));

alter table public.order_items drop constraint if exists order_items_delivered_quantity_check;
alter table public.order_items
  add constraint order_items_delivered_quantity_check
  check (delivered_quantity >= 0);

create index if not exists order_items_delivery_status_idx on public.order_items(order_id, delivery_status);
create index if not exists orders_fulfillment_status_idx on public.orders(fulfillment_status, updated_at desc);

create table if not exists public.order_item_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  from_status text,
  to_status text not null,
  operator_id uuid,
  operator_type text not null default 'system',
  note text,
  created_at timestamptz not null default now(),
  constraint order_item_delivery_logs_status_check check (to_status in ('pending','processing','delivered','failed','not_required','cancelled'))
);

create index if not exists order_item_delivery_logs_order_idx on public.order_item_delivery_logs(order_id, created_at desc);
create index if not exists order_item_delivery_logs_item_idx on public.order_item_delivery_logs(order_item_id, created_at desc);

alter table public.order_item_delivery_logs enable row level security;

drop policy if exists "admins can read order item delivery logs" on public.order_item_delivery_logs;
create policy "admins can read order item delivery logs"
on public.order_item_delivery_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "users can read own order item delivery logs" on public.order_item_delivery_logs;
create policy "users can read own order item delivery logs"
on public.order_item_delivery_logs for select
to authenticated
using (exists (
  select 1 from public.orders o
  where o.id = order_item_delivery_logs.order_id
    and o.user_id = auth.uid()
));

drop policy if exists "deny direct order item delivery log writes" on public.order_item_delivery_logs;
create policy "deny direct order item delivery log writes"
on public.order_item_delivery_logs for all
to authenticated
using (false)
with check (false);

create table if not exists public.digital_delivery_secrets (
  delivery_id uuid primary key references public.order_deliveries(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digital_delivery_secrets enable row level security;

drop policy if exists "deny direct delivery secret reads" on public.digital_delivery_secrets;
create policy "deny direct delivery secret reads"
on public.digital_delivery_secrets for select
to authenticated
using (false);

drop policy if exists "deny direct delivery secret writes" on public.digital_delivery_secrets;
create policy "deny direct delivery secret writes"
on public.digital_delivery_secrets for all
to authenticated
using (false)
with check (false);

alter table public.order_deliveries
  add column if not exists user_id uuid,
  add column if not exists product_id uuid,
  add column if not exists inventory_id uuid,
  add column if not exists encrypted_content text,
  add column if not exists viewed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists delivery_note text;

alter table public.order_deliveries drop constraint if exists order_deliveries_status_check;
alter table public.order_deliveries
  add constraint order_deliveries_status_check
  check (delivery_status in ('pending','processing','delivered','failed','not_required','cancelled','revoked'));

create index if not exists order_deliveries_order_item_status_idx on public.order_deliveries(order_item_id, delivery_status);
create unique index if not exists order_deliveries_delivered_inventory_uidx
  on public.order_deliveries(inventory_id)
  where inventory_id is not null and delivery_status = 'delivered';

create or replace function public.normalize_order_item_delivery_type(p_delivery_type text)
returns text
language sql
immutable
as $$
  select case
    when p_delivery_type in ('auto_delivery','automatic','auto','card','account','digital') then 'auto_delivery'
    when p_delivery_type in ('manual_delivery','manual') then 'manual_delivery'
    when p_delivery_type in ('service','none','not_required') then 'service'
    when p_delivery_type in ('physical','shipping') then 'physical'
    else 'manual_delivery'
  end;
$$;

create or replace function public.initial_order_item_delivery_status(p_delivery_type text)
returns text
language sql
immutable
as $$
  select case
    when public.normalize_order_item_delivery_type(p_delivery_type) = 'service' then 'not_required'
    when public.normalize_order_item_delivery_type(p_delivery_type) = 'physical' then 'processing'
    else 'pending'
  end;
$$;

create or replace function public.mask_delivery_secret(p_content text)
returns text
language sql
immutable
as $$
  select case
    when p_content is null or p_content = '' then '—'
    when length(p_content) <= 8 then repeat('*', greatest(length(p_content), 4))
    else left(p_content, 4) || repeat('*', 8) || right(p_content, 4)
  end;
$$;

create or replace function public.set_order_item_delivery_defaults()
returns trigger
language plpgsql
as $$
begin
  new.delivery_type = public.normalize_order_item_delivery_type(new.delivery_type);
  if new.delivery_status is null then
    new.delivery_status = public.initial_order_item_delivery_status(new.delivery_type);
  end if;
  new.delivery_status_updated_at = coalesce(new.delivery_status_updated_at, now());
  return new;
end;
$$;

drop trigger if exists order_items_delivery_defaults on public.order_items;
create trigger order_items_delivery_defaults
before insert or update of delivery_type, delivery_status on public.order_items
for each row execute function public.set_order_item_delivery_defaults();

update public.order_items
set delivery_type = public.normalize_order_item_delivery_type(delivery_type),
    delivery_status = coalesce(delivery_status, public.initial_order_item_delivery_status(delivery_type)),
    delivery_status_updated_at = coalesce(delivery_status_updated_at, now());

update public.order_deliveries od
set user_id = coalesce(od.user_id, o.user_id),
    product_id = coalesce(od.product_id, oi.product_id),
    delivery_type = public.normalize_order_item_delivery_type(coalesce(od.delivery_type, oi.delivery_type))
from public.orders o
left join public.order_items oi on oi.id = od.order_item_id
where od.order_id = o.id;

insert into public.digital_delivery_secrets (delivery_id, content)
select id, delivery_content
from public.order_deliveries
where delivery_content is not null and btrim(delivery_content) <> ''
on conflict (delivery_id) do nothing;

update public.order_deliveries
set encrypted_content = coalesce(encrypted_content, 'stored_in_private_table'),
    delivery_content = null
where delivery_content is not null and btrim(delivery_content) <> '';

create or replace function public.log_order_item_delivery_status(
  p_order_id uuid,
  p_order_item_id uuid,
  p_from_status text,
  p_to_status text,
  p_operator_type text default 'system',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_item_delivery_logs (
    order_id, order_item_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    p_order_id, p_order_item_id, p_from_status, p_to_status, auth.uid(), coalesce(nullif(p_operator_type, ''), 'system'), left(coalesce(p_note, ''), 500)
  );
end;
$$;

create or replace function public.refresh_order_fulfillment_status(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_delivered integer;
  v_status text;
  v_total integer;
  v_done integer;
  v_failed integer;
  v_processing integer;
  v_pending integer;
  v_fulfillment text;
  v_order_status text;
begin
  for v_item in
    select * from public.order_items where order_id = p_order_id order by created_at asc
  loop
    select count(*)::integer into v_delivered
    from public.order_deliveries
    where order_item_id = v_item.id and delivery_status = 'delivered';

    if v_item.delivery_type = 'service' then
      v_status := 'not_required';
      v_delivered := coalesce(v_item.quantity, 1);
    elsif v_item.delivery_type = 'physical' then
      v_status := case when coalesce(v_item.delivery_status, '') = 'delivered' then 'delivered' else 'processing' end;
    elsif exists (select 1 from public.order_deliveries where order_item_id = v_item.id and delivery_status = 'failed') then
      v_status := 'failed';
    elsif coalesce(v_delivered, 0) >= coalesce(v_item.quantity, 1) then
      v_status := 'delivered';
    elsif coalesce(v_delivered, 0) > 0 then
      v_status := 'processing';
    else
      v_status := coalesce(v_item.delivery_status, public.initial_order_item_delivery_status(v_item.delivery_type));
    end if;

    if v_status <> coalesce(v_item.delivery_status, '') or coalesce(v_delivered, 0) <> coalesce(v_item.delivered_quantity, 0) then
      update public.order_items
      set delivery_status = v_status,
          delivered_quantity = least(coalesce(v_item.quantity, 1), coalesce(v_delivered, 0)),
          delivery_completed_at = case when v_status in ('delivered','not_required') then coalesce(delivery_completed_at, now()) else delivery_completed_at end,
          delivery_status_updated_at = now()
      where id = v_item.id;

      perform public.log_order_item_delivery_status(p_order_id, v_item.id, v_item.delivery_status, v_status, 'system', '订单项交付状态聚合更新');
    end if;
  end loop;

  select count(*),
         count(*) filter (where delivery_status in ('delivered','not_required')),
         count(*) filter (where delivery_status = 'failed'),
         count(*) filter (where delivery_status = 'processing'),
         count(*) filter (where delivery_status = 'pending')
  into v_total, v_done, v_failed, v_processing, v_pending
  from public.order_items
  where order_id = p_order_id;

  if coalesce(v_total, 0) = 0 then
    v_fulfillment := 'pending';
  elsif v_done = v_total then
    v_fulfillment := 'delivered';
  elsif v_failed > 0 and v_done = 0 and v_pending = 0 and v_processing = 0 then
    v_fulfillment := 'delivery_failed';
  elsif v_done > 0 then
    v_fulfillment := 'partially_delivered';
  elsif v_processing > 0 or v_failed > 0 then
    v_fulfillment := 'processing';
  else
    v_fulfillment := 'pending';
  end if;

  select status into v_order_status from public.orders where id = p_order_id;

  update public.orders
  set fulfillment_status = v_fulfillment,
      status = case
        when status in ('cancelled','refunded','failed','completed') then status
        when v_fulfillment = 'delivered' then 'delivered'
        when payment_status = 'paid' and v_fulfillment in ('partially_delivered','processing','delivery_failed') then 'processing'
        else status
      end,
      processed_at = case when payment_status = 'paid' and v_fulfillment in ('partially_delivered','processing','delivery_failed') then coalesce(processed_at, now()) else processed_at end,
      completed_at = case when v_fulfillment = 'delivered' then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where id = p_order_id;

  return v_fulfillment;
end;
$$;

create or replace function public.deliver_digital_order(
  p_order_id uuid,
  p_trigger_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_inventory public.digital_inventory;
  v_remaining integer;
  v_delivered_total integer := 0;
  v_already_delivered integer := 0;
  v_delivery_id uuid;
  v_has_auto_item boolean := false;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception '订单未支付，不能发货';
  end if;

  if v_order.status in ('cancelled','refunded') then
    raise exception '订单已取消或退款，不能发货';
  end if;

  for v_item in
    select * from public.order_items
    where order_id = p_order_id
      and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
    order by created_at asc
  loop
    v_has_auto_item := true;

    select count(*)::integer into v_already_delivered
    from public.order_deliveries
    where order_item_id = v_item.id and delivery_status = 'delivered';

    v_remaining := greatest(coalesce(v_item.quantity, 1) - coalesce(v_already_delivered, 0), 0);
    if v_remaining <= 0 then
      continue;
    end if;

    update public.order_items
    set delivery_status = 'processing', delivery_started_at = coalesce(delivery_started_at, now()), delivery_status_updated_at = now()
    where id = v_item.id and delivery_status = 'pending';

    for v_inventory in
      select * from public.digital_inventory
      where product_id = v_item.product_id
        and status in ('reserved','available')
        and (status = 'available' or coalesce(reserved_order_id, order_id) = p_order_id)
        and (expires_at is null or expires_at > now())
      order by case when status = 'reserved' then 0 else 1 end, reserved_at asc nulls last, created_at asc
      limit v_remaining
      for update skip locked
    loop
      exit when v_remaining <= 0;

      begin
        insert into public.order_deliveries (
          order_id, order_item_id, user_id, product_id, inventory_id,
          delivery_type, encrypted_content, delivery_status, delivered_at
        ) values (
          p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_inventory.id,
          'auto_delivery', 'stored_in_private_table', 'delivered', now()
        ) returning id into v_delivery_id;

        insert into public.digital_delivery_secrets (delivery_id, content)
        values (v_delivery_id, v_inventory.content)
        on conflict (delivery_id) do nothing;

        update public.digital_inventory
        set status = 'delivered',
            order_id = p_order_id,
            reserved_order_id = p_order_id,
            delivered_order_id = p_order_id,
            delivered_user_id = v_order.user_id,
            reserved_at = coalesce(reserved_at, now()),
            delivered_at = now()
        where id = v_inventory.id;

        v_delivered_total := v_delivered_total + 1;
        v_remaining := v_remaining - 1;
      exception when unique_violation then
        continue;
      end;
    end loop;

    if v_remaining > 0 then
      insert into public.order_deliveries (
        order_id, order_item_id, user_id, product_id, delivery_type, delivery_status, failure_reason
      ) values (
        p_order_id, v_item.id, v_order.user_id, v_item.product_id, 'auto_delivery', 'failed', '库存不足，等待人工处理'
      );

      update public.order_items
      set delivery_status = 'failed',
          delivery_failure_reason = '库存不足，等待人工处理',
          delivery_status_updated_at = now()
      where id = v_item.id;

      perform public.log_order_item_delivery_status(p_order_id, v_item.id, 'processing', 'failed', 'system', '库存不足，自动发货失败');
    end if;

    if v_item.product_id is not null then
      perform public.sync_product_available_stock(v_item.product_id);
    end if;
  end loop;

  if not v_has_auto_item then
    perform public.refresh_order_fulfillment_status(p_order_id);
    return jsonb_build_object('ok', true, 'order_id', p_order_id, 'delivered_count', 0, 'idempotent', true);
  end if;

  perform public.refresh_order_fulfillment_status(p_order_id);

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'delivered_count', v_delivered_total, 'idempotent', v_delivered_total = 0);
end;
$$;

create or replace function public.admin_deliver_order_item_manual(
  p_order_id uuid,
  p_order_item_id uuid,
  p_delivery_content text,
  p_delivery_note text default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_delivery public.order_deliveries;
begin
  if not public.is_admin() then
    raise exception '无后台访问权限';
  end if;
  if nullif(btrim(coalesce(p_delivery_content, '')), '') is null then
    raise exception '交付内容为空';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception '订单不存在'; end if;
  if v_order.payment_status <> 'paid' then raise exception '订单未支付'; end if;
  if v_order.status in ('cancelled','refunded') then raise exception '订单已取消或退款'; end if;

  select * into v_item from public.order_items where id = p_order_item_id and order_id = p_order_id for update;
  if not found then raise exception '订单项不存在'; end if;
  if public.normalize_order_item_delivery_type(v_item.delivery_type) <> 'manual_delivery' then
    raise exception '交付类型不匹配';
  end if;
  if coalesce(v_item.delivery_status, '') in ('delivered','not_required')
    or exists (select 1 from public.order_deliveries where order_item_id = p_order_item_id and delivery_status = 'delivered') then
    raise exception '重复交付';
  end if;

  insert into public.order_deliveries (
    order_id, order_item_id, user_id, product_id, delivery_type,
    encrypted_content, delivery_status, delivered_at, delivery_note
  ) values (
    p_order_id, p_order_item_id, v_order.user_id, v_item.product_id, 'manual_delivery',
    'stored_in_private_table', 'delivered', now(), nullif(btrim(coalesce(p_delivery_note, '')), '')
  ) returning * into v_delivery;

  insert into public.digital_delivery_secrets (delivery_id, content)
  values (v_delivery.id, btrim(p_delivery_content));

  update public.order_items
  set delivery_status = 'delivered',
      delivered_quantity = coalesce(quantity, 1),
      delivery_completed_at = now(),
      delivery_status_updated_at = now()
  where id = p_order_item_id;

  perform public.log_order_item_delivery_status(p_order_id, p_order_item_id, v_item.delivery_status, 'delivered', 'admin', '管理员提交人工交付内容');
  perform public.refresh_order_fulfillment_status(p_order_id);

  return v_delivery;
end;
$$;

create or replace function public.get_order_fulfillment_for_user(p_order_no text)
returns table (
  order_item_id uuid,
  product_name text,
  delivery_status text,
  delivery_type text,
  quantity integer,
  delivered_quantity integer,
  delivered_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select * into v_order from public.orders where order_no = p_order_no and user_id = auth.uid() limit 1;
  if not found then raise exception '订单不存在或无权查看'; end if;
  if v_order.payment_status <> 'paid' then raise exception '订单未支付'; end if;

  update public.order_deliveries
  set viewed_at = coalesce(viewed_at, now())
  where order_id = v_order.id and delivery_status = 'delivered' and viewed_at is null;

  return query
  select
    oi.id,
    oi.product_name,
    coalesce(oi.delivery_status, public.initial_order_item_delivery_status(oi.delivery_type)),
    public.normalize_order_item_delivery_type(oi.delivery_type),
    coalesce(oi.quantity, 1)::integer,
    coalesce(oi.delivered_quantity, 0)::integer,
    coalesce(oi.delivery_completed_at, max(od.delivered_at)),
    public.mask_delivery_secret(max(ds.content)),
    case when coalesce(oi.delivery_status, '') = 'delivered' then max(ds.content) else null end,
    max(od.delivery_note)
  from public.order_items oi
  left join public.order_deliveries od on od.order_item_id = oi.id and od.delivery_status = 'delivered'
  left join public.digital_delivery_secrets ds on ds.delivery_id = od.id
  where oi.order_id = v_order.id
  group by oi.id, oi.product_name, oi.delivery_status, oi.delivery_type, oi.quantity, oi.delivered_quantity, oi.delivery_completed_at
  order by min(oi.created_at) asc;
end;
$$;

create or replace function public.get_order_delivery_for_user(p_order_no text)
returns table (
  order_no text,
  order_status text,
  payment_status text,
  product_name text,
  delivery_id uuid,
  delivery_status text,
  delivery_type text,
  delivered_at timestamptz,
  viewed_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into v_order from public.orders where order_no = p_order_no and user_id = auth.uid() limit 1;
  if not found then raise exception '订单不存在或无权查看'; end if;
  if v_order.payment_status <> 'paid' then raise exception '订单未支付'; end if;

  return query
  select
    v_order.order_no,
    v_order.status,
    v_order.payment_status,
    f.product_name,
    null::uuid,
    f.delivery_status,
    f.delivery_type,
    f.delivered_at,
    now(),
    f.masked_content,
    f.content,
    f.delivery_note
  from public.get_order_fulfillment_for_user(p_order_no) f;
end;
$$;

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in select distinct order_id from public.order_items loop
    perform public.refresh_order_fulfillment_status(v_order_id);
  end loop;
end $$;

grant execute on function public.refresh_order_fulfillment_status(uuid) to authenticated;
grant execute on function public.deliver_digital_order(uuid, text) to authenticated;
grant execute on function public.admin_deliver_order_item_manual(uuid, uuid, text, text) to authenticated;
grant execute on function public.get_order_fulfillment_for_user(text) to authenticated;
grant execute on function public.get_order_delivery_for_user(text) to authenticated;
