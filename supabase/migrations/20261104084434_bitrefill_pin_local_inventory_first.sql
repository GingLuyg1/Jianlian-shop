-- Only the existing PIN hook changes. No data, role, ACL or purchase-gate writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $patch$
declare old text; new text; anchor text; replacement text;
begin
  if current_user <> 'postgres' then raise exception 'PIN_LOCAL_MIGRATION_OWNER_REQUIRED'; end if;
  if (select md5(prosrc) from pg_proc where oid='public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure)
    <> '1db3711b52a672032e4402c9e762428d' then raise exception 'PIN_LOCAL_BASELINE_DRIFT'; end if;
  old:=replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\r','');
  anchor:=$old$    v_bitrefill_gate := bitrefill_pin_private.consume_quote(v_user_id,v_request_id,p_product_id,p_sku_id,v_quantity,v_unit_price);
    v_supplier_delivery := true;$old$;
  replacement:=$new$    -- Existing exact-SKU local reservation path remains authoritative.
    -- Never convert real local inventory into a supplier order or budget hold.
    -- Missing supplier metadata yields SQL NULL in the legacy Daju predicate.
    -- Normalize only inside this PIN hook, or NOT NULL skips local reservation.
    v_supplier_delivery := coalesce(v_supplier_delivery,false);
    if (select count(*) from public.digital_inventory di
        where di.product_id=p_product_id and di.sku_id=p_sku_id
          and di.status='available' and (di.expires_at is null or di.expires_at>now())) < v_quantity then
      v_bitrefill_gate := bitrefill_pin_private.consume_quote(v_user_id,v_request_id,p_product_id,p_sku_id,v_quantity,v_unit_price);
      v_supplier_delivery := true;
    end if;$new$;
  if (length(old)-length(replace(old,anchor,'')))/length(anchor) <> 1 then raise exception 'PIN_LOCAL_ANCHOR_DRIFT'; end if;
  new:=replace(old,anchor,replacement);
  execute new;
end $patch$;
create or replace function bitrefill_pin_private.replay_guard(p_order uuid,p_product uuid,p_sku uuid,p_quantity integer)
returns void language plpgsql security invoker set search_path=pg_catalog as $f$
begin
  if exists(select 1 from public.order_items i where i.order_id=p_order and i.product_snapshot->'supplier_binding'->>'supplier'='bitrefill') or
     exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.sku_id=p_sku) then
    if (select count(*) from public.order_items where order_id=p_order)<>1 or not exists(select 1 from public.order_items i where
      i.order_id=p_order and i.product_id=p_product and i.sku_id=p_sku and i.quantity=p_quantity
      and (i.product_snapshot->'supplier_binding'->>'supplier'='bitrefill'
        or coalesce(i.product_snapshot->'supplier_binding'->>'supplier','')='')) then
      raise exception 'BITREFILL_PIN_REQUEST_CONFLICT';
    end if;
  end if;
end $f$;
commit;
