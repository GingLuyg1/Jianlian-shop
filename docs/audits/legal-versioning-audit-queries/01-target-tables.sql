-- Query 01: target legal-versioning tables.
with expected(schema_name, table_name) as (
  values
    ('public', 'legal_documents'),
    ('public', 'order_agreement_acceptances'),
    ('public', 'order_evidence_events')
)
select
  '01-target-tables'::text as query_id,
  e.schema_name,
  e.table_name,
  (c.oid is not null) as object_exists,
  case c.relkind
    when 'r' then 'ordinary table'
    when 'p' then 'partitioned table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    when 'f' then 'foreign table'
    when null then null
    else c.relkind::text
  end as table_type,
  c.oid
from expected e
left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
left join pg_catalog.pg_class c
  on c.relnamespace = n.oid
 and c.relname = e.table_name
order by e.schema_name, e.table_name;
