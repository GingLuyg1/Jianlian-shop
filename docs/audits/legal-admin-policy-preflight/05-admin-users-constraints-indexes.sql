-- Query 05: public.admin_users constraints and indexes in one export-friendly result.
with constraint_rows as (
  select
    'CONSTRAINT'::text as object_kind,
    con.conname::text as object_name,
    case con.contype
      when 'p' then 'PRIMARY KEY'
      when 'u' then 'UNIQUE'
      when 'f' then 'FOREIGN KEY'
      when 'c' then 'CHECK'
      when 'x' then 'EXCLUSION'
      else con.contype::text
    end as object_type,
    pg_catalog.pg_get_constraintdef(con.oid, true) as object_definition,
    null::boolean as is_primary,
    (con.contype in ('p', 'u')) as is_unique,
    con.convalidated as is_valid,
    null::text as predicate
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'admin_users'
), index_rows as (
  select
    'INDEX'::text as object_kind,
    idx.relname::text as object_name,
    'INDEX'::text as object_type,
    pg_catalog.pg_get_indexdef(i.indexrelid) as object_definition,
    i.indisprimary as is_primary,
    i.indisunique as is_unique,
    i.indisvalid as is_valid,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate
  from pg_catalog.pg_index i
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  where n.nspname = 'public'
    and tbl.relname = 'admin_users'
), rows as (
  select * from constraint_rows
  union all
  select * from index_rows
)
select
  '05-admin-users-constraints-indexes'::text as query_id,
  'FOUND'::text as result_state,
  object_kind,
  object_name,
  object_type,
  object_definition,
  is_primary,
  is_unique,
  is_valid,
  predicate
from rows
union all
select
  '05-admin-users-constraints-indexes'::text,
  'NO_ROWS'::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::boolean,
  null::boolean,
  null::text
where not exists (select 1 from rows)
order by object_kind nulls last, object_name nulls last;
