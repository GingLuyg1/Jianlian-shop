-- CURRENT-SCHEMA TEST FIXTURE. LOCAL DISPOSABLE POSTGRES ONLY.
-- NOT A PRODUCTION MIGRATION. NOT HISTORICAL MIGRATION RECONSTRUCTION.
-- NO PRODUCTION DATA. This is a scoped contract snapshot, not a full clone.
-- Caller must set v13.expected_data_directory in the same psql session.
\set ON_ERROR_STOP on

do $guard$
begin
  if current_database() !~ '^jianlian_bitrefill_v13_(current_schema(_(logical|invoice|child|orphan|state|binding))?|db5_[0-9a-f]{8})$'
     or inet_server_addr() is distinct from '127.0.0.1'::inet
     or nullif(current_setting('v13.expected_data_directory', true), '') is null
     or replace(current_setting('data_directory'), '\', '/') <>
       replace(current_setting('v13.expected_data_directory', true), '\', '/') then
    raise exception 'V13_CURRENT_SCHEMA_DISPOSABLE_GUARD_FAILED';
  end if;
end
$guard$;

do $roles$
begin
  if to_regrole('anon') is null then create role anon nologin; end if;
  if to_regrole('authenticated') is null then create role authenticated nologin; end if;
  if to_regrole('service_role') is null then create role service_role nologin bypassrls; end if;
end
$roles$;
grant usage on schema public to anon, authenticated, service_role;

-- Only columns needed by V1.3 and the synthetic fulfillment E2E are copied.
-- Selected production column types/defaults/nullability and named constraints
-- are checked by the scoped fingerprint; unrelated storefront columns are not.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  stock integer not null default 0
);
create table public.product_skus (
  id uuid primary key default gen_random_uuid()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid not null,
  status text not null default 'pending_payment',
  payment_status text not null default 'unpaid',
  fulfillment_status text not null default 'pending',
  constraint orders_status_check check (status = any (array[
    'pending_payment'::text,'paid'::text,'processing'::text,'delivered'::text,
    'completed'::text,'cancelled'::text,'expired'::text,'refunded'::text,'failed'::text
  ])),
  constraint orders_payment_status_check check (payment_status = any (array[
    'unpaid'::text,'paid'::text,'refunded'::text,'partially_refunded'::text,'failed'::text
  ]))
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  unit_price numeric not null,
  line_total numeric not null,
  quantity integer not null default 1,
  delivery_type text,
  product_snapshot jsonb,
  delivery_status text,
  delivered_quantity integer not null default 0,
  delivery_completed_at timestamptz,
  delivery_status_updated_at timestamptz not null default now()
);
create table public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  user_id uuid,
  product_id uuid,
  sku_id uuid,
  delivery_type text,
  delivery_content text,
  encrypted_content text,
  delivery_no text,
  delivery_status text not null default 'pending',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_deliveries_status_check check (delivery_status = any (array[
    'pending'::text,'processing'::text,'delivered'::text,'failed'::text,
    'not_required'::text,'cancelled'::text,'revoked'::text
  ]))
);
create unique index order_deliveries_supplier_item_delivered_uidx
  on public.order_deliveries(order_item_id)
  where delivery_type = 'supplier_delivery' and delivery_status = 'delivered';

create table public.supplier_fulfillment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  supplier text not null,
  supplier_product_id text,
  supplier_sku text,
  request_id text not null unique,
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
  constraint supplier_fulfillment_requests_status_check check (status = any (array[
    'PENDING'::text,'PURCHASING'::text,'FULFILLED'::text,'FAILED'::text,
    'UNCERTAIN'::text,'RECONCILIATION'::text,'NEEDS_INPUT'::text,'FAILED_VALIDATION'::text
  ]))
);

create table public.digital_inventory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  status text not null default 'available'
);
create table public.digital_delivery_secrets (
  delivery_id uuid primary key references public.order_deliveries(id) on delete cascade,
  content text not null
);
create table public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  message text,
  detail jsonb not null default '{}'::jsonb
);

alter table public.products enable row level security;
alter table public.product_skus enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_deliveries enable row level security;
alter table public.supplier_fulfillment_requests enable row level security;
alter table public.digital_inventory enable row level security;
alter table public.digital_delivery_secrets enable row level security;
alter table public.delivery_logs enable row level security;

revoke all on public.products,public.product_skus,public.orders,
  public.order_items,public.order_deliveries,public.supplier_fulfillment_requests,
  public.digital_inventory,public.digital_delivery_secrets,public.delivery_logs
  from public,anon,authenticated,service_role;
grant select,insert on public.products,public.order_items,public.delivery_logs
  to anon,authenticated;
grant select on public.orders,public.product_skus to anon,authenticated;
grant select,insert on public.products,public.product_skus,public.orders,
  public.order_items,public.order_deliveries,public.supplier_fulfillment_requests,
  public.digital_inventory,public.digital_delivery_secrets,public.delivery_logs
  to service_role;

-- The exact read-only-captured current activation function is appended below.
create or replace function public.admin_evaluate_product_sku_activation(
  p_product_delivery_type text,
  p_sku_delivery_type text,
  p_stock integer,
  p_metadata jsonb,
  p_local_available_count bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
  v_effective_delivery_type text := coalesce(nullif(p_sku_delivery_type, ''), nullif(p_product_delivery_type, ''), 'manual');
  v_supplier_requested boolean;
  v_binding_complete boolean := false;
  v_snapshot bigint;
  v_snapshot_valid boolean := false;
  v_last_success_valid boolean := false;
  v_supplier_ready boolean := false;
  v_exact_supplier_ready boolean := false;
  v_local_inventory_ready boolean := false;
  v_trusted_source boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_mapping jsonb;
  v_cost_text text;
  v_product_id_numeric numeric;
  v_snapshot_numeric numeric;
  v_product_id_valid boolean := false;
  v_supplier_sku_valid boolean := false;
  v_mapping_valid boolean := false;
  v_cost_valid boolean := false;
begin
  if v_effective_delivery_type <> 'automatic' then
    return jsonb_build_object(
      'ready', true,
      'reasons', '[]'::jsonb,
      'source', 'not_required',
      'stock', greatest(coalesce(p_stock, 0), 0),
      'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
      'inventory_state', v_metadata->>'inventory_state'
    );
  end if;

  v_supplier_requested := coalesce(v_metadata->>'fulfillment_source', '') = 'supplier';
  v_mapping := case
    when not (v_metadata ? 'supplier_inputs_mapping') then '{}'::jsonb
    else v_metadata->'supplier_inputs_mapping'
  end;
  v_cost_text := btrim(coalesce(v_metadata->>'supplier_max_unit_cost', ''));

  if jsonb_typeof(v_metadata->'supplier_product_id') = 'number' then
    v_product_id_numeric := (v_metadata->'supplier_product_id')::numeric;
    v_product_id_valid :=
      v_product_id_numeric > 0
      and v_product_id_numeric <= 9007199254740991
      and trunc(v_product_id_numeric) = v_product_id_numeric;
  end if;
  v_supplier_sku_valid :=
    not (v_metadata ? 'supplier_sku')
    or jsonb_typeof(v_metadata->'supplier_sku') = 'null'
    or (
      jsonb_typeof(v_metadata->'supplier_sku') = 'string'
      and length(btrim(v_metadata->>'supplier_sku')) between 1 and 200
    );
  if jsonb_typeof(v_mapping) = 'object' then
    v_mapping_valid := not exists (
      select 1
      from jsonb_each(v_mapping) as mapping_entry(key, value)
      where mapping_entry.key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,79}$'
        or jsonb_typeof(mapping_entry.value) <> 'string'
        or mapping_entry.value #>> '{}' not in ('customer_email', 'customer_name', 'customer_phone', 'customer_note')
    );
  end if;
  if v_cost_text ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' then
    v_cost_valid := v_cost_text::numeric > 0;
  end if;

  v_binding_complete :=
    v_supplier_requested
    and coalesce(v_metadata->>'supplier', '') = 'daju'
    and v_product_id_valid
    and v_supplier_sku_valid
    and v_mapping_valid
    and v_cost_valid;

  if jsonb_typeof(v_metadata->'supplier_stock_snapshot') = 'number' then
    v_snapshot_numeric := (v_metadata->'supplier_stock_snapshot')::numeric;
    if v_snapshot_numeric > 0
       and v_snapshot_numeric <= 9007199254740991
       and trunc(v_snapshot_numeric) = v_snapshot_numeric then
      v_snapshot := v_snapshot_numeric::bigint;
      v_snapshot_valid := true;
    end if;
  end if;

  if jsonb_typeof(v_metadata->'supplier_stock_last_success_at') = 'string'
     and (v_metadata->>'supplier_stock_last_success_at')
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    begin
      perform (v_metadata->>'supplier_stock_last_success_at')::timestamptz;
      v_last_success_valid := true;
    exception when others then
      v_last_success_valid := false;
    end;
  end if;

  v_supplier_ready :=
    v_binding_complete
    and v_snapshot_valid
    and coalesce(v_metadata->>'supplier_stock_sync_status', '') = 'synced'
    and v_last_success_valid
    and coalesce(v_metadata->'supplier_stock_stale', 'false'::jsonb) <> 'true'::jsonb;
  v_exact_supplier_ready := v_supplier_ready and v_snapshot = coalesce(p_stock, 0);
  v_local_inventory_ready := not v_supplier_requested and coalesce(p_local_available_count, 0) > 0;
  v_trusted_source := v_exact_supplier_ready or v_local_inventory_ready;

  if coalesce(p_stock, 0) <= 0 then v_reasons := v_reasons || '"ZERO_STOCK"'::jsonb; end if;
  if v_supplier_requested then
    if not v_binding_complete then
      v_reasons := v_reasons || '"SUPPLIER_BINDING_INCOMPLETE"'::jsonb;
    elsif not v_exact_supplier_ready then
      v_reasons := v_reasons || '"SUPPLIER_STOCK_UNVERIFIED"'::jsonb;
    end if;
  elsif not v_local_inventory_ready then
    v_reasons := v_reasons || '"LOCAL_INVENTORY_EMPTY"'::jsonb;
  end if;
  if not v_trusted_source then v_reasons := v_reasons || '"NO_FULFILLMENT_SOURCE"'::jsonb; end if;
  if coalesce(v_metadata->>'inventory_state', '') = 'requires_verification' and not v_trusted_source then
    v_reasons := v_reasons || '"INVENTORY_REQUIRES_VERIFICATION"'::jsonb;
  end if;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_reasons) = 0,
    'reasons', v_reasons,
    'source', case when v_exact_supplier_ready then 'supplier' when v_local_inventory_ready then 'local_inventory' else 'none' end,
    'stock', greatest(coalesce(p_stock, 0), 0),
    'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
    'inventory_state', v_metadata->>'inventory_state'
  );
end;
$$;
