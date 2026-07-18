-- Query 07: all indexes and partial-index predicates.
with rows as (
  select
    ns.nspname as schema_name,
    tbl.relname as table_name,
    idx.relname as index_name,
    i.indisprimary as is_primary,
    i.indisunique as is_unique,
    i.indisvalid as is_valid,
    pg_catalog.pg_get_indexdef(i.indexrelid) as index_definition,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate
  from pg_catalog.pg_index i
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  where ns.nspname = 'public'
    and tbl.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
)
select
  '07-indexes'::text as query_id,
  'FOUND'::text as result_state,
  schema_name,
  table_name,
  index_name,
  is_primary,
  is_unique,
  is_valid,
  index_definition,
  predicate
from rows
union all
select
  '07-indexes'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::boolean,
  null::boolean,
  null::boolean,
  null::text,
  null::text
where not exists (select 1 from rows)
order by table_name nulls last, index_name nulls last;
