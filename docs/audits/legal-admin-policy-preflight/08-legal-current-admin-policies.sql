-- Query 08: current public.legal_documents policy definitions.
with rows as (
  select
    p.schemaname,
    p.tablename,
    p.policyname,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,
    p.with_check
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'legal_documents'
)
select
  '08-legal-current-admin-policies'::text as query_id,
  'FOUND'::text as result_state,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from rows
union all
select
  '08-legal-current-admin-policies'::text,
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
order by policyname nulls last;
