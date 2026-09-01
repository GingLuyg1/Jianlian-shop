-- Candidate only. DO NOT EXECUTE without separate Production authorization.
-- Generalizes the durable supplier fulfillment boundary while preserving one frozen supplier per order item.

begin;

set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $dependencies$
begin
  if to_regclass('public.supplier_fulfillment_requests') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.order_deliveries') is null
     or to_regclass('public.digital_delivery_secrets') is null
     or to_regclass('public.digital_inventory') is null
     or to_regprocedure('public.refresh_order_fulfillment_status(uuid)') is null
     or to_regprocedure('public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)') is null
     or to_regprocedure('public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)') is null
     or to_regprocedure('public.deliver_digital_order(uuid,text)') is null then
    raise exception 'SUPPLIER_FULFILLMENT_REQUIRED_DEPENDENCY_MISSING';
  end if;
end
$dependencies$;


alter table public.supplier_fulfillment_requests
  drop constraint if exists supplier_fulfillment_requests_supplier_check;
alter table public.supplier_fulfillment_requests
  alter column supplier_product_id type text using supplier_product_id::text;
alter table public.supplier_fulfillment_requests
  add constraint supplier_fulfillment_requests_supplier_check check (
    btrim(supplier) <> '' and supplier = btrim(supplier) and char_length(supplier) <= 80
  );
alter table public.supplier_fulfillment_requests
  drop constraint if exists supplier_fulfillment_requests_product_id_check;
alter table public.supplier_fulfillment_requests
  add constraint supplier_fulfillment_requests_product_id_check check (
    supplier_product_id is null or (btrim(supplier_product_id) <> '' and supplier_product_id = btrim(supplier_product_id) and char_length(supplier_product_id) <= 200)
  );

create or replace function public.claim_supplier_fulfillment(
  p_order_id uuid,
  p_order_item_id uuid,
  p_supplier text,
  p_request_id text,
  p_supplier_product_id text,
  p_supplier_sku text default null,
  p_trigger_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order public.orders;
  v_item public.order_items;
  v_request public.supplier_fulfillment_requests;
  v_expected_request_id text;
  v_attempt_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SUPPLIER_FULFILLMENT_SERVICE_ROLE_REQUIRED';
  end if;

  if p_supplier is null or p_supplier <> btrim(p_supplier) or p_supplier = '' or char_length(p_supplier) > 80 then
    raise exception 'SUPPLIER_FULFILLMENT_SUPPLIER_INVALID';
  end if;
  if p_supplier_product_id is null or p_supplier_product_id <> btrim(p_supplier_product_id) or p_supplier_product_id = '' or char_length(p_supplier_product_id) > 200 then
    raise exception 'SUPPLIER_FULFILLMENT_PRODUCT_ID_INVALID';
  end if;

  v_expected_request_id := 'jianlian:' || p_order_id::text || ':' || p_order_item_id::text;
  if p_request_id is null or p_request_id <> v_expected_request_id then
    raise exception 'SUPPLIER_FULFILLMENT_REQUEST_ID_INVALID';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'SUPPLIER_FULFILLMENT_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'SUPPLIER_FULFILLMENT_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then
    raise exception 'SUPPLIER_FULFILLMENT_ORDER_STATE_BLOCKED';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id and order_id = p_order_id
  for update;
  if not found then raise exception 'SUPPLIER_FULFILLMENT_ITEM_NOT_FOUND'; end if;
  if public.normalize_order_item_delivery_type(v_item.delivery_type) <> 'auto_delivery' then
    raise exception 'SUPPLIER_FULFILLMENT_ITEM_TYPE_INVALID';
  end if;
  if coalesce(v_item.product_snapshot->'supplier_binding'->>'fulfillment_source', '') <> 'supplier'
     or coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier', '') <> p_supplier
     or nullif(btrim(coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_product_id', '')), '') is distinct from p_supplier_product_id
     or nullif(btrim(coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_sku', '')), '')
        is distinct from nullif(btrim(coalesce(p_supplier_sku, '')), '') then
    raise exception 'SUPPLIER_FULFILLMENT_ORDER_SNAPSHOT_INVALID';
  end if;

  insert into public.supplier_fulfillment_requests (
    order_id, order_item_id, supplier, supplier_product_id, supplier_sku,
    request_id, status, trigger_source
  ) values (
    p_order_id, p_order_item_id, p_supplier, p_supplier_product_id,
    nullif(btrim(coalesce(p_supplier_sku, '')), ''), p_request_id, 'PENDING',
    left(nullif(btrim(coalesce(p_trigger_source, '')), ''), 80)
  )
  on conflict (order_item_id) do nothing;

  select * into v_request
  from public.supplier_fulfillment_requests
  where order_item_id = p_order_item_id
  for update;

  if v_request.request_id <> p_request_id or v_request.supplier <> p_supplier then
    raise exception 'SUPPLIER_FULFILLMENT_IDEMPOTENCY_CONFLICT';
  end if;
  if v_request.supplier_product_id is distinct from p_supplier_product_id
     or v_request.supplier_sku is distinct from nullif(btrim(coalesce(p_supplier_sku, '')), '') then
    raise exception 'SUPPLIER_FULFILLMENT_BINDING_CHANGED';
  end if;

  if v_request.status = 'FULFILLED' then
    return jsonb_build_object('action','NONE','request_id',v_request.request_id,'status',v_request.status,'provider_order_code',v_request.provider_order_code);
  end if;
  if v_request.status in ('PURCHASING','UNCERTAIN','RECONCILIATION') then
    return jsonb_build_object(
      'action', case when v_request.provider_order_code is not null then 'QUERY' else 'NONE' end,
      'request_id',v_request.request_id,'status',v_request.status,
      'provider_order_code',v_request.provider_order_code,'attempt_token',v_request.attempt_token
    );
  end if;
  if v_request.status in ('NEEDS_INPUT','FAILED_VALIDATION')
     or (v_request.status = 'FAILED' and not v_request.retryable) then
    return jsonb_build_object('action','NONE','request_id',v_request.request_id,'status',v_request.status,'provider_order_code',v_request.provider_order_code);
  end if;

  v_attempt_token := gen_random_uuid();
  update public.supplier_fulfillment_requests
     set status = 'PURCHASING', retryable = false, attempt_token = v_attempt_token,
         attempt_count = attempt_count + 1, last_attempt_at = now(),
         trigger_source = left(nullif(btrim(coalesce(p_trigger_source, '')), ''), 80),
         last_error_code = null
   where id = v_request.id;

  update public.order_items
     set delivery_status = 'processing',
         delivery_started_at = coalesce(delivery_started_at, now()),
         delivery_status_updated_at = now(),
         delivery_failure_reason = null
   where id = p_order_item_id
     and coalesce(delivery_status, 'pending') in ('pending','failed','processing');

  return jsonb_build_object(
    'action','PURCHASE','request_id',p_request_id,'status','PURCHASING',
    'attempt_token',v_attempt_token,'provider_order_code',v_request.provider_order_code
  );
end
$function$;


create or replace function public.record_supplier_fulfillment_outcome(
  p_order_id uuid,
  p_order_item_id uuid,
  p_supplier text,
  p_request_id text,
  p_attempt_token uuid,
  p_status text,
  p_retryable boolean default false,
  p_error_code text default null,
  p_provider_order_code text default null,
  p_delivery_content text default null,
  p_supplier_unit_price numeric default null,
  p_supplier_total_price numeric default null,
  p_trigger_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order public.orders;
  v_item public.order_items;
  v_request public.supplier_fulfillment_requests;
  v_delivery public.order_deliveries;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SUPPLIER_FULFILLMENT_SERVICE_ROLE_REQUIRED';
  end if;
  if p_supplier is null or p_supplier <> btrim(p_supplier) or p_supplier = '' or char_length(p_supplier) > 80 then
    raise exception 'SUPPLIER_FULFILLMENT_SUPPLIER_INVALID';
  end if;
  if p_status not in ('PENDING','FULFILLED','FAILED','UNCERTAIN','RECONCILIATION','NEEDS_INPUT','FAILED_VALIDATION') then
    raise exception 'SUPPLIER_FULFILLMENT_OUTCOME_INVALID';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'SUPPLIER_FULFILLMENT_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'SUPPLIER_FULFILLMENT_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then raise exception 'SUPPLIER_FULFILLMENT_ORDER_STATE_BLOCKED'; end if;

  select * into v_item from public.order_items
  where id = p_order_item_id and order_id = p_order_id for update;
  if not found then raise exception 'SUPPLIER_FULFILLMENT_ITEM_NOT_FOUND'; end if;

  select * into v_request from public.supplier_fulfillment_requests
  where order_item_id = p_order_item_id and request_id = p_request_id for update;
  if not found then raise exception 'SUPPLIER_FULFILLMENT_REQUEST_NOT_FOUND'; end if;
  if v_request.supplier <> p_supplier
     or coalesce(v_item.product_snapshot->'supplier_binding'->>'fulfillment_source', '') <> 'supplier'
     or coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier', '') <> p_supplier
     or nullif(btrim(coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_product_id', '')), '') is distinct from v_request.supplier_product_id
     or nullif(btrim(coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_sku', '')), '') is distinct from v_request.supplier_sku then
    raise exception 'SUPPLIER_FULFILLMENT_ORDER_SNAPSHOT_INVALID';
  end if;

  if v_request.status = 'FULFILLED' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'FULFILLED', 'request_id', p_request_id);
  end if;
  if v_request.attempt_token is distinct from p_attempt_token or v_request.status <> 'PURCHASING' then
    raise exception 'SUPPLIER_FULFILLMENT_STALE_ATTEMPT';
  end if;

  if p_status = 'FULFILLED' then
    if nullif(btrim(coalesce(p_delivery_content, '')), '') is null
       or nullif(btrim(coalesce(p_provider_order_code, '')), '') is null then
      raise exception 'SUPPLIER_FULFILLMENT_DELIVERY_EVIDENCE_REQUIRED';
    end if;

    insert into public.order_deliveries (
      order_id, order_item_id, user_id, product_id, sku_id, delivery_type,
      encrypted_content, delivery_status, delivery_no, delivered_at, created_at, updated_at
    ) values (
      p_order_id, p_order_item_id, v_order.user_id, v_item.product_id, v_item.sku_id,
      'supplier_delivery', 'stored_in_private_table', 'delivered',
      left(btrim(p_provider_order_code), 160), v_now, v_now, v_now
    )
    on conflict (order_item_id) where delivery_type = 'supplier_delivery' and delivery_status = 'delivered'
    do nothing
    returning * into v_delivery;

    if v_delivery.id is null then
      select * into v_delivery from public.order_deliveries
      where order_item_id = p_order_item_id and delivery_type = 'supplier_delivery' and delivery_status = 'delivered';
    else
      insert into public.digital_delivery_secrets(delivery_id, content)
      values (v_delivery.id, btrim(p_delivery_content));
    end if;

    update public.order_items
       set delivery_status = 'delivered', delivered_quantity = coalesce(quantity, 1),
           delivery_completed_at = v_now, delivery_status_updated_at = v_now,
           delivery_failure_reason = null
     where id = p_order_item_id;

    update public.supplier_fulfillment_requests
       set status = 'FULFILLED', retryable = false,
           provider_order_code = left(btrim(p_provider_order_code), 160),
           supplier_unit_price = p_supplier_unit_price,
           supplier_total_price = p_supplier_total_price,
           last_error_code = null, completed_at = v_now
     where id = v_request.id;

    perform public.log_order_item_delivery_status(
      p_order_id, p_order_item_id, v_item.delivery_status, 'delivered',
      'supplier', 'supplier delivery completed'
    );
    perform public.write_delivery_log(
      p_order_id, p_order_item_id, null, left(coalesce(p_trigger_source, 'supplier'), 80),
      'delivery_success', 'supplier delivery completed',
      jsonb_build_object('supplier',p_supplier,'request_id',p_request_id,'provider_order_code_present',true)
    );
    perform public.refresh_order_fulfillment_status(p_order_id);
    return jsonb_build_object('ok', true, 'idempotent', v_delivery.created_at < v_now, 'status', 'FULFILLED', 'request_id', p_request_id);
  end if;

  if p_delivery_content is not null then
    raise exception 'SUPPLIER_FULFILLMENT_SECRET_NOT_ALLOWED_FOR_NON_SUCCESS';
  end if;

  update public.supplier_fulfillment_requests
     set status = p_status, retryable = coalesce(p_retryable, false),
         provider_order_code = coalesce(nullif(btrim(coalesce(p_provider_order_code, '')), ''), provider_order_code),
         supplier_unit_price = coalesce(p_supplier_unit_price, supplier_unit_price),
         supplier_total_price = coalesce(p_supplier_total_price, supplier_total_price),
         last_error_code = left(nullif(btrim(coalesce(p_error_code, '')), ''), 120)
   where id = v_request.id;

  update public.order_items
     set delivery_status = case when p_status in ('FAILED','FAILED_VALIDATION','NEEDS_INPUT') then 'failed' else 'processing' end,
         delivery_failure_reason = left(coalesce(nullif(btrim(coalesce(p_error_code, '')), ''), p_status), 240),
         delivery_status_updated_at = v_now
   where id = p_order_item_id;

  perform public.write_delivery_log(
    p_order_id, p_order_item_id, null, left(coalesce(p_trigger_source, 'supplier'), 80),
    case when p_status in ('UNCERTAIN','RECONCILIATION') then 'delivery_uncertain' else 'delivery_failed' end,
    'supplier delivery did not complete',
    jsonb_build_object('supplier',p_supplier,'request_id',p_request_id,'status',p_status,'error_code',left(coalesce(p_error_code,''),120))
  );
  perform public.refresh_order_fulfillment_status(p_order_id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'status', p_status, 'request_id', p_request_id);
end
$function$;



create or replace function public.claim_daju_supplier_fulfillment(
  p_order_id uuid, p_order_item_id uuid, p_request_id text, p_supplier_product_id bigint,
  p_supplier_sku text default null, p_trigger_source text default 'system'
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $wrapper$
begin
  -- DAJU_FULFILLMENT_PRODUCT_ID_COMPAT_GUARD: preserve the legacy positive bigint contract.
  if p_supplier_product_id is null or not (p_supplier_product_id between 1 and 9223372036854775807) then
    raise exception 'DAJU_FULFILLMENT_ORDER_SNAPSHOT_INVALID';
  end if;
  return public.claim_supplier_fulfillment(p_order_id,p_order_item_id,'daju',p_request_id,p_supplier_product_id::text,p_supplier_sku,p_trigger_source);
exception when others then
  if sqlerrm like 'SUPPLIER_FULFILLMENT_%' then
    raise exception using message = replace(sqlerrm,'SUPPLIER_FULFILLMENT_','DAJU_FULFILLMENT_');
  end if;
  raise;
end
$wrapper$;

create or replace function public.record_daju_supplier_fulfillment_outcome(
  p_order_id uuid, p_order_item_id uuid, p_request_id text, p_attempt_token uuid,
  p_status text, p_retryable boolean default false, p_error_code text default null,
  p_provider_order_code text default null, p_delivery_content text default null,
  p_supplier_unit_price numeric default null, p_supplier_total_price numeric default null,
  p_trigger_source text default 'system'
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $wrapper$
begin
  return public.record_supplier_fulfillment_outcome(p_order_id,p_order_item_id,'daju',p_request_id,p_attempt_token,p_status,p_retryable,p_error_code,p_provider_order_code,p_delivery_content,p_supplier_unit_price,p_supplier_total_price,p_trigger_source);
exception when others then
  if sqlerrm like 'SUPPLIER_FULFILLMENT_%' then
    raise exception using message = replace(sqlerrm,'SUPPLIER_FULFILLMENT_','DAJU_FULFILLMENT_');
  end if;
  raise;
end
$wrapper$;

create or replace function public.reserve_local_inventory_for_supplier_order(
  p_order_id uuid,
  p_trigger_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_inventory_ids uuid[];
  v_required integer;
  v_delivered integer;
  v_reserved integer;
  v_local_ready_count integer := 0;
  v_supplier_fallback_count integer := 0;
  v_blocked_count integer := 0;
  v_updated_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SUPPLIER_LOCAL_PRIORITY_SERVICE_ROLE_REQUIRED';
  end if;

  select o.* into v_order
  from public.orders as o
  where o.id = p_order_id
  for update;
  if not found then raise exception 'SUPPLIER_LOCAL_PRIORITY_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'SUPPLIER_LOCAL_PRIORITY_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then
    raise exception 'SUPPLIER_LOCAL_PRIORITY_ORDER_STATE_BLOCKED';
  end if;

  for v_item in
    select oi.*
    from public.order_items as oi
    where oi.order_id = p_order_id
      and public.normalize_order_item_delivery_type(oi.delivery_type) = 'auto_delivery'
      and coalesce(oi.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
      and coalesce(oi.product_snapshot->'supplier_binding'->>'supplier', '') <> '' and coalesce(oi.product_snapshot->'supplier_binding'->>'supplier', '') = btrim(coalesce(oi.product_snapshot->'supplier_binding'->>'supplier', ''))
      and coalesce(oi.delivery_status, 'pending') <> 'delivered'
    order by oi.created_at asc
    for update
  loop
    if exists (
      select 1 from public.supplier_fulfillment_requests as sfr
      where sfr.order_item_id = v_item.id
    ) then
      v_supplier_fallback_count := v_supplier_fallback_count + 1;
      continue;
    end if;

    select count(*)::integer
      into v_delivered
    from public.order_deliveries as od
    where od.order_item_id = v_item.id
      and od.delivery_status = 'delivered';
    if v_delivered > 0 and v_delivered < coalesce(v_item.quantity, 1) then
      v_blocked_count := v_blocked_count + 1;
      continue;
    end if;
    v_required := greatest(coalesce(v_item.quantity, 1) - v_delivered, 0);
    if v_required = 0 then
      continue;
    end if;

    select count(*)::integer into v_reserved
    from public.digital_inventory as di
    where di.product_id = v_item.product_id
      and ((v_item.sku_id is null and di.sku_id is null) or di.sku_id = v_item.sku_id)
      and di.status = 'reserved'
      and coalesce(di.reserved_order_id, di.order_id) = p_order_id
      and di.reserved_order_item_id = v_item.id
      and (di.expires_at is null or di.expires_at > v_now);

    if v_reserved = v_required then
      v_local_ready_count := v_local_ready_count + 1;
      continue;
    end if;
    if v_reserved > 0 then
      -- Unknown partial state must never fall through to supplier purchase.
      v_blocked_count := v_blocked_count + 1;
      continue;
    end if;

    select array_agg(candidate.id order by candidate.created_at asc)
      into v_inventory_ids
    from (
      select di.id, di.created_at
      from public.digital_inventory as di
      where di.product_id = v_item.product_id
        and ((v_item.sku_id is null and di.sku_id is null) or di.sku_id = v_item.sku_id)
        and di.status = 'available'
        and di.order_id is null
        and di.reserved_order_id is null
        and di.reserved_order_item_id is null
        and di.delivered_order_id is null
        and di.delivered_order_item_id is null
        and (di.expires_at is null or di.expires_at > v_now)
      order by di.created_at asc
      limit v_required
      for update skip locked
    ) as candidate;

    if coalesce(cardinality(v_inventory_ids), 0) <> v_required then
      v_supplier_fallback_count := v_supplier_fallback_count + 1;
      v_inventory_ids := null;
      continue;
    end if;

    update public.digital_inventory as di
       set status = 'reserved',
           order_id = p_order_id,
           reserved_order_id = p_order_id,
           reserved_order_item_id = v_item.id,
           reserved_user_id = v_order.user_id,
           reserved_at = v_now,
           updated_at = v_now
     where di.id = any(v_inventory_ids)
       and di.status = 'available';
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> v_required then
      raise exception 'SUPPLIER_LOCAL_PRIORITY_RESERVATION_STATE_CHANGED';
    end if;
    v_local_ready_count := v_local_ready_count + 1;
    v_inventory_ids := null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'local_ready_count', v_local_ready_count,
    'supplier_fallback_count', v_supplier_fallback_count,
    'blocked_count', v_blocked_count,
    'trigger_source', left(coalesce(nullif(btrim(p_trigger_source), ''), 'system'), 80)
  );
end
$function$;


create or replace function public.reserve_local_inventory_for_daju_order(
  p_order_id uuid,
  p_trigger_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $wrapper$
begin
  return public.reserve_local_inventory_for_supplier_order(p_order_id, p_trigger_source);
exception when others then
  if sqlerrm like 'SUPPLIER_LOCAL_PRIORITY_%' then
    raise exception using message = replace(sqlerrm, 'SUPPLIER_LOCAL_PRIORITY_', 'DAJU_LOCAL_PRIORITY_');
  end if;
  raise;
end
$wrapper$;

do $patch_local_delivery$
declare
  v_definition text;
  v_patched text;
  v_old text := $old$and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
      and (
        not (
          coalesce(order_items.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
          and coalesce(order_items.product_snapshot->'supplier_binding'->>'supplier', '') = 'daju'
        )
        or (
          not exists (
            select 1 from public.supplier_fulfillment_requests as local_sfr
            where local_sfr.order_item_id = order_items.id
          )
          and (
            select count(*)::integer
            from public.digital_inventory as local_di
            where local_di.product_id = order_items.product_id
              and ((order_items.sku_id is null and local_di.sku_id is null) or local_di.sku_id = order_items.sku_id)
              and local_di.status = 'reserved'
              and coalesce(local_di.reserved_order_id, local_di.order_id) = order_items.order_id
              and local_di.reserved_order_item_id = order_items.id
          ) >= greatest(
            coalesce(order_items.quantity, 1) - (
              select count(*)::integer from public.order_deliveries as local_od
              where local_od.order_item_id = order_items.id
                and local_od.delivery_status = 'delivered'
            ),
            0
          )
        )
      )$old$;
  v_new text := $new$and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
      and (
        not (
          coalesce(order_items.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
        )
        or (
          not exists (
            select 1 from public.supplier_fulfillment_requests as local_sfr
            where local_sfr.order_item_id = order_items.id
          )
          and (
            select count(*)::integer
            from public.digital_inventory as local_di
            where local_di.product_id = order_items.product_id
              and ((order_items.sku_id is null and local_di.sku_id is null) or local_di.sku_id = order_items.sku_id)
              and local_di.status = 'reserved'
              and coalesce(local_di.reserved_order_id, local_di.order_id) = order_items.order_id
              and local_di.reserved_order_item_id = order_items.id
          ) >= greatest(
            coalesce(order_items.quantity, 1) - (
              select count(*)::integer from public.order_deliveries as local_od
              where local_od.order_item_id = order_items.id
                and local_od.delivery_status = 'delivered'
            ),
            0
          )
        )
      )$new$;
begin
  select pg_catalog.pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'SUPPLIER_LOCAL_PRIORITY_DELIVERY_CONTRACT_DRIFT';
  end if;
  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition or position(v_old in v_patched) > 0 then
    raise exception 'SUPPLIER_LOCAL_PRIORITY_DELIVERY_PATCH_FAILED';
  end if;
  execute v_patched;
end
$patch_local_delivery$;



revoke execute on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) to service_role;

revoke execute on function public.record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text) to service_role;

revoke execute on function public.reserve_local_inventory_for_supplier_order(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_local_inventory_for_supplier_order(uuid,text) to service_role;

revoke execute on function public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text) to service_role;

revoke execute on function public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text) to service_role;

revoke execute on function public.reserve_local_inventory_for_daju_order(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_local_inventory_for_daju_order(uuid,text) to service_role;

commit;
