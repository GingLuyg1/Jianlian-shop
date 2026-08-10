-- TEST DATABASE READ-ONLY PRECHECK. DO NOT RUN IN PRODUCTION.
-- Run this complete file once before either candidate Migration.
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '120s';

with required_objects(object_name, object_exists) as (
  values
    ('account_recharges', to_regclass('public.account_recharges') is not null),
    ('profiles', to_regclass('public.profiles') is not null),
    ('balance_transactions', to_regclass('public.balance_transactions') is not null),
    ('chain_transaction_claims', to_regclass('public.chain_transaction_claims') is not null),
    ('orders', to_regclass('public.orders') is not null),
    ('order_items', to_regclass('public.order_items') is not null),
    ('products', to_regclass('public.products') is not null),
    ('product_skus', to_regclass('public.product_skus') is not null),
    ('order_deliveries', to_regclass('public.order_deliveries') is not null),
    ('digital_delivery_secrets', to_regclass('public.digital_delivery_secrets') is not null),
    ('set_updated_at', to_regprocedure('public.set_updated_at()') is not null),
    ('normalize_order_item_delivery_type', to_regprocedure('public.normalize_order_item_delivery_type(text)') is not null),
    ('refresh_order_fulfillment_status', to_regprocedure('public.refresh_order_fulfillment_status(uuid)') is not null),
    ('log_order_item_delivery_status', to_regprocedure('public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)') is not null),
    ('write_delivery_log', to_regprocedure('public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)') is not null),
    ('deliver_digital_order', to_regprocedure('public.deliver_digital_order(uuid,text)') is not null),
    ('create_order_with_item', to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') is not null)
), required_roles(role_name, role_exists) as (
  values
    ('anon', to_regrole('anon') is not null),
    ('authenticated', to_regrole('authenticated') is not null),
    ('service_role', to_regrole('service_role') is not null)
), required_columns(relation_name, column_name) as (
  values
    ('account_recharges','id'), ('account_recharges','recharge_no'),
    ('account_recharges','user_id'), ('account_recharges','status'),
    ('account_recharges','amount'), ('account_recharges','currency'),
    ('account_recharges','provider_trade_no'),
    ('profiles','id'), ('profiles','balance'),
    ('balance_transactions','business_type'), ('balance_transactions','business_id'),
    ('chain_transaction_claims','chain_id'), ('chain_transaction_claims','tx_hash'),
    ('orders','id'), ('orders','payment_status'), ('orders','status'),
    ('order_items','id'), ('order_items','order_id'), ('order_items','product_id'),
    ('order_items','sku_id'), ('order_items','delivery_type'),
    ('order_items','delivery_status'), ('order_items','product_snapshot'),
    ('products','id'), ('products','metadata'),
    ('product_skus','id'), ('product_skus','product_id'), ('product_skus','metadata'),
    ('order_deliveries','order_item_id'), ('order_deliveries','delivery_type'),
    ('order_deliveries','delivery_status'),
    ('digital_delivery_secrets','delivery_id'), ('digital_delivery_secrets','content')
), column_state as (
  select required_columns.*,
    exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = to_regclass('public.' || required_columns.relation_name)
        and attname = required_columns.column_name and attnum > 0 and not attisdropped
    ) as column_exists
  from required_columns
), candidate_objects(object_name, object_exists) as (
  values
    ('account_recharge_daily_rates', to_regclass('public.account_recharge_daily_rates') is not null),
    ('bep20_transaction_usage_registry', to_regclass('public.bep20_transaction_usage_registry') is not null),
    ('account_recharge_chain_claims', to_regclass('public.account_recharge_chain_claims') is not null),
    ('supplier_fulfillment_requests', to_regclass('public.supplier_fulfillment_requests') is not null),
    ('claim_account_recharge_bep20_transfer', to_regprocedure('public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)') is not null),
    ('complete_account_recharge_usdt_cny_v1', to_regprocedure('public.complete_account_recharge_usdt_cny_v1(uuid,text)') is not null),
    ('claim_daju_supplier_fulfillment', to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)') is not null),
    ('record_daju_supplier_fulfillment_outcome', to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)') is not null)
), function_contract as (
  select
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.deliver_digital_order(uuid,text)')), '') as deliver_definition,
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)')), '') as create_definition
), aggregate_state as (
  select
    (select count(*) from (
      select chain_id, lower(tx_hash) from public.chain_transaction_claims
      group by chain_id, lower(tx_hash) having count(*) > 1
    ) duplicate_claims) as duplicate_chain_claim_group_count,
    (select count(*) from (
      select order_item_id from public.order_deliveries
      where delivery_type = 'supplier_delivery' and delivery_status = 'delivered'
      group by order_item_id having count(*) > 1
    ) duplicate_supplier_deliveries) as duplicate_supplier_delivery_group_count
), summary as (
  select
    (select count(*) from required_objects where not object_exists) as missing_object_count,
    (select count(*) from required_roles where not role_exists) as missing_role_count,
    (select count(*) from column_state where not column_exists) as missing_column_count,
    (select count(*) from candidate_objects where object_exists) as candidate_object_already_present_count,
    aggregate_state.duplicate_chain_claim_group_count,
    aggregate_state.duplicate_supplier_delivery_group_count,
    position('and public.normalize_order_item_delivery_type(delivery_type) = ''auto_delivery''' in function_contract.deliver_definition) > 0
      and position('supplier_binding' in function_contract.deliver_definition) = 0 as deliver_patch_contract_ready,
    position('v_auto_delivery boolean := false;' in function_contract.create_definition) > 0
      and position('if v_auto_delivery then' in function_contract.create_definition) > 0
      and position('''option_snapshot'', v_option_snapshot' in function_contract.create_definition) > 0
      and position('supplier_binding' in function_contract.create_definition) = 0 as create_patch_contract_ready
  from aggregate_state cross join function_contract
)
select summary.*,
  case when missing_object_count = 0 and missing_role_count = 0 and missing_column_count = 0
    and candidate_object_already_present_count = 0
    and duplicate_chain_claim_group_count = 0 and duplicate_supplier_delivery_group_count = 0
    and deliver_patch_contract_ready and create_patch_contract_ready
    then 'READY_FOR_TEST_MIGRATIONS' else 'BLOCKED' end as assessment
from summary;

rollback;
