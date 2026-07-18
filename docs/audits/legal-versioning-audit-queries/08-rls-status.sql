-- Query 08: RLS status and owner for every expected target table.
with expected(table_name) as (
  values ('legal_documents'), ('order_agreement_acceptances'), ('order_evidence_events')
)
select
  '08-rls-status'::text as query_id,
  'public'::text as schema_name,
  e.table_name,
  (c.oid is not null) as table_exists,
  pg_catalog.pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from expected e
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c
  on c.relnamespace = n.oid
 and c.relname = e.table_name
order by e.table_name;
