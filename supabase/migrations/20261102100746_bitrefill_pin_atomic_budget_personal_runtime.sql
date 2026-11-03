-- Forward-only candidate: developed, NOT applied to Production.
begin;
set local lock_timeout='3s';
alter table bitrefill_pin_private.sale_authorizations
  add column auth_mode text not null default 'business' check(auth_mode in ('personal','business'));
-- Extend, rather than replace, the reviewed V2 quote issuer. Freeze auth mode
-- alongside the existing private account binding; historical quotes stay business.
do $patch$
declare old text; changed text; anchor text;
begin
  old:=pg_get_functiondef('bitrefill_pin_private.authorize_quote(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  anchor:='  select * into q from bitrefill_pin_private.order_quotes where user_id=p_user and client_request_id=p_request for update;';
  if strpos(old,anchor)=0 then raise exception 'BITREFILL_BUDGET_ISSUER_BASELINE_DRIFT'; end if;
  changed:=replace(old,anchor,'  if coalesce(p_evidence->>''authMode'',''business'') is distinct from a.auth_mode then raise exception ''BITREFILL_PIN_AUTH_MODE_MISMATCH''; end if;'||E'\n'||anchor);
  anchor:='v_binding:=v_binding||jsonb_build_object(''pin_account_fingerprint'',a.account_fingerprint';
  if strpos(changed,anchor)=0 then raise exception 'BITREFILL_BUDGET_BINDING_BASELINE_DRIFT'; end if;
  changed:=replace(changed,anchor,'v_binding:=v_binding||jsonb_build_object(''pin_auth_mode'',a.auth_mode,''pin_account_fingerprint'',a.account_fingerprint');
  execute changed;
end $patch$;
-- No existing authorization is enabled or rebound by this migration.
create table bitrefill_pin_private.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  logical_key text not null unique check(length(logical_key) between 1 and 190),
  sku_id uuid not null references bitrefill_pin_private.sale_authorizations(sku_id),
  supplier text not null default 'bitrefill' check(supplier='bitrefill'),
  currency text not null default 'USD' check(currency='USD'),
  auth_mode text not null check(auth_mode in ('personal','business')),
  account_fingerprint text not null check(account_fingerprint ~ '^[a-f0-9]{64}$'),
  contract_fingerprint text not null check(contract_fingerprint ~ '^[a-f0-9]{64}$'),
  amount numeric(18,6) not null check(amount>0),
  status text not null default 'RESERVED' check(status in ('RESERVED','HELD','CONSUMED','RELEASED')),
  invoice_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index bitrefill_budget_account_status_idx on bitrefill_pin_private.budget_reservations(account_fingerprint,status);
create index bitrefill_budget_sku_status_idx on bitrefill_pin_private.budget_reservations(sku_id,status);
alter table bitrefill_pin_private.budget_reservations enable row level security;
revoke all on bitrefill_pin_private.budget_reservations from public,anon,authenticated,service_role;

create function bitrefill_pin_private.reserve_budget(p_sku uuid,p_key text,p_account text,p_amount numeric,p_contract text,
  p_auth_mode text,p_available numeric,p_balance_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare a bitrefill_pin_private.sale_authorizations%rowtype; r bitrefill_pin_private.budget_reservations%rowtype;
  used numeric; held numeric; item_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'BITREFILL_BUDGET_SERVICE_REQUIRED'; end if;
  if p_sku is null or p_key is null or p_account is null or p_contract is null or p_amount is null or p_available is null or
     p_auth_mode is null or p_auth_mode not in ('personal','business') or p_balance_at is null or not isfinite(p_balance_at) or
     p_account !~ '^[a-f0-9]{64}$' or p_contract !~ '^[a-f0-9]{64}$' or p_amount<=0 or p_amount<>round(p_amount,6) or
     p_available<0 or p_available<>round(p_available,6) or p_amount::text in ('NaN','Infinity','-Infinity') or
     p_available::text in ('NaN','Infinity','-Infinity') or p_balance_at>clock_timestamp() or
     p_balance_at<clock_timestamp()-interval '60 seconds' then raise exception 'BITREFILL_BUDGET_INPUT_INVALID'; end if;
  if p_key !~ '^bitrefill:[0-9a-f-]{36}:1$' then raise exception 'BITREFILL_BUDGET_KEY_INVALID'; end if;
  item_id:=split_part(p_key,':',2)::uuid;
  -- Account lock serializes aggregate balance across ALL SKU reservations.
  perform pg_advisory_xact_lock(hashtextextended('bitrefill-budget:'||p_account,0));
  select * into a from bitrefill_pin_private.sale_authorizations where sku_id=p_sku for update;
  if not found or not a.enabled or a.account_fingerprint is distinct from p_account or a.auth_mode is distinct from p_auth_mode or
     a.sku_id not in ('eeef050f-3b56-492d-a0a2-0640e4c1355f'::uuid,'4cf72256-72ca-47b0-8dca-9904a0d70f69'::uuid,'f1333d43-8f0b-4041-a120-c980f7e58147'::uuid) or
     a.max_unit_cost_usd is null or a.cumulative_cap_usd is null or a.min_profit_cny is null or
     nullif(btrim(a.permission_reference),'') is null or nullif(btrim(a.funding_reference),'') is null or
     a.supplier_product_id<>'giff-gaff-pin-united-kingdom' or a.face_value not in (10,15,20) or
     a.package_id is distinct from 'giff-gaff-pin-united-kingdom<&>'||a.face_value::integer::text or
     a.face_currency<>'GBP' or a.country<>'GB' then raise exception 'BITREFILL_BUDGET_AUTHORIZATION_INVALID'; end if;
  if p_amount>a.max_unit_cost_usd then raise exception 'BITREFILL_BUDGET_CAP_EXCEEDED'; end if;
  if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
    join public.supplier_purchase_attempts pa on pa.logical_request_key=p_key and pa.supplier='bitrefill'
    where i.id=item_id and i.sku_id=p_sku and i.product_id=a.product_id and i.quantity=1 and o.currency='CNY' and
      o.payment_status='paid' and o.status in ('paid','processing','delivered','completed') and
      coalesce(to_jsonb(o)->>'refund_status','unknown')='none' and
      coalesce((to_jsonb(o)->>'refunded_amount')::numeric,-1)=0 and
      not exists(select 1 from public.refund_requests rr where rr.order_id=o.id and rr.status not in ('rejected','cancelled')) and
      i.product_snapshot->'supplier_binding'->>'supplier'='bitrefill' and pa.status='SUBMITTING') then
    raise exception 'BITREFILL_BUDGET_PAID_CLAIM_REQUIRED'; end if;
  select * into r from bitrefill_pin_private.budget_reservations where logical_key=p_key for update;
  if found then
    if r.sku_id<>p_sku or r.account_fingerprint<>p_account or r.auth_mode<>p_auth_mode or r.amount<>p_amount or
       r.contract_fingerprint<>p_contract or r.status<>'RESERVED' then raise exception 'BITREFILL_BUDGET_REPLAY_CONFLICT'; end if;
  else
    select coalesce(sum(amount),0) into used from bitrefill_pin_private.budget_reservations
      where sku_id=p_sku and status<>'RELEASED';
    select coalesce(sum(amount),0) into held from bitrefill_pin_private.budget_reservations
      where account_fingerprint=p_account and status in ('RESERVED','HELD');
    if p_amount>a.max_unit_cost_usd or p_amount+used>a.cumulative_cap_usd or p_amount+held>p_available then
      raise exception 'BITREFILL_BUDGET_CAP_EXCEEDED'; end if;
    insert into bitrefill_pin_private.budget_reservations(logical_key,sku_id,auth_mode,account_fingerprint,contract_fingerprint,amount)
      values(p_key,p_sku,p_auth_mode,p_account,p_contract,p_amount) returning * into r;
  end if;
  return jsonb_build_object('reserved',true,'reservationId',r.id,'logicalKey',r.logical_key,'amount',r.amount::text,
    'currency','USD','accountFingerprint',r.account_fingerprint,'contractFingerprint',r.contract_fingerprint);
end $f$;

create function bitrefill_pin_private.transition_budget(p_key text,p_account text,p_contract text,p_next text,p_invoice text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare r bitrefill_pin_private.budget_reservations%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'BITREFILL_BUDGET_SERVICE_REQUIRED'; end if;
  if p_account is null or p_contract is null or p_next is null or p_next not in ('HELD','RELEASED','CONSUMED') then
    raise exception 'BITREFILL_BUDGET_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bitrefill-budget:'||p_account,0));
  select * into r from bitrefill_pin_private.budget_reservations where logical_key=p_key for update;
  if not found or r.account_fingerprint is distinct from p_account or r.contract_fingerprint is distinct from p_contract then
    raise exception 'BITREFILL_BUDGET_IDENTITY_MISMATCH'; end if;
  if r.status=p_next then
    if p_next='CONSUMED' and r.invoice_id is distinct from p_invoice then raise exception 'BITREFILL_BUDGET_INVOICE_MISMATCH'; end if;
    return jsonb_build_object('status',r.status);
  end if;
  if not ((r.status='RESERVED' and p_next in ('HELD','RELEASED')) or (r.status='HELD' and p_next='CONSUMED')) then
    raise exception 'BITREFILL_BUDGET_UNCERTAIN_HELD'; end if;
  if p_next='CONSUMED' and (p_invoice is null or not exists(select 1 from public.supplier_purchase_attempts pa
    where pa.logical_request_key=p_key and pa.external_invoice_id=p_invoice and pa.status in ('EXTERNAL_CREATED','RECONCILING','SUCCEEDED'))) then
    raise exception 'BITREFILL_BUDGET_PERSISTED_INVOICE_REQUIRED'; end if;
  update bitrefill_pin_private.budget_reservations set status=p_next,invoice_id=p_invoice,updated_at=now() where id=r.id;
  return jsonb_build_object('status',p_next);
end $f$;
create function bitrefill_pin_private.budget_totals(p_sku uuid,p_account text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $f$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'BITREFILL_BUDGET_SERVICE_REQUIRED'; end if;
  return jsonb_build_object('reservedUsd',(select coalesce(sum(amount),0)::text from bitrefill_pin_private.budget_reservations
    where account_fingerprint=p_account and status in ('RESERVED','HELD')),'spentUsd',
    (select coalesce(sum(amount),0)::text from bitrefill_pin_private.budget_reservations where sku_id=p_sku and status='CONSUMED'));
end $f$;
revoke all on function bitrefill_pin_private.reserve_budget(uuid,text,text,numeric,text,text,numeric,timestamptz),
 bitrefill_pin_private.transition_budget(text,text,text,text,text),bitrefill_pin_private.budget_totals(uuid,text) from public,anon,authenticated,service_role;
grant execute on function bitrefill_pin_private.reserve_budget(uuid,text,text,numeric,text,text,numeric,timestamptz),
 bitrefill_pin_private.transition_budget(text,text,text,text,text),bitrefill_pin_private.budget_totals(uuid,text) to service_role;
create function public.internal_bitrefill_pin_reserve_budget(p_sku uuid,p_key text,p_account text,p_amount numeric,p_contract text,p_auth_mode text,p_available numeric,p_balance_at timestamptz)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$
 select bitrefill_pin_private.reserve_budget(p_sku,p_key,p_account,p_amount,p_contract,p_auth_mode,p_available,p_balance_at) $f$;
create function public.internal_bitrefill_pin_transition_budget(p_key text,p_account text,p_contract text,p_next text,p_invoice text default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$
 select bitrefill_pin_private.transition_budget(p_key,p_account,p_contract,p_next,p_invoice) $f$;
create function public.internal_bitrefill_pin_budget_totals(p_sku uuid,p_account text)
returns jsonb language sql security invoker set search_path=pg_catalog as $f$
 select bitrefill_pin_private.budget_totals(p_sku,p_account) $f$;
revoke all on function public.internal_bitrefill_pin_reserve_budget(uuid,text,text,numeric,text,text,numeric,timestamptz),
 public.internal_bitrefill_pin_transition_budget(text,text,text,text,text),public.internal_bitrefill_pin_budget_totals(uuid,text) from public,anon,authenticated;
grant execute on function public.internal_bitrefill_pin_reserve_budget(uuid,text,text,numeric,text,text,numeric,timestamptz),
 public.internal_bitrefill_pin_transition_budget(text,text,text,text,text),public.internal_bitrefill_pin_budget_totals(uuid,text) to service_role;
commit;
