-- P3 supplemental SELECT-only parity: frozen v1 does not include tgenabled.
-- Local rehearsal only this round; Production requires separate DB8 approval.
select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
  t.tgenabled::text as enabled_mode
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
  and (t.tgname in ('order_deliveries_set_updated_at',
    'supplier_fulfillment_requests_set_updated_at', 'supplier_purchase_attempt_item_guard',
    'supplier_purchase_attempt_update_guard', 'supplier_external_order_guard'))
order by n.nspname,c.relname,t.tgname;
