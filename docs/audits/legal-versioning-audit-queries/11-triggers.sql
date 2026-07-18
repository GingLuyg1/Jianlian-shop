-- Query 11: non-internal triggers on the legal-versioning tables.
with rows as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    t.tgname as trigger_name,
    t.tgenabled as trigger_enabled,
    pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_definition
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
    and not t.tgisinternal
)
select
  '11-triggers'::text as query_id,
  'FOUND'::text as result_state,
  schema_name,
  table_name,
  trigger_name,
  trigger_enabled,
  trigger_definition
from rows
union all
select
  '11-triggers'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::char,
  null::text
where not exists (select 1 from rows)
order by table_name nulls last, trigger_name nulls last;
