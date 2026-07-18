-- Query 04: all public.admin_users columns, including actual role/status/is_active fields if present.
with rows as (
  select
    c.table_schema,
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.udt_schema,
    c.udt_name,
    c.is_nullable,
    c.column_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'admin_users'
)
select
  '04-admin-users-columns'::text as query_id,
  'FOUND'::text as result_state,
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
from rows
union all
select
  '04-admin-users-columns'::text,
  'NO_ROWS'::text,
  null::text,
  null::text,
  null::integer,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text
where not exists (select 1 from rows)
order by ordinal_position nulls last;
