-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

with expected_columns(name, expected_type) as (
  values
    ('requested_cny_amount','numeric'), ('expected_usdt_amount','numeric'), ('actual_received_usdt','numeric'),
    ('credited_cny_amount','numeric'), ('settlement_currency','text'), ('payment_token_contract','text'),
    ('locked_market_rate','numeric'), ('locked_settlement_rate','numeric'), ('rate_source','text'),
    ('rate_effective_date','date'), ('rate_effective_at','timestamp with time zone'),
    ('rate_locked_at','timestamp with time zone')
), column_state as (
  select expected_columns.name,
    coalesce(format_type(attribute.atttypid, attribute.atttypmod) like expected_columns.expected_type || '%', false) as column_valid
  from expected_columns
  left join pg_catalog.pg_attribute attribute
    on attribute.attrelid = to_regclass('public.account_recharges')
   and attribute.attname = expected_columns.name and attribute.attnum > 0 and not attribute.attisdropped
), summary as (
  select
    count(*) filter (where not column_valid) as invalid_column_count,
    to_regclass('public.account_recharge_daily_rates') is not null as daily_rate_table_exists,
    to_regclass('public.account_recharge_chain_claims') is not null as recharge_claim_table_exists,
    to_regclass('public.bep20_transaction_usage_registry') is not null as usage_registry_exists,
    to_regprocedure('public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)') is not null as claim_rpc_exists,
    to_regprocedure('public.complete_account_recharge_usdt_cny_v1(uuid,text)') is not null as credit_rpc_exists,
    to_regclass('public.account_recharge_chain_claims') is not null
      and (select count(*) from (
        select chain_id, tx_hash from public.account_recharge_chain_claims group by chain_id, tx_hash having count(*) > 1
      ) duplicates) = 0 as recharge_tx_hash_unique,
    position('credited_cny := trunc(target_recharge.actual_received_usdt * target_recharge.locked_settlement_rate, 2)'
      in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.complete_account_recharge_usdt_cny_v1(uuid,text)')), '')) > 0
      as credit_uses_actual_usdt_and_locked_rate,
    position('update public.profiles set balance = after_balance'
      in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.complete_account_recharge_usdt_cny_v1(uuid,text)')), '')) > 0
      as credit_updates_cny_profile_balance
  from column_state
)
select summary.*,
  case when invalid_column_count = 0 and daily_rate_table_exists and recharge_claim_table_exists
    and usage_registry_exists and claim_rpc_exists and credit_rpc_exists and recharge_tx_hash_unique
    and credit_uses_actual_usdt_and_locked_rate and credit_updates_cny_profile_balance
    then 'PASS' else 'BLOCKED' end as assessment
from summary;

select
  (has_table_privilege('anon', 'public.account_recharge_daily_rates', 'INSERT')
    or has_table_privilege('anon', 'public.account_recharge_daily_rates', 'UPDATE')
    or has_table_privilege('anon', 'public.account_recharge_daily_rates', 'DELETE')) as anon_daily_rate_write,
  (has_table_privilege('authenticated', 'public.account_recharge_daily_rates', 'INSERT')
    or has_table_privilege('authenticated', 'public.account_recharge_daily_rates', 'UPDATE')
    or has_table_privilege('authenticated', 'public.account_recharge_daily_rates', 'DELETE')) as authenticated_daily_rate_write,
  (has_table_privilege('anon', 'public.account_recharge_chain_claims', 'INSERT')
    or has_table_privilege('anon', 'public.account_recharge_chain_claims', 'UPDATE')
    or has_table_privilege('anon', 'public.account_recharge_chain_claims', 'DELETE')) as anon_claim_write,
  (has_table_privilege('authenticated', 'public.account_recharge_chain_claims', 'INSERT')
    or has_table_privilege('authenticated', 'public.account_recharge_chain_claims', 'UPDATE')
    or has_table_privilege('authenticated', 'public.account_recharge_chain_claims', 'DELETE')) as authenticated_claim_write,
  has_function_privilege('service_role', 'public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)', 'EXECUTE') as service_role_claim_execute,
  has_function_privilege('service_role', 'public.complete_account_recharge_usdt_cny_v1(uuid,text)', 'EXECUTE') as service_role_credit_execute,
  has_function_privilege('anon', 'public.complete_account_recharge_usdt_cny_v1(uuid,text)', 'EXECUTE') as anon_credit_execute,
  has_function_privilege('authenticated', 'public.complete_account_recharge_usdt_cny_v1(uuid,text)', 'EXECUTE') as authenticated_credit_execute;

rollback;
