-- Candidate only. Do not execute without a separately authorized precheck and rollout.
-- Adds durable Daju supplier purchase idempotency while reusing the existing
-- order_deliveries + digital_delivery_secrets user delivery boundary.

begin;

set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $dependencies$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.products') is null
     or to_regclass('public.product_skus') is null
     or to_regclass('public.order_deliveries') is null
     or to_regclass('public.digital_delivery_secrets') is null
     or to_regprocedure('public.refresh_order_fulfillment_status(uuid)') is null
     or to_regprocedure('public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)') is null
     or to_regprocedure('public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)') is null
     or to_regprocedure('public.deliver_digital_order(uuid,text)') is null then
    raise exception 'DAJU_FULFILLMENT_REQUIRED_DEPENDENCY_MISSING';
  end if;
end
$dependencies$;

create table public.supplier_fulfillment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  supplier text not null,
  supplier_product_id bigint,
  supplier_sku text,
  request_id text not null,
  attempt_token uuid,
  attempt_count integer not null default 0,
  status text not null default 'PENDING',
  retryable boolean not null default false,
  provider_order_code text,
  supplier_unit_price numeric(18,6),
  supplier_total_price numeric(18,6),
  last_error_code text,
  trigger_source text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_fulfillment_requests_supplier_check check (supplier = 'daju'),
  constraint supplier_fulfillment_requests_request_not_blank check (btrim(request_id) <> ''),
  constraint supplier_fulfillment_requests_attempt_count_check check (attempt_count >= 0),
  constraint supplier_fulfillment_requests_status_check check (
    status in ('PENDING','PURCHASING','FULFILLED','FAILED','UNCERTAIN','RECONCILIATION','NEEDS_INPUT','FAILED_VALIDATION')
  ),
  constraint supplier_fulfillment_requests_price_check check (
    (supplier_unit_price is null or supplier_unit_price >= 0)
    and (supplier_total_price is null or supplier_total_price >= 0)
  ),
  unique (order_item_id),
  unique (request_id)
);

create index supplier_fulfillment_requests_order_status_idx
  on public.supplier_fulfillment_requests(order_id, status, updated_at desc);

create unique index order_deliveries_supplier_item_delivered_uidx
  on public.order_deliveries(order_item_id)
  where delivery_type = 'supplier_delivery' and delivery_status = 'delivered';

alter table public.supplier_fulfillment_requests enable row level security;
revoke all privileges on table public.supplier_fulfillment_requests from public, anon, authenticated;
grant select, insert, update on table public.supplier_fulfillment_requests to service_role;

drop trigger if exists supplier_fulfillment_requests_set_updated_at on public.supplier_fulfillment_requests;
create trigger supplier_fulfillment_requests_set_updated_at
before update on public.supplier_fulfillment_requests
for each row execute function public.set_updated_at();

create or replace function public.claim_daju_supplier_fulfillment(
  p_order_id uuid,
  p_order_item_id uuid,
  p_request_id text,
  p_supplier_product_id bigint,
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
    raise exception 'DAJU_FULFILLMENT_SERVICE_ROLE_REQUIRED';
  end if;

  v_expected_request_id := 'jianlian:' || p_order_id::text || ':' || p_order_item_id::text;
  if p_request_id is null or p_request_id <> v_expected_request_id then
    raise exception 'DAJU_FULFILLMENT_REQUEST_ID_INVALID';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'DAJU_FULFILLMENT_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'DAJU_FULFILLMENT_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then
    raise exception 'DAJU_FULFILLMENT_ORDER_STATE_BLOCKED';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id and order_id = p_order_id
  for update;
  if not found then raise exception 'DAJU_FULFILLMENT_ITEM_NOT_FOUND'; end if;
  if public.normalize_order_item_delivery_type(v_item.delivery_type) <> 'auto_delivery' then
    raise exception 'DAJU_FULFILLMENT_ITEM_TYPE_INVALID';
  end if;
  if coalesce(v_item.product_snapshot->'supplier_binding'->>'fulfillment_source', '') <> 'supplier'
     or coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier', '') <> 'daju'
     or coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_product_id', '') !~ '^[1-9][0-9]*$'
     or (v_item.product_snapshot->'supplier_binding'->>'supplier_product_id')::bigint is distinct from p_supplier_product_id
     or nullif(btrim(coalesce(v_item.product_snapshot->'supplier_binding'->>'supplier_sku', '')), '')
        is distinct from nullif(btrim(coalesce(p_supplier_sku, '')), '') then
    raise exception 'DAJU_FULFILLMENT_ORDER_SNAPSHOT_INVALID';
  end if;

  insert into public.supplier_fulfillment_requests (
    order_id, order_item_id, supplier, supplier_product_id, supplier_sku,
    request_id, status, trigger_source
  ) values (
    p_order_id, p_order_item_id, 'daju', p_supplier_product_id,
    nullif(btrim(coalesce(p_supplier_sku, '')), ''), p_request_id, 'PENDING',
    left(nullif(btrim(coalesce(p_trigger_source, '')), ''), 80)
  )
  on conflict (order_item_id) do nothing;

  select * into v_request
  from public.supplier_fulfillment_requests
  where order_item_id = p_order_item_id
  for update;

  if v_request.request_id <> p_request_id or v_request.supplier <> 'daju' then
    raise exception 'DAJU_FULFILLMENT_IDEMPOTENCY_CONFLICT';
  end if;
  if v_request.supplier_product_id is distinct from p_supplier_product_id
     or v_request.supplier_sku is distinct from nullif(btrim(coalesce(p_supplier_sku, '')), '') then
    raise exception 'DAJU_FULFILLMENT_BINDING_CHANGED';
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

create or replace function public.record_daju_supplier_fulfillment_outcome(
  p_order_id uuid,
  p_order_item_id uuid,
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
    raise exception 'DAJU_FULFILLMENT_SERVICE_ROLE_REQUIRED';
  end if;
  if p_status not in ('PENDING','FULFILLED','FAILED','UNCERTAIN','RECONCILIATION','NEEDS_INPUT','FAILED_VALIDATION') then
    raise exception 'DAJU_FULFILLMENT_OUTCOME_INVALID';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'DAJU_FULFILLMENT_ORDER_NOT_FOUND'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'DAJU_FULFILLMENT_ORDER_NOT_PAID'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then raise exception 'DAJU_FULFILLMENT_ORDER_STATE_BLOCKED'; end if;

  select * into v_item from public.order_items
  where id = p_order_item_id and order_id = p_order_id for update;
  if not found then raise exception 'DAJU_FULFILLMENT_ITEM_NOT_FOUND'; end if;

  select * into v_request from public.supplier_fulfillment_requests
  where order_item_id = p_order_item_id and request_id = p_request_id for update;
  if not found then raise exception 'DAJU_FULFILLMENT_REQUEST_NOT_FOUND'; end if;

  if v_request.status = 'FULFILLED' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', 'FULFILLED', 'request_id', p_request_id);
  end if;
  if v_request.attempt_token is distinct from p_attempt_token or v_request.status <> 'PURCHASING' then
    raise exception 'DAJU_FULFILLMENT_STALE_ATTEMPT';
  end if;

  if p_status = 'FULFILLED' then
    if nullif(btrim(coalesce(p_delivery_content, '')), '') is null
       or nullif(btrim(coalesce(p_provider_order_code, '')), '') is null then
      raise exception 'DAJU_FULFILLMENT_DELIVERY_EVIDENCE_REQUIRED';
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
      jsonb_build_object('supplier','daju','request_id',p_request_id,'provider_order_code_present',true)
    );
    perform public.refresh_order_fulfillment_status(p_order_id);
    return jsonb_build_object('ok', true, 'idempotent', v_delivery.created_at < v_now, 'status', 'FULFILLED', 'request_id', p_request_id);
  end if;

  if p_delivery_content is not null then
    raise exception 'DAJU_FULFILLMENT_SECRET_NOT_ALLOWED_FOR_NON_SUCCESS';
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
    jsonb_build_object('supplier','daju','request_id',p_request_id,'status',p_status,'error_code',left(coalesce(p_error_code,''),120))
  );
  perform public.refresh_order_fulfillment_status(p_order_id);
  return jsonb_build_object('ok', true, 'idempotent', false, 'status', p_status, 'request_id', p_request_id);
end
$function$;

-- The deployed local-inventory RPC must skip supplier-bound items. The immutable
-- order_items.product_snapshot.supplier_binding is authoritative after order
-- creation: later product/SKU metadata changes must never change fulfillment.
-- Legacy rows without supplier_binding remain local-inventory rows; current
-- catalog metadata is deliberately not consulted for those historical orders.
do $exclude_supplier_items$
declare
  v_definition text;
  v_patched text;
  v_old text := 'and public.normalize_order_item_delivery_type(delivery_type) = ''auto_delivery''';
  v_new text := $replacement$and public.normalize_order_item_delivery_type(delivery_type) = 'auto_delivery'
      and not (
        coalesce(order_items.product_snapshot->'supplier_binding'->>'fulfillment_source', '') = 'supplier'
        and coalesce(order_items.product_snapshot->'supplier_binding'->>'supplier', '') = 'daju'
      )$replacement$;
begin
  select pg_catalog.pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure) into v_definition;
  if position(v_new in v_definition) > 0 then return; end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'DAJU_FULFILLMENT_LOCAL_DELIVERY_CONTRACT_DRIFT';
  end if;
  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition then raise exception 'DAJU_FULFILLMENT_LOCAL_DELIVERY_PATCH_FAILED'; end if;
  execute v_patched;
end
$exclude_supplier_items$;

-- The order-creation RPC currently treats every automatic product as local
-- digital inventory. Add a supplier flag, skip only the local inventory count
-- and reservation for Daju, and persist the immutable binding in product_snapshot.
-- The existing RPC validates a requested SKU before this injected branch. When
-- p_sku_id is null, only product metadata is read; v_sku is never dereferenced.
-- When a validated SKU exists, each SKU binding field continues to override the
-- corresponding product binding field, preserving the existing binding contract.
do $snapshot_supplier_binding$
declare
  v_definition text;
  v_patched text;
  v_gap_pattern text := '(?:[[:space:]]|--[^\n]*(?:\n|$)|/\*(?:[^*]|\*+[^*/])*\*+/)+';
  v_count_anchor_pattern text;
  v_count_patched_pattern text;
  v_pick_anchor_pattern text;
  v_pick_patched_pattern text;
  v_count_anchor_matches integer;
  v_pick_anchor_matches integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure
  ) into v_definition;

  -- Match the two local-inventory blocks by their unique control-flow and table
  -- aliases. Whitespace, CRLF/LF and harmless SQL comments may vary, but the
  -- business statements themselves must remain intact and occur exactly once.
  v_count_anchor_pattern :=
    '(if' || v_gap_pattern || ')v_auto_delivery(' ||
    v_gap_pattern || 'then' ||
    v_gap_pattern || 'select' ||
    v_gap_pattern || 'count\(\*\)::integer' ||
    v_gap_pattern || 'into' ||
    v_gap_pattern || 'v_stock' ||
    v_gap_pattern || 'from' ||
    v_gap_pattern || 'public\.digital_inventory' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || 'di_count)';
  v_count_patched_pattern :=
    'if' || v_gap_pattern || 'v_auto_delivery' ||
    v_gap_pattern || 'and' ||
    v_gap_pattern || 'not' ||
    v_gap_pattern || 'v_supplier_delivery' ||
    v_gap_pattern || 'then' ||
    v_gap_pattern || 'select' ||
    v_gap_pattern || 'count\(\*\)::integer' ||
    v_gap_pattern || 'into' ||
    v_gap_pattern || 'v_stock' ||
    v_gap_pattern || 'from' ||
    v_gap_pattern || 'public\.digital_inventory' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || 'di_count';
  v_pick_anchor_pattern :=
    '(if' || v_gap_pattern || ')v_auto_delivery(' ||
    v_gap_pattern || 'then' ||
    v_gap_pattern || 'with' ||
    v_gap_pattern || 'picked' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || '\(' ||
    v_gap_pattern || 'select' ||
    v_gap_pattern || 'di_pick\.id' ||
    v_gap_pattern || 'from' ||
    v_gap_pattern || 'public\.digital_inventory' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || 'di_pick)';
  v_pick_patched_pattern :=
    'if' || v_gap_pattern || 'v_auto_delivery' ||
    v_gap_pattern || 'and' ||
    v_gap_pattern || 'not' ||
    v_gap_pattern || 'v_supplier_delivery' ||
    v_gap_pattern || 'then' ||
    v_gap_pattern || 'with' ||
    v_gap_pattern || 'picked' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || '\(' ||
    v_gap_pattern || 'select' ||
    v_gap_pattern || 'di_pick\.id' ||
    v_gap_pattern || 'from' ||
    v_gap_pattern || 'public\.digital_inventory' ||
    v_gap_pattern || 'as' ||
    v_gap_pattern || 'di_pick';

  if position('v_supplier_delivery boolean' in v_definition) > 0
     and position('''supplier_binding''' in v_definition) > 0 then
    return;
  end if;

  v_count_anchor_matches := pg_catalog.regexp_count(v_definition, v_count_anchor_pattern);
  v_pick_anchor_matches := pg_catalog.regexp_count(v_definition, v_pick_anchor_pattern);
  if position('v_auto_delivery boolean := false;' in v_definition) = 0
     or v_count_anchor_matches <> 1
     or v_pick_anchor_matches <> 1
     or position('''option_snapshot'', v_option_snapshot' in v_definition) = 0 then
    raise exception 'DAJU_FULFILLMENT_CREATE_ORDER_CONTRACT_DRIFT';
  end if;

  v_patched := replace(
    v_definition,
    'v_auto_delivery boolean := false;',
    'v_auto_delivery boolean := false;' || chr(10) ||
    '  v_supplier_delivery boolean := false;' || chr(10) ||
    '  v_supplier_product_id jsonb := null;' || chr(10) ||
    '  v_supplier_sku_binding jsonb := null;' || chr(10) ||
    '  v_supplier_inputs_mapping jsonb := ''{}''::jsonb;' || chr(10) ||
    '  v_supplier_max_unit_cost jsonb := null;'
  );
  v_patched := replace(
    v_patched,
    'v_auto_delivery := lower(coalesce(v_delivery_type, '''')) in' || chr(10) ||
      '    (''automatic'',''auto'',''card'',''account'',''auto_delivery'');',
    'v_auto_delivery := lower(coalesce(v_delivery_type, '''')) in' || chr(10) ||
      '    (''automatic'',''auto'',''card'',''account'',''auto_delivery'');' || chr(10) ||
      '  if p_sku_id is not null then' || chr(10) ||
      '    v_supplier_delivery := v_auto_delivery' || chr(10) ||
      '      and coalesce(v_sku.metadata->>''fulfillment_source'', v_product.metadata->>''fulfillment_source'') = ''supplier''' || chr(10) ||
      '      and coalesce(v_sku.metadata->>''supplier'', v_product.metadata->>''supplier'') = ''daju'';' || chr(10) ||
      '    if v_supplier_delivery then' || chr(10) ||
      '      v_supplier_product_id := coalesce(v_sku.metadata->''supplier_product_id'', v_product.metadata->''supplier_product_id'');' || chr(10) ||
      '      v_supplier_sku_binding := coalesce(v_sku.metadata->''supplier_sku'', v_product.metadata->''supplier_sku'');' || chr(10) ||
      '      v_supplier_inputs_mapping := coalesce(v_sku.metadata->''supplier_inputs_mapping'', v_product.metadata->''supplier_inputs_mapping'', ''{}''::jsonb);' || chr(10) ||
      '      v_supplier_max_unit_cost := coalesce(v_sku.metadata->''supplier_max_unit_cost'', v_product.metadata->''supplier_max_unit_cost'');' || chr(10) ||
      '    end if;' || chr(10) ||
      '  else' || chr(10) ||
      '    v_supplier_delivery := v_auto_delivery' || chr(10) ||
      '      and coalesce(v_product.metadata->>''fulfillment_source'', '''') = ''supplier''' || chr(10) ||
      '      and coalesce(v_product.metadata->>''supplier'', '''') = ''daju'';' || chr(10) ||
      '    if v_supplier_delivery then' || chr(10) ||
      '      v_supplier_product_id := v_product.metadata->''supplier_product_id'';' || chr(10) ||
      '      v_supplier_sku_binding := v_product.metadata->''supplier_sku'';' || chr(10) ||
      '      v_supplier_inputs_mapping := coalesce(v_product.metadata->''supplier_inputs_mapping'', ''{}''::jsonb);' || chr(10) ||
      '      v_supplier_max_unit_cost := v_product.metadata->''supplier_max_unit_cost'';' || chr(10) ||
      '    end if;' || chr(10) ||
      '  end if;'
  );
  v_patched := pg_catalog.regexp_replace(
    v_patched,
    v_count_anchor_pattern,
    E'\\1v_auto_delivery and not v_supplier_delivery\\2'
  );
  v_patched := pg_catalog.regexp_replace(
    v_patched,
    v_pick_anchor_pattern,
    E'\\1v_auto_delivery and not v_supplier_delivery\\2'
  );
  v_patched := replace(
    v_patched,
    '''option_snapshot'', v_option_snapshot',
    '''option_snapshot'', v_option_snapshot,' || chr(10) ||
    '      ''supplier_binding'', case when v_supplier_delivery then jsonb_build_object(' || chr(10) ||
    '        ''fulfillment_source'', ''supplier'',' || chr(10) ||
    '        ''supplier'', ''daju'',' || chr(10) ||
    '        ''supplier_product_id'', v_supplier_product_id,' || chr(10) ||
    '        ''supplier_sku'', v_supplier_sku_binding,' || chr(10) ||
    '        ''supplier_inputs_mapping'', v_supplier_inputs_mapping,' || chr(10) ||
    '        ''supplier_max_unit_cost'', v_supplier_max_unit_cost' || chr(10) ||
    '      ) else null end'
  );

  if position('v_supplier_delivery boolean' in v_patched) = 0
     or position('''supplier_binding''' in v_patched) = 0
     or position('if p_sku_id is not null then' in v_patched) = 0
     or position('v_supplier_product_id := v_product.metadata->''supplier_product_id'';' in v_patched) = 0
     or pg_catalog.regexp_count(v_patched, v_count_anchor_pattern) <> 0
     or pg_catalog.regexp_count(v_patched, v_pick_anchor_pattern) <> 0
     or pg_catalog.regexp_count(v_patched, v_count_patched_pattern) <> 1
     or pg_catalog.regexp_count(v_patched, v_pick_patched_pattern) <> 1 then
    raise exception 'DAJU_FULFILLMENT_CREATE_ORDER_PATCH_FAILED';
  end if;
  execute v_patched;
end
$snapshot_supplier_binding$;

revoke execute on function public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text) to service_role;
revoke execute on function public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text) to service_role;

commit;
