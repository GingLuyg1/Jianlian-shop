-- Query 09: complete RLS policy definitions.
with rows as (
  select
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
)
select
  '09-policies'::text as query_id,
  'FOUND'::text as result_state,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from rows
union all
select
  '09-policies'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::text,
  null::name[],
  null::text,
  null::text,
  null::text
where not exists (select 1 from rows)
order by tablename nulls last, policyname nulls last;
