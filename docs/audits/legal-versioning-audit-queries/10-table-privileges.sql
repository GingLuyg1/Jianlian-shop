-- Query 10: table privileges for common Supabase roles and PUBLIC.
with rows as (
  select
    n.nspname as table_schema,
    c.relname as table_name,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname::text end as grantee,
    acl.privilege_type,
    acl.is_grantable
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'public'
    and c.relname in ('legal_documents', 'order_agreement_acceptances', 'order_evidence_events')
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
    )
)
select
  '10-table-privileges'::text as query_id,
  'FOUND'::text as result_state,
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from rows
union all
select
  '10-table-privileges'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::text,
  null::text,
  null::boolean
where not exists (select 1 from rows)
order by table_name nulls last, grantee nulls last, privilege_type nulls last;
