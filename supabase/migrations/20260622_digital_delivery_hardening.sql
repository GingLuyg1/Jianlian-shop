-- Digital delivery hardening and user delivery access.
-- Execute manually in Supabase SQL Editor. This migration is idempotent and keeps RLS enabled.

create extension if not exists pgcrypto;

-- 1) Harden digital inventory shape without deleting existing data.
alter table public.digital_inventory
  add column if not exists content_type text not null default 'text',
  add column if not exists reserved_order_id uuid references public.orders(id) on delete set null,
  add column if not exists delivered_order_id uuid references public.orders(id) on delete set null,
  add column if not exists delivered_user_id uuid;

update public.digital_inventory
set reserved_order_id = coalesce(reserved_order_id, order_id)
where reserved_order_id is null and order_id is not null and status = 'reserved';

update public.digital_inventory
set delivered_order_id = coalesce(delivered_order_id, order_id)
where delivered_order_id is null and order_id is not null and status = 'delivered';

update public.digital_inventory
set status = 'invalid'
where status = 'expired';

alter table public.digital_inventory drop constraint if exists digital_inventory_status_check;
alter table public.digital_inventory
  add constraint digital_inventory_status_check
  check (status in ('available','reserved','delivered','disabled','invalid'));

create index if not exists digital_inventory_reserved_order_idx
  on public.digital_inventory(reserved_order_id)
  where reserved_order_id is not null;
create index if not exists digital_inventory_delivered_order_idx
  on public.digital_inventory(delivered_order_id)
  where delivered_order_id is not null;
create index if not exists digital_inventory_delivered_user_idx
  on public.digital_inventory(delivered_user_id)
  where delivered_user_id is not null;

-- 2) Add delivery metadata. Keep legacy delivery_content column for compatibility but new flows store secrets separately.
alter table public.order_deliveries
  add column if not exists user_id uuid,
  add column if not exists product_id uuid,
  add column if not exists inventory_id uuid references public.digital_inventory(id) on delete set null,
  add column if not exists encrypted_content text,
  add column if not exists viewed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists delivery_note text;

alter table public.order_deliveries drop constraint if exists order_deliveries_status_check;
alter table public.order_deliveries
  add constraint order_deliveries_status_check
  check (delivery_status in ('pending','delivered','failed','revoked'));

create index if not exists order_deliveries_user_idx
  on public.order_deliveries(user_id)
  where user_id is not null;
create index if not exists order_deliveries_inventory_idx
  on public.order_deliveries(inventory_id)
  where inventory_id is not null;
create unique index if not exists order_deliveries_delivered_inventory_uidx
  on public.order_deliveries(inventory_id)
  where inventory_id is not null and delivery_status = 'delivered';

update public.order_deliveries od
set user_id = o.user_id
from public.orders o
where od.order_id = o.id and od.user_id is null;

update public.order_deliveries od
set product_id = oi.product_id
from public.order_items oi
where od.order_item_id = oi.id and od.product_id is null;

-- 3) Private secret storage. Direct client access is denied by RLS.
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
using (false);

drop policy if exists "deny direct delivery secret writes" on public.digital_delivery_secrets;
create policy "deny direct delivery secret writes"
on public.digital_delivery_secrets for all
using (false)
with check (false);

drop trigger if exists digital_delivery_secrets_set_updated_at on public.digital_delivery_secrets;
create trigger digital_delivery_secrets_set_updated_at
before update on public.digital_delivery_secrets
for each row execute function public.set_updated_at();

insert into public.digital_delivery_secrets (delivery_id, content)
select od.id, od.delivery_content
from public.order_deliveries od
where od.delivery_content is not null
  and btrim(od.delivery_content) <> ''
on conflict (delivery_id) do nothing;

update public.order_deliveries
set encrypted_content = coalesce(encrypted_content, 'stored_in_private_table'),
    delivery_content = null
where delivery_content is not null;

create or replace function public.protect_order_delivery_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delivery_content is not null and btrim(new.delivery_content) <> '' then
    insert into public.digital_delivery_secrets (delivery_id, content)
    values (new.id, new.delivery_content)
    on conflict (delivery_id) do update
      set content = excluded.content,
          updated_at = now();

    update public.order_deliveries
      set encrypted_content = coalesce(encrypted_content, 'stored_in_private_table'),
          delivery_content = null
    where id = new.id
      and delivery_content is not null;
  end if;

  return null;
end;
$$;

drop trigger if exists order_deliveries_protect_content on public.order_deliveries;
create trigger order_deliveries_protect_content
after insert or update of delivery_content on public.order_deliveries
for each row execute function public.protect_order_delivery_content();
-- 4) Delivery logs. Messages must not contain raw card/account secrets.
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
  created_at timestamptz not null default now(),
  constraint delivery_logs_operator_type_check check (operator_type in ('system','admin','user','api')),
  constraint delivery_logs_event_type_check check (event_type in ('delivery_started','delivery_success','delivery_failed','delivery_retry','delivery_viewed'))
);

create index if not exists delivery_logs_order_idx
  on public.delivery_logs(order_id, created_at desc);
create index if not exists delivery_logs_inventory_idx
  on public.delivery_logs(inventory_id)
  where inventory_id is not null;

alter table public.delivery_logs enable row level security;

drop policy if exists "admins can read delivery logs" on public.delivery_logs;
create policy "admins can read delivery logs"
on public.delivery_logs for select
using (public.is_admin());

drop policy if exists "deny direct delivery log writes" on public.delivery_logs;
create policy "deny direct delivery log writes"
on public.delivery_logs for all
using (false)
with check (false);

create or replace function public.mask_delivery_secret(p_content text)
returns text
language sql
immutable
as $$
  select case
    when p_content is null or p_content = '' then '閳?
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
  if auth.uid() is null then
    raise exception '鐠囧嘲鍘涢惂璇茬秿';
  end if;

  if p_order_id is not null
    and not public.is_admin()
    and not exists (
      select 1 from public.orders o
      where o.id = p_order_id and o.user_id = auth.uid()
    ) then
    raise exception '閺冪姵娼堥崘娆忓弳娴溿倓绮弮銉ョ箶';
  end if;

  insert into public.delivery_logs (
    order_id, order_item_id, inventory_id, operator_id, operator_type,
    trigger_source, event_type, message, detail
  )
  values (
    p_order_id, p_order_item_id, p_inventory_id, auth.uid(),
    case when public.is_admin() then 'admin' else 'system' end,
    coalesce(nullif(btrim(p_trigger_source), ''), 'manual'),
    coalesce(nullif(btrim(p_event_type), ''), 'delivery_failed'),
    left(coalesce(p_message, ''), 500),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

create or replace function public.sync_product_available_stock(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
begin
  select count(*)::integer
    into v_available
  from public.digital_inventory
  where product_id = p_product_id
    and status = 'available'
    and (expires_at is null or expires_at > now());

  update public.products
    set stock = coalesce(v_available, 0)
  where id = p_product_id;

  return coalesce(v_available, 0);
end;
$$;

create or replace function public.release_order_inventory(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_released integer := 0;
  v_product_id uuid;
begin
  if not public.is_admin() and not exists (
    select 1 from public.orders
    where id = p_order_id and user_id = auth.uid()
  ) then
    raise exception '閺冪姵娼堥柌濠冩杹鐠囥儴顓归崡鏇炵氨鐎?;
  end if;

  for v_product_id in
    select distinct product_id
    from public.digital_inventory
    where coalesce(reserved_order_id, order_id) = p_order_id and status = 'reserved'
  loop
    update public.digital_inventory
      set status = 'available',
          order_id = null,
          reserved_order_id = null,
          reserved_at = null
    where coalesce(reserved_order_id, order_id) = p_order_id
      and product_id = v_product_id
      and status = 'reserved';

    get diagnostics v_count = row_count;
    v_released := v_released + coalesce(v_count, 0);
    perform public.sync_product_available_stock(v_product_id);
  end loop;

  return coalesce(v_released, 0);
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
  v_from_status text;
begin
  if not public.is_admin() then
    raise exception '閺冪姴鎮楅崣鎷岊問闂傤喗娼堥梽?;
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_failed', '鐠併垹宕熸稉宥呯摠閸?, '{}'::jsonb);
    raise exception '鐠併垹宕熸稉宥呯摠閸?;
  end if;

  if v_order.payment_status <> 'paid' then
    perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_failed', '鐠併垹宕熼張顏呮暜娴?, jsonb_build_object('payment_status', v_order.payment_status));
    raise exception '鐠併垹宕熼張顏呮暜娴犳﹫绱濇稉宥堝厴閸欐垼鎻?;
  end if;

  if v_order.status in ('cancelled','refunded') then
    perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_failed', '鐠併垹宕熷鎻掑絿濞戝牊鍨ㄩ柅鈧▎?, jsonb_build_object('status', v_order.status));
    raise exception '鐠併垹宕熷鎻掑絿濞戝牊鍨ㄩ柅鈧▎鎾呯礉娑撳秷鍏橀崣鎴ｆ彛';
  end if;

  perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_started', '瀵偓婵鍤滈崝銊ュ絺鐠?, '{}'::jsonb);

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
      and delivery_type in ('automatic','auto','card','account')
    order by created_at asc
  loop
    v_has_auto_item := true;

    select count(*)::integer
      into v_already_delivered
    from public.order_deliveries od
    where od.order_id = p_order_id
      and od.order_item_id = v_item.id
      and od.delivery_status = 'delivered';

    v_remaining := greatest(coalesce(v_item.quantity, 1) - coalesce(v_already_delivered, 0), 0);
    if v_remaining <= 0 then
      continue;
    end if;

    -- Prefer inventory reserved by order creation.
    for v_inventory in
      select *
      from public.digital_inventory
      where product_id = v_item.product_id
        and status = 'reserved'
        and coalesce(reserved_order_id, order_id) = p_order_id
      order by reserved_at asc nulls last, created_at asc
      limit v_remaining
      for update skip locked
    loop
      exit when v_remaining <= 0;

      begin
        insert into public.order_deliveries (
          order_id, order_item_id, user_id, product_id, inventory_id,
          delivery_type, encrypted_content, delivery_status, delivered_at
        )
        values (
          p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_inventory.id,
          coalesce(v_item.delivery_type, v_order.delivery_type), 'stored_in_private_table', 'delivered', now()
        )
        returning id into v_delivery_id;

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

    -- If reservation was missing, use currently available stock.
    for v_inventory in
      select *
      from public.digital_inventory
      where product_id = v_item.product_id
        and status = 'available'
        and (expires_at is null or expires_at > now())
      order by created_at asc
      limit v_remaining
      for update skip locked
    loop
      exit when v_remaining <= 0;

      begin
        insert into public.order_deliveries (
          order_id, order_item_id, user_id, product_id, inventory_id,
          delivery_type, encrypted_content, delivery_status, delivered_at
        )
        values (
          p_order_id, v_item.id, v_order.user_id, v_item.product_id, v_inventory.id,
          coalesce(v_item.delivery_type, v_order.delivery_type), 'stored_in_private_table', 'delivered', now()
        )
        returning id into v_delivery_id;

        insert into public.digital_delivery_secrets (delivery_id, content)
        values (v_delivery_id, v_inventory.content)
        on conflict (delivery_id) do nothing;

        update public.digital_inventory
          set status = 'delivered',
              order_id = p_order_id,
              reserved_order_id = coalesce(reserved_order_id, p_order_id),
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
      )
      values (
        p_order_id, v_item.id, v_order.user_id, v_item.product_id,
        coalesce(v_item.delivery_type, v_order.delivery_type), 'failed', '鎼存挸鐡ㄦ稉宥堝喕閿涘矁鍤滈崝銊ュ絺鐠愌冦亼鐠?
      );

      perform public.write_delivery_log(
        p_order_id, v_item.id, null, p_trigger_source, 'delivery_failed',
        '鎼存挸鐡ㄦ稉宥堝喕閿涘矁鍤滈崝銊ュ絺鐠愌冦亼鐠?,
        jsonb_build_object('product_id', v_item.product_id, 'remaining', v_remaining)
      );

      update public.orders
        set status = case when status in ('paid','pending_payment') then 'processing' else status end,
            processed_at = coalesce(processed_at, now()),
            admin_note = coalesce(admin_note || E'\n', '') || '閼奉亜濮╅崣鎴ｆ彛婢惰精瑙﹂敍姘氨鐎涙ü绗夌搾绛圭礉鐠囪渹姹夊銉ヮ槱閻?
      where id = p_order_id;

      raise exception '閼奉亜濮╅崣鎴ｆ彛鎼存挸鐡ㄦ稉宥堝喕閿涘矁顕禍鍝勪紣婢跺嫮鎮?;
    end if;

    perform public.sync_product_available_stock(v_item.product_id);
  end loop;

  if not v_has_auto_item then
    perform public.write_delivery_log(p_order_id, null, null, p_trigger_source, 'delivery_failed', '閸熷棗鎼ф稉宥嗘Ц閼奉亜濮╅崣鎴ｆ彛閸熷棗鎼?, '{}'::jsonb);
    raise exception '閸熷棗鎼ф稉宥嗘Ц閼奉亜濮╅崣鎴ｆ彛閸熷棗鎼?;
  end if;

  if v_delivered_total > 0 then
    v_from_status := v_order.status;
    update public.orders
      set status = 'delivered',
          payment_status = 'paid',
          paid_at = coalesce(paid_at, now()),
          processed_at = coalesce(processed_at, now()),
          completed_at = coalesce(completed_at, now())
    where id = p_order_id
    returning * into v_order;

    insert into public.order_status_logs (
      order_id, from_status, to_status, operator_id, operator_type, note
    )
    values (
      p_order_id, v_from_status, 'delivered', auth.uid(), 'system', '閼奉亜濮╅崣鎴ｆ彛鐎瑰本鍨?
    );

    perform public.write_delivery_log(
      p_order_id, null, null, p_trigger_source, 'delivery_success',
      '閼奉亜濮╅崣鎴ｆ彛鐎瑰本鍨?, jsonb_build_object('delivered_count', v_delivered_total)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'delivered_count', v_delivered_total,
    'idempotent', v_delivered_total = 0
  );
end;
$$;
create or replace function public.auto_deliver_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.deliver_digital_order(p_order_id, 'legacy_auto_deliver_order');
  return coalesce((v_result ->> 'delivered_count')::integer, 0);
end;
$$;

create or replace function public.admin_retry_auto_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '閺冪姴鎮楅崣鎷岊問闂傤喗娼堥梽?;
  end if;

  return public.deliver_digital_order(p_order_id, 'admin_retry');
end;
$$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_payment_status text default null,
  p_admin_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from_status text;
  v_stock_ok boolean := true;
  v_delivery_result jsonb;
begin
  if not public.is_admin() then
    raise exception '閺冪姴鎮楅崣鎷岊問闂傤喗娼堥梽?;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '鐠併垹宕熸稉宥呯摠閸?;
  end if;

  v_from_status := v_order.status;

  if p_to_status not in ('pending_payment','paid','processing','delivered','completed','cancelled','refunded','failed') then
    raise exception '閺冪姵鏅ョ拋銏犲礋閻樿埖鈧?;
  end if;

  if p_to_status = 'cancelled' then
    perform public.release_order_inventory(p_order_id);
  end if;

  if v_order.status = 'pending_payment' and p_to_status = 'paid' then
    select bool_and(
      case
        when oi.delivery_type in ('automatic','auto','card','account') then
          (
            select count(*)::integer
            from public.digital_inventory di
            where coalesce(di.reserved_order_id, di.order_id) = p_order_id
              and di.product_id = oi.product_id
              and di.status = 'reserved'
          ) >= oi.quantity
        else p.stock >= oi.quantity
      end
    )
      into v_stock_ok
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id;

    if coalesce(v_stock_ok, false) = false then
      raise exception '鎼存挸鐡ㄦ稉宥堝喕閿涘本妫ゅ▔鏇熺垼鐠佹澘鍑￠弨顖欑帛';
    end if;

    update public.products p
      set stock = p.stock - oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = p.id
      and coalesce(oi.delivery_type, '') not in ('automatic','auto','card','account');
  end if;

  update public.orders
    set status = p_to_status,
        payment_status = coalesce(p_payment_status, case when p_to_status = 'paid' then 'paid' else payment_status end),
        admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
        paid_at = case when p_to_status = 'paid' and paid_at is null then now() else paid_at end,
        processed_at = case when p_to_status = 'processing' and processed_at is null then now() else processed_at end,
        completed_at = case when p_to_status = 'completed' and completed_at is null then now() else completed_at end,
        cancelled_at = case when p_to_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_logs (
    order_id,from_status,to_status,operator_id,operator_type,note
  )
  values (
    p_order_id,v_from_status,p_to_status,auth.uid(),'admin',nullif(trim(p_admin_note), '')
  );

  if p_to_status = 'paid' or p_payment_status = 'paid' then
    begin
      v_delivery_result := public.deliver_digital_order(p_order_id, 'admin_order_status_paid');
      select * into v_order from public.orders where id = p_order_id;
    exception when others then
      perform public.write_delivery_log(p_order_id, null, null, 'admin_order_status_paid', 'delivery_failed', SQLERRM, '{}'::jsonb);
      update public.orders
        set status = 'processing',
            processed_at = coalesce(processed_at, now()),
            admin_note = coalesce(admin_note || E'\n', '') || '閼奉亜濮╅崣鎴ｆ彛婢惰精瑙﹂敍宀冾嚞娴滃搫浼愭径鍕倞'
      where id = p_order_id
      returning * into v_order;
    end;
  end if;

  return v_order;
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
  if auth.uid() is null then
    raise exception '鐠囧嘲鍘涢惂璇茬秿';
  end if;

  select * into v_order
  from public.orders
  where order_no = p_order_no
    and user_id = auth.uid()
  limit 1;

  if not found then
    raise exception '鐠併垹宕熸稉宥呯摠閸︺劍鍨ㄩ弮鐘虫綀閺屻儳婀?;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception '鐠併垹宕熼張顏呮暜娴犳﹫绱濇稉宥堝厴閺屻儳婀呮禍銈勭帛閸愬懎顔?;
  end if;

  update public.order_deliveries
    set viewed_at = coalesce(viewed_at, now())
  where order_id = v_order.id
    and delivery_status = 'delivered'
    and viewed_at is null;

  perform public.write_delivery_log(v_order.id, null, null, 'user_view_delivery', 'delivery_viewed', '閻劍鍩涢弻銉ф箙娴溿倓绮崘鍛啇', '{}'::jsonb);

  return query
  select
    v_order.order_no,
    v_order.status,
    v_order.payment_status,
    oi.product_name,
    od.id,
    od.delivery_status,
    od.delivery_type,
    od.delivered_at,
    coalesce(od.viewed_at, now()),
    public.mask_delivery_secret(ds.content),
    case when od.delivery_status = 'delivered' then ds.content else null end,
    od.delivery_note
  from public.order_deliveries od
  left join public.order_items oi on oi.id = od.order_item_id
  left join public.digital_delivery_secrets ds on ds.delivery_id = od.id
  where od.order_id = v_order.id
  order by od.created_at asc;
end;
$$;

create or replace function public.admin_list_digital_inventory_summary(
  p_search text default '',
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  product_id uuid,
  product_name text,
  product_slug text,
  batch_no text,
  available_count integer,
  reserved_count integer,
  delivered_count integer,
  disabled_count integer,
  expired_count integer,
  total_count integer,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
begin
  if not public.is_admin() then
    raise exception '閺冪姴鎮楅崣鎷岊問闂傤喗娼堥梽?;
  end if;

  return query
  with grouped as (
    select
      di.product_id,
      p.name as product_name,
      p.slug as product_slug,
      coalesce(di.batch_no, '') as batch_no,
      count(*) filter (where di.status = 'available')::integer as available_count,
      count(*) filter (where di.status = 'reserved')::integer as reserved_count,
      count(*) filter (where di.status = 'delivered')::integer as delivered_count,
      count(*) filter (where di.status = 'disabled')::integer as disabled_count,
      count(*) filter (where di.status = 'invalid')::integer as expired_count,
      count(*)::integer as total_count,
      max(di.updated_at) as updated_at
    from public.digital_inventory di
    join public.products p on p.id = di.product_id
    where (
        coalesce(nullif(btrim(p_search), ''), '') = ''
        or p.name ilike '%' || btrim(p_search) || '%'
        or p.slug ilike '%' || btrim(p_search) || '%'
      )
      and (v_status = 'all' or di.status = v_status)
    group by di.product_id, p.name, p.slug, coalesce(di.batch_no, '')
  ),
  counted as (
    select grouped.*, count(*) over() as total_rows
    from grouped
  )
  select *
  from counted
  order by updated_at desc nulls last
  offset (v_from - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_list_digital_inventory_items(
  p_product_id uuid,
  p_batch_no text default null,
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  product_id uuid,
  masked_content text,
  status text,
  order_id uuid,
  batch_no text,
  remark text,
  reserved_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
begin
  if not public.is_admin() then
    raise exception '閺冪姴鎮楅崣鎷岊問闂傤喗娼堥梽?;
  end if;

  return query
  with filtered as (
    select di.*
    from public.digital_inventory di
    where di.product_id = p_product_id
      and (p_batch_no is null or coalesce(di.batch_no, '') = coalesce(p_batch_no, ''))
      and (v_status = 'all' or di.status = v_status)
  ),
  counted as (
    select filtered.*, count(*) over() as total_rows
    from filtered
  )
  select
    counted.id,
    counted.product_id,
    public.mask_delivery_secret(counted.content) as masked_content,
    counted.status,
    coalesce(counted.delivered_order_id, counted.reserved_order_id, counted.order_id) as order_id,
    counted.batch_no,
    counted.remark,
    counted.reserved_at,
    counted.delivered_at,
    counted.expires_at,
    counted.created_at,
    counted.updated_at,
    counted.total_rows
  from counted
  order by counted.updated_at desc
  offset (v_from - 1) * v_size
  limit v_size;
end;
$$;

revoke all on function public.deliver_digital_order(uuid, text) from anon;
revoke all on function public.get_order_delivery_for_user(text) from anon;
grant execute on function public.deliver_digital_order(uuid, text) to authenticated;
grant execute on function public.get_order_delivery_for_user(text) to authenticated;
grant execute on function public.admin_retry_auto_delivery(uuid) to authenticated;
grant execute on function public.write_delivery_log(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;


