-- Candidate only. Production requires separate read-only source/ACL preflight and authorization.
-- No new tables or columns. MODEL_C capacity is independent of advisory upstream stock.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $atomic$
declare
  target oid := to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)');
  original text;
  patched text;
  original_acl aclitem[];
  original_owner oid;
  original_config text[];
begin
  if target is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if to_regclass('public.product_skus') is null or to_regclass('public.order_items') is null
    or to_regclass('public.order_deliveries') is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if exists (
    select 1 from (values
      ('orders','reservation_released_at'), ('orders','payment_status'), ('orders','status'),
      ('order_items','product_snapshot'), ('order_items','sku_id'), ('order_items','quantity'),
      ('product_skus','stock'), ('product_skus','status'), ('product_skus','updated_at'),
      ('order_deliveries','order_item_id'), ('order_deliveries','delivery_status')
    ) required(table_name,column_name)
    where not exists (select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name)
  ) then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if has_function_privilege('anon', target, 'execute')
    or not has_function_privilege('service_role', target, 'execute') then
    raise exception 'ATOMIC_CAP_ACL_PRECONDITION';
  end if;
  select replace(pg_get_functiondef(target), E'\r\n', E'\n'), proacl, proowner, proconfig
    into original, original_acl, original_owner, original_config from pg_proc where oid=target;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') = '6f7880a7eb198a3d31e65656f6a78c11bdbd1ba26c83700f42038045571d44b1' then return; end if;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') <> '4d677e51c6ce8a3e34b9ce7a976bca574bdc10256d7c68696cb0f090318fa0cd' then
    raise exception 'UNKNOWN_CREATE_ORDER_BASELINE';
  end if;
  patched := original;
  if (length(patched)-length(replace(patched,'      and s.status = ''active''
    for update;','')))/length('      and s.status = ''active''
    for update;') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'      and s.status = ''active''
    for update;','      and (s.status = ''active'' or (
        s.status = ''sold_out''
        and coalesce(s.metadata->>''supplier'', v_product.metadata->>''supplier'') = ''kuajingzy''
        and coalesce(s.metadata->>''fulfillment_source'', v_product.metadata->>''fulfillment_source'') = ''supplier''
      ))
    for update;');
  if (length(patched)-length(replace(patched,'  if v_auto_delivery then
    null;','')))/length('  if v_auto_delivery then
    null;') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'  if v_auto_delivery then
    null;','  if v_kj_metadata->>''fulfillment_source'' = ''supplier''
     and coalesce(v_kj_metadata->>''supplier'', '''') not in (''kuajingzy'',''daju'',''bitrefill'') then
    raise exception ''UNKNOWN_SUPPLIER'';
  end if;
  if v_kuajingzy_binding is not null then
    if p_sku_id is null then raise exception ''KUAJINGZY_SELLABLE_CAP_EXHAUSTED''; end if;
    update public.product_skus as s
       set stock = s.stock - v_quantity,
           status = case when s.stock - v_quantity <= 0 and s.status = ''active'' then ''sold_out'' else s.status end,
           updated_at = now()
     where s.id = p_sku_id
       and s.product_id = p_product_id
       and s.status = ''active''
       and s.stock >= v_quantity
     returning s.stock into v_stock;
    if not found then raise exception ''KUAJINGZY_SELLABLE_CAP_EXHAUSTED''; end if;
  elsif v_auto_delivery then
    null;');
  if (length(patched)-length(replace(patched,'      ''supplier_binding'', case when v_kuajingzy_binding is not null then','')))/length('      ''supplier_binding'', case when v_kuajingzy_binding is not null then') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'      ''supplier_binding'', case when v_kuajingzy_binding is not null then','      ''sellable_cap_reservation'', case when v_kuajingzy_binding is not null then
        jsonb_build_object(''version'', 1, ''model'', ''MODEL_C'', ''provider'', ''kuajingzy'',
          ''sku_id'', p_sku_id, ''quantity'', v_quantity, ''reserved'', true)
        else null end,
      ''supplier_binding'', case when v_kuajingzy_binding is not null then');
  if encode(sha256(convert_to(patched, 'UTF8')), 'hex') <> '6f7880a7eb198a3d31e65656f6a78c11bdbd1ba26c83700f42038045571d44b1' then
    raise exception 'ATOMIC_CAP_PATCH_DRIFT';
  end if;
  execute patched;
  if encode(sha256(convert_to(replace(pg_get_functiondef(target), E'\r\n', E'\n'), 'UTF8')), 'hex') <> '6f7880a7eb198a3d31e65656f6a78c11bdbd1ba26c83700f42038045571d44b1'
    or not exists (select 1 from pg_proc where oid=target and proacl is not distinct from original_acl
      and proowner=original_owner and proconfig is not distinct from original_config and prosecdef)
    or has_function_privilege('anon',target,'execute') then
    raise exception 'ATOMIC_CAP_POSTCHECK_FAILED';
  end if;
end
$atomic$;
do $atomic$
declare
  target oid := to_regprocedure('public.release_order_inventory(uuid,text)');
  original text;
  patched text;
  original_acl aclitem[];
  original_owner oid;
  original_config text[];
begin
  if target is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if to_regclass('public.product_skus') is null or to_regclass('public.order_items') is null
    or to_regclass('public.order_deliveries') is null then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if exists (
    select 1 from (values
      ('orders','reservation_released_at'), ('orders','payment_status'), ('orders','status'),
      ('order_items','product_snapshot'), ('order_items','sku_id'), ('order_items','quantity'),
      ('product_skus','stock'), ('product_skus','status'), ('product_skus','updated_at'),
      ('order_deliveries','order_item_id'), ('order_deliveries','delivery_status')
    ) required(table_name,column_name)
    where not exists (select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name)
  ) then raise exception 'ATOMIC_CAP_DEPENDENCY_MISSING'; end if;
  if has_function_privilege('anon', target, 'execute')
    or not has_function_privilege('service_role', target, 'execute') then
    raise exception 'ATOMIC_CAP_ACL_PRECONDITION';
  end if;
  select replace(pg_get_functiondef(target), E'\r\n', E'\n'), proacl, proowner, proconfig
    into original, original_acl, original_owner, original_config from pg_proc where oid=target;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') = 'd3b550d6958c4c309402eafcc3d2a13a9e6cd5508ce8e9bc7320660b36fc90d1' then return; end if;
  if encode(sha256(convert_to(original, 'UTF8')), 'hex') <> '97938ae85629c2ced978d85e3f55f529b9fde1b6ec4319c18f5873cc7dbb36da' then
    raise exception 'UNKNOWN_RELEASE_INVENTORY_BASELINE';
  end if;
  patched := original;
  if (length(patched)-length(replace(patched,'  v_released_digital integer := 0;','')))/length('  v_released_digital integer := 0;') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'  v_released_digital integer := 0;','  v_released_digital integer := 0;
  v_released_kuajingzy_cap integer := 0;');
  if (length(patched)-length(replace(patched,'  update public.product_skus s','')))/length('  update public.product_skus s') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'  update public.product_skus s','  -- Only an exact frozen reservation marker can restore MODEL_C capacity.
  with reserved as (
    select oi.sku_id, oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = p_order_id
      and v_order.payment_status in (''unpaid'',''failed'')
      and v_order.status in (''pending_payment'',''cancelled'',''expired'',''failed'')
      and oi.sku_id is not null
      and oi.quantity > 0
      and lower(coalesce(oi.delivery_type, '''')) in (''automatic'',''auto'',''card'',''account'',''auto_delivery'')
      and oi.product_snapshot->''sellable_cap_reservation'' @> jsonb_build_object(
        ''version'', 1, ''model'', ''MODEL_C'', ''provider'', ''kuajingzy'',
        ''sku_id'', oi.sku_id::text, ''quantity'', oi.quantity, ''reserved'', true)
      and not exists (
        select 1 from public.order_deliveries od
        where od.order_item_id = oi.id and od.delivery_status = ''delivered''
      )
    group by oi.sku_id, oi.product_id
  )
  update public.product_skus s
     set stock = s.stock + r.quantity,
         status = case when s.status = ''sold_out'' then ''active'' else s.status end,
         updated_at = v_now
    from reserved r
   where s.id = r.sku_id and s.product_id = r.product_id;
  get diagnostics v_released_kuajingzy_cap = row_count;

  update public.product_skus s');
  if (length(patched)-length(replace(patched,'      ''released_digital'', 0','')))/length('      ''released_digital'', 0') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'      ''released_digital'', 0','      ''released_kuajingzy_cap'', 0,
      ''released_digital'', 0');
  if (length(patched)-length(replace(patched,'    ''released_digital'', v_released_digital','')))/length('    ''released_digital'', v_released_digital') <> 1 then
    raise exception 'ATOMIC_CAP_ANCHOR_DRIFT';
  end if;
  patched := replace(patched,'    ''released_digital'', v_released_digital','    ''released_kuajingzy_cap'', v_released_kuajingzy_cap,
    ''released_digital'', v_released_digital');
  if encode(sha256(convert_to(patched, 'UTF8')), 'hex') <> 'd3b550d6958c4c309402eafcc3d2a13a9e6cd5508ce8e9bc7320660b36fc90d1' then
    raise exception 'ATOMIC_CAP_PATCH_DRIFT';
  end if;
  execute patched;
  if encode(sha256(convert_to(replace(pg_get_functiondef(target), E'\r\n', E'\n'), 'UTF8')), 'hex') <> 'd3b550d6958c4c309402eafcc3d2a13a9e6cd5508ce8e9bc7320660b36fc90d1'
    or not exists (select 1 from pg_proc where oid=target and proacl is not distinct from original_acl
      and proowner=original_owner and proconfig is not distinct from original_config and prosecdef)
    or has_function_privilege('anon',target,'execute') then
    raise exception 'ATOMIC_CAP_POSTCHECK_FAILED';
  end if;
end
$atomic$;
commit;
