-- Query 04: primary-key and unique constraints.
with rows as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    con.conname as constraint_name,
    case con.contype when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE' end as constraint_type,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_definition,
    con.convalidated as is_validated
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
    and con.contype in ('p', 'u')
)
select
  '04-primary-unique-constraints'::text as query_id,
  'FOUND'::text as result_state,
  schema_name,
  table_name,
  constraint_name,
  constraint_type,
  constraint_definition,
  is_validated
from rows
union all
select
  '04-primary-unique-constraints'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::text,
  null::text,
  null::boolean
where not exists (select 1 from rows)
order by table_name nulls last, constraint_type nulls last, constraint_name nulls last;
