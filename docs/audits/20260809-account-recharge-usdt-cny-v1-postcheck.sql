-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

with expected_columns(name) as (
  values
    ('requested_cny_amount'), ('expected_usdt_amount'), ('actual_received_usdt'),
    ('credited_cny_amount'), ('settlement_currency'), ('payment_token_contract'),
    ('locked_market_rate'), ('locked_settlement_rate'), ('rate_source'),
    ('rate_effective_date'), ('rate_effective_at'), ('rate_locked_at')
), column_state as (
  select expected_columns.name,
    exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = to_regclass('public.account_recharges')
        and attname = expected_columns.name and attnum > 0 and not attisdropped
    ) as column_exists
  from expected_columns
), summary as (
  select
    count(*) filter (where not column_exists) as missing_column_count,
    to_regclass('public.account_recharge_daily_rates') is not null as daily_rate_table_exists,
    to_regclass('public.account_recharge_chain_claims') is not null as recharge_claim_table_exists,
    to_regclass('public.bep20_transaction_usage_registry') is not null as usage_registry_exists,
    to_regprocedure('public.claim_account_recharge_bep20_transfer(uuid,integer,text,integer,numeric,text,timestamp with time zone,text,text,text,numeric,numeric,integer)') is not null as claim_rpc_exists,
    to_regprocedure('public.complete_account_recharge_usdt_cny_v1(uuid,text)') is not null as credit_rpc_exists
  from column_state
)
select summary.*,
  case when missing_column_count = 0 and daily_rate_table_exists and recharge_claim_table_exists
    and usage_registry_exists and claim_rpc_exists and credit_rpc_exists
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
    or has_table_privilege('authenticated', 'public.account_recharge_chain_claims', 'DELETE')) as authenticated_claim_write;

rollback;
