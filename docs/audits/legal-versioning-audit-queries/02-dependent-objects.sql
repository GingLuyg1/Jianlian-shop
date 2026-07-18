-- Query 02: baseline table and UUID-function dependencies.
with expected_tables(schema_name, object_name) as (
  values
    ('public', 'orders'),
    ('public', 'profiles'),
    ('auth', 'users')
), table_results as (
  select
    'table'::text as object_kind,
    e.schema_name,
    e.object_name,
    (c.oid is not null) as object_exists,
    case c.relkind
      when 'r' then 'ordinary table'
      when 'p' then 'partitioned table'
      when 'v' then 'view'
      when 'm' then 'materialized view'
      when 'f' then 'foreign table'
      when null then null
      else c.relkind::text
    end as object_type,
    null::text as owning_extension
  from expected_tables e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = e.object_name
), function_result as (
  select
    'function'::text as object_kind,
    coalesce(min(n.nspname), 'pg_catalog')::text as schema_name,
    'gen_random_uuid()'::text as object_name,
    (count(p.oid) > 0) as object_exists,
    min(pg_catalog.pg_get_function_result(p.oid))::text as object_type,
    min(e.extname)::text as owning_extension
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  left join pg_catalog.pg_depend d
    on d.classid = 'pg_catalog.pg_proc'::regclass
   and d.objid = p.oid
   and d.deptype = 'e'
  left join pg_catalog.pg_extension e on e.oid = d.refobjid
  where p.proname = 'gen_random_uuid'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
)
select
  '02-dependent-objects'::text as query_id,
  object_kind,
  schema_name,
  object_name,
  object_exists,
  object_type,
  owning_extension
from table_results
union all
select
  '02-dependent-objects'::text,
  object_kind,
  schema_name,
  object_name,
  object_exists,
  object_type,
  owning_extension
from function_result
order by object_kind, schema_name, object_name;
