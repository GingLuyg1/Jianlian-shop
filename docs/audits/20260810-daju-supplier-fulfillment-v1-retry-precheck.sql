-- Read-only retry precheck for the candidate Daju supplier fulfillment V1 migration.
-- Target: Jianlian-shop-test only. This file does not authorize the migration.
-- Run the complete file once and require the single final result set assessment.

begin;
set transaction read only;

with
contract as (
  select
    'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'::text
      as create_order_signature,
    '(?:[[:space:]]|--[^\n]*(?:\n|$)|/\*(?:[^*]|\*+[^*/])*\*+/)+'::text
      as gap_pattern,
    '(?:[[:space:]]|--[^\n]*(?:\n|$)|/\*(?:[^*]|\*+[^*/])*\*+/)*'::text
      as optional_gap_pattern
),
target as (
  select
    pg_catalog.to_regprocedure(contract.create_order_signature) as function_oid,
    contract.gap_pattern,
    contract.optional_gap_pattern
  from contract
),
definition as (
  select
    target.function_oid,
    target.gap_pattern,
    target.optional_gap_pattern,
    case
      when target.function_oid is null then null::text
      else pg_catalog.pg_get_functiondef(target.function_oid)
    end as function_definition
  from target
),
patterns as (
  select
    definition.function_oid,
    definition.function_definition,
    '(v_auto_delivery' || definition.gap_pattern || ':=' ||
      definition.gap_pattern || 'lower' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || 'coalesce' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || 'v_delivery_type' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''''' ||
      definition.optional_gap_pattern || '\)' || definition.optional_gap_pattern || '\)' ||
      definition.gap_pattern || 'in' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || '''automatic''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''auto''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''card''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''account''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''auto_delivery''' ||
      definition.optional_gap_pattern || '\)' || definition.optional_gap_pattern || ';)' as assignment_anchor_pattern,
    '(v_auto_delivery' || definition.gap_pattern || ':=' ||
      definition.gap_pattern || 'lower' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || 'coalesce' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || 'v_delivery_type' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''''' ||
      definition.optional_gap_pattern || '\)' || definition.optional_gap_pattern || '\)' ||
      definition.gap_pattern || 'in' || definition.optional_gap_pattern || '\(' ||
      definition.optional_gap_pattern || '''automatic''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''auto''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''card''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''account''' ||
      definition.optional_gap_pattern || ',' || definition.optional_gap_pattern || '''auto_delivery''' ||
      definition.optional_gap_pattern || '\)' || definition.optional_gap_pattern || ';)' ||
      definition.gap_pattern || 'if' || definition.gap_pattern || 'p_sku_id' ||
      definition.gap_pattern || 'is' || definition.gap_pattern || 'not' ||
      definition.gap_pattern || 'null' || definition.gap_pattern || 'then' ||
      definition.gap_pattern || 'v_supplier_delivery' || definition.gap_pattern || ':=' ||
      definition.gap_pattern || 'v_auto_delivery' as assignment_patched_pattern,
    '(if' || definition.gap_pattern || ')v_auto_delivery(' ||
      definition.gap_pattern || 'then' ||
      definition.gap_pattern || 'select' ||
      definition.gap_pattern || 'count\(\*\)::integer' ||
      definition.gap_pattern || 'into' ||
      definition.gap_pattern || 'v_stock' ||
      definition.gap_pattern || 'from' ||
      definition.gap_pattern || 'public\.digital_inventory' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || 'di_count)' as count_anchor_pattern,
    'if' || definition.gap_pattern || 'v_auto_delivery' ||
      definition.gap_pattern || 'and' ||
      definition.gap_pattern || 'not' ||
      definition.gap_pattern || 'v_supplier_delivery' ||
      definition.gap_pattern || 'then' ||
      definition.gap_pattern || 'select' ||
      definition.gap_pattern || 'count\(\*\)::integer' ||
      definition.gap_pattern || 'into' ||
      definition.gap_pattern || 'v_stock' ||
      definition.gap_pattern || 'from' ||
      definition.gap_pattern || 'public\.digital_inventory' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || 'di_count' as count_patched_pattern,
    '(if' || definition.gap_pattern || ')v_auto_delivery(' ||
      definition.gap_pattern || 'then' ||
      definition.gap_pattern || 'with' ||
      definition.gap_pattern || 'picked' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || '\(' ||
      definition.gap_pattern || 'select' ||
      definition.gap_pattern || 'di_pick\.id' ||
      definition.gap_pattern || 'from' ||
      definition.gap_pattern || 'public\.digital_inventory' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || 'di_pick)' as pick_anchor_pattern,
    'if' || definition.gap_pattern || 'v_auto_delivery' ||
      definition.gap_pattern || 'and' ||
      definition.gap_pattern || 'not' ||
      definition.gap_pattern || 'v_supplier_delivery' ||
      definition.gap_pattern || 'then' ||
      definition.gap_pattern || 'with' ||
      definition.gap_pattern || 'picked' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || '\(' ||
      definition.gap_pattern || 'select' ||
      definition.gap_pattern || 'di_pick\.id' ||
      definition.gap_pattern || 'from' ||
      definition.gap_pattern || 'public\.digital_inventory' ||
      definition.gap_pattern || 'as' ||
      definition.gap_pattern || 'di_pick' as pick_patched_pattern
  from definition
),
function_evidence as (
  select
    patterns.function_oid is not null as exact_signature_exists,
    patterns.function_definition is not null as definition_readable,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.assignment_anchor_pattern)
    end as assignment_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.assignment_patched_pattern)
    end as patched_assignment_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.count_anchor_pattern)
    end as count_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.pick_anchor_pattern)
    end as picked_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.count_patched_pattern)
    end as patched_count_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(patterns.function_definition, patterns.pick_patched_pattern)
    end as patched_picked_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(
        patterns.function_definition,
        'v_auto_delivery boolean := false;'
      )
    end as auto_delivery_declaration_match_count,
    case when patterns.function_definition is null then null::integer
      else pg_catalog.regexp_count(
        patterns.function_definition,
        '''option_snapshot'', v_option_snapshot'
      )
    end as option_snapshot_anchor_match_count,
    coalesce(position('v_supplier_delivery boolean' in patterns.function_definition) > 0, false)
      as supplier_delivery_marker_exists,
    coalesce(position('''supplier_binding''' in patterns.function_definition) > 0, false)
      as supplier_binding_marker_exists,
    coalesce(
      pg_catalog.regexp_count(patterns.function_definition, patterns.assignment_anchor_pattern) = 1,
      false
    ) as assignment_patch_anchor_exists
  from patterns
),
function_state as (
  select
    function_evidence.*,
    auto_delivery_declaration_match_count = 1 as auto_delivery_declaration_exists,
    option_snapshot_anchor_match_count = 1 as option_snapshot_anchor_exists,
    patched_assignment_match_count = 1 as assignment_already_patched,
    case
      when not supplier_delivery_marker_exists
       and not supplier_binding_marker_exists
       and assignment_match_count = 1
       and patched_assignment_match_count = 0
       and count_match_count = 1
       and picked_match_count = 1
       and patched_count_match_count = 0
       and patched_picked_match_count = 0
        then 'UNPATCHED_READY'
      when supplier_delivery_marker_exists
       and supplier_binding_marker_exists
       and assignment_match_count = 1
       and patched_assignment_match_count = 1
       and count_match_count = 0
       and picked_match_count = 0
       and patched_count_match_count = 1
       and patched_picked_match_count = 1
        then 'ALREADY_PATCHED_COMPLETE'
      else 'PARTIAL_OR_UNKNOWN'
    end as create_order_supplier_patch_state
  from function_evidence
),
candidate_objects as (
  select
    pg_catalog.to_regclass('public.supplier_fulfillment_requests') is not null
      as supplier_request_table_exists,
    pg_catalog.to_regclass('public.supplier_fulfillment_requests_order_status_idx') is not null
      as supplier_request_index_exists,
    pg_catalog.to_regclass('public.order_deliveries_supplier_item_delivered_uidx') is not null
      as supplier_delivery_unique_index_exists,
    pg_catalog.to_regprocedure(
      'public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)'
    ) is not null as claim_function_exists,
    pg_catalog.to_regprocedure(
      'public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)'
    ) is not null as outcome_function_exists,
    exists (
      select 1
      from pg_catalog.pg_trigger as trigger_state
      where trigger_state.tgname = 'supplier_fulfillment_requests_set_updated_at'
        and trigger_state.tgrelid = pg_catalog.to_regclass('public.supplier_fulfillment_requests')
        and not trigger_state.tgisinternal
    ) as supplier_request_trigger_exists
),
recharge_objects as (
  select
    pg_catalog.to_regclass('public.account_recharge_daily_rates') is not null
      as daily_rate_table_exists,
    pg_catalog.to_regclass('public.bep20_transaction_usage_registry') is not null
      as transaction_registry_exists,
    pg_catalog.to_regclass('public.account_recharge_chain_claims') is not null
      as recharge_chain_claim_table_exists,
    pg_catalog.to_regprocedure(
      'public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamptz,text,text,text,numeric,numeric,integer)'
    ) is not null as recharge_claim_function_exists,
    pg_catalog.to_regprocedure(
      'public.complete_account_recharge_usdt_cny_v1(uuid,text)'
    ) is not null as recharge_complete_function_exists,
    (
      pg_catalog.to_regprocedure('public.prevent_account_recharge_daily_rate_mutation()') is not null and
      pg_catalog.to_regprocedure('public.protect_account_recharge_rate_snapshot()') is not null and
      pg_catalog.to_regprocedure('public.guard_order_bep20_transaction_usage()') is not null
    ) as recharge_guard_functions_exist,
    (
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger_state
        where trigger_state.tgname = 'prevent_account_recharge_daily_rate_mutation'
          and trigger_state.tgrelid = pg_catalog.to_regclass('public.account_recharge_daily_rates')
          and not trigger_state.tgisinternal
      ) and
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger_state
        where trigger_state.tgname = 'protect_account_recharge_rate_snapshot'
          and trigger_state.tgrelid = pg_catalog.to_regclass('public.account_recharges')
          and not trigger_state.tgisinternal
      ) and
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger_state
        where trigger_state.tgname = 'guard_order_bep20_transaction_usage'
          and trigger_state.tgrelid = pg_catalog.to_regclass('public.chain_transaction_claims')
          and not trigger_state.tgisinternal
      )
    ) as recharge_guard_triggers_exist,
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_state
      where constraint_state.conname = 'account_recharges_usdt_cny_amounts_check'
        and constraint_state.conrelid = pg_catalog.to_regclass('public.account_recharges')
        and constraint_state.convalidated
    ) as recharge_amount_constraint_exists,
    (
      select count(*) = 12
      from pg_catalog.pg_attribute as column_state
      where column_state.attrelid = pg_catalog.to_regclass('public.account_recharges')
        and column_state.attnum > 0
        and not column_state.attisdropped
        and column_state.attname in (
          'requested_cny_amount', 'expected_usdt_amount', 'actual_received_usdt',
          'credited_cny_amount', 'settlement_currency', 'payment_token_contract',
          'locked_market_rate', 'locked_settlement_rate', 'rate_source',
          'rate_effective_date', 'rate_effective_at', 'rate_locked_at'
        )
    ) as recharge_snapshot_columns_exist
),
evidence as (
  select
    function_state.*,
    candidate_objects.*,
    recharge_objects.*,
    (
      candidate_objects.supplier_request_table_exists::integer +
      candidate_objects.supplier_request_index_exists::integer +
      candidate_objects.supplier_delivery_unique_index_exists::integer +
      candidate_objects.claim_function_exists::integer +
      candidate_objects.outcome_function_exists::integer +
      candidate_objects.supplier_request_trigger_exists::integer
    ) as existing_candidate_object_count,
    (
      recharge_objects.daily_rate_table_exists and
      recharge_objects.transaction_registry_exists and
      recharge_objects.recharge_chain_claim_table_exists and
      recharge_objects.recharge_claim_function_exists and
      recharge_objects.recharge_complete_function_exists and
      recharge_objects.recharge_guard_functions_exist and
      recharge_objects.recharge_guard_triggers_exist and
      recharge_objects.recharge_amount_constraint_exists and
      recharge_objects.recharge_snapshot_columns_exist
    ) as recharge_usdt_cny_objects_ready
  from function_state
  cross join candidate_objects
  cross join recharge_objects
),
summary as (
  select
    evidence.*,
    (not exact_signature_exists)::integer as exact_signature_blocker_count,
    (not definition_readable)::integer as definition_readability_blocker_count,
    case when auto_delivery_declaration_exists then 0 else 1 end
      as declaration_blocker_count,
    case when option_snapshot_anchor_exists then 0 else 1 end
      as option_snapshot_blocker_count,
    case
      when count_match_count = 1 and patched_count_match_count = 0 then 0
      when count_match_count = 0 and patched_count_match_count = 1 then 0
      else 1
    end as count_regex_blocker_count,
    case
      when picked_match_count = 1 and patched_picked_match_count = 0 then 0
      when picked_match_count = 0 and patched_picked_match_count = 1 then 0
      else 1
    end as picked_regex_blocker_count,
    (create_order_supplier_patch_state = 'PARTIAL_OR_UNKNOWN')::integer
      as supplier_patch_state_blocker_count,
    case
      when assignment_match_count <> 1 then 1
      when create_order_supplier_patch_state = 'UNPATCHED_READY'
       and patched_assignment_match_count = 0 then 0
      when create_order_supplier_patch_state = 'ALREADY_PATCHED_COMPLETE'
       and patched_assignment_match_count = 1 then 0
      else 1
    end as assignment_patch_anchor_blocker_count,
    existing_candidate_object_count as candidate_object_blocker_count,
    (not recharge_usdt_cny_objects_ready)::integer as recharge_dependency_blocker_count
  from evidence
)
select
  summary.*,
  (
    exact_signature_blocker_count +
    definition_readability_blocker_count +
    declaration_blocker_count +
    option_snapshot_blocker_count +
    count_regex_blocker_count +
    picked_regex_blocker_count +
    supplier_patch_state_blocker_count +
    assignment_patch_anchor_blocker_count +
    candidate_object_blocker_count +
    recharge_dependency_blocker_count
  ) as total_blocker_count,
  case
    when exact_signature_blocker_count = 0
     and definition_readability_blocker_count = 0
     and declaration_blocker_count = 0
     and option_snapshot_blocker_count = 0
     and count_regex_blocker_count = 0
     and picked_regex_blocker_count = 0
     and supplier_patch_state_blocker_count = 0
     and assignment_patch_anchor_blocker_count = 0
     and candidate_object_blocker_count = 0
     and recharge_dependency_blocker_count = 0
      then 'READY_FOR_DAJU_MIGRATION_RETRY'
    else 'BLOCKED'
  end as assessment
from summary;

rollback;
