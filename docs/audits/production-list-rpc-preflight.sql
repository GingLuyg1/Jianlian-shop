-- Production list RPC preflight (read-only metadata audit).
--
-- Target project (confirm manually in Supabase Dashboard before every query):
-- - Project name: Jianlian-shop
-- - Project ref: qvbovrvybirscaurwuov
--
-- Safety:
-- - Every numbered block is a standalone system-metadata SELECT.
-- - Run one block at a time and retain its result before any Migration is authorized.
-- - Do not click Run all and do not modify these queries in the SQL Editor.
-- - Stop if the project identity is not exact or any expected result is false/missing.
-- - This file does not read order, payment, address, TxHash, inventory, or user data.

-- 1. Confirm the exact target function signature is still absent.
-- Expected before rollout: exact_signature_absent = true and exact_signature_count = 0.
select
  count(*) filter (
    where p.pronargs = 1
      and p.proargtypes = '23'::pg_catalog.oidvector
  ) as exact_signature_count,
  count(*) filter (
    where p.pronargs = 1
      and p.proargtypes = '23'::pg_catalog.oidvector
  ) = 0 as exact_signature_absent,
  count(*) as all_same_name_overload_count
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'list_expirable_unpaid_orders';

-- 2. Confirm both dependency tables still exist as ordinary or partitioned tables.
-- Expected: one row per table with table_exists = true.
with expected(table_name) as (
  values ('orders'::text), ('chain_payment_sessions'::text)
)
select
  'public'::text as schema_name,
  e.table_name,
  c.relkind,
  c.oid is not null and c.relkind in ('r', 'p') as table_exists
from expected e
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c
  on c.relnamespace = n.oid
 and c.relname = e.table_name
 and c.relkind in ('r', 'p')
order by e.table_name;

-- 3. Confirm every referenced column exists and its PostgreSQL type has not drifted.
-- Expected: every row has column_exists = true and type_matches = true.
with expected(table_name, column_name, expected_udt_name) as (
  values
    ('orders'::text, 'id'::text, 'uuid'::text),
    ('orders', 'created_at', 'timestamptz'),
    ('orders', 'payment_expires_at', 'timestamptz'),
    ('orders', 'reservation_released_at', 'timestamptz'),
    ('orders', 'status', 'text'),
    ('orders', 'payment_status', 'text'),
    ('chain_payment_sessions', 'order_id', 'uuid'),
    ('chain_payment_sessions', 'status', 'text'),
    ('chain_payment_sessions', 'failure_reason', 'text')
)
select
  'public'::text as schema_name,
  e.table_name,
  e.column_name,
  e.expected_udt_name,
  c.data_type as actual_data_type,
  c.udt_name as actual_udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as column_exists,
  c.udt_name = e.expected_udt_name as type_matches
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.table_name, e.column_name;

-- 4. Confirm chain_payment_sessions.status CHECK constraints still cover every status
-- referenced by the Migration. Review constraint_def as well as the boolean column.
-- Expected: every row has status_literal_present_in_check = true.
with expected_status(status_value) as (
  values
    ('confirming'::text),
    ('verified'),
    ('completing'),
    ('manual_review'),
    ('underpaid'),
    ('overpaid'),
    ('paid'),
    ('payment_failed'),
    ('submitted')
), status_checks as (
  select
    con.conname,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_def
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'chain_payment_sessions'
    and con.contype = 'c'
    and exists (
      select 1
      from pg_catalog.unnest(con.conkey) k(attnum)
      join pg_catalog.pg_attribute a
        on a.attrelid = con.conrelid
       and a.attnum = k.attnum
      where a.attname = 'status'
    )
)
select
  e.status_value,
  coalesce(
    pg_catalog.bool_or(
      pg_catalog.strpos(sc.constraint_def, pg_catalog.quote_literal(e.status_value)) > 0
    ),
    false
  ) as status_literal_present_in_check,
  pg_catalog.string_agg(sc.conname || ': ' || sc.constraint_def, E'\n' order by sc.conname) as matching_check_definitions
from expected_status e
left join status_checks sc
  on pg_catalog.strpos(sc.constraint_def, pg_catalog.quote_literal(e.status_value)) > 0
group by e.status_value
order by e.status_value;

-- 5. Confirm orders CHECK constraints still allow the lifecycle values used after
-- candidate selection: orders.status = expired and orders.payment_status = failed.
-- Expected: both rows have expected_literal_present_in_check = true; manually verify
-- each returned definition is an allowed-value CHECK rather than an exclusion.
with expected(column_name, expected_value) as (
  values
    ('status'::text, 'expired'::text),
    ('payment_status'::text, 'failed'::text)
), order_checks as (
  select
    con.conname,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_def,
    array(
      select a.attname
      from pg_catalog.unnest(con.conkey) k(attnum)
      join pg_catalog.pg_attribute a
        on a.attrelid = con.conrelid
       and a.attnum = k.attnum
      order by a.attnum
    ) as constrained_columns
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'orders'
    and con.contype = 'c'
)
select
  e.column_name,
  e.expected_value,
  coalesce(
    pg_catalog.bool_or(
      pg_catalog.strpos(oc.constraint_def, pg_catalog.quote_literal(e.expected_value)) > 0
    ),
    false
  ) as expected_literal_present_in_check,
  pg_catalog.string_agg(
    oc.conname || ': ' || oc.constraint_def,
    E'\n' order by oc.conname
  ) filter (
    where e.column_name = any(oc.constrained_columns)
  ) as relevant_check_definitions
from expected e
left join order_checks oc
  on e.column_name = any(oc.constrained_columns)
group by e.column_name, e.expected_value
order by e.column_name;
