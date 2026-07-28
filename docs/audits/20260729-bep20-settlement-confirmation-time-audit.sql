-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 confirmation-time and historical-threshold audit.
-- This query returns aggregate timing and configuration-shape evidence only.

with object_state as (
  select
    to_regclass('public.chain_transactions') is not null as transactions_exist,
    to_regclass('public.chain_payment_sessions') is not null as sessions_exist,
    to_regclass('public.site_settings') is not null as settings_exist
),
confirmation_document as (
  select
    case
      when os.transactions_exist and os.sessions_exist then query_to_xml(
        $audit$
          select
            count(*)::bigint as transaction_count,
            count(*) filter (where ct.confirmation_count is null)::bigint
              as confirmation_count_null_count,
            count(*) filter (where ct.confirmation_count < 12)::bigint
              as confirmation_count_below_12_count,
            count(*) filter (where ct.confirmation_count = 12)::bigint
              as confirmation_count_equal_12_count,
            count(*) filter (where ct.confirmation_count > 12)::bigint
              as confirmation_count_above_12_count,
            min(ct.confirmation_count)::bigint as confirmation_count_minimum,
            max(ct.confirmation_count)::bigint as confirmation_count_maximum,
            count(*) filter (where cps.confirmed_at is null)::bigint
              as confirmed_at_null_count,
            count(*) filter (where cps.confirmed_at is not null)::bigint
              as confirmed_at_present_count,
            min(extract(epoch from (cps.confirmed_at - ct.created_at)))::numeric
              as confirmed_to_created_seconds_minimum,
            max(extract(epoch from (cps.confirmed_at - ct.created_at)))::numeric
              as confirmed_to_created_seconds_maximum,
            avg(extract(epoch from (cps.confirmed_at - ct.created_at)))::numeric
              as confirmed_to_created_seconds_average,
            count(*) filter (where cps.confirmed_at < ct.created_at)::bigint
              as confirmed_before_created_count,
            min(extract(epoch from (cps.confirmed_at - ct.block_timestamp)))::numeric
              as confirmed_to_block_seconds_minimum,
            max(extract(epoch from (cps.confirmed_at - ct.block_timestamp)))::numeric
              as confirmed_to_block_seconds_maximum,
            avg(extract(epoch from (cps.confirmed_at - ct.block_timestamp)))::numeric
              as confirmed_to_block_seconds_average,
            count(*) filter (where cps.confirmed_at < ct.block_timestamp)::bigint
              as confirmed_before_block_count,
            null::bigint as created_before_confirmation_threshold_but_backfilled_count,
            'unknown_without_historical_confirmation-observation_events'::text
              as created_before_confirmation_threshold_assessment,
            'unknown'::text as historical_required_confirmation_threshold
          from public.chain_transactions ct
          join public.chain_payment_sessions cps
            on cps.id = ct.chain_payment_session_id
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
      when os.settings_exist then query_to_xml(
        $audit$
          select
            count(*)::bigint as confirmation_setting_record_count,
            count(*) filter (
              where setting_value is null
                 or setting_value = 'null'::jsonb
                 or setting_value -> 'value' is null
                 or setting_value -> 'value' = 'null'::jsonb
            )::bigint as confirmation_setting_null_count,
            coalesce(
              string_agg(
                distinct coalesce(
                  jsonb_typeof(setting_value -> 'value'),
                  jsonb_typeof(setting_value),
                  'sql_null'
                ),
                ','
                order by coalesce(
                  jsonb_typeof(setting_value -> 'value'),
                  jsonb_typeof(setting_value),
                  'sql_null'
                )
              ),
              'none'
            )::text as confirmation_setting_json_types
          from public.site_settings
          where lower(setting_key) in (
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
  case
    when cd.document is null then null::jsonb
    else jsonb_build_object(
      'transaction_count',
        ((xpath('/table/row/transaction_count/text()', cd.document))[1]::text)::bigint,
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
