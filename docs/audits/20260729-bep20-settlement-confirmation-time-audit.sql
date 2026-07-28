-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 confirmation-time and historical-threshold audit.
-- This query returns aggregate timing and configuration-shape evidence only.

with column_requirements(
  requirement_group,
  table_name,
  column_name,
  allowed_udt_names
) as (
  values
    ('confirmation'::text, 'chain_transactions'::text, 'chain_payment_session_id'::text, array['uuid']::text[]),
    ('confirmation', 'chain_transactions', 'confirmation_count', array['int2','int4','int8','numeric']),
    ('confirmation', 'chain_transactions', 'created_at', array['timestamp','timestamptz']),
    ('confirmation', 'chain_transactions', 'block_timestamp', array['timestamp','timestamptz']),
    ('confirmation', 'chain_payment_sessions', 'id', array['uuid']),
    ('confirmation', 'chain_payment_sessions', 'confirmed_at', array['timestamp','timestamptz']),
    ('settings', 'site_settings', 'setting_key', array['text','varchar']),
    ('settings', 'site_settings', 'setting_value', null::text[])
),
object_state as (
  select
    to_regclass('public.chain_transactions') is not null as transactions_exist,
    to_regclass('public.chain_payment_sessions') is not null as sessions_exist,
    to_regclass('public.site_settings') is not null as settings_exist,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_key'
    ) as settings_key_column_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_value'
    ) as settings_value_column_exists,
    array(
      select format('%I.%I', cr.table_name, cr.column_name)
      from column_requirements cr
      left join information_schema.columns c
        on c.table_schema = 'public'
       and c.table_name = cr.table_name
       and c.column_name = cr.column_name
      where cr.requirement_group = 'confirmation'
        and c.column_name is null
      order by cr.table_name, cr.column_name
    ) as confirmation_missing_columns,
    array(
      select format(
        '%I.%I expected %s actual %s',
        cr.table_name,
        cr.column_name,
        array_to_string(cr.allowed_udt_names, '|'),
        c.udt_name
      )
      from column_requirements cr
      join information_schema.columns c
        on c.table_schema = 'public'
       and c.table_name = cr.table_name
       and c.column_name = cr.column_name
      where cr.requirement_group = 'confirmation'
        and cr.allowed_udt_names is not null
        and not (c.udt_name = any(cr.allowed_udt_names))
      order by cr.table_name, cr.column_name
    ) as confirmation_unexpected_column_types,
    array(
      select format('%I.%I', cr.table_name, cr.column_name)
      from column_requirements cr
      left join information_schema.columns c
        on c.table_schema = 'public'
       and c.table_name = cr.table_name
       and c.column_name = cr.column_name
      where cr.requirement_group = 'settings'
        and c.column_name is null
      order by cr.table_name, cr.column_name
    ) as settings_missing_columns,
    array(
      select format(
        '%I.%I expected %s actual %s',
        cr.table_name,
        cr.column_name,
        array_to_string(cr.allowed_udt_names, '|'),
        c.udt_name
      )
      from column_requirements cr
      join information_schema.columns c
        on c.table_schema = 'public'
       and c.table_name = cr.table_name
       and c.column_name = cr.column_name
      where cr.requirement_group = 'settings'
        and cr.allowed_udt_names is not null
        and not (c.udt_name = any(cr.allowed_udt_names))
      order by cr.table_name, cr.column_name
    ) as settings_unexpected_column_types,
    (
      select c.udt_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_value'
    ) as settings_value_udt_name
),
confirmation_document as (
  select
    case
      when os.transactions_exist
        and os.sessions_exist
        and cardinality(os.confirmation_missing_columns) = 0
        and cardinality(os.confirmation_unexpected_column_types) = 0
        then query_to_xml(
        $audit$
          with session_evidence as (
            select
              cps.id,
              cps.confirmed_at,
              count(*)::bigint as transaction_count,
              min(ct.created_at) as transaction_created_at,
              min(ct.block_timestamp) as transaction_block_timestamp
            from public.chain_payment_sessions cps
            join public.chain_transactions ct
              on ct.chain_payment_session_id = cps.id
            group by cps.id, cps.confirmed_at
          ),
          session_cardinality as (
            select
              count(*)::bigint as distinct_chain_session_count,
              count(*) filter (where transaction_count > 1)::bigint
                as multiple_transactions_per_session_count
            from session_evidence
          )
          select
            (select count(*)::bigint from public.chain_transactions)
              as transaction_count,
            sc.distinct_chain_session_count,
            sc.multiple_transactions_per_session_count,
            case
              when sc.multiple_transactions_per_session_count = 0 then 'PASS'
              else 'REVIEW_REQUIRED'
            end::text as session_timing_evidence_status,
            (select count(*) filter (where ct.confirmation_count is null)::bigint
             from public.chain_transactions ct)
              as confirmation_count_null_count,
            (select count(*) filter (where ct.confirmation_count < 12)::bigint
             from public.chain_transactions ct)
              as confirmation_count_below_12_count,
            (select count(*) filter (where ct.confirmation_count = 12)::bigint
             from public.chain_transactions ct)
              as confirmation_count_equal_12_count,
            (select count(*) filter (where ct.confirmation_count > 12)::bigint
             from public.chain_transactions ct)
              as confirmation_count_above_12_count,
            (select min(ct.confirmation_count)::bigint
             from public.chain_transactions ct) as confirmation_count_minimum,
            (select max(ct.confirmation_count)::bigint
             from public.chain_transactions ct) as confirmation_count_maximum,
            count(se.id) filter (where se.confirmed_at is null)::bigint
              as confirmed_at_null_count,
            count(se.id) filter (where se.confirmed_at is not null)::bigint
              as confirmed_at_present_count,
            case when sc.multiple_transactions_per_session_count = 0
              then min(extract(epoch from (
                se.confirmed_at - se.transaction_created_at
              )))::numeric
            end as confirmed_to_created_seconds_minimum,
            case when sc.multiple_transactions_per_session_count = 0
              then max(extract(epoch from (
                se.confirmed_at - se.transaction_created_at
              )))::numeric
            end as confirmed_to_created_seconds_maximum,
            case when sc.multiple_transactions_per_session_count = 0
              then avg(extract(epoch from (
                se.confirmed_at - se.transaction_created_at
              )))::numeric
            end as confirmed_to_created_seconds_average,
            case when sc.multiple_transactions_per_session_count = 0
              then count(*) filter (
                where se.confirmed_at < se.transaction_created_at
              )::bigint
            end as confirmed_before_created_count,
            case when sc.multiple_transactions_per_session_count = 0
              then min(extract(epoch from (
                se.confirmed_at - se.transaction_block_timestamp
              )))::numeric
            end as confirmed_to_block_seconds_minimum,
            case when sc.multiple_transactions_per_session_count = 0
              then max(extract(epoch from (
                se.confirmed_at - se.transaction_block_timestamp
              )))::numeric
            end as confirmed_to_block_seconds_maximum,
            case when sc.multiple_transactions_per_session_count = 0
              then avg(extract(epoch from (
                se.confirmed_at - se.transaction_block_timestamp
              )))::numeric
            end as confirmed_to_block_seconds_average,
            case when sc.multiple_transactions_per_session_count = 0
              then count(*) filter (
                where se.confirmed_at < se.transaction_block_timestamp
              )::bigint
            end as confirmed_before_block_count,
            null::bigint as created_before_confirmation_threshold_but_backfilled_count,
            'unknown_without_historical_confirmation-observation_events'::text
              as created_before_confirmation_threshold_assessment,
            'unknown'::text as historical_required_confirmation_threshold
          from session_cardinality sc
          left join session_evidence se on true
          group by
            sc.distinct_chain_session_count,
            sc.multiple_transactions_per_session_count
        $audit$,
        true,
        false,
        ''
      )
      else null::xml
    end as document
  from object_state os
),
settings_document as (
  select
    case
      when os.settings_exist
        and os.settings_key_column_exists
        and os.settings_value_column_exists
        and cardinality(os.settings_missing_columns) = 0
        and cardinality(os.settings_unexpected_column_types) = 0
        then query_to_xml(
        $audit$
          with normalized_settings as (
            select
              lower(setting_key::text) as normalized_key,
              to_jsonb(setting_value) as setting_json
            from public.site_settings
          )
          select
            count(*)::bigint as confirmation_setting_record_count,
            count(*) filter (
              where setting_json is null
                 or setting_json = 'null'::jsonb
                 or (
                   jsonb_typeof(setting_json) = 'object'
                   and (
                     setting_json -> 'value' is null
                     or setting_json -> 'value' = 'null'::jsonb
                   )
                 )
            )::bigint as confirmation_setting_null_count,
            coalesce(
              string_agg(
                distinct coalesce(
                  case
                    when jsonb_typeof(setting_json) = 'object'
                      then jsonb_typeof(setting_json -> 'value')
                    else jsonb_typeof(setting_json)
                  end,
                  'sql_null'
                ),
                ','
                order by coalesce(
                  case
                    when jsonb_typeof(setting_json) = 'object'
                      then jsonb_typeof(setting_json -> 'value')
                    else jsonb_typeof(setting_json)
                  end,
                  'sql_null'
                )
              ),
              'none'
            )::text as confirmation_setting_json_types
          from normalized_settings
          where normalized_key in (
            'bsc_required_confirmations',
            'bep20_required_confirmations'
          )
        $audit$,
        true,
        false,
        ''
      )
      else null::xml
    end as document
  from object_state os
)
select
  'bep20_settlement_confirmation_time_audit'::text as audit_name,
  os.transactions_exist,
  os.sessions_exist,
  os.settings_exist,
  os.settings_key_column_exists,
  os.settings_value_column_exists,
  os.confirmation_missing_columns,
  os.confirmation_unexpected_column_types,
  os.settings_missing_columns,
  os.settings_unexpected_column_types,
  os.settings_value_udt_name,
  case
    when not os.transactions_exist
      or not os.sessions_exist
      or cardinality(os.confirmation_missing_columns) > 0
      then 'NOT_CHECKED_MISSING_OBJECTS'
    when cardinality(os.confirmation_unexpected_column_types) > 0
      then 'NOT_CHECKED_UNEXPECTED_COLUMN_TYPE'
    else (xpath(
      '/table/row/session_timing_evidence_status/text()',
      cd.document
    ))[1]::text
  end as confirmation_timing_status,
  case
    when not os.settings_exist
      or cardinality(os.settings_missing_columns) > 0
      then 'NOT_CHECKED_MISSING_OBJECTS'
    when cardinality(os.settings_unexpected_column_types) > 0
      then 'NOT_CHECKED_UNEXPECTED_COLUMN_TYPE'
    else 'PASS'
  end as confirmation_setting_contract_status,
  case
    when cd.document is null then null::jsonb
    else jsonb_build_object(
      'transaction_count',
        ((xpath('/table/row/transaction_count/text()', cd.document))[1]::text)::bigint,
      'distinct_chain_session_count',
        ((xpath('/table/row/distinct_chain_session_count/text()', cd.document))[1]::text)::bigint,
      'multiple_transactions_per_session_count',
        ((xpath('/table/row/multiple_transactions_per_session_count/text()', cd.document))[1]::text)::bigint,
      'session_timing_evidence_status',
        (xpath('/table/row/session_timing_evidence_status/text()', cd.document))[1]::text,
      'confirmation_count_null_count',
        ((xpath('/table/row/confirmation_count_null_count/text()', cd.document))[1]::text)::bigint,
      'confirmation_count_below_12_count',
        ((xpath('/table/row/confirmation_count_below_12_count/text()', cd.document))[1]::text)::bigint,
      'confirmation_count_equal_12_count',
        ((xpath('/table/row/confirmation_count_equal_12_count/text()', cd.document))[1]::text)::bigint,
      'confirmation_count_above_12_count',
        ((xpath('/table/row/confirmation_count_above_12_count/text()', cd.document))[1]::text)::bigint,
      'confirmation_count_minimum',
        nullif((xpath('/table/row/confirmation_count_minimum/text()', cd.document))[1]::text, '')::bigint,
      'confirmation_count_maximum',
        nullif((xpath('/table/row/confirmation_count_maximum/text()', cd.document))[1]::text, '')::bigint,
      'confirmed_at_null_count',
        ((xpath('/table/row/confirmed_at_null_count/text()', cd.document))[1]::text)::bigint,
      'confirmed_at_present_count',
        ((xpath('/table/row/confirmed_at_present_count/text()', cd.document))[1]::text)::bigint,
      'confirmed_to_created_seconds_minimum',
        nullif((xpath('/table/row/confirmed_to_created_seconds_minimum/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_to_created_seconds_maximum',
        nullif((xpath('/table/row/confirmed_to_created_seconds_maximum/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_to_created_seconds_average',
        nullif((xpath('/table/row/confirmed_to_created_seconds_average/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_before_created_count',
        ((xpath('/table/row/confirmed_before_created_count/text()', cd.document))[1]::text)::bigint,
      'confirmed_to_block_seconds_minimum',
        nullif((xpath('/table/row/confirmed_to_block_seconds_minimum/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_to_block_seconds_maximum',
        nullif((xpath('/table/row/confirmed_to_block_seconds_maximum/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_to_block_seconds_average',
        nullif((xpath('/table/row/confirmed_to_block_seconds_average/text()', cd.document))[1]::text, '')::numeric,
      'confirmed_before_block_count',
        ((xpath('/table/row/confirmed_before_block_count/text()', cd.document))[1]::text)::bigint,
      'created_before_confirmation_threshold_but_backfilled_count', null,
      'created_before_confirmation_threshold_assessment',
        'unknown_without_historical_confirmation-observation_events',
      'historical_required_confirmation_threshold', 'unknown'
    )
  end as confirmation_summary,
  case
    when sd.document is null then null::jsonb
    else jsonb_build_object(
      'confirmation_setting_exists',
        ((xpath('/table/row/confirmation_setting_record_count/text()', sd.document))[1]::text)::bigint > 0,
      'confirmation_setting_record_count',
        ((xpath('/table/row/confirmation_setting_record_count/text()', sd.document))[1]::text)::bigint,
      'confirmation_setting_is_null',
        (
          (xpath('/table/row/confirmation_setting_record_count/text()', sd.document))[1]::text
        )::bigint > 0
        and (
          (xpath('/table/row/confirmation_setting_record_count/text()', sd.document))[1]::text
        )::bigint = (
          (xpath('/table/row/confirmation_setting_null_count/text()', sd.document))[1]::text
        )::bigint,
      'confirmation_setting_json_types',
        (xpath('/table/row/confirmation_setting_json_types/text()', sd.document))[1]::text,
      'configuration_value_exposed', false
    )
  end as confirmation_setting_shape
from object_state os
cross join confirmation_document cd
cross join settings_document sd;
