-- Digital inventory reservation and delivery hardening.
--
-- Scope:
-- - keep existing inventory data
-- - require automatic delivery to consume inventory reserved for the same order
-- - keep delivery content in digital_delivery_secrets
-- - preserve idempotency for repeated payment completion and admin retry
--
-- Execute manually after:
-- 1. 20260620_digital_inventory_delivery.sql
-- 2. 20260622_digital_delivery_hardening.sql
-- 3. 20260703_digital_delivery_atomic_hardening.sql
-- 4. 20260709_order_lifecycle_non_payment_hardening.sql

create extension if not exists pgcrypto;

alter table if exists public.digital_inventory
  add column if not exists reserved_order_id uuid,
  add column if not exists reserved_order_item_id uuid,
  add column if not exists reserved_user_id uuid,
  add column if not exists delivered_order_id uuid,
  add column if not exists delivered_order_item_id uuid,
  add column if not exists delivered_user_id uuid,
  add column if not exists reserved_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists updated_at timestamptz not null default now();

update public.digital_inventory
   set reserved_order_id = coalesce(reserved_order_id, order_id)
 where status = 'reserved'
   and reserved_order_id is null
   and order_id is not null;

update public.digital_inventory
   set delivered_order_id = coalesce(delivered_order_id, order_id)
 where status = 'delivered'
   and delivered_order_id is null
   and order_id is not null;

alter table if exists public.digital_inventory drop constraint if exists digital_inventory_status_check;
alter table if exists public.digital_inventory
  add constraint digital_inventory_status_check
  check (status in ('available','reserved','delivered','disabled','expired','invalid'));

alter table if exists public.order_deliveries
  add column if not exists user_id uuid,
  add column if not exists product_id uuid,
  add column if not exists sku_id uuid,
  add column if not exists inventory_id uuid,
  add column if not exists encrypted_content text,
  add column if not exists viewed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists delivery_note text,
  add column if not exists delivery_status_updated_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.order_items
  add column if not exists delivery_status text,
  add column if not exists delivered_quantity integer not null default 0,
  add column if not exists delivery_failure_reason text,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_completed_at timestamptz,
  add column if not exists delivery_status_updated_at timestamptz not null default now();

alter table if exists public.orders
  add column if not exists fulfillment_status text not null default 'pending';

alter table if exists public.order_deliveries drop constraint if exists order_deliveries_status_check;
alter table if exists public.order_deliveries
  add constraint order_deliveries_status_check
  check (delivery_status in ('pending','processing','delivered','failed','not_required','cancelled','revoked'));

alter table if exists public.order_items drop constraint if exists order_items_delivery_status_check;
alter table if exists public.order_items
  add constraint order_items_delivery_status_check
  check (delivery_status is null or delivery_status in ('pending','processing','delivered','failed','not_required','cancelled'));

alter table if exists public.orders drop constraint if exists orders_fulfillment_status_check;
alter table if exists public.orders
  add constraint orders_fulfillment_status_check
  check (fulfillment_status in ('pending','partially_delivered','processing','delivered','delivery_failed'));

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
to anon, authenticated
using (false);

drop policy if exists "deny direct delivery secret writes" on public.digital_delivery_secrets;
create policy "deny direct delivery secret writes"
on public.digital_delivery_secrets for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  inventory_id uuid references public.digital_inventory(id) on delete set null,
  operator_id uuid,
  operator_type text not null default 'system',
  trigger_source text not null default 'manual',
  event_type text not null,
  message text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delivery_logs enable row level security;

drop policy if exists "admins can read delivery logs" on public.delivery_logs;
create policy "admins can read delivery logs"
on public.delivery_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "deny direct delivery log writes" on public.delivery_logs;
create policy "deny direct delivery log writes"
on public.delivery_logs for all
to anon, authenticated
using (false)
with check (false);

create index if not exists digital_inventory_product_sku_status_idx
  on public.digital_inventory(product_id, sku_id, status, updated_at desc);
create index if not exists digital_inventory_reserved_order_item_idx
  on public.digital_inventory(reserved_order_id, reserved_order_item_id)
  where reserved_order_id is not null;
create index if not exists digital_inventory_delivered_order_item_idx
  on public.digital_inventory(delivered_order_id, delivered_order_item_id)
  where delivered_order_id is not null;
create index if not exists digital_inventory_delivered_user_idx
  on public.digital_inventory(delivered_user_id)
  where delivered_user_id is not null;

create index if not exists order_deliveries_order_item_status_idx
  on public.order_deliveries(order_id, order_item_id, delivery_status);
create index if not exists order_deliveries_inventory_idx
  on public.order_deliveries(inventory_id)
  where inventory_id is not null;
create unique index if not exists order_deliveries_delivered_inventory_uidx
  on public.order_deliveries(inventory_id)
  where inventory_id is not null and delivery_status = 'delivered';

create or replace function public.normalize_order_item_delivery_type(p_delivery_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_delivery_type, '')) in ('auto_delivery','automatic','auto','card','account','digital') then 'auto_delivery'
    when lower(coalesce(p_delivery_type, '')) in ('manual_delivery','manual') then 'manual_delivery'
    when lower(coalesce(p_delivery_type, '')) in ('service','none','not_required') then 'service'
    when lower(coalesce(p_delivery_type, '')) in ('physical','shipping') then 'physical'
    else coalesce(nullif(lower(btrim(p_delivery_type)), ''), 'manual_delivery')
  end;
$$;

create or replace function public.mask_delivery_secret(p_content text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_content is null or p_content = '' then '-'
    when length(p_content) <= 8 then repeat('*', greatest(length(p_content), 4))
    else left(p_content, 4) || repeat('*', 8) || right(p_content, 4)
  end;
$$;

create or replace function public.write_delivery_log(
  p_order_id uuid,
  p_order_item_id uuid default null,
  p_inventory_id uuid default null,
  p_trigger_source text default 'manual',
  p_event_type text default 'delivery_failed',
  p_message text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.delivery_logs (
    order_id, order_item_id, inventory_id, operator_id, operator_type,
    trigger_source, event_type, message, detail
  )
  values (
    p_order_id,
    p_order_item_id,
    p_inventory_id,
    auth.uid(),
    case when public.is_admin() then 'admin' else 'system' end,
    coalesce(nullif(btrim(p_trigger_source), ''), 'manual'),
    coalesce(nullif(btrim(p_event_type), ''), 'delivery_failed'),
    left(coalesce(p_message, ''), 500),
    coalesce(p_detail, '{}'::jsonb) - 'content' - 'delivery_content' - 'secret' - 'token' - 'password'
  );
end;
$$;

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
  )
  values (
    p_order_id,
    p_order_item_id,
    p_from_status,
    p_to_status,
    auth.uid(),
    coalesce(nullif(p_operator_type, ''), 'system'),
    left(coalesce(p_note, ''), 500)
  );
exception when undefined_table then
  null;
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
begin
  for v_item in
    select * from public.order_items where order_id = p_order_id order by created_at asc
  loop
    select count(*)::integer into v_delivered
    from public.order_deliveries
    where order_item_id = v_item.id and delivery_status = 'delivered';

    if public.normalize_order_item_delivery_type(v_item.delivery_type) = 'service' then
      v_status := 'not_required';
      v_delivered := coalesce(v_item.quantity, 1);
    elsif public.normalize_order_item_delivery_type(v_item.delivery_type) = 'physical' then
      v_status := case when coalesce(v_item.delivery_status, '') = 'delivered' then 'delivered' else 'processing' end;
    elsif exists (select 1 from public.order_deliveries where order_item_id = v_item.id and delivery_status = 'failed') then
      v_status := 'failed';
    elsif coalesce(v_delivered, 0) >= coalesce(v_item.quantity, 1) then
      v_status := 'delivered';
    elsif coalesce(v_delivered, 0) > 0 then
      v_status := 'processing';
    else
      v_status := coalesce(v_item.delivery_status, 'pending');
    end if;

    if v_status <> coalesce(v_item.delivery_status, '') or coalesce(v_delivered, 0) <> coalesce(v_item.delivered_quantity, 0) then
      update public.order_items
         set delivery_status = v_status,
             delivered_quantity = least(coalesce(v_item.quantity, 1), coalesce(v_delivered, 0)),
             delivery_completed_at = case when v_status in ('delivered','not_required') then coalesce(delivery_completed_at, now()) else delivery_completed_at end,
             delivery_status_updated_at = now()
       where id = v_item.id;

      perform public.log_order_item_delivery_status(p_order_id, v_item.id, v_item.delivery_status, v_status, 'system', 'delivery status refreshed');
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
  elsif v_done > 0 then
    v_fulfillment := 'partially_delivered';
  elsif v_failed > 0 and v_pending = 0 and v_processing = 0 then
    v_fulfillment := 'delivery_failed';
  elsif v_processing > 0 or v_failed > 0 then
    v_fulfillment := 'processing';
  else
    v_fulfillment := 'pending';
  end if;

  update public.orders
     set fulfillment_status = v_fulfillment,
         status = case
           when status in ('cancelled','expired','refunded','failed','completed') then status
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
  p_trigger_source text default 'system'
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
  v_delivery public.order_deliveries;
  v_remaining integer;
  v_delivered_count integer := 0;
  v_failed_count integer := 0;
  v_total_auto_items integer := 0;
  v_now timestamptz := now();
  v_fulfillment_status text;
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_jwt_role <> 'service_role' and not public.is_admin() then
    raise exception 'delivery requires service role or administrator';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'order not found', 'delivered_count', 0, 'failed_count', 0, 'idempotent', true);
  end if;

  if v_order.payment_status <> 'paid' then
    return jsonb_build_object('ok', false, 'message', 'order is not paid', 'order_id', p_order_id, 'delivered_count', 0, 'failed_count', 0, 'idempotent', true);
  end if;

  if v_order.status in ('cancelled','expired','refunded','failed') then
    return jsonb_build_object('ok', false, 'message', 'order status does not allow delivery', 'order_id', p_order_id, 'status', v_order.status, 'delivered_count', 0, 'failed_count', 0, 'idempotent', true);
  end if;

  perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_started', 'automatic delivery started', '{}'::jsonb);

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
      and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
    order by created_at asc
    for update
  loop
    v_total_auto_items := v_total_auto_items + 1;

    select greatest(coalesce(v_item.quantity, 1) - count(*)::integer, 0)
      into v_remaining
    from public.order_deliveries
    where order_item_id = v_item.id
      and delivery_status = 'delivered';

    if v_remaining <= 0 then
      continue;
    end if;

    update public.order_items
       set delivery_status = 'processing',
           delivery_started_at = coalesce(delivery_started_at, v_now),
           delivery_status_updated_at = v_now
     where id = v_item.id
       and coalesce(delivery_status, 'pending') in ('pending','failed','processing')
     returning * into v_item;

    while v_remaining > 0 loop
      select * into v_inventory
      from public.digital_inventory
      where product_id = v_item.product_id
        and (
          (v_item.sku_id is null and sku_id is null)
          or sku_id = v_item.sku_id
        )
        and status = 'reserved'
        and coalesce(reserved_order_id, order_id) = p_order_id
        and (reserved_order_item_id is null or reserved_order_item_id = v_item.id)
        and (expires_at is null or expires_at > v_now)
      order by reserved_at asc nulls last, created_at asc
      limit 1
      for update skip locked;

      if not found then
        exit;
      end if;

      insert into public.order_deliveries (
        order_id, order_item_id, user_id, product_id, sku_id, inventory_id,
        delivery_type, encrypted_content, delivery_status, delivered_at, created_at, updated_at
      )
      values (
        p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_item.sku_id, v_inventory.id,
        'auto_delivery', 'stored_in_private_table', 'delivered', v_now, v_now, v_now
      )
      on conflict do nothing
      returning * into v_delivery;

      if v_delivery.id is null then
        continue;
      end if;

      insert into public.digital_delivery_secrets (delivery_id, content)
      values (v_delivery.id, v_inventory.content)
      on conflict (delivery_id) do nothing;

      update public.digital_inventory
         set status = 'delivered',
             order_id = p_order_id,
             reserved_order_id = p_order_id,
             reserved_order_item_id = v_item.id,
             delivered_order_id = p_order_id,
             delivered_order_item_id = v_item.id,
             delivered_user_id = v_order.user_id,
             reserved_at = coalesce(reserved_at, v_now),
             delivered_at = v_now,
             updated_at = v_now
       where id = v_inventory.id
         and status = 'reserved'
         and coalesce(reserved_order_id, order_id) = p_order_id
         and (reserved_order_item_id is null or reserved_order_item_id = v_item.id);

      if not found then
        raise exception 'reserved inventory state changed during delivery';
      end if;

      v_delivered_count := v_delivered_count + 1;
      v_remaining := v_remaining - 1;
    end loop;

    if v_remaining > 0 then
      if not exists (
        select 1
        from public.order_deliveries
        where order_item_id = v_item.id
          and delivery_status = 'failed'
          and failure_reason = 'reserved inventory is insufficient'
      ) then
        insert into public.order_deliveries (
          order_id, order_item_id, user_id, product_id, sku_id,
          delivery_type, delivery_status, failure_reason, created_at, updated_at
        )
        values (
          p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_item.sku_id,
          'auto_delivery', 'failed', 'reserved inventory is insufficient', v_now, v_now
        );
      end if;

      update public.order_items
         set delivery_status = 'failed',
             delivery_failure_reason = case when v_item.sku_id is null then 'reserved digital inventory is insufficient' else 'reserved SKU digital inventory is insufficient' end,
             delivery_status_updated_at = v_now
       where id = v_item.id;

      perform public.log_order_item_delivery_status(p_order_id, v_item.id, v_item.delivery_status, 'failed', 'system', 'reserved inventory is insufficient');
      perform public.write_delivery_log(
        p_order_id,
        v_item.id,
        null,
        p_trigger_source,
        'delivery_failed',
        'reserved inventory is insufficient',
        jsonb_build_object('product_id', v_item.product_id, 'sku_id', v_item.sku_id, 'remaining', v_remaining)
      );
      v_failed_count := v_failed_count + 1;
    end if;

    if v_item.product_id is not null and to_regprocedure('public.sync_product_available_stock(uuid)') is not null then
      perform public.sync_product_available_stock(v_item.product_id);
    end if;
  end loop;

  if v_total_auto_items = 0 then
    v_fulfillment_status := public.refresh_order_fulfillment_status(p_order_id);
    return jsonb_build_object('ok', true, 'order_id', p_order_id, 'message', 'no automatic delivery items', 'delivered_count', 0, 'failed_count', 0, 'fulfillment_status', v_fulfillment_status, 'idempotent', true);
  end if;

  v_fulfillment_status := public.refresh_order_fulfillment_status(p_order_id);

  if v_delivered_count > 0 then
    perform public.write_delivery_log(
      p_order_id,
      null,
      null,
      p_trigger_source,
      'delivery_success',
      'automatic delivery completed',
      jsonb_build_object('delivered_count', v_delivered_count, 'failed_count', v_failed_count, 'fulfillment_status', v_fulfillment_status)
    );
  end if;

  return jsonb_build_object(
    'ok', v_failed_count = 0,
    'order_id', p_order_id,
    'message', case when v_failed_count = 0 then 'automatic delivery completed' else 'automatic delivery partially failed and requires manual review' end,
    'delivered_count', v_delivered_count,
    'failed_count', v_failed_count,
    'fulfillment_status', v_fulfillment_status,
    'idempotent', v_delivered_count = 0
  );
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
    raise exception 'please sign in first';
  end if;

  select * into v_order
  from public.orders
  where order_no = p_order_no and user_id = auth.uid()
  limit 1;
  if not found then raise exception 'order not found or access denied'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'order is not paid'; end if;
  if v_order.status in ('cancelled','expired','failed') then raise exception 'order status does not allow delivery access'; end if;

  update public.order_deliveries
     set viewed_at = coalesce(viewed_at, now())
   where order_id = v_order.id
     and user_id = auth.uid()
     and delivery_status = 'delivered'
     and viewed_at is null;

  return query
  select
    oi.id,
    oi.product_name,
    coalesce(oi.delivery_status, 'pending'),
    public.normalize_order_item_delivery_type(oi.delivery_type),
    coalesce(oi.quantity, 1)::integer,
    coalesce(oi.delivered_quantity, 0)::integer,
    coalesce(oi.delivery_completed_at, max(od.delivered_at)),
    public.mask_delivery_secret(string_agg(ds.content, E'\n' order by od.delivered_at asc)),
    case
      when coalesce(oi.delivery_status, '') = 'delivered'
        then string_agg(ds.content, E'\n' order by od.delivered_at asc)
      else null
    end,
    max(od.delivery_note)
  from public.order_items oi
  left join public.order_deliveries od
    on od.order_item_id = oi.id
   and od.order_id = v_order.id
   and od.user_id = auth.uid()
   and od.delivery_status = 'delivered'
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
  if auth.uid() is null then raise exception 'please sign in first'; end if;
  select * into v_order from public.orders where order_no = p_order_no and user_id = auth.uid() limit 1;
  if not found then raise exception 'order not found or access denied'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'order is not paid'; end if;
  if v_order.status in ('cancelled','expired','failed') then raise exception 'order status does not allow delivery access'; end if;

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
    null::timestamptz,
    f.masked_content,
    f.content,
    f.delivery_note
  from public.get_order_fulfillment_for_user(p_order_no) f;
end;
$$;

revoke execute on function public.deliver_digital_order(uuid, text) from anon;
revoke execute on function public.deliver_digital_order(uuid, text) from authenticated;
grant execute on function public.deliver_digital_order(uuid, text) to service_role;
grant execute on function public.deliver_digital_order(uuid, text) to authenticated;

grant execute on function public.get_order_fulfillment_for_user(text) to authenticated;
grant execute on function public.get_order_delivery_for_user(text) to authenticated;
grant execute on function public.write_delivery_log(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
