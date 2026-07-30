-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Production precheck for account recharge schema, runtime dependencies, and privileges.
-- Business tables are read only for aggregate counts; no identifiers or configuration values are returned.
-- Lock state is an execution-time snapshot and must be checked again immediately before running 20260729135500.
-- PASS does not reserve or pre-acquire any lock for the later Migration.

begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '120s';

with
allowed_statuses(status_value) as (
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
target_columns(column_name, expected_udt_names, compatibility_column, required_before_compatibility) as (
  values
    ('id'::text, array['uuid']::text[], false, true),
    ('user_id'::text, array['uuid']::text[], false, true),
    ('recharge_no'::text, array['text']::text[], false, true),
    ('channel_code'::text, array['text']::text[], false, true),
    ('amount'::text, array['numeric']::text[], false, true),
    ('payable_amount'::text, array['numeric']::text[], false, true),
    ('credited_amount'::text, array['numeric']::text[], false, true),
    ('received_amount'::text, array['numeric']::text[], false, true),
    ('status'::text, array['text']::text[], false, true),
    ('client_request_id'::text, array['text']::text[], true, false),
    ('completed_at'::text, array['timestamptz']::text[], true, false),
    ('paid_at'::text, array['timestamptz']::text[], false, true),
    ('provider_trade_no'::text, array['text']::text[], false, true),
    ('transaction_reference'::text, array['text']::text[], false, true),
    ('created_at'::text, array['timestamptz']::text[], false, true),
    ('updated_at'::text, array['timestamptz']::text[], false, true),
    ('customer_note'::text, array['text']::text[], true, false),
    ('payment_method'::text, array['text']::text[], true, false),
    ('review_mode'::text, array['text']::text[], true, false),
    ('review_reason'::text, array['text']::text[], true, false)
),
phase_one_tables(table_name, optional_table) as (
  values
    ('account_recharges'::text, false),
    ('admin_audit_logs'::text, false),
    ('balance_transactions'::text, false),
    ('order_payments'::text, false),
    ('order_status_logs'::text, false),
    ('orders'::text, false),
    ('payment_sessions'::text, false),
    ('profiles'::text, false),
    ('site_setting_logs'::text, true),
    ('site_settings'::text, true)
),
objects as (
  select
    to_regclass('public.account_recharges') as account_recharges_oid,
    to_regclass('public.payment_channels') as payment_channels_oid,
    to_regclass('public.account_recharges_user_client_request_unique')
      as target_index_oid
),
role_state as (
  select
    required.role_name,
    to_regrole(required.role_name) as role_oid,
    to_regrole(required.role_name) is not null as role_exists
  from (
    values
      ('anon'::text),
      ('authenticated'::text),
      ('service_role'::text)
  ) required(role_name)
),
phase_one_objects as (
  select
    target.table_name,
    target.optional_table,
    c.oid as table_oid,
    c.relowner,
    c.relacl,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from phase_one_tables target
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', target.table_name))
),
execution_role as (
  select
    role_state.oid as role_oid,
    role_state.rolname as role_name,
    role_state.rolsuper,
    role_state.rolbypassrls
  from pg_catalog.pg_roles role_state
  where role_state.rolname = current_user
),
activity_visibility as (
  select
    role_state.role_name,
    case
      when role_state.rolsuper then 0
      when to_regrole('pg_read_all_stats') is not null
        and pg_catalog.pg_has_role(
          role_state.role_oid,
          to_regrole('pg_read_all_stats'),
          'MEMBER'
        )
        then 0
      else 1
    end::integer as activity_visibility_blocker_count
  from execution_role role_state
),
relation_visibility as (
  select
    pg_catalog.has_table_privilege(
      role_state.role_oid,
      account_table.oid,
      'SELECT'
    ) as account_recharges_select,
    (
      pg_catalog.has_table_privilege(
        role_state.role_oid,
        account_table.oid,
        'SELECT'
      )
      and (
        account_table.relrowsecurity is not true
        or role_state.rolsuper
        or role_state.rolbypassrls
        or (
          role_state.role_oid = account_table.relowner
          and account_table.relforcerowsecurity is not true
        )
      )
    ) as account_recharges_full_visibility,
    pg_catalog.has_table_privilege(
      role_state.role_oid,
      payment_table.oid,
      'SELECT'
    ) as payment_channels_select,
    (
      pg_catalog.has_table_privilege(
        role_state.role_oid,
        payment_table.oid,
        'SELECT'
      )
      and (
        payment_table.relrowsecurity is not true
        or role_state.rolsuper
        or role_state.rolbypassrls
        or (
          role_state.role_oid = payment_table.relowner
          and payment_table.relforcerowsecurity is not true
        )
      )
    ) as payment_channels_full_visibility
  from objects object_state
  cross join execution_role role_state
  left join pg_catalog.pg_class account_table
    on account_table.oid = object_state.account_recharges_oid
  left join pg_catalog.pg_class payment_table
    on payment_table.oid = object_state.payment_channels_oid
),
visibility_summary as (
  select
    case
      when visibility.account_recharges_select is true
        and visibility.account_recharges_full_visibility is true
        then 0
      else 1
    end::integer as account_recharges_visibility_blocker_count,
    case
      when visibility.payment_channels_select is true
        and visibility.payment_channels_full_visibility is true
        then 0
      else 1
    end::integer as payment_channels_visibility_blocker_count
  from relation_visibility visibility
),
column_state as (
  select
    expected.column_name,
    expected.expected_udt_names,
    expected.compatibility_column,
    expected.required_before_compatibility,
    a.attnum,
    typ.typname as udt_name,
    case when a.attnum is null then null else not a.attnotnull end as is_nullable,
    case
      when defaults.adbin is null then null
      else pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid)
    end as default_value
  from target_columns expected
  cross join objects object_state
  left join pg_catalog.pg_attribute a
    on a.attrelid = object_state.account_recharges_oid
   and a.attname = expected.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_type typ on typ.oid = a.atttypid
  left join pg_catalog.pg_attrdef defaults
    on defaults.adrelid = a.attrelid
   and defaults.adnum = a.attnum
),
payment_channel_column_state as (
  select
    expected.column_name,
    expected.expected_udt_name,
    a.attnum,
    typ.typname as udt_name
  from (
    values
      ('enabled'::text, 'bool'::text),
      ('configured'::text, 'bool'::text),
      ('public_config'::text, 'jsonb'::text)
  ) expected(column_name, expected_udt_name)
  cross join objects object_state
  left join pg_catalog.pg_attribute a
    on a.attrelid = object_state.payment_channels_oid
   and a.attname = expected.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_type typ on typ.oid = a.atttypid
),
status_column as (
  select a.attnum
  from objects object_state
  join pg_catalog.pg_attribute a
    on a.attrelid = object_state.account_recharges_oid
   and a.attname = 'status'
   and a.attnum > 0
   and not a.attisdropped
),
client_request_columns_ready as (
  select
    exists (
      select 1
      from column_state
      where column_name = 'user_id' and attnum is not null
    ) as user_id_exists,
    exists (
      select 1
      from column_state
      where column_name = 'client_request_id' and attnum is not null
    ) as client_request_id_exists
),
status_aggregate_xml as (
  select
    case
      when object_state.account_recharges_oid is null
        or not exists (select 1 from status_column)
        or visibility.account_recharges_full_visibility is not true
        then null
      else pg_catalog.query_to_xml(
        $status_query$
          select
            coalesce(
              jsonb_object_agg(status_value, status_count order by status_value),
              '{}'::jsonb
            ) as status_counts,
            coalesce(
              sum(status_count) filter (
                where status_value not in (
                  'pending',
                  'waiting_payment',
                  'submitted',
                  'reviewing',
                  'approved',
                  'processing',
                  'succeeded',
                  'failed',
                  'rejected',
                  'cancelled',
                  'expired',
                  'paid',
                  'closed',
                  'refunded'
                )
              ),
              0
            )::bigint as invalid_status_count
          from (
            select
              coalesce(status::text, '<NULL>') as status_value,
              count(*)::bigint as status_count
            from public.account_recharges
            group by coalesce(status::text, '<NULL>')
          ) grouped_statuses
        $status_query$,
        true,
        false,
        ''
      )
    end as payload
  from objects object_state
  cross join relation_visibility visibility
),
status_aggregate as (
  select
    case
      when payload is null then null
      else ((pg_catalog.xpath(
        '/table/row/status_counts/text()',
        payload
      ))[1]::text)::jsonb
    end as status_counts,
    case
      when payload is null then null
      else ((pg_catalog.xpath(
        '/table/row/invalid_status_count/text()',
        payload
      ))[1]::text)::bigint
    end as invalid_status_count
  from status_aggregate_xml
),
idempotency_aggregate_xml as (
  select
    case
      when object_state.account_recharges_oid is null
        or not readiness.user_id_exists
        or not readiness.client_request_id_exists
        or visibility.account_recharges_full_visibility is not true
        then null
      else pg_catalog.query_to_xml(
        $idempotency_query$
          with duplicate_groups as (
            select count(*)::bigint as group_record_count
            from public.account_recharges
            where client_request_id is not null
              and btrim(client_request_id::text) <> ''
            group by user_id, btrim(client_request_id::text)
            having count(*) > 1
          )
          select
            (
              select count(*)::bigint
              from public.account_recharges
              where client_request_id is not null
                and btrim(client_request_id::text) <> ''
            ) as nonempty_client_request_count,
            count(*)::bigint as duplicate_client_request_group_count,
            coalesce(sum(group_record_count), 0)::bigint
              as duplicate_client_request_record_count
          from duplicate_groups
        $idempotency_query$,
        true,
        false,
        ''
      )
    end as payload
  from objects object_state
  cross join client_request_columns_ready readiness
  cross join relation_visibility visibility
),
idempotency_aggregate as (
  select
    case
      when object_state.account_recharges_oid is null
        or not readiness.user_id_exists
        or visibility.account_recharges_full_visibility is not true
        then null
      when not readiness.client_request_id_exists then 0
      when payload is null then null
      else ((pg_catalog.xpath(
        '/table/row/nonempty_client_request_count/text()',
        payload
      ))[1]::text)::bigint
    end as nonempty_client_request_count,
    case
      when object_state.account_recharges_oid is null
        or not readiness.user_id_exists
        or visibility.account_recharges_full_visibility is not true
        then null
      when not readiness.client_request_id_exists then 0
      when payload is null then null
      else ((pg_catalog.xpath(
        '/table/row/duplicate_client_request_group_count/text()',
        payload
      ))[1]::text)::bigint
    end as duplicate_client_request_group_count,
    case
      when object_state.account_recharges_oid is null
        or not readiness.user_id_exists
        or visibility.account_recharges_full_visibility is not true
        then null
      when not readiness.client_request_id_exists then 0
      when payload is null then null
      else ((pg_catalog.xpath(
        '/table/row/duplicate_client_request_record_count/text()',
        payload
      ))[1]::text)::bigint
    end as duplicate_client_request_record_count
  from idempotency_aggregate_xml
  cross join objects object_state
  cross join client_request_columns_ready readiness
  cross join relation_visibility visibility
),
constraint_state as (
  select
    c.conname as constraint_name,
    c.conkey,
    pg_catalog.pg_get_constraintdef(c.oid, true) as constraint_definition,
    exists (
      select 1
      from status_column status_attribute
      where c.conkey = array[status_attribute.attnum]::smallint[]
    ) as status_single_column
  from objects object_state
  join pg_catalog.pg_constraint c
    on c.conrelid = object_state.account_recharges_oid
   and c.contype = 'c'
),
target_index_state as (
  select
    idx.oid as index_oid,
    idx.relname as index_name,
    i.indrelid,
    i.indisvalid,
    i.indisunique,
    i.indnkeyatts,
    pg_catalog.pg_get_indexdef(idx.oid) as index_definition,
    lower(
      regexp_replace(
        coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), ''),
        '\s+',
        '',
        'g'
      )
    ) as normalized_predicate,
    lower(pg_catalog.pg_get_indexdef(idx.oid, 1, true)) as first_index_column,
    lower(pg_catalog.pg_get_indexdef(idx.oid, 2, true)) as second_index_column
  from objects object_state
  join pg_catalog.pg_class idx on idx.oid = object_state.target_index_oid
  join pg_catalog.pg_index i on i.indexrelid = idx.oid
),
index_assessment as (
  select
    exists (select 1 from target_index_state) as target_index_exists,
    count(*) filter (
      where state.index_oid is not null
        and (
          state.indrelid is distinct from object_state.account_recharges_oid
          or state.indisvalid is not true
          or state.indisunique is not true
          or state.indnkeyatts <> 2
          or state.first_index_column <> 'user_id'
          or state.second_index_column <> 'client_request_id'
          or state.normalized_predicate not like '%client_request_idisnotnull%'
          or state.normalized_predicate not like '%btrim(client_request_id)<>''%'
          or state.normalized_predicate like '%or%'
        )
    )::integer as conflicting_index_count
  from objects object_state
  left join target_index_state state on true
  group by object_state.account_recharges_oid
),
relation_activity as (
  select
    case
      when object_state.account_recharges_oid is null then null
      else pg_catalog.pg_total_relation_size(object_state.account_recharges_oid)
    end as account_recharges_total_bytes,
    case
      when object_state.account_recharges_oid is null then null
      else pg_catalog.pg_relation_size(object_state.account_recharges_oid)
    end as account_recharges_table_bytes,
    case
      when object_state.account_recharges_oid is null then null
      else pg_catalog.pg_indexes_size(object_state.account_recharges_oid)
    end as account_recharges_index_bytes,
    count(lock_state.*) filter (
      where lock_state.relation = object_state.account_recharges_oid
        and lock_state.locktype = 'relation'
    )::integer as current_lock_count,
    count(lock_state.*) filter (
      where lock_state.relation = object_state.account_recharges_oid
        and lock_state.locktype = 'relation'
        and not lock_state.granted
    )::integer as ungranted_lock_count,
    count(lock_state.*) filter (
      where lock_state.relation = object_state.account_recharges_oid
        and lock_state.locktype = 'relation'
        and lock_state.pid <> pg_catalog.pg_backend_pid()
        and lock_state.granted
    )::integer as ddl_conflicting_granted_lock_count,
    case
      when visibility.activity_visibility_blocker_count <> 0 then null
      else count(distinct activity.pid) filter (
        where lock_state.relation = object_state.account_recharges_oid
          and lock_state.locktype = 'relation'
          and activity.pid <> pg_catalog.pg_backend_pid()
          and activity.state is distinct from 'idle'
      )::integer
    end as account_recharges_active_session_count
  from objects object_state
  cross join activity_visibility visibility
  left join pg_catalog.pg_locks lock_state
    on lock_state.relation = object_state.account_recharges_oid
  left join pg_catalog.pg_stat_activity activity on activity.pid = lock_state.pid
  group by
    object_state.account_recharges_oid,
    visibility.activity_visibility_blocker_count
),
long_transactions as (
  select
    case
      when visibility.activity_visibility_blocker_count <> 0 then null
      else count(*) filter (
        where activity.datid = (
            select database.oid
            from pg_catalog.pg_database database
            where database.datname = current_database()
          )
          and activity.pid <> pg_catalog.pg_backend_pid()
          and activity.xact_start is not null
          and activity.xact_start
            < pg_catalog.clock_timestamp() - interval '5 minutes'
      )::integer
    end as long_transaction_count
  from activity_visibility visibility
  left join pg_catalog.pg_stat_activity activity on true
  group by visibility.activity_visibility_blocker_count
),
grantee_matrix as (
  select 'PUBLIC'::text as grantee_name, 0::oid as role_oid, true as role_exists
  union all
  select role_name, role_oid, role_exists from role_state
),
table_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text),
    ('MAINTAIN'::text)
),
effective_table_acl as (
  select
    target.table_name,
    grantee.grantee_name,
    privilege.privilege_name,
    case
      when target.table_oid is null or not grantee.role_exists then null
      when privilege.privilege_name = 'MAINTAIN'
        and current_setting('server_version_num')::integer < 170000
        then false
      when grantee.grantee_name = 'PUBLIC'
        then exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              target.relacl,
              pg_catalog.acldefault('r', target.relowner)
            )
          ) acl
          where acl.grantee = 0
            and acl.privilege_type = privilege.privilege_name
        )
      else pg_catalog.has_table_privilege(
        grantee.role_oid,
        target.table_oid,
        privilege.privilege_name
      )
    end as effective_privilege
  from phase_one_objects target
  cross join grantee_matrix grantee
  cross join table_privileges privilege
),
explicit_column_acl as (
  select
    target.table_name,
    case
      when acl.grantee = 0 then 'PUBLIC'
      else role_name.rolname
    end as grantee_name,
    acl.privilege_type,
    count(*)::integer as explicit_column_acl_count
  from phase_one_objects target
  join pg_catalog.pg_attribute attribute_state
    on attribute_state.attrelid = target.table_oid
   and attribute_state.attnum > 0
   and not attribute_state.attisdropped
  cross join lateral pg_catalog.aclexplode(attribute_state.attacl) acl
  left join pg_catalog.pg_roles role_name on role_name.oid = acl.grantee
  where acl.grantee = 0
     or role_name.rolname in ('anon', 'authenticated', 'service_role')
  group by
    target.table_name,
    case when acl.grantee = 0 then 'PUBLIC' else role_name.rolname end,
    acl.privilege_type
),
policy_state as (
  select
    target.table_name,
    policy.polname as policy_name,
    case policy.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      when '*' then 'ALL'
      else 'UNKNOWN'
    end as policy_command,
    array(
      select
        case
          when policy_role.role_oid = 0 then 'PUBLIC'
          else coalesce(role_name.rolname, '<missing_role>')
        end
      from unnest(policy.polroles) policy_role(role_oid)
      left join pg_catalog.pg_roles role_name
        on role_name.oid = policy_role.role_oid
      order by 1
    ) as policy_roles
  from phase_one_objects target
  join pg_catalog.pg_policy policy on policy.polrelid = target.table_oid
),
channel_aggregate_xml as (
  select
    case
      when object_state.payment_channels_oid is null
        or visibility.payment_channels_full_visibility is not true
        or exists (
          select 1
          from payment_channel_column_state
          where attnum is null or udt_name <> expected_udt_name
        )
        then null
      else pg_catalog.query_to_xml(
        $channel_query$
          select
            count(*)::bigint as total_channel_count,
            count(*) filter (where enabled)::bigint as enabled_channel_count,
            count(*) filter (where configured)::bigint as configured_channel_count,
            count(*) filter (
              where to_jsonb(public_config) ->> 'review_mode' = 'manual'
                 or to_jsonb(public_config) ->> 'payment_mode' = 'manual'
            )::bigint as manual_channel_count,
            count(*) filter (
              where enabled and configured
            )::bigint as enabled_configured_channel_count
          from public.payment_channels
        $channel_query$,
        true,
        false,
        ''
      )
    end as payload
  from objects object_state
  cross join relation_visibility visibility
),
channel_aggregate as (
  select
    case when payload is null then null else
      ((pg_catalog.xpath('/table/row/total_channel_count/text()', payload))[1]::text)::bigint
    end as total_channel_count,
    case when payload is null then null else
      ((pg_catalog.xpath('/table/row/enabled_channel_count/text()', payload))[1]::text)::bigint
    end as enabled_channel_count,
    case when payload is null then null else
      ((pg_catalog.xpath('/table/row/configured_channel_count/text()', payload))[1]::text)::bigint
    end as configured_channel_count,
    case when payload is null then null else
      ((pg_catalog.xpath('/table/row/manual_channel_count/text()', payload))[1]::text)::bigint
    end as manual_channel_count,
    case when payload is null then null else
      ((pg_catalog.xpath('/table/row/enabled_configured_channel_count/text()', payload))[1]::text)::bigint
    end as enabled_configured_channel_count
  from channel_aggregate_xml
),
schema_summary as (
  select
    (
      select count(*)::integer
      from (
        select table_name
        from phase_one_objects
        where not optional_table and table_oid is null
        union
        select 'payment_channels'
        from objects
        where payment_channels_oid is null
      ) missing_required_objects
    )
    + (
      select count(*)::integer
      from column_state
      where required_before_compatibility and attnum is null
    )
    + (
      select count(*)::integer
      from column_state
      where attnum is not null
        and udt_name <> all(expected_udt_names)
    )
    + (
      select count(*)::integer
      from column_state
      where compatibility_column
        and attnum is not null
        and is_nullable is not true
    )
    + (
      select count(*)::integer
      from payment_channel_column_state
      where attnum is null or udt_name <> expected_udt_name
    ) as schema_blocker_count,
    (
      select count(*)::integer
      from column_state
      where compatibility_column and attnum is null
    ) as missing_compatibility_column_count
),
rls_summary as (
  select count(*)::integer as rls_blocker_count
  from phase_one_objects
  where table_oid is not null and rls_enabled is not true
),
acl_summary as (
  select count(*)::integer as acl_blocker_count
  from (
    values
      (
        (
          select effective_privilege
          from effective_table_acl
          where table_name = 'account_recharges'
            and grantee_name = 'authenticated'
            and privilege_name = 'INSERT'
        ),
        true
      ),
      (
        (
          select effective_privilege
          from effective_table_acl
          where table_name = 'account_recharges'
            and grantee_name = 'service_role'
            and privilege_name = 'INSERT'
        ),
        true
      ),
      (
        (
          select effective_privilege
          from effective_table_acl
          where table_name = 'account_recharges'
            and grantee_name = 'service_role'
            and privilege_name = 'UPDATE'
        ),
        true
      )
  ) expected(actual_value, expected_value)
  where actual_value is distinct from expected_value
),
summary as (
  select
    schema.schema_blocker_count,
    schema.missing_compatibility_column_count,
    status.invalid_status_count,
    idempotency.duplicate_client_request_group_count,
    idempotency.duplicate_client_request_record_count,
    index_state.conflicting_index_count,
    (select count(*)::integer from role_state where not role_exists)
      as missing_role_count,
    rls.rls_blocker_count,
    acl.acl_blocker_count,
    (
      relation.ungranted_lock_count
      + relation.ddl_conflicting_granted_lock_count
    )::integer as active_lock_blocker_count,
    long_tx.long_transaction_count as long_transaction_blocker_count,
    activity.activity_visibility_blocker_count,
    visibility.account_recharges_visibility_blocker_count,
    visibility.payment_channels_visibility_blocker_count
  from schema_summary schema
  cross join status_aggregate status
  cross join idempotency_aggregate idempotency
  cross join index_assessment index_state
  cross join rls_summary rls
  cross join acl_summary acl
  cross join relation_activity relation
  cross join long_transactions long_tx
  cross join activity_visibility activity
  cross join visibility_summary visibility
)
select
  current_user as current_database_role_name,
  object_state.account_recharges_oid is not null
    as account_recharges_table_exists,
  object_state.payment_channels_oid is not null
    as payment_channels_table_exists,
  (
    select jsonb_object_agg(role_name, role_exists order by role_name)
    from role_state
  ) as required_role_presence,
  (
    select rls_enabled
    from phase_one_objects
    where table_name = 'account_recharges'
  ) as account_recharges_rls_enabled,
  (
    select jsonb_agg(
      jsonb_build_object(
        'column_name', column_name,
        'exists', attnum is not null,
        'udt_name', udt_name,
        'is_nullable', is_nullable,
        'default_value', default_value,
        'compatibility_column', compatibility_column
      )
      order by column_name
    )
    from column_state
  ) as account_recharges_column_contract,
  status.status_counts,
  status.invalid_status_count,
  idempotency.nonempty_client_request_count,
  idempotency.duplicate_client_request_group_count,
  idempotency.duplicate_client_request_record_count,
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'constraint_name', constraint_name,
          'constraint_definition', constraint_definition,
          'status_single_column', status_single_column
        )
        order by constraint_name
      ),
      '[]'::jsonb
    )
    from constraint_state
  ) as account_recharges_check_constraints,
  index_state.target_index_exists,
  (
    select index_definition from target_index_state
  ) as target_index_definition,
  index_state.conflicting_index_count,
  relation.account_recharges_total_bytes,
  relation.account_recharges_table_bytes,
  relation.account_recharges_index_bytes,
  relation.current_lock_count,
  relation.ungranted_lock_count,
  relation.ddl_conflicting_granted_lock_count,
  relation.account_recharges_active_session_count,
  long_tx.long_transaction_count,
  (
    select jsonb_agg(
      jsonb_build_object(
        'table_name', table_name,
        'grantee', grantee_name,
        'privilege', privilege_name,
        'effective', effective_privilege
      )
      order by table_name, grantee_name, privilege_name
    )
    from effective_table_acl
  ) as effective_table_acl,
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_name', table_name,
          'grantee', grantee_name,
          'privilege', privilege_type,
          'explicit_column_acl_count', explicit_column_acl_count
        )
        order by table_name, grantee_name, privilege_type
      ),
      '[]'::jsonb
    )
    from explicit_column_acl
  ) as explicit_column_acl_summary,
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_name', table_name,
          'policy_name', policy_name,
          'command', policy_command,
          'roles', policy_roles
        )
        order by table_name, policy_name
      ),
      '[]'::jsonb
    )
    from policy_state
  ) as rls_policy_metadata,
  (
    select effective_privilege
    from effective_table_acl
    where table_name = 'account_recharges'
      and grantee_name = 'authenticated'
      and privilege_name = 'INSERT'
  ) as account_recharges_authenticated_insert_retained,
  (
    select effective_privilege
    from effective_table_acl
    where table_name = 'account_recharges'
      and grantee_name = 'service_role'
      and privilege_name = 'INSERT'
  ) as account_recharges_service_role_insert,
  (
    select effective_privilege
    from effective_table_acl
    where table_name = 'account_recharges'
      and grantee_name = 'service_role'
      and privilege_name = 'UPDATE'
  ) as account_recharges_service_role_update,
  channel.total_channel_count,
  channel.enabled_channel_count,
  channel.configured_channel_count,
  channel.manual_channel_count,
  channel.enabled_configured_channel_count,
  summary.schema_blocker_count,
  summary.missing_compatibility_column_count,
  summary.invalid_status_count,
  summary.duplicate_client_request_group_count,
  summary.conflicting_index_count,
  summary.missing_role_count,
  summary.rls_blocker_count,
  summary.acl_blocker_count,
  summary.active_lock_blocker_count,
  summary.long_transaction_blocker_count,
  summary.activity_visibility_blocker_count,
  summary.account_recharges_visibility_blocker_count,
  summary.payment_channels_visibility_blocker_count,
  case
    when summary.schema_blocker_count = 0
      and summary.invalid_status_count = 0
      and summary.duplicate_client_request_group_count = 0
      and summary.conflicting_index_count = 0
      and summary.missing_role_count = 0
      and summary.rls_blocker_count = 0
      and summary.acl_blocker_count = 0
      and summary.active_lock_blocker_count = 0
      and summary.long_transaction_blocker_count = 0
      and summary.activity_visibility_blocker_count = 0
      and summary.account_recharges_visibility_blocker_count = 0
      and summary.payment_channels_visibility_blocker_count = 0
      then 'PASS'
    else 'BLOCKED'
  end as assessment
from objects object_state
cross join status_aggregate status
cross join idempotency_aggregate idempotency
cross join index_assessment index_state
cross join relation_activity relation
cross join long_transactions long_tx
cross join channel_aggregate channel
cross join summary;

rollback;
