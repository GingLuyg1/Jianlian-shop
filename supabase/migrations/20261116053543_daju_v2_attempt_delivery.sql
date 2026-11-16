begin;
set local lock_timeout = '5s';

-- The existing V1.3 attempt lock serializes allocations; retain that lock here
-- as well so a Daju attempt cannot acquire a second order-item/root.
create function public.daju_purchase_single_item_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog as $function$
declare v_supplier text;
begin
  select supplier into v_supplier from public.supplier_purchase_attempts
    where id=new.attempt_id for update;
  if v_supplier='daju' and exists (
    select 1 from public.supplier_purchase_attempt_items i where i.attempt_id=new.attempt_id
      and (i.order_item_id is distinct from new.order_item_id
        or i.fulfillment_request_id is distinct from new.fulfillment_request_id)) then
    raise exception 'DAJU_SINGLE_ORDER_ITEM_REQUIRED';
  end if;
  return new;
end
$function$;
revoke all on function public.daju_purchase_single_item_guard() from public,anon,authenticated;
create trigger daju_purchase_single_item_guard before insert on public.supplier_purchase_attempt_items
for each row execute function public.daju_purchase_single_item_guard();

create function public.internal_supplier_purchase_deliver_daju_attempt(
  p_attempt_id uuid, p_request_id text, p_attempt_token uuid,
  p_evidence_fingerprint text, p_delivery_content text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  a public.supplier_purchase_attempts;
  r public.supplier_fulfillment_requests;
  i public.order_items;
  v_root uuid;
  v_count integer;
  v_outcome jsonb;
  v_delivery uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'DAJU_SERVICE_ROLE_REQUIRED'; end if;
  if p_attempt_id is null or p_request_id is null or p_attempt_token is null
    or p_evidence_fingerprint is null or p_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_delivery_content),'') is null or octet_length(p_delivery_content)>65536 then
    raise exception 'DAJU_DELIVERY_INPUT_INVALID';
  end if;
  select * into a from public.supplier_purchase_attempts where id=p_attempt_id for update;
  if not found or a.supplier <> 'daju' or a.external_invoice_id is null
    or a.status not in ('EXTERNAL_CREATED','RECONCILING','SUCCEEDED') then
    raise exception 'DAJU_DELIVERY_ATTEMPT_INVALID';
  end if;
  select count(*), min(x.fulfillment_request_id::text)::uuid into v_count,v_root
    from public.supplier_purchase_attempt_items x where x.attempt_id=a.id;
  if v_count=0 or exists(select 1 from public.supplier_purchase_attempt_items x
    where x.attempt_id=a.id and x.fulfillment_request_id is distinct from v_root) then
    raise exception 'DAJU_SINGLE_ROOT_REQUIRED';
  end if;
  select * into r from public.supplier_fulfillment_requests where id=v_root for update;
  if not found or r.supplier <> 'daju' or r.request_id is distinct from p_request_id
    or r.request_id is distinct from a.logical_request_key
    or r.attempt_token is distinct from p_attempt_token
    or r.status not in ('PURCHASING','FULFILLED') then raise exception 'DAJU_DELIVERY_ROOT_MISMATCH'; end if;
  select * into i from public.order_items where id=r.order_item_id and order_id=r.order_id for update;
  if not found or i.quantity <> v_count or exists (
    select 1 from public.supplier_purchase_attempt_items x where x.attempt_id=a.id and (
      x.order_item_id is distinct from i.id or x.unit_index<1 or x.unit_index>i.quantity
      or x.frozen_currency<>'CNY' or x.frozen_product_id is distinct from r.supplier_product_id
      or x.frozen_package_id is distinct from r.supplier_sku)) then
    raise exception 'DAJU_DELIVERY_UNITS_MISMATCH';
  end if;
  if not exists(select 1 from public.supplier_reconciliation_evidence e
    where e.attempt_id=a.id and e.external_order_row_id is null
      and e.normalized_status='DELIVERED' and e.result_class='DAJU_AUTHORITATIVE_DELIVERED'
      and e.safe_fingerprint=p_evidence_fingerprint
      and e.checked_at >= a.submit_finished_at) then raise exception 'DAJU_DELIVERED_EVIDENCE_REQUIRED'; end if;
  if a.status='SUCCEEDED' then
    select id into v_delivery from public.order_deliveries where order_item_id=i.id
      and delivery_type='supplier_delivery' and delivery_status='delivered';
    if r.status <> 'FULFILLED' or v_delivery is null then raise exception 'DAJU_SUCCEEDED_DELIVERY_MISSING'; end if;
    return jsonb_build_object('ok',true,'idempotent',true,'delivery_id',v_delivery);
  end if;
  v_outcome := public.record_supplier_fulfillment_outcome(r.order_id,i.id,'daju',
    p_request_id,p_attempt_token,'FULFILLED',false,null,a.external_invoice_id,
    p_delivery_content,null,null,'daju_v2_reconciliation');
  if coalesce((v_outcome->>'ok')::boolean,false) is not true then raise exception 'DAJU_PRIVATE_OUTCOME_FAILED'; end if;
  select id into v_delivery from public.order_deliveries where order_item_id=i.id
    and delivery_type='supplier_delivery' and delivery_status='delivered';
  if v_delivery is null then raise exception 'DAJU_PRIVATE_DELIVERY_MISSING'; end if;
  update public.supplier_purchase_attempts set status='SUCCEEDED' where id=a.id;
  return jsonb_build_object('ok',true,'idempotent',coalesce((v_outcome->>'idempotent')::boolean,false),'delivery_id',v_delivery);
end
$function$;
revoke all on function public.internal_supplier_purchase_deliver_daju_attempt(uuid,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.internal_supplier_purchase_deliver_daju_attempt(uuid,text,uuid,text,text) to service_role;
commit;
