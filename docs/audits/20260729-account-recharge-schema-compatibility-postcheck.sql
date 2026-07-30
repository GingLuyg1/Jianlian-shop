-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Catalog-only schema compatibility postcheck; no account recharge rows are read.

with target_columns(column_name, expected_udt_name) as (
  values
    ('client_request_id'::text, 'text'::text),
    ('completed_at'::text, 'timestamptz'::text),
    ('customer_note'::text, 'text'::text),
    ('payment_method'::text, 'text'::text),
    ('review_mode'::text, 'text'::text),
    ('review_reason'::text, 'text'::text)
),
required_statuses(status_value) as (
  values
    ('pending'::text),
    ('waiting_payment'::text),
    ('submitted'::text),
    ('reviewing'::text),
    ('approved'::text),
    ('processing'::text),
    ('succeeded'::text),
    ('failed'::text),
    ('rejected'::text),
    ('cancelled'::text),
    ('expired'::text),
    ('paid'::text),
    ('closed'::text),
    ('refunded'::text)
),
table_state as (
  select
    c.oid as table_oid,
    c.relrowsecurity as rls_enabled
  from (values (1)) seed(n)
  left join pg_catalog.pg_class c
    on c.oid = to_regclass('public.account_recharges')
),
column_state as (
  select
    t.column_name,
    t.expected_udt_name,
    a.attnum,
    typ.typname as udt_name,
    case when a.attnum is null then null else not a.attnotnull end as is_nullable
  from target_columns t
  cross join table_state s
  left join pg_catalog.pg_attribute a
    on a.attrelid = s.table_oid
   and a.attname = t.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_type typ on typ.oid = a.atttypid
),
status_column as (
  select a.attnum
  from table_state s
  join pg_catalog.pg_attribute a
    on a.attrelid = s.table_oid
   and a.attname = 'status'
   and a.attnum > 0
   and not a.attisdropped
),
status_constraint as (
  select
    c.oid as constraint_oid,
    c.conkey,
    pg_catalog.pg_get_constraintdef(c.oid, true) as constraint_definition
  from table_state s
  join pg_catalog.pg_constraint c
    on c.conrelid = s.table_oid
   and c.contype = 'c'
   and c.conname = 'account_recharges_status_check'
),
status_summary as (
  select
    exists (select 1 from status_constraint) as status_check_exists,
    exists (
      select 1
      from status_constraint c
      cross join status_column a
      where c.conkey = array[a.attnum]::smallint[]
    ) as status_check_is_single_column,
    (
      select count(*)::integer
      from required_statuses r
      where not exists (
        select 1
        from status_constraint c
        where c.constraint_definition like '%' || quote_literal(r.status_value) || '%'
      )
    ) as status_check_missing_required_value_count,
    exists (
      select 1
      from status_constraint c
      where c.constraint_definition like '%''refunded''%'
    ) as status_check_preserves_refunded
),
index_state as (
  select
    idx.oid as index_oid,
    i.indisvalid,
    i.indisunique,
    i.indnkeyatts,
    pg_catalog.pg_get_indexdef(idx.oid, 1, true) as first_index_column,
    pg_catalog.pg_get_indexdef(idx.oid, 2, true) as second_index_column,
    lower(
      regexp_replace(
        coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), ''),
        '\s+',
        '',
        'g'
      )
    ) as normalized_predicate
  from table_state s
  join pg_catalog.pg_class idx
    on idx.oid = to_regclass(
      'public.account_recharges_user_client_request_unique'
    )
  join pg_catalog.pg_index i
    on i.indexrelid = idx.oid
   and i.indrelid = s.table_oid
),
index_summary as (
  select
    exists (select 1 from index_state) as client_request_unique_index_exists,
    coalesce((select bool_and(indisvalid) from index_state), false)
      as client_request_unique_index_valid,
    coalesce((select bool_and(indisunique) from index_state), false)
      as client_request_unique_index_is_unique,
    coalesce((
      select bool_and(
        indnkeyatts = 2
        and lower(first_index_column) = 'user_id'
        and lower(second_index_column) = 'client_request_id'
      )
      from index_state
    ), false) as client_request_unique_index_column_order_correct,
    coalesce((
      select bool_and(
        normalized_predicate like '%client_request_idisnotnull%'
        and normalized_predicate like '%btrim(client_request_id)<>''%'
        and normalized_predicate not like '%or%'
      )
      from index_state
    ), false) as client_request_unique_index_predicate_correct
),
column_summary as (
  select
    count(*) filter (where attnum is null)::integer as missing_column_count,
    count(*) filter (
      where attnum is not null and udt_name <> expected_udt_name
    )::integer as wrong_type_count,
    count(*) filter (
      where attnum is not null and is_nullable is false
    )::integer as unexpected_not_null_count,
    bool_or(attnum is not null) filter (where column_name = 'client_request_id')
      as client_request_id_exists,
    max(udt_name) filter (where column_name = 'client_request_id')
      as client_request_id_udt_name,
    bool_or(is_nullable) filter (where column_name = 'client_request_id')
      as client_request_id_is_nullable,
    bool_or(attnum is not null) filter (where column_name = 'completed_at')
      as completed_at_exists,
    max(udt_name) filter (where column_name = 'completed_at')
      as completed_at_udt_name,
    bool_or(is_nullable) filter (where column_name = 'completed_at')
      as completed_at_is_nullable,
    bool_or(attnum is not null) filter (where column_name = 'customer_note')
      as customer_note_exists,
    max(udt_name) filter (where column_name = 'customer_note')
      as customer_note_udt_name,
    bool_or(is_nullable) filter (where column_name = 'customer_note')
      as customer_note_is_nullable,
    bool_or(attnum is not null) filter (where column_name = 'payment_method')
      as payment_method_exists,
    max(udt_name) filter (where column_name = 'payment_method')
      as payment_method_udt_name,
    bool_or(is_nullable) filter (where column_name = 'payment_method')
      as payment_method_is_nullable,
    bool_or(attnum is not null) filter (where column_name = 'review_mode')
      as review_mode_exists,
    max(udt_name) filter (where column_name = 'review_mode')
      as review_mode_udt_name,
    bool_or(is_nullable) filter (where column_name = 'review_mode')
      as review_mode_is_nullable,
    bool_or(attnum is not null) filter (where column_name = 'review_reason')
      as review_reason_exists,
    max(udt_name) filter (where column_name = 'review_reason')
      as review_reason_udt_name,
    bool_or(is_nullable) filter (where column_name = 'review_reason')
      as review_reason_is_nullable
  from column_state
)
select
  s.table_oid is not null as table_exists,
  s.rls_enabled,
  c.*,
  status.status_check_exists,
  status.status_check_is_single_column,
  status.status_check_missing_required_value_count,
  status.status_check_preserves_refunded,
  idx.client_request_unique_index_exists,
  idx.client_request_unique_index_valid,
  idx.client_request_unique_index_is_unique,
  idx.client_request_unique_index_column_order_correct,
  idx.client_request_unique_index_predicate_correct,
  case
    when s.table_oid is null then 'MISSING_TABLE'
    when c.missing_column_count <> 0
      or c.wrong_type_count <> 0
      or c.unexpected_not_null_count <> 0
      or not status.status_check_exists
      or not status.status_check_is_single_column
      or status.status_check_missing_required_value_count <> 0
      or not status.status_check_preserves_refunded
      or not idx.client_request_unique_index_exists
      or not idx.client_request_unique_index_valid
      or not idx.client_request_unique_index_is_unique
      or not idx.client_request_unique_index_column_order_correct
      or not idx.client_request_unique_index_predicate_correct
      or s.rls_enabled is not true
      then 'REVIEW_REQUIRED'
    else 'PASS'
  end as assessment
from table_state s
cross join column_summary c
cross join status_summary status
cross join index_summary idx;
