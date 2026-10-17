-- Candidate only. Local isolated PostgreSQL acceptance is required before rollout.
-- Extends the existing per-order-item supplier root; does not replace delivery RPCs.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $dependencies$
begin
  if to_regclass('public.supplier_fulfillment_requests') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.order_deliveries') is null
     or to_regprocedure('public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)') is null then
    raise exception 'SUPPLIER_PURCHASE_BASE_SCHEMA_MISSING';
  end if;
  if to_regrole('service_role') is null or to_regrole('anon') is null
     or to_regrole('authenticated') is null then
    raise exception 'SUPPLIER_PURCHASE_ROLES_MISSING';
  end if;
end
$dependencies$;

-- Reuse the existing trusted migration owner; do not CREATE ROLE/ALTER OWNER.
-- DEFINER is needed because application roles intentionally have no table writes.
-- Fail rather than deploying under an application/untrusted/inherited owner.
do $owner_security$
declare
  v_owner oid := current_user::regrole;
  v_role text;
begin
  if current_user in ('anon','authenticated','service_role')
     or not exists (select 1 from pg_catalog.pg_roles
       where oid=v_owner and (rolsuper or rolbypassrls)) then
    raise exception 'SUPPLIER_PURCHASE_TRUSTED_OWNER_REQUIRED';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if pg_catalog.pg_has_role(v_role,v_owner,'USAGE')
       or pg_catalog.pg_has_role(v_role,v_owner,'SET')
       or pg_catalog.has_schema_privilege(v_role,'public','CREATE') then
      raise exception 'SUPPLIER_PURCHASE_UNSAFE_ROLE_PATH';
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles
      where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
     or not exists (select 1 from pg_catalog.pg_roles
      where rolname='service_role' and not rolsuper and rolbypassrls) then
    raise exception 'SUPPLIER_PURCHASE_APPLICATION_ROLE_MODEL_INVALID';
  end if;
  if exists (select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in
        ('orders','order_items','order_deliveries','supplier_fulfillment_requests',
         'digital_delivery_secrets','delivery_logs') and c.relowner<>v_owner)
     or not exists (select 1 from pg_catalog.pg_proc p
      where p.oid=to_regprocedure('public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)')
        and p.proowner=v_owner)
     or not exists (select 1 from pg_catalog.pg_proc p
      where p.oid=to_regprocedure('public.record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)')
        and p.proowner=v_owner and p.prosecdef) then
    raise exception 'SUPPLIER_PURCHASE_DEPENDENCY_OWNER_MISMATCH';
  end if;
end
$owner_security$;

-- Existing root data is never silently repaired by this migration. Some of
-- these conflicts are already prevented by the historical constraints; this
-- explicit check also catches drifted installations before new DDL begins.
do $preflight$
begin
  if exists (select 1 from public.supplier_fulfillment_requests
             group by order_item_id having count(*) > 1)
     or exists (select 1 from public.supplier_fulfillment_requests
                group by supplier, request_id having count(*) > 1) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_LOGICAL_ROOT';
  end if;
  if exists (select 1 from public.supplier_fulfillment_requests
             where provider_order_code is not null
             group by supplier, provider_order_code having count(*) > 1) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE';
  end if;
  if exists (select 1 from public.supplier_fulfillment_requests as r
             left join public.order_items as i on i.id = r.order_item_id
             where i.id is null) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_ORPHAN_ROOT';
  end if;
  if exists (select 1 from public.supplier_fulfillment_requests
             where status not in ('PENDING','PURCHASING','FULFILLED','FAILED',
                                  'UNCERTAIN','RECONCILIATION','NEEDS_INPUT','FAILED_VALIDATION')) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_INVALID_ROOT_STATE';
  end if;
  if exists (select 1 from public.supplier_fulfillment_requests
             where supplier = 'bitrefill'
               and (nullif(btrim(coalesce(supplier_product_id, '')), '') is null
                    or nullif(btrim(coalesce(supplier_sku, '')), '') is null)) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_MISSING_FROZEN_BINDING';
  end if;
  if exists (select 1 from public.order_deliveries
             where delivery_type = 'supplier_delivery' and delivery_status = 'delivered'
             group by order_item_id having count(*) > 1) then
    raise exception 'SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_DELIVERY';
  end if;
end
$preflight$;

-- One immutable logical request is one external invoice submission boundary.
-- SUBMITTING is deliberately non-retryable: a crash can occur after bytes leave.
create table public.supplier_purchase_attempts (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (supplier ~ '^[a-z][a-z0-9_]{1,39}$'),
  logical_request_key text not null check (length(logical_request_key) between 1 and 200),
  semantic_request_hash text not null check (semantic_request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'CLAIMED' check (status in (
    'CLAIMED','SUBMITTING','UNCERTAIN','EXTERNAL_CREATED','RECONCILING',
    'SUCCEEDED','FAILED','MANUAL_REVIEW'
  )),
  external_invoice_id text check (external_invoice_id is null or external_invoice_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  submit_started_at timestamptz,
  submit_finished_at timestamptz,
  last_reconciled_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_purchase_attempts_logical_key_uidx unique (supplier, logical_request_key),
  constraint supplier_purchase_attempts_submit_boundary_chk check (
    (status = 'CLAIMED' and submit_started_at is null and external_invoice_id is null)
    or (status <> 'CLAIMED' and submit_started_at is not null)
  ),
  constraint supplier_purchase_attempts_external_state_chk check (
    external_invoice_id is null or status in ('EXTERNAL_CREATED','RECONCILING','SUCCEEDED','FAILED','MANUAL_REVIEW')
  )
);

create unique index supplier_purchase_attempts_external_invoice_uidx
  on public.supplier_purchase_attempts(supplier, external_invoice_id)
  where external_invoice_id is not null;
create index supplier_purchase_attempts_reconcile_idx
  on public.supplier_purchase_attempts(supplier, status, updated_at, id)
  where status in ('SUBMITTING','UNCERTAIN','EXTERNAL_CREATED','RECONCILING');

-- One row per frozen order-item unit. This allows an invoice to group at most 20
-- units, and a larger order to split across independent invoice attempts.
create table public.supplier_purchase_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.supplier_purchase_attempts(id) on delete restrict,
  fulfillment_request_id uuid not null references public.supplier_fulfillment_requests(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  unit_index integer not null check (unit_index between 1 and 100000),
  frozen_product_id text not null check (length(btrim(frozen_product_id)) between 1 and 300),
  frozen_package_id text check (frozen_package_id is null or length(btrim(frozen_package_id)) between 1 and 300),
  frozen_currency text not null check (frozen_currency ~ '^[A-Z]{3}$'),
  frozen_face_value text check (frozen_face_value is null or frozen_face_value ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'),
  quoted_unit_cost numeric(18,6) not null check (quoted_unit_cost > 0),
  max_unit_cost numeric(18,6) not null check (max_unit_cost > 0 and max_unit_cost >= quoted_unit_cost),
  created_at timestamptz not null default now(),
  constraint supplier_purchase_unit_logical_uidx unique (fulfillment_request_id, unit_index),
  constraint supplier_purchase_attempt_unit_uidx unique (attempt_id, fulfillment_request_id, unit_index)
);
create index supplier_purchase_attempt_items_attempt_idx
  on public.supplier_purchase_attempt_items(attempt_id);
create index supplier_purchase_attempt_items_order_item_idx
  on public.supplier_purchase_attempt_items(order_item_id);

create function public.supplier_purchase_guard_attempt_item()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_supplier text;
  v_root_supplier text;
  v_root_item uuid;
  v_root_product text;
  v_root_package text;
begin
  -- Serializes concurrent allocation into the same invoice attempt.
  select supplier into v_supplier
  from public.supplier_purchase_attempts
  where id = new.attempt_id for update;
  select supplier, order_item_id, supplier_product_id, supplier_sku
    into v_root_supplier, v_root_item, v_root_product, v_root_package
  from public.supplier_fulfillment_requests
  where id = new.fulfillment_request_id for share;
  if v_supplier is null or v_root_supplier is null
     or v_supplier <> v_root_supplier
     or v_root_item is distinct from new.order_item_id
     or v_root_product is distinct from new.frozen_product_id
     or v_root_package is distinct from new.frozen_package_id then
    raise exception 'SUPPLIER_PURCHASE_ROOT_MISMATCH';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'SUPPLIER_PURCHASE_FROZEN_ITEM_IMMUTABLE';
  end if;
  if (select count(*) from public.supplier_purchase_attempt_items
      where attempt_id = new.attempt_id) >= 20 then
    raise exception 'SUPPLIER_PURCHASE_INVOICE_UNIT_LIMIT';
  end if;
  return new;
end
$function$;
create trigger supplier_purchase_attempt_item_guard
before insert or update on public.supplier_purchase_attempt_items
for each row execute function public.supplier_purchase_guard_attempt_item();

create function public.supplier_purchase_guard_attempt_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if old.supplier is distinct from new.supplier
     or old.logical_request_key is distinct from new.logical_request_key
     or old.semantic_request_hash is distinct from new.semantic_request_hash
     or old.submit_started_at is not null and old.submit_started_at is distinct from new.submit_started_at
     or old.external_invoice_id is not null and old.external_invoice_id is distinct from new.external_invoice_id then
    raise exception 'SUPPLIER_PURCHASE_IDENTITY_IMMUTABLE';
  end if;
  if old.status = 'CLAIMED' and new.status not in ('CLAIMED','SUBMITTING','MANUAL_REVIEW')
     or old.status = 'SUBMITTING' and new.status not in ('SUBMITTING','UNCERTAIN','EXTERNAL_CREATED','MANUAL_REVIEW')
     or old.status = 'UNCERTAIN' and new.status not in ('UNCERTAIN','MANUAL_REVIEW')
     or old.status = 'EXTERNAL_CREATED' and new.status not in ('EXTERNAL_CREATED','RECONCILING','SUCCEEDED','FAILED','MANUAL_REVIEW')
     or old.status = 'RECONCILING' and new.status not in ('RECONCILING','EXTERNAL_CREATED','SUCCEEDED','FAILED','MANUAL_REVIEW')
     or old.status in ('SUCCEEDED','FAILED','MANUAL_REVIEW') and new.status <> old.status then
    raise exception 'SUPPLIER_PURCHASE_STATE_TRANSITION_BLOCKED';
  end if;
  new.updated_at := now();
  return new;
end
$function$;
create trigger supplier_purchase_attempt_update_guard
before update on public.supplier_purchase_attempts
for each row execute function public.supplier_purchase_guard_attempt_update();

-- One child order maps to exactly one frozen unit. Invoice completion is not
-- itself evidence that all children were delivered.
create table public.supplier_external_orders (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.supplier_purchase_attempts(id) on delete restrict,
  attempt_item_id uuid not null unique references public.supplier_purchase_attempt_items(id) on delete restrict,
  supplier text not null check (supplier ~ '^[a-z][a-z0-9_]{1,39}$'),
  external_order_id text not null check (external_order_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  normalized_status text not null check (normalized_status in (
    'PENDING','PROCESSING','DELIVERED','FAILED','REFUNDED','UNKNOWN'
  )),
  evidence_fingerprint text check (evidence_fingerprint is null or evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  checked_at timestamptz,
  terminal_at timestamptz,
  delivery_id uuid unique references public.order_deliveries(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_external_orders_provider_id_uidx unique (supplier, external_order_id),
  constraint supplier_external_orders_delivery_state_chk check (
    delivery_id is null or normalized_status = 'DELIVERED'
  )
);
create index supplier_external_orders_attempt_status_idx
  on public.supplier_external_orders(attempt_id, normalized_status, updated_at);

create function public.supplier_purchase_guard_external_order()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_attempt_id uuid;
  v_order_item_id uuid;
  v_supplier text;
  v_delivery_item_id uuid;
begin
  select i.attempt_id, i.order_item_id, a.supplier
    into v_attempt_id, v_order_item_id, v_supplier
  from public.supplier_purchase_attempt_items as i
  join public.supplier_purchase_attempts as a on a.id = i.attempt_id
  where i.id = new.attempt_item_id;
  if v_attempt_id is distinct from new.attempt_id
     or v_supplier is distinct from new.supplier then
    raise exception 'SUPPLIER_EXTERNAL_ORDER_ASSIGNMENT_MISMATCH';
  end if;
  if tg_op = 'UPDATE' and (
    old.attempt_id is distinct from new.attempt_id
    or old.attempt_item_id is distinct from new.attempt_item_id
    or old.supplier is distinct from new.supplier
    or old.external_order_id is distinct from new.external_order_id
    or old.delivery_id is not null and old.delivery_id is distinct from new.delivery_id
  ) then
    raise exception 'SUPPLIER_EXTERNAL_ORDER_IDENTITY_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and old.normalized_status in ('DELIVERED','FAILED','REFUNDED')
     and new.normalized_status is distinct from old.normalized_status then
    raise exception 'SUPPLIER_EXTERNAL_ORDER_TERMINAL_IMMUTABLE';
  end if;
  if new.delivery_id is not null then
    select order_item_id into v_delivery_item_id
    from public.order_deliveries where id = new.delivery_id;
    if v_delivery_item_id is distinct from v_order_item_id then
      raise exception 'SUPPLIER_EXTERNAL_ORDER_DELIVERY_ITEM_MISMATCH';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$function$;
create trigger supplier_external_order_guard
before insert or update on public.supplier_external_orders
for each row execute function public.supplier_purchase_guard_external_order();

-- Webhooks only wake a GET reconciliation; neither payload nor redemption is stored.
create table public.supplier_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (supplier ~ '^[a-z][a-z0-9_]{1,39}$'),
  event_fingerprint text not null check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  external_invoice_id text check (external_invoice_id is null or external_invoice_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  external_order_id text check (external_order_id is null or external_order_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  processing_state text not null default 'RECEIVED' check (processing_state in ('RECEIVED','RECONCILING','PROCESSED','MANUAL_REVIEW')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint supplier_webhook_receipts_fingerprint_uidx unique (supplier, event_fingerprint)
);
create index supplier_webhook_receipts_pending_idx
  on public.supplier_webhook_receipts(supplier, received_at, id)
  where processing_state = 'RECEIVED';

create table public.supplier_reconciliation_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.supplier_purchase_attempts(id) on delete restrict,
  external_order_row_id uuid references public.supplier_external_orders(id) on delete restrict,
  normalized_status text not null check (normalized_status in (
    'PENDING','PROCESSING','DELIVERED','FAILED','REFUNDED','UNKNOWN'
  )),
  result_class text not null check (length(btrim(result_class)) between 1 and 100),
  safe_fingerprint text not null check (safe_fingerprint ~ '^[0-9a-f]{64}$'),
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index supplier_reconciliation_evidence_attempt_checked_idx
  on public.supplier_reconciliation_evidence(attempt_id, checked_at desc);
create index supplier_reconciliation_evidence_order_checked_idx
  on public.supplier_reconciliation_evidence(external_order_row_id, checked_at desc)
  where external_order_row_id is not null;
create unique index supplier_reconciliation_evidence_child_fingerprint_uidx
  on public.supplier_reconciliation_evidence(external_order_row_id, normalized_status, safe_fingerprint)
  where external_order_row_id is not null;
create unique index supplier_reconciliation_evidence_invoice_fingerprint_uidx
  on public.supplier_reconciliation_evidence(attempt_id, normalized_status, safe_fingerprint)
  where external_order_row_id is null;

-- Do not inherit the default PUBLIC table grant or expose a browser policy.
alter table public.supplier_purchase_attempts enable row level security;
alter table public.supplier_purchase_attempt_items enable row level security;
alter table public.supplier_external_orders enable row level security;
alter table public.supplier_webhook_receipts enable row level security;
alter table public.supplier_reconciliation_evidence enable row level security;

revoke all on public.supplier_purchase_attempts,
  public.supplier_purchase_attempt_items,
  public.supplier_external_orders,
  public.supplier_webhook_receipts,
  public.supplier_reconciliation_evidence from public, anon, authenticated, service_role;

-- Normalize inherited creation defaults before granting only safe worker reads.
-- GRANT SELECT alone would NOT remove Supabase's default service_role writes.
grant select on public.supplier_purchase_attempts,
  public.supplier_purchase_attempt_items,
  public.supplier_external_orders,
  public.supplier_webhook_receipts,
  public.supplier_reconciliation_evidence to service_role;

revoke all on function public.supplier_purchase_guard_attempt_item(),
  public.supplier_purchase_guard_attempt_update(),
  public.supplier_purchase_guard_external_order() from public, anon, authenticated, service_role;

-- The tables intentionally remain read-only for service_role. A narrowly
-- granted DEFINER entry point is needed for atomic writes. It performs no HTTP.
create function public.internal_supplier_purchase_claim(
  p_supplier text, p_logical_key text, p_semantic_hash text, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_attempt_id uuid;
  v_created boolean := false;
  v_existing_hash text;
  v_item jsonb;
  v_root_id uuid;
  v_order_item_id uuid;
  v_unit_index integer;
  v_product_id text;
  v_package_id text;
  v_currency text;
  v_face_value text;
  v_cost text;
  v_max text;
  v_order_id uuid;
  v_root_order_id uuid;
  v_root_status text;
  v_order_payment_status text;
  v_order_status text;
  v_item_quantity integer;
  v_binding jsonb;
begin
  if p_supplier is null or p_supplier !~ '^[a-z][a-z0-9_]{1,39}$'
     or p_logical_key is null or p_logical_key !~ '^[A-Za-z0-9:_-]{1,200}$'
     or p_semantic_hash is null or p_semantic_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_items) is distinct from 'array'
     or pg_column_size(p_items) > 65536
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'SUPPLIER_PURCHASE_CLAIM_INPUT_INVALID';
  end if;
  insert into public.supplier_purchase_attempts(supplier,logical_request_key,semantic_request_hash)
  values(p_supplier,p_logical_key,p_semantic_hash)
  on conflict (supplier,logical_request_key) do nothing
  returning id into v_attempt_id;
  if v_attempt_id is null then
    select id, semantic_request_hash into v_attempt_id, v_existing_hash
    from public.supplier_purchase_attempts
    where supplier = p_supplier and logical_request_key = p_logical_key for update;
    if v_existing_hash is distinct from p_semantic_hash then
      raise exception 'SUPPLIER_PURCHASE_SEMANTIC_CONFLICT';
    end if;
    return jsonb_build_object('result','ALREADY_CLAIMED','attempt_id',v_attempt_id);
  end if;
  v_created := true;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'fulfillment_request_id','') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item->>'order_item_id','') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item->>'unit_index','') !~ '^[1-9][0-9]{0,5}$'
       or coalesce(v_item->>'quoted_unit_cost','') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
       or coalesce(v_item->>'max_unit_cost','') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' then
      raise exception 'SUPPLIER_PURCHASE_ITEM_INPUT_INVALID';
    end if;
    v_root_id := (v_item->>'fulfillment_request_id')::uuid;
    v_order_item_id := (v_item->>'order_item_id')::uuid;
    v_unit_index := (v_item->>'unit_index')::integer;
    v_product_id := v_item->>'frozen_product_id';
    v_package_id := v_item->>'frozen_package_id';
    v_currency := v_item->>'frozen_currency';
    v_face_value := v_item->>'frozen_face_value';
    v_cost := v_item->>'quoted_unit_cost';
    v_max := v_item->>'max_unit_cost';
    if v_unit_index > 100000 or length(btrim(coalesce(v_product_id,''))) not between 1 and 300
       or (p_supplier = 'bitrefill' and length(btrim(coalesce(v_package_id,''))) not between 1 and 300)
       or (v_package_id is not null and length(btrim(v_package_id)) not between 1 and 300)
       or coalesce(v_currency,'') !~ '^[A-Z]{3}$'
       or (v_face_value is not null and v_face_value !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$')
       or (p_supplier = 'bitrefill' and
           (v_face_value is null or v_face_value::numeric <= 0))
       or v_cost::numeric <= 0 or v_max::numeric < v_cost::numeric
       or v_cost::numeric > 999999999999.999999 or v_max::numeric > 999999999999.999999 then
      raise exception 'SUPPLIER_PURCHASE_FROZEN_EVIDENCE_INVALID';
    end if;
    select r.order_id, r.status, i.order_id, i.quantity, i.product_snapshot->'supplier_binding'
      into v_root_order_id, v_root_status, v_order_id, v_item_quantity, v_binding
    from public.supplier_fulfillment_requests as r
    join public.order_items as i on i.id = r.order_item_id
    where r.id=v_root_id and i.id=v_order_item_id
    for share of r, i;
    if v_root_order_id is null or v_order_id is distinct from v_root_order_id
       or v_root_status not in ('PENDING','PURCHASING')
       or v_item_quantity is null or v_unit_index > v_item_quantity
       or coalesce(v_binding->>'fulfillment_source','') <> 'supplier'
       or coalesce(v_binding->>'supplier','') <> p_supplier
       or coalesce(v_binding->>'supplier_product_id','') <> v_product_id
       or nullif(btrim(coalesce(v_binding->>'supplier_sku','')), '') is distinct from v_package_id then
      raise exception 'SUPPLIER_PURCHASE_FROZEN_ORDER_MISMATCH';
    end if;
    if exists (select 1 from public.order_deliveries
               where order_item_id=v_order_item_id and delivery_status='delivered') then
      raise exception 'SUPPLIER_PURCHASE_ALREADY_DELIVERED';
    end if;
    select payment_status,status into v_order_payment_status,v_order_status
    from public.orders where id=v_order_id for share;
    if v_order_payment_status is distinct from 'paid'
       or v_order_status in ('cancelled','expired','refunded','failed')
       or v_order_status is null then
      raise exception 'SUPPLIER_PURCHASE_ORDER_NOT_PURCHASABLE';
    end if;
    insert into public.supplier_purchase_attempt_items(
      attempt_id,fulfillment_request_id,order_item_id,unit_index,
      frozen_product_id,frozen_package_id,frozen_currency,frozen_face_value,
      quoted_unit_cost,max_unit_cost
    ) values (
      v_attempt_id,v_root_id,v_order_item_id,v_unit_index,
      v_product_id,v_package_id,v_currency,v_face_value,
      v_cost::numeric,v_max::numeric
    );
  end loop;
  return jsonb_build_object('result','CLAIMED','attempt_id',v_attempt_id);
end
$function$;

create function public.internal_supplier_purchase_transition(
  p_attempt_id uuid, p_expected_status text, p_next_status text,
  p_external_invoice_id text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.supplier_purchase_attempts;
begin
  if p_attempt_id is null or p_expected_status is null or p_next_status is null
     or (p_external_invoice_id is not null and
         p_external_invoice_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$') then
    raise exception 'SUPPLIER_PURCHASE_TRANSITION_INPUT_INVALID';
  end if;
  select * into v_row from public.supplier_purchase_attempts
  where id = p_attempt_id for update;
  if not found then raise exception 'SUPPLIER_PURCHASE_ATTEMPT_NOT_FOUND'; end if;
  if p_expected_status = 'SUBMITTING' and p_next_status = 'EXTERNAL_CREATED'
     and v_row.status in ('EXTERNAL_CREATED','RECONCILING','SUCCEEDED') then
    if v_row.external_invoice_id is distinct from p_external_invoice_id then
      raise exception 'SUPPLIER_PURCHASE_EXTERNAL_INVOICE_CONFLICT';
    end if;
    return jsonb_build_object('result','ALREADY_REGISTERED','status',v_row.status);
  end if;
  if v_row.status <> p_expected_status then
    return jsonb_build_object('result','STATE_CONFLICT','status',v_row.status);
  end if;
  if (p_expected_status = 'CLAIMED' and p_next_status = 'SUBMITTING' and p_external_invoice_id is null) then
    update public.supplier_purchase_attempts set status='SUBMITTING',submit_started_at=clock_timestamp()
    where id=p_attempt_id;
  elsif (p_expected_status = 'SUBMITTING' and p_next_status = 'UNCERTAIN' and p_external_invoice_id is null) then
    update public.supplier_purchase_attempts set status='UNCERTAIN',submit_finished_at=clock_timestamp()
    where id=p_attempt_id;
  elsif (p_expected_status = 'SUBMITTING' and p_next_status = 'EXTERNAL_CREATED' and p_external_invoice_id is not null) then
    update public.supplier_purchase_attempts
    set status='EXTERNAL_CREATED',external_invoice_id=p_external_invoice_id,
        submit_finished_at=clock_timestamp() where id=p_attempt_id;
  elsif (p_expected_status = 'EXTERNAL_CREATED' and p_next_status = 'RECONCILING' and p_external_invoice_id is null) then
    update public.supplier_purchase_attempts set status='RECONCILING' where id=p_attempt_id;
  else
    raise exception 'SUPPLIER_PURCHASE_TRANSITION_FORBIDDEN';
  end if;
  return jsonb_build_object('result','TRANSITIONED','status',p_next_status);
end
$function$;

create function public.internal_supplier_purchase_record_child(
  p_attempt_item_id uuid, p_external_order_id text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_attempt_id uuid;
  v_supplier text;
  v_status text;
  v_existing public.supplier_external_orders;
begin
  if p_attempt_item_id is null or p_external_order_id is null
     or p_external_order_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then
    raise exception 'SUPPLIER_PURCHASE_CHILD_INPUT_INVALID';
  end if;
  select a.id,a.supplier,a.status into v_attempt_id,v_supplier,v_status
  from public.supplier_purchase_attempt_items as i
  join public.supplier_purchase_attempts as a on a.id=i.attempt_id
  where i.id=p_attempt_item_id for update of a;
  if v_status not in ('EXTERNAL_CREATED','RECONCILING') then
    raise exception 'SUPPLIER_PURCHASE_CHILD_STATE_INVALID';
  end if;
  insert into public.supplier_external_orders(
    attempt_id,attempt_item_id,supplier,external_order_id,normalized_status
  ) values(v_attempt_id,p_attempt_item_id,v_supplier,p_external_order_id,'PENDING')
  on conflict (attempt_item_id) do nothing;
  select * into v_existing from public.supplier_external_orders
  where attempt_item_id=p_attempt_item_id for update;
  if v_existing.external_order_id is distinct from p_external_order_id then
    raise exception 'SUPPLIER_PURCHASE_CHILD_IDENTITY_CONFLICT';
  end if;
  return jsonb_build_object('result','RECORDED','external_order_row_id',v_existing.id);
end
$function$;

-- Reconciliation can record only classifications and safe SHA-256 fingerprints.
-- It cannot create an external purchase or store a redemption payload.
create function public.internal_supplier_purchase_record_evidence(
  p_attempt_id uuid, p_external_order_row_id uuid, p_status text,
  p_result_class text, p_safe_fingerprint text, p_checked_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_attempt_status text;
declare v_child public.supplier_external_orders;
declare v_evidence_id uuid;
begin
  if p_attempt_id is null or p_status not in
       ('PENDING','PROCESSING','DELIVERED','FAILED','REFUNDED','UNKNOWN')
     or p_result_class is null or length(btrim(p_result_class)) not between 1 and 100
     or p_result_class !~ '^[A-Z][A-Z0-9_]{0,99}$'
     or p_safe_fingerprint is null or p_safe_fingerprint !~ '^[0-9a-f]{64}$'
     or p_checked_at is null or p_checked_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'SUPPLIER_PURCHASE_EVIDENCE_INPUT_INVALID';
  end if;
  select status into v_attempt_status from public.supplier_purchase_attempts
  where id=p_attempt_id for update;
  if v_attempt_status not in ('EXTERNAL_CREATED','RECONCILING') then
    raise exception 'SUPPLIER_PURCHASE_EVIDENCE_STATE_INVALID';
  end if;
  if p_external_order_row_id is not null then
    select * into v_child from public.supplier_external_orders
    where id=p_external_order_row_id for update;
    if v_child.attempt_id is distinct from p_attempt_id then
      raise exception 'SUPPLIER_PURCHASE_EVIDENCE_CHILD_MISMATCH';
    end if;
    update public.supplier_external_orders
      set normalized_status=p_status,evidence_fingerprint=p_safe_fingerprint,
          checked_at=p_checked_at,
          terminal_at=case when p_status in ('DELIVERED','FAILED','REFUNDED')
            then coalesce(terminal_at,p_checked_at) else terminal_at end
      where id=p_external_order_row_id;
  end if;
  insert into public.supplier_reconciliation_evidence(
    attempt_id,external_order_row_id,normalized_status,result_class,safe_fingerprint,checked_at
  ) values(p_attempt_id,p_external_order_row_id,p_status,p_result_class,p_safe_fingerprint,p_checked_at)
  on conflict do nothing
  returning id into v_evidence_id;
  if v_evidence_id is null then
    select id into v_evidence_id from public.supplier_reconciliation_evidence
    where attempt_id=p_attempt_id and external_order_row_id is not distinct from p_external_order_row_id
      and normalized_status=p_status and safe_fingerprint=p_safe_fingerprint;
  end if;
  if v_attempt_status='EXTERNAL_CREATED' then
    update public.supplier_purchase_attempts set status='RECONCILING',
      last_reconciled_at=p_checked_at where id=p_attempt_id;
  else
    update public.supplier_purchase_attempts set last_reconciled_at=p_checked_at
    where id=p_attempt_id;
  end if;
  return jsonb_build_object('result','RECORDED','evidence_id',v_evidence_id);
end
$function$;

create function public.internal_supplier_purchase_record_webhook(
  p_supplier text, p_event_fingerprint text,
  p_external_invoice_id text default null, p_external_order_id text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_id uuid;
declare v_existing_invoice text;
declare v_existing_order text;
begin
  if p_supplier is null or p_supplier !~ '^[a-z][a-z0-9_]{1,39}$'
     or p_event_fingerprint is null or p_event_fingerprint !~ '^[0-9a-f]{64}$'
     or (p_external_invoice_id is not null and
         p_external_invoice_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$')
     or (p_external_order_id is not null and
         p_external_order_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$') then
    raise exception 'SUPPLIER_PURCHASE_WEBHOOK_INPUT_INVALID';
  end if;
  insert into public.supplier_webhook_receipts(
    supplier,event_fingerprint,external_invoice_id,external_order_id
  ) values(p_supplier,p_event_fingerprint,p_external_invoice_id,p_external_order_id)
  on conflict (supplier,event_fingerprint) do nothing returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('result','RECEIVED','receipt_id',v_id);
  end if;
  select id,external_invoice_id,external_order_id
    into v_id,v_existing_invoice,v_existing_order
    from public.supplier_webhook_receipts
  where supplier=p_supplier and event_fingerprint=p_event_fingerprint;
  if v_existing_invoice is distinct from p_external_invoice_id
     or v_existing_order is distinct from p_external_order_id then
    raise exception 'SUPPLIER_PURCHASE_WEBHOOK_IDENTITY_CONFLICT';
  end if;
  return jsonb_build_object('result','ALREADY_RECEIVED','receipt_id',v_id);
end
$function$;

revoke all on function public.internal_supplier_purchase_claim(text,text,text,jsonb),
  public.internal_supplier_purchase_transition(uuid,text,text,text),
  public.internal_supplier_purchase_record_child(uuid,text),
  public.internal_supplier_purchase_record_evidence(uuid,uuid,text,text,text,timestamptz),
  public.internal_supplier_purchase_record_webhook(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.internal_supplier_purchase_claim(text,text,text,jsonb),
  public.internal_supplier_purchase_transition(uuid,text,text,text),
  public.internal_supplier_purchase_record_child(uuid,text),
  public.internal_supplier_purchase_record_evidence(uuid,uuid,text,text,text,timestamptz),
  public.internal_supplier_purchase_record_webhook(text,text,text,text)
  to service_role;

-- Atomic bridge to the existing private supplier-delivery transaction. Without
-- this bridge, service_role cannot bind supplier_external_orders.delivery_id,
-- and a crash can leave the exact child-to-delivery relation unrecorded.
create function public.internal_supplier_purchase_deliver_child(
  p_external_order_row_id uuid, p_request_id text,
  p_attempt_token uuid, p_delivery_content text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_order_id uuid;
  v_order_item_id uuid;
  v_external_order_id text;
  v_root_request_id text;
  v_root_attempt_token uuid;
  v_root_status text;
  v_existing_delivery_id uuid;
  v_delivery_id uuid;
  v_outcome jsonb;
begin
  if p_external_order_row_id is null or p_request_id is null
     or p_attempt_token is null or nullif(btrim(coalesce(p_delivery_content,'')),'') is null
     or length(p_delivery_content) > 65536 then
    raise exception 'SUPPLIER_PURCHASE_PRIVATE_DELIVERY_INPUT_INVALID';
  end if;
  select r.order_id,i.order_item_id,e.external_order_id,r.request_id,
         r.attempt_token,r.status,e.delivery_id
    into v_order_id,v_order_item_id,v_external_order_id,v_root_request_id,
         v_root_attempt_token,v_root_status,v_existing_delivery_id
  from public.supplier_external_orders e
  join public.supplier_purchase_attempt_items i on i.id=e.attempt_item_id
  join public.supplier_fulfillment_requests r on r.id=i.fulfillment_request_id
  where e.id=p_external_order_row_id and e.supplier='bitrefill'
    and e.normalized_status='DELIVERED'
    and r.order_item_id=i.order_item_id;
  if v_order_id is null or v_root_request_id is distinct from p_request_id
     or v_root_attempt_token is distinct from p_attempt_token
     or v_root_status not in ('PURCHASING','FULFILLED') then
    raise exception 'SUPPLIER_PURCHASE_PRIVATE_DELIVERY_IDENTITY_MISMATCH';
  end if;
  v_outcome := public.record_supplier_fulfillment_outcome(
    v_order_id,v_order_item_id,'bitrefill',p_request_id,p_attempt_token,
    'FULFILLED',false,null,v_external_order_id,p_delivery_content,
    null,null,'bitrefill_reconciliation');
  if coalesce((v_outcome->>'ok')::boolean,false) is not true then
    raise exception 'SUPPLIER_PURCHASE_PRIVATE_DELIVERY_OUTCOME_FAILED';
  end if;
  select id into v_delivery_id from public.order_deliveries
  where order_item_id=v_order_item_id and delivery_type='supplier_delivery'
    and delivery_status='delivered' for share;
  if v_delivery_id is null or (v_existing_delivery_id is not null
     and v_existing_delivery_id is distinct from v_delivery_id) then
    raise exception 'SUPPLIER_PURCHASE_PRIVATE_DELIVERY_LINK_MISMATCH';
  end if;
  update public.supplier_external_orders set delivery_id=v_delivery_id
  where id=p_external_order_row_id and delivery_id is distinct from v_delivery_id;
  return jsonb_build_object('ok',true,'idempotent',
    coalesce((v_outcome->>'idempotent')::boolean,false),
    'child_id',p_external_order_row_id,'delivery_id',v_delivery_id);
end
$function$;
revoke all on function public.internal_supplier_purchase_deliver_child(uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_supplier_purchase_deliver_child(uuid,text,uuid,text)
  to service_role;

-- Forward-only P2.3 evaluator replacement. Daju's quantity path is retained;
-- the boolean path is opt-in and requires an explicit fresh, internally
-- consistent metadata contract. This does not activate or bind any SKU.
create or replace function public.admin_evaluate_product_sku_activation(
  p_product_delivery_type text,
  p_sku_delivery_type text,
  p_stock integer,
  p_metadata jsonb,
  p_local_available_count bigint
) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog
as $function$
declare
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
    then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
  v_effective_delivery_type text := coalesce(nullif(p_sku_delivery_type, ''), nullif(p_product_delivery_type, ''), 'manual');
  v_supplier_requested boolean;
  v_supplier text;
  v_binding_complete boolean := false;
  v_snapshot bigint;
  v_snapshot_valid boolean := false;
  v_last_success_valid boolean := false;
  v_last_success_at timestamptz;
  v_supplier_ready boolean := false;
  v_exact_supplier_ready boolean := false;
  v_boolean_supplier_ready boolean := false;
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
      'ready', true, 'reasons', '[]'::jsonb, 'source', 'not_required',
      'stock', greatest(coalesce(p_stock, 0), 0),
      'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
      'inventory_state', v_metadata->>'inventory_state'
    );
  end if;

  v_supplier_requested := coalesce(v_metadata->>'fulfillment_source', '') = 'supplier';
  v_supplier := coalesce(v_metadata->>'supplier', '');
  v_mapping := case when not (v_metadata ? 'supplier_inputs_mapping') then '{}'::jsonb
    else v_metadata->'supplier_inputs_mapping' end;
  v_cost_text := btrim(coalesce(v_metadata->>'supplier_max_unit_cost', ''));
  if jsonb_typeof(v_metadata->'supplier_product_id') = 'number' then
    v_product_id_numeric := (v_metadata->'supplier_product_id')::numeric;
    v_product_id_valid := v_product_id_numeric > 0
      and v_product_id_numeric <= 9007199254740991
      and trunc(v_product_id_numeric) = v_product_id_numeric;
  end if;
  v_supplier_sku_valid :=
    not (v_metadata ? 'supplier_sku')
    or jsonb_typeof(v_metadata->'supplier_sku') = 'null'
    or (jsonb_typeof(v_metadata->'supplier_sku') = 'string'
        and length(btrim(v_metadata->>'supplier_sku')) between 1 and 200);
  if jsonb_typeof(v_mapping) = 'object' then
    v_mapping_valid := not exists (
      select 1 from jsonb_each(v_mapping) as mapping_entry(key,value)
      where mapping_entry.key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,79}$'
        or jsonb_typeof(mapping_entry.value) <> 'string'
        or mapping_entry.value #>> '{}' not in
          ('customer_email','customer_name','customer_phone','customer_note')
    );
  end if;
  if v_cost_text ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' then
    v_cost_valid := v_cost_text::numeric > 0;
  end if;
  v_binding_complete := v_supplier_requested and (
    (v_supplier = 'daju' and v_product_id_valid and v_supplier_sku_valid
      and v_mapping_valid and v_cost_valid)
    or (v_supplier = 'bitrefill'
      and jsonb_typeof(v_metadata->'supplier_product_id') = 'string'
      and length(btrim(v_metadata->>'supplier_product_id')) between 1 and 200
      and jsonb_typeof(v_metadata->'supplier_sku') = 'string'
      and length(btrim(v_metadata->>'supplier_sku')) between 1 and 200
      and v_mapping_valid and v_cost_valid)
  );
  if jsonb_typeof(v_metadata->'supplier_stock_snapshot') = 'number' then
    v_snapshot_numeric := (v_metadata->'supplier_stock_snapshot')::numeric;
    if v_snapshot_numeric > 0 and v_snapshot_numeric <= 9007199254740991
       and trunc(v_snapshot_numeric) = v_snapshot_numeric then
      v_snapshot := v_snapshot_numeric::bigint;
      v_snapshot_valid := true;
    end if;
  end if;
  if jsonb_typeof(v_metadata->'supplier_stock_last_success_at') = 'string'
     and (v_metadata->>'supplier_stock_last_success_at')
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    begin
      v_last_success_at := (v_metadata->>'supplier_stock_last_success_at')::timestamptz;
      v_last_success_valid := true;
    exception when others then
      v_last_success_valid := false;
    end;
  end if;
  v_supplier_ready := v_binding_complete and v_snapshot_valid
    and coalesce(v_metadata->>'supplier_stock_sync_status', '') = 'synced'
    and v_last_success_valid
    and coalesce(v_metadata->'supplier_stock_stale', 'false'::jsonb) <> 'true'::jsonb;
  v_exact_supplier_ready := v_supplier = 'daju' and v_supplier_ready
    and v_snapshot = coalesce(p_stock, 0);
  v_boolean_supplier_ready := v_supplier = 'bitrefill' and v_binding_complete
    and v_metadata->'supplier_quantity_known' = 'false'::jsonb
    and coalesce(v_metadata->'supplier_stock_snapshot', 'null'::jsonb) = 'null'::jsonb
    and v_metadata->>'supplier_availability' = 'AVAILABLE'
    and v_metadata->'supplier_available' = 'true'::jsonb
    and coalesce(v_metadata->>'supplier_stock_sync_status', '') = 'synced'
    and v_metadata->'supplier_stock_stale' = 'false'::jsonb
    and v_last_success_valid and v_last_success_at <= now()
    and v_last_success_at > now() - interval '1 hour';
  v_local_inventory_ready := not v_supplier_requested and coalesce(p_local_available_count, 0) > 0;
  v_trusted_source := v_exact_supplier_ready or v_boolean_supplier_ready or v_local_inventory_ready;

  if coalesce(p_stock, 0) <= 0 and not v_boolean_supplier_ready then
    v_reasons := v_reasons || '"ZERO_STOCK"'::jsonb;
  end if;
  if v_supplier_requested then
    if not v_binding_complete then
      v_reasons := v_reasons || '"SUPPLIER_BINDING_INCOMPLETE"'::jsonb;
    elsif not (v_exact_supplier_ready or v_boolean_supplier_ready) then
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
    'ready', jsonb_array_length(v_reasons) = 0, 'reasons', v_reasons,
    'source', case when v_exact_supplier_ready or v_boolean_supplier_ready then 'supplier'
      when v_local_inventory_ready then 'local_inventory' else 'none' end,
    'stock', greatest(coalesce(p_stock, 0), 0),
    'local_available_count', greatest(coalesce(p_local_available_count, 0), 0),
    'inventory_state', v_metadata->>'inventory_state'
  );
end
$function$;
revoke all on function public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)
  from public, anon, authenticated;
grant execute on function public.admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)
  to service_role;

-- Effective permission assertions include PUBLIC, inherited grants and roles
-- reachable through SET ROLE (including NOINHERIT memberships). Unexpected
-- default grants must roll back this entire migration, not leave a weak install.
do $effective_security$
declare
  v_owner oid := current_user::regrole;
  v_table text;
  v_role text;
  v_privilege text;
  v_route record;
  v_function record;
  v_column record;
begin
  foreach v_table in array array['supplier_purchase_attempts',
    'supplier_purchase_attempt_items','supplier_external_orders',
    'supplier_webhook_receipts','supplier_reconciliation_evidence'] loop
    if not exists (select 1 from pg_catalog.pg_class
        where oid=to_regclass('public.'||v_table) and relowner=v_owner and relrowsecurity)
       or exists (select 1 from pg_catalog.pg_policy
        where polrelid=to_regclass('public.'||v_table)) then
      raise exception 'SUPPLIER_PURCHASE_TABLE_SECURITY_INVALID';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_table_privilege(v_role,'public.'||v_table,'SELECT')
          is distinct from (v_role='service_role') then
        raise exception 'SUPPLIER_PURCHASE_READ_ACL_INVALID';
      end if;
      for v_route in select oid from pg_catalog.pg_roles
        where pg_catalog.pg_has_role(v_role,oid,'USAGE')
           or pg_catalog.pg_has_role(v_role,oid,'SET') loop
        foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE',
          'REFERENCES','TRIGGER','MAINTAIN'] loop
          if pg_catalog.has_table_privilege(v_route.oid,'public.'||v_table,v_privilege) then
            raise exception 'SUPPLIER_PURCHASE_EFFECTIVE_WRITE_ACL_UNSAFE';
          end if;
        end loop;
        for v_column in select attnum from pg_catalog.pg_attribute
          where attrelid=to_regclass('public.'||v_table) and attnum>0 and not attisdropped loop
          foreach v_privilege in array array['INSERT','UPDATE','REFERENCES'] loop
            if pg_catalog.has_column_privilege(v_route.oid,to_regclass('public.'||v_table),
                v_column.attnum,v_privilege) then
              raise exception 'SUPPLIER_PURCHASE_EFFECTIVE_COLUMN_ACL_UNSAFE';
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  for v_function in select p.* from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'internal_supplier_purchase_claim','internal_supplier_purchase_transition',
      'internal_supplier_purchase_record_child','internal_supplier_purchase_record_evidence',
      'internal_supplier_purchase_record_webhook','internal_supplier_purchase_deliver_child',
      'supplier_purchase_guard_attempt_item','supplier_purchase_guard_attempt_update',
      'supplier_purchase_guard_external_order') loop
    if v_function.proowner<>v_owner
       or v_function.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or v_function.prosecdef is distinct from
          (v_function.proname like 'internal_supplier_purchase_%')
       or pg_catalog.has_function_privilege('service_role',v_function.oid,'EXECUTE')
          is distinct from (v_function.proname like 'internal_supplier_purchase_%')
       or exists (select 1 from pg_catalog.aclexplode(v_function.proacl) where grantee=0) then
      raise exception 'SUPPLIER_PURCHASE_FUNCTION_SECURITY_INVALID';
    end if;
    foreach v_role in array array['anon','authenticated'] loop
      for v_route in select oid from pg_catalog.pg_roles
        where pg_catalog.pg_has_role(v_role,oid,'USAGE')
           or pg_catalog.pg_has_role(v_role,oid,'SET') loop
        if pg_catalog.has_function_privilege(v_route.oid,v_function.oid,'EXECUTE') then
          raise exception 'SUPPLIER_PURCHASE_EFFECTIVE_EXECUTE_ACL_UNSAFE';
        end if;
      end loop;
    end loop;
  end loop;
end
$effective_security$;

commit;
