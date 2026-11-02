-- READ ONLY; run only after the separately authorized exact migration.
-- No quote evidence, private caps, customer identity or secrets are printed.
select md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\r','')) as patched_function_md5,
 md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\r',''))='99d1c702abc81d0ff1a8876aa58f54d9' as patched_function_match;
select s.sku_code,a.enabled,a.binding_version,p.status as product_status,s.status as sku_status,p.stock as product_stock,s.stock as sku_stock
 from bitrefill_pin_private.sale_authorizations a join public.product_skus s on s.id=a.sku_id join public.products p on p.id=a.product_id
 order by s.sku_code;
select count(*) as quote_count from bitrefill_pin_private.order_quotes;
select c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) as owner,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_table_privilege,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_table_privilege
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='bitrefill_pin_private' and c.relkind='r';
select p.proname,p.prosecdef,pg_get_userbyid(p.proowner) as owner,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='bitrefill_pin_private' or (n.nspname='public' and p.proname in
 ('internal_bitrefill_pin_entry_status','internal_bitrefill_pin_authorize_quote','internal_bitrefill_pin_read_order_binding')) order by n.nspname,p.proname;
