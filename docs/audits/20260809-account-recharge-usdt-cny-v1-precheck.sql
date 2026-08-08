-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

with required_objects(name, object_exists) as (
  values
    ('account_recharges', to_regclass('public.account_recharges') is not null),
    ('profiles', to_regclass('public.profiles') is not null),
    ('balance_transactions', to_regclass('public.balance_transactions') is not null),
    ('chain_transaction_claims', to_regclass('public.chain_transaction_claims') is not null)
), summary as (
  select count(*) filter (where not object_exists) as missing_object_count
  from required_objects
)
select required_objects.*, summary.missing_object_count,
  case when summary.missing_object_count = 0 then 'PASS' else 'BLOCKED' end as assessment
from required_objects cross join summary
order by required_objects.name;

select
  count(*) filter (where provider_trade_no is not null and btrim(provider_trade_no) <> '') as recharge_tx_hash_count,
  count(*) filter (where currency not in ('CNY', 'USDT')) as unexpected_recharge_currency_count
from public.account_recharges;

select count(*) as existing_order_bep20_claim_count
from public.chain_transaction_claims;

rollback;
