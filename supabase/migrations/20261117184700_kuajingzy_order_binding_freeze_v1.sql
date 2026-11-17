-- Candidate only. No Production execution without separate authorization.
-- Body-only extension: no tables, columns, RPC signature or payment algorithm changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $freeze$
declare v_oid oid; v_old text; v_new text;
begin
 v_oid:=to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)');
 if v_oid is null then raise exception 'KUAJINGZY_FREEZE_SIGNATURE_MISSING'; end if;
 select replace(pg_get_functiondef(v_oid),E'\r\n',E'\n') into v_old;
 if encode(sha256(convert_to(v_old,'UTF8')),'hex')='4d677e51c6ce8a3e34b9ce7a976bca574bdc10256d7c68696cb0f090318fa0cd' then return; end if;
 if encode(sha256(convert_to(v_old,'UTF8')),'hex')<>'43790e5f7c4de47508de9952df4e9bf036f38e05ba03abe1e28720a8701dfc89' then raise exception 'KUAJINGZY_FREEZE_SOURCE_DRIFT'; end if;
 if position('bitrefill_pin_private.consume_quote(' in v_old)=0 then raise exception 'KUAJINGZY_FREEZE_EXISTING_HOOK_MISSING'; end if;
 if position('bitrefill_pin_private.attach_quote(' in v_old)=0 then raise exception 'KUAJINGZY_FREEZE_EXISTING_HOOK_MISSING'; end if;
 if position('bitrefill_pin_private.replay_guard(' in v_old)=0 then raise exception 'KUAJINGZY_FREEZE_EXISTING_HOOK_MISSING'; end if;
 if position('= ''daju'';' in v_old)=0 then raise exception 'KUAJINGZY_FREEZE_EXISTING_HOOK_MISSING'; end if;
 if (length(v_old)-length(replace(v_old,'  v_bitrefill_gate jsonb := null;','')))/length('  v_bitrefill_gate jsonb := null;')<>1 then raise exception 'KUAJINGZY_FREEZE_ANCHOR_DRIFT'; end if;
 if (length(v_old)-length(replace(v_old,'  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and','')))/length('  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and')<>1 then raise exception 'KUAJINGZY_FREEZE_ANCHOR_DRIFT'; end if;
 if (length(v_old)-length(replace(v_old,'''supplier_binding'', case when v_bitrefill_gate is not null then','')))/length('''supplier_binding'', case when v_bitrefill_gate is not null then')<>1 then raise exception 'KUAJINGZY_FREEZE_ANCHOR_DRIFT'; end if;
 v_new:=replace(v_old,'  v_bitrefill_gate jsonb := null;','  v_bitrefill_gate jsonb := null;
  v_kuajingzy_binding jsonb := null;
  v_kj_metadata jsonb;');
 v_new:=replace(v_new,'  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and',$kj_hook$  -- KuajingZY V1: trusted DB rows only. Never client-supplied binding fields.
  if p_sku_id is null then
    v_kj_metadata := coalesce(v_product.metadata,'{}'::jsonb);
  else
    v_kj_metadata := jsonb_build_object(
      'fulfillment_source',coalesce(v_sku.metadata->>'fulfillment_source',v_product.metadata->>'fulfillment_source'),
      'supplier',coalesce(v_sku.metadata->>'supplier',v_product.metadata->>'supplier'),
      'supplier_product_id',coalesce(v_sku.metadata->'supplier_product_id',v_product.metadata->'supplier_product_id'),
      'supplier_sku',coalesce(v_sku.metadata->'supplier_sku',v_product.metadata->'supplier_sku'),
      'supplier_currency',coalesce(v_sku.metadata->'supplier_currency',v_product.metadata->'supplier_currency'),
      'supplier_max_unit_cost',coalesce(v_sku.metadata->'supplier_max_unit_cost',v_product.metadata->'supplier_max_unit_cost'),
      'supplier_min_unit_profit',coalesce(v_sku.metadata->'supplier_min_unit_profit',v_product.metadata->'supplier_min_unit_profit'),
      'supplier_min_margin_bps',coalesce(v_sku.metadata->'supplier_min_margin_bps',v_product.metadata->'supplier_min_margin_bps'),
      'supplier_auto_purchase_enabled',coalesce(v_sku.metadata->'supplier_auto_purchase_enabled',v_product.metadata->'supplier_auto_purchase_enabled'));
  end if;
  if v_kj_metadata->>'supplier' = 'kuajingzy' then
    if p_sku_id is null then raise exception 'KUAJINGZY_BINDING_INCOMPLETE'; end if;
    if not coalesce(p_sku_id is not null and v_sku.id=p_sku_id and v_sku.product_id=v_product.id
      and v_auto_delivery and v_kj_metadata->>'fulfillment_source'='supplier'
      and jsonb_typeof(v_kj_metadata->'supplier_product_id')='string'
      and v_kj_metadata->>'supplier_product_id' ~ '^[A-Za-z0-9_-]{1,120}$'
      and (coalesce(v_sku.metadata,'{}'::jsonb) ? 'supplier_sku' or coalesce(v_product.metadata,'{}'::jsonb) ? 'supplier_sku')
      and (v_kj_metadata->'supplier_sku'='null'::jsonb or
        (jsonb_typeof(v_kj_metadata->'supplier_sku')='string' and v_kj_metadata->>'supplier_sku' ~ '^[A-Za-z0-9_-]{1,80}$'))
      and v_kj_metadata->>'supplier_currency'='CNY'
      and jsonb_typeof(v_kj_metadata->'supplier_max_unit_cost') in ('string','number')
      and v_kj_metadata->>'supplier_max_unit_cost' ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,4})?$'
      and jsonb_typeof(v_kj_metadata->'supplier_min_unit_profit') in ('string','number')
      and v_kj_metadata->>'supplier_min_unit_profit' ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,4})?$'
      and jsonb_typeof(v_kj_metadata->'supplier_min_margin_bps')='number'
      and v_kj_metadata->>'supplier_min_margin_bps' ~ '^(0|[1-9][0-9]{0,3})$'
      and jsonb_typeof(v_kj_metadata->'supplier_auto_purchase_enabled')='boolean',false) then
      raise exception 'KUAJINGZY_BINDING_INCOMPLETE';
    end if;
    if (v_kj_metadata->>'supplier_max_unit_cost')::numeric<=0 or (v_kj_metadata->>'supplier_min_unit_profit')::numeric<=0 then
      raise exception 'KUAJINGZY_BINDING_INCOMPLETE';
    end if;
    v_kuajingzy_binding := jsonb_build_object(
      'fulfillment_source','supplier','supplier','kuajingzy',
      'website_product_id',v_product.id,'website_sku_id',v_sku.id,
      'supplier_product_id',v_kj_metadata->>'supplier_product_id','supplier_sku',v_kj_metadata->'supplier_sku','supplier_currency','CNY',
      'supplier_max_unit_cost',v_kj_metadata->>'supplier_max_unit_cost',
      'supplier_min_unit_profit',v_kj_metadata->>'supplier_min_unit_profit',
      'supplier_min_margin_bps',(v_kj_metadata->>'supplier_min_margin_bps')::integer,
      'supplier_auto_purchase_enabled',v_kj_metadata->'supplier_auto_purchase_enabled');
    v_supplier_delivery := true;
  end if;

  if exists(select 1 from bitrefill_pin_private.sale_authorizations a where a.product_id=p_product_id) and$kj_hook$);
 v_new:=replace(v_new,'''supplier_binding'', case when v_bitrefill_gate is not null then','''supplier_binding'', case when v_kuajingzy_binding is not null then v_kuajingzy_binding when v_bitrefill_gate is not null then');
 if encode(sha256(convert_to(v_new,'UTF8')),'hex')<>'4d677e51c6ce8a3e34b9ce7a976bca574bdc10256d7c68696cb0f090318fa0cd' then raise exception 'KUAJINGZY_FREEZE_PATCH_DRIFT'; end if;
 execute v_new;
 select replace(pg_get_functiondef(v_oid),E'\r\n',E'\n') into v_old;
 if encode(sha256(convert_to(v_old,'UTF8')),'hex')<>'4d677e51c6ce8a3e34b9ce7a976bca574bdc10256d7c68696cb0f090318fa0cd' then raise exception 'KUAJINGZY_FREEZE_POSTCHECK_FAILED'; end if;
end
$freeze$;
commit;
