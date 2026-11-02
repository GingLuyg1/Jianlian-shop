-- Candidate only: no Production execution authorized by preparation.
-- Existing purchase queues/RPCs are reused. These tables only authorize and
-- freeze a particular user's proposed order; they never submit a purchase.
begin;
set local lock_timeout = '3s';
do $precheck$
begin
  if to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') is null or
     md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure), E'\r','')) <> 'c45e1803c49709ae7480c30ac83f19a5' then
    raise exception 'BITREFILL_PIN_ORDER_BASELINE_DRIFT';
  end if;
  if to_regclass('public.supplier_purchase_attempts') is null then raise exception 'BITREFILL_PIN_DB9_REQUIRED'; end if;
  if current_user<>'postgres' then raise exception 'BITREFILL_PIN_MIGRATION_OWNER_REQUIRED'; end if;
  if (select count(*) from (values
    ('eeef050f-3b56-492d-a0a2-0640e4c1355f'::uuid,'e00553bf-a2da-48c7-9bdc-9b897b18b2fd'::uuid,'BFR-GB-GIFFGAFF-GBP-010'),
    ('4cf72256-72ca-47b0-8dca-9904a0d70f69'::uuid,'5e4025b0-9a14-4827-87a2-f7f3e0e79734'::uuid,'BFR-GB-GIFFGAFF-GBP-015'),
    ('f1333d43-8f0b-4041-a120-c980f7e58147'::uuid,'b2878f67-344a-40e4-af59-b32b6db21d29'::uuid,'BFR-GB-GIFFGAFF-GBP-020')
    ) e(sku_id,product_id,sku_code) join public.product_skus s on s.id=e.sku_id and s.product_id=e.product_id and s.sku_code=e.sku_code
      join public.products p on p.id=s.product_id)<>3 then raise exception 'BITREFILL_PIN_EXISTING_SKU_IDENTITY_DRIFT'; end if;
end
$precheck$;

create schema bitrefill_pin_private;
revoke all on schema bitrefill_pin_private from public,anon,authenticated,service_role;
grant usage on schema bitrefill_pin_private to service_role;
create table bitrefill_pin_private.sale_authorizations (
  sku_id uuid primary key references public.product_skus(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  supplier_product_id text not null,
  package_id text not null,
  face_value numeric not null check(face_value>0),
  face_currency text not null check(face_currency ~ '^[A-Z]{3}$'),
  country text not null check(country ~ '^[A-Z]{2}$'),
  enabled boolean not null default false,
  account_fingerprint text check(account_fingerprint ~ '^[a-f0-9]{64}$'),
  permission_reference text,
  funding_reference text,
  max_unit_cost_usd numeric(18,6) check(max_unit_cost_usd>0),
  min_profit_cny numeric(18,6) check(min_profit_cny>0),
  cumulative_cap_usd numeric(18,6) check(cumulative_cap_usd>0),
  binding_version integer not null default 1 check(binding_version>0)
);
create table bitrefill_pin_private.order_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id text not null check(length(client_request_id) between 1 and 120),
  product_id uuid not null references public.products(id) on delete restrict,
  sku_id uuid not null references bitrefill_pin_private.sale_authorizations(sku_id) on delete restrict,
  sale_price_cny numeric not null check(sale_price_cny>0),
  evidence jsonb not null,
  binding jsonb not null,
  expires_at timestamptz not null,
  order_id uuid unique references public.orders(id) on delete restrict,
  consumed_at timestamptz,
  unique(user_id,client_request_id)
);
alter table bitrefill_pin_private.sale_authorizations enable row level security;
alter table bitrefill_pin_private.order_quotes enable row level security;
revoke all on all tables in schema bitrefill_pin_private from public,anon,authenticated,service_role;
grant select on all tables in schema bitrefill_pin_private to service_role;

-- Exact existing three SKU/product pairs. Disabled, with NO approved budget or
-- permission by default. No product/category/SKU row is changed or created.
insert into bitrefill_pin_private.sale_authorizations(sku_id,product_id,supplier_product_id,package_id,face_value,face_currency,country) values
('eeef050f-3b56-492d-a0a2-0640e4c1355f','e00553bf-a2da-48c7-9bdc-9b897b18b2fd','giff-gaff-pin-united-kingdom','giff-gaff-pin-united-kingdom<&>10',10,'GBP','GB'),
('4cf72256-72ca-47b0-8dca-9904a0d70f69','5e4025b0-9a14-4827-87a2-f7f3e0e79734','giff-gaff-pin-united-kingdom','giff-gaff-pin-united-kingdom<&>15',15,'GBP','GB'),
('f1333d43-8f0b-4041-a120-c980f7e58147','b2878f67-344a-40e4-af59-b32b6db21d29','giff-gaff-pin-united-kingdom','giff-gaff-pin-united-kingdom<&>20',20,'GBP','GB');

create function bitrefill_pin_private.entry_status(p_user uuid,p_request text,p_product uuid,p_sku uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare a bitrefill_pin_private.sale_authorizations%rowtype; q bitrefill_pin_private.order_quotes%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'BITREFILL_PIN_SERVICE_REQUIRED'; end if;
  select * into a from bitrefill_pin_private.sale_authorizations where sku_id=p_sku and product_id=p_product;
  if not found then raise exception 'BITREFILL_PIN_SCOPE_MISMATCH'; end if;
  select * into q from bitrefill_pin_private.order_quotes where user_id=p_user and client_request_id=p_request;
  if found and (q.sku_id<>p_sku or q.product_id<>p_product) then raise exception 'BITREFILL_PIN_REQUEST_CONFLICT'; end if;
  return jsonb_build_object('enabled',a.enabled,'replay',q.order_id is not null,'authorization',to_jsonb(a));
end $f$;

create function bitrefill_pin_private.authorize_quote(p_user uuid,p_request text,p_product uuid,p_sku uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare a bitrefill_pin_private.sale_authorizations%rowtype; q bitrefill_pin_private.order_quotes%rowtype;
  v_price numeric; v_cost numeric; v_rate numeric; v_fees numeric; v_expiry timestamptz; v_binding jsonb; k text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'BITREFILL_PIN_SERVICE_REQUIRED'; end if;
  if p_user is null or p_request is null or length(p_request) not between 1 and 120 then raise exception 'BITREFILL_PIN_REQUEST_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_request,0));
  select * into a from bitrefill_pin_private.sale_authorizations where sku_id=p_sku and product_id=p_product for share;
  if not found or not a.enabled or nullif(btrim(a.permission_reference),'') is null or nullif(btrim(a.funding_reference),'') is null or
      a.account_fingerprint is null or a.max_unit_cost_usd is null or a.min_profit_cny is null or a.cumulative_cap_usd is null then
    raise exception 'BITREFILL_PIN_SALE_NOT_AUTHORIZED';
  end if;
  select * into q from bitrefill_pin_private.order_quotes where user_id=p_user and client_request_id=p_request for update;
  if found and (q.product_id<>p_product or q.sku_id<>p_sku) then raise exception 'BITREFILL_PIN_REQUEST_CONFLICT'; end if;
  if q.order_id is not null then return jsonb_build_object('quote_id',q.id,'replay',true); end if;
  if jsonb_typeof(p_evidence) is distinct from 'object' or coalesce(not (p_evidence->>'source'='authenticated_pin_order_quote' or
    (p_evidence->>'source'='synthetic_pin_order_quote' and current_database() ~ '^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$' and inet_server_addr()='127.0.0.1'::inet)),true) then raise exception 'BITREFILL_PIN_QUOTE_SOURCE_INVALID'; end if;
  foreach k in array array['feesIncluded','cnyFeesVerified','supplierEnforcedCap','available','atomicBudgetReady','accountPermissionVerified'] loop
    if p_evidence->k is distinct from 'true'::jsonb then raise exception 'BITREFILL_PIN_QUOTE_GATE_MISSING'; end if;
  end loop;
  if p_evidence->>'productId' is distinct from a.supplier_product_id or p_evidence->>'packageId' is distinct from a.package_id or
     p_evidence->>'faceCurrency' is distinct from a.face_currency or p_evidence->>'country' is distinct from a.country or
     p_evidence->>'purchaseCurrency' is distinct from 'USD' or p_evidence->>'deliveryKind' is distinct from 'pin' or
     p_evidence->>'accountFingerprint' is distinct from a.account_fingerprint then raise exception 'BITREFILL_PIN_QUOTE_IDENTITY_MISMATCH'; end if;
  foreach k in array array['faceValue','allInUsd','fxRate','cnyFees','availableUsd','reservedUsd','spentUsd','salePriceCny'] loop
    if coalesce(p_evidence->>k,'') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,8})?$' then raise exception 'BITREFILL_PIN_MONEY_INVALID'; end if;
  end loop;
  if (p_evidence->>'faceValue')::numeric<>a.face_value then raise exception 'BITREFILL_PIN_FACE_MISMATCH'; end if;
  if (p_evidence->>'allInUsd')::numeric <> round((p_evidence->>'allInUsd')::numeric,6) then raise exception 'BITREFILL_PIN_DB9_COST_PRECISION'; end if;
  foreach k in array array['checkedAt','fxCheckedAt','balanceCheckedAt','expiresAt','fxExpiresAt'] loop
    if p_evidence->>k is null or not isfinite((p_evidence->>k)::timestamptz) then raise exception 'BITREFILL_PIN_TIME_REQUIRED'; end if;
  end loop;
  if (p_evidence->>'checkedAt')::timestamptz>now() or (p_evidence->>'checkedAt')::timestamptz<now()-interval '5 minutes' or
     (p_evidence->>'fxCheckedAt')::timestamptz>now() or (p_evidence->>'fxCheckedAt')::timestamptz<now()-interval '5 minutes' or
     (p_evidence->>'balanceCheckedAt')::timestamptz>now() or (p_evidence->>'balanceCheckedAt')::timestamptz<now()-interval '60 seconds' then raise exception 'BITREFILL_PIN_STALE_EVIDENCE'; end if;
  v_expiry := least((p_evidence->>'expiresAt')::timestamptz,(p_evidence->>'fxExpiresAt')::timestamptz);
  if v_expiry is null or v_expiry<=now() or v_expiry>now()+interval '5 minutes' then raise exception 'BITREFILL_PIN_QUOTE_EXPIRED'; end if;
  select s.price into v_price from public.product_skus s join public.products p on p.id=s.product_id join public.categories c on c.id=p.category_id
    where s.id=p_sku and p.id=p_product and s.status='active' and p.status='active' and c.is_active is true;
  if v_price is null or v_price<=0 or v_price<>round(v_price,2) or v_price<>(p_evidence->>'salePriceCny')::numeric then raise exception 'BITREFILL_PIN_PRICE_CHANGED'; end if;
  v_cost := (p_evidence->>'allInUsd')::numeric; v_rate := (p_evidence->>'fxRate')::numeric; v_fees := (p_evidence->>'cnyFees')::numeric;
  if v_cost<=0 or v_rate<=0 or v_cost>a.max_unit_cost_usd or v_cost*v_rate+v_fees>v_price*0.85 or
     v_price-v_cost*v_rate-v_fees<a.min_profit_cny or
     v_cost+(p_evidence->>'reservedUsd')::numeric>(p_evidence->>'availableUsd')::numeric or
     v_cost+(p_evidence->>'reservedUsd')::numeric+(p_evidence->>'spentUsd')::numeric>a.cumulative_cap_usd then raise exception 'BITREFILL_PIN_COST_MARGIN_BUDGET_BLOCKED'; end if;
  v_binding := jsonb_build_object('fulfillment_source','supplier','supplier','bitrefill','supplier_product_id',a.supplier_product_id,
    'supplier_sku',a.package_id,'supplier_currency',a.face_currency,'supplier_face_value',a.face_value::text,'supplier_country',a.country,
    'supplier_cost_currency','USD','supplier_delivery_kind','pin','supplier_max_unit_cost',a.max_unit_cost_usd::text,
    'supplier_min_unit_profit',a.min_profit_cny::text,'supplier_binding_version',a.binding_version,'pin_order_entry_version',2);
  v_binding:=v_binding||jsonb_build_object('pin_account_fingerprint',a.account_fingerprint,'pin_authorization_reference',a.permission_reference,
    'pin_funding_reference',a.funding_reference,'pin_cumulative_cap_usd',a.cumulative_cap_usd::text);
  insert into bitrefill_pin_private.order_quotes(user_id,client_request_id,product_id,sku_id,sale_price_cny,evidence,binding,expires_at)
    values(p_user,p_request,p_product,p_sku,v_price,p_evidence,v_binding,v_expiry)
    on conflict(user_id,client_request_id) do update set sale_price_cny=excluded.sale_price_cny,evidence=excluded.evidence,
      binding=excluded.binding,expires_at=excluded.expires_at
    where bitrefill_pin_private.order_quotes.order_id is null returning * into q;
  return jsonb_build_object('quote_id',q.id,'replay',false);
end $f$;

create function bitrefill_pin_private.consume_quote(p_user uuid,p_request text,p_product uuid,p_sku uuid,p_quantity integer,p_price numeric)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $f$
declare q bitrefill_pin_private.order_quotes%rowtype; a bitrefill_pin_private.sale_authorizations%rowtype;
begin
  if auth.uid() is distinct from p_user or p_user is null or p_quantity<>1 then raise exception 'BITREFILL_PIN_ORDER_SCOPE_INVALID'; end if;
  select * into a from bitrefill_pin_private.sale_authorizations where sku_id=p_sku and product_id=p_product for share;
  if not found or not a.enabled or nullif(btrim(a.permission_reference),'') is null or nullif(btrim(a.funding_reference),'') is null or
     a.account_fingerprint is null or a.max_unit_cost_usd is null or a.min_profit_cny is null or a.cumulative_cap_usd is null then
    raise exception 'BITREFILL_PIN_SALE_CLOSED';
  end if;
  select * into q from bitrefill_pin_private.order_quotes where user_id=p_user and client_request_id=p_request for update;
  if not found or q.order_id is not null or q.consumed_at is not null or q.expires_at<=now() or q.product_id<>p_product or q.sku_id<>p_sku or
    q.sale_price_cny is distinct from p_price or q.binding->>'supplier_binding_version' is distinct from a.binding_version::text or
    q.evidence->>'accountFingerprint' is distinct from a.account_fingerprint or
    q.binding->>'pin_authorization_reference' is distinct from a.permission_reference or
    q.binding->>'pin_funding_reference' is distinct from a.funding_reference then raise exception 'BITREFILL_PIN_ORDER_QUOTE_REQUIRED'; end if;
  if (q.binding->>'supplier_max_unit_cost')::numeric>a.max_unit_cost_usd or
     (q.binding->>'supplier_min_unit_profit')::numeric<a.min_profit_cny or
     (q.evidence->>'allInUsd')::numeric+(q.evidence->>'reservedUsd')::numeric+(q.evidence->>'spentUsd')::numeric>a.cumulative_cap_usd then
    raise exception 'BITREFILL_PIN_AUTHORIZATION_CHANGED';
  end if;
  update bitrefill_pin_private.order_quotes set consumed_at=now() where id=q.id;
  -- Public snapshot contains identities only. Costs/caps/evidence stay private.
  return jsonb_build_object('quote_id',q.id,'expires_at',q.expires_at,'binding',
    (q.binding-'supplier_max_unit_cost'-'supplier_min_unit_profit'-'pin_account_fingerprint'-'pin_authorization_reference'-'pin_funding_reference'-'pin_cumulative_cap_usd')||jsonb_build_object('pin_quote_id',q.id));
end $f$;

create function bitrefill_pin_private.attach_quote(p_quote uuid,p_order uuid)
returns void language plpgsql security invoker set search_path=pg_catalog as $f$
begin
  update bitrefill_pin_private.order_quotes q set order_id=p_order where q.id=p_quote and q.order_id is null and q.consumed_at is not null
    and q.user_id=auth.uid() and exists(select 1 from public.orders o where o.id=p_order and o.user_id=q.user_id);
  if not found then raise exception 'BITREFILL_PIN_ORDER_QUOTE_ATTACH_FAILED'; end if;
end $f$;

create function bitrefill_pin_private.replay_guard(p_order uuid,p_product uuid,p_sku uuid,p_quantity integer)
returns void language plpgsql security invoker set search_path=pg_catalog as $f$
begin
  if exists(select 1 from public.order_items i where i.order_id=p_order and i.product_snapshot->'supplier_binding'->>'supplier'='bitrefill') or
     exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.sku_id=p_sku) then
    if (select count(*) from public.order_items where order_id=p_order)<>1 or not exists(select 1 from public.order_items i where
      i.order_id=p_order and i.product_id=p_product and i.sku_id=p_sku and i.quantity=p_quantity and i.product_snapshot->'supplier_binding'->>'supplier'='bitrefill') then
      raise exception 'BITREFILL_PIN_REQUEST_CONFLICT';
    end if;
  end if;
end $f$;

create function bitrefill_pin_private.read_order_binding(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $f$
declare v_binding jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'BITREFILL_PIN_SERVICE_REQUIRED'; end if;
  select q.binding||jsonb_build_object('pin_quote_id',q.id) into v_binding from public.order_items i join bitrefill_pin_private.order_quotes q on q.order_id=i.order_id and
    q.product_id=i.product_id and q.sku_id=i.sku_id and q.id::text=i.product_snapshot->'supplier_binding'->>'pin_quote_id' where i.id=p_item;
  if v_binding is null then raise exception 'BITREFILL_PIN_PRIVATE_BINDING_MISSING'; end if;
  return v_binding;
end $f$;

revoke all on all functions in schema bitrefill_pin_private from public,anon,authenticated,service_role;
grant execute on function bitrefill_pin_private.entry_status(uuid,text,uuid,uuid),bitrefill_pin_private.authorize_quote(uuid,text,uuid,uuid,jsonb),bitrefill_pin_private.read_order_binding(uuid) to service_role;
create function public.internal_bitrefill_pin_entry_status(p_user uuid,p_request text,p_product uuid,p_sku uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$ select bitrefill_pin_private.entry_status(p_user,p_request,p_product,p_sku) $f$;
create function public.internal_bitrefill_pin_authorize_quote(p_user uuid,p_request text,p_product uuid,p_sku uuid,p_evidence jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$ select bitrefill_pin_private.authorize_quote(p_user,p_request,p_product,p_sku,p_evidence) $f$;
create function public.internal_bitrefill_pin_read_order_binding(p_order_item_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$ select bitrefill_pin_private.read_order_binding(p_order_item_id) $f$;
revoke all on function public.internal_bitrefill_pin_entry_status(uuid,text,uuid,uuid),public.internal_bitrefill_pin_authorize_quote(uuid,text,uuid,uuid,jsonb),public.internal_bitrefill_pin_read_order_binding(uuid) from public,anon,authenticated;
grant execute on function public.internal_bitrefill_pin_entry_status(uuid,text,uuid,uuid),public.internal_bitrefill_pin_authorize_quote(uuid,text,uuid,uuid,jsonb),public.internal_bitrefill_pin_read_order_binding(uuid) to service_role;

-- Add only four anchored hooks. Daju supplier detection, frozen JSON and all
-- payment/idempotency/inventory statements otherwise remain byte-identical.
do $patch$
declare old text; new text; anchor text;
begin
  old:=replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\r',''); new:=old;
  new:=replace(new,'  v_has_active_skus boolean := false;','  v_has_active_skus boolean := false;'||E'\n  v_bitrefill_gate jsonb := null;');
  anchor:=E'  if not v_auto_delivery and v_stock < v_quantity then';
  new:=replace(new,anchor,$hook$
  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and
     not exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.sku_id=p_sku_id and a.product_id=p_product_id) then
    raise exception 'BITREFILL_PIN_EXACT_SKU_REQUIRED';
  end if;
  if p_sku_id is not null and exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.sku_id=p_sku_id and a.product_id=p_product_id) then
    if not v_auto_delivery or v_supplier_delivery then raise exception 'BITREFILL_PIN_BINDING_CONFLICT'; end if;
    v_bitrefill_gate := bitrefill_pin_private.consume_quote(v_user_id,v_request_id,p_product_id,p_sku_id,v_quantity,v_unit_price);
    v_supplier_delivery := true;
  end if;
$hook$||anchor);
  new:=replace(new,'      ''supplier_binding'', case when v_supplier_delivery then jsonb_build_object(',
    '      ''supplier_binding'', case when v_bitrefill_gate is not null then v_bitrefill_gate->''binding'' when v_supplier_delivery then jsonb_build_object(');
  anchor:=E'  ) returning id into v_order_item_id;';
  new:=replace(new,anchor,anchor||$hook$
  if v_bitrefill_gate is not null then
    perform bitrefill_pin_private.attach_quote((v_bitrefill_gate->>'quote_id')::uuid,v_order_id);
    update public.orders set payment_expires_at=least(payment_expires_at,(v_bitrefill_gate->>'expires_at')::timestamptz) where id=v_order_id;
  end if;
$hook$);
  -- Guard both idempotent return sites, without repricing or touching Daju.
  new:=replace(new,E'    if found then\n      return query',E'    if found then\n      perform bitrefill_pin_private.replay_guard(v_existing_order.id,p_product_id,p_sku_id,v_quantity);\n      return query');
  new:=replace(new,E'        if found then\n          return query',E'        if found then\n          perform bitrefill_pin_private.replay_guard(v_existing_order.id,p_product_id,p_sku_id,v_quantity);\n          return query');
  if new=old or strpos(new,'v_bitrefill_gate jsonb')=0 or strpos(new,'bitrefill_pin_private.consume_quote')=0 or
     strpos(new,'then v_bitrefill_gate->''binding''')=0 or strpos(new,'bitrefill_pin_private.attach_quote')=0 or
     (length(new)-length(replace(new,'perform bitrefill_pin_private.replay_guard','')))/length('perform bitrefill_pin_private.replay_guard')<>2 then raise exception 'BITREFILL_PIN_PATCH_ANCHOR_MISSING'; end if;
  execute new;
end $patch$;
commit;
