-- Query 05: foreign-key definitions and referential action rules.
with rows as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    con.conname as constraint_name,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_definition,
    case con.confupdtype
      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
      when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else null
    end as update_rule,
    case con.confdeltype
      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
      when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else null
    end as delete_rule,
    con.convalidated as is_validated
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
    and con.contype = 'f'
)
select
  '05-foreign-keys'::text as query_id,
  'FOUND'::text as result_state,
  schema_name,
  table_name,
  constraint_name,
  constraint_definition,
  update_rule,
  delete_rule,
  is_validated
from rows
union all
select
  '05-foreign-keys'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::text,
  null::text,
  null::text,
  null::boolean
where not exists (select 1 from rows)
order by table_name nulls last, constraint_name nulls last;
