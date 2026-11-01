-- READ ONLY; intended target qvbovrvybirscaurwuov. No apply, repair or activation.
select current_database() as database_name,current_user as execution_role,
 current_setting('server_version') as pg_version,
 md5(replace(pg_get_functiondef('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::regprocedure),E'\r',''))='c45e1803c49709ae7480c30ac83f19a5' as original_function_match,
 to_regclass('public.supplier_purchase_attempts') is not null as db9_present,
 to_regnamespace('bitrefill_pin_private') is null as candidate_not_applied;
with expected(sku_id,product_id,sku_code) as (values
 ('eeef050f-3b56-492d-a0a2-0640e4c1355f'::uuid,'e00553bf-a2da-48c7-9bdc-9b897b18b2fd'::uuid,'BFR-GB-GIFFGAFF-GBP-010'),
 ('4cf72256-72ca-47b0-8dca-9904a0d70f69'::uuid,'5e4025b0-9a14-4827-87a2-f7f3e0e79734'::uuid,'BFR-GB-GIFFGAFF-GBP-015'),
 ('f1333d43-8f0b-4041-a120-c980f7e58147'::uuid,'b2878f67-344a-40e4-af59-b32b6db21d29'::uuid,'BFR-GB-GIFFGAFF-GBP-020'))
select e.sku_code, p.id is not null and s.id is not null as exact_existing_identity,
 p.status as product_status,s.status as sku_status,p.stock as product_stock,s.stock as sku_stock
from expected e left join public.product_skus s on s.id=e.sku_id and s.product_id=e.product_id and s.sku_code=e.sku_code
 left join public.products p on p.id=e.product_id order by e.sku_code;
