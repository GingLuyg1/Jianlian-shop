-- Jianlian Shop / production BEP20 automatic-overpayment read-only audit
-- Target project must be confirmed manually before running:
--   Project name: Jianlian-shop
--   Project ref: qvbovrvybirscaurwuov
-- Run one numbered query at a time. Do not use Run all.
-- This file reads metadata and aggregate safety summaries only. It does not
-- return full TxHash, wallet addresses, customer data, or delivery secrets.

-- Query 01 - Baseline, migration-created and compatibility columns.
with required(table_name, column_name, requirement) as (
  select b.table_name, b.column_name, 'baseline_required'::text
  from (values
    ('orders','id'), ('orders','order_no'), ('orders','user_id'),
    ('orders','status'), ('orders','payment_status'), ('orders','payment_expires_at'),
    ('payment_sessions','id'), ('payment_sessions','business_type'),
    ('payment_sessions','business_id'), ('payment_sessions','user_id'),
    ('payment_sessions','payable_amount'), ('payment_sessions','currency'),
    ('payment_sessions','expires_at'), ('payment_sessions','status'),
    ('chain_payment_sessions','id'), ('chain_payment_sessions','order_id'),
    ('chain_payment_sessions','payment_session_id'), ('chain_payment_sessions','payment_id'),
    ('chain_payment_sessions','status'), ('chain_payment_sessions','chain_id'),
    ('chain_payment_sessions','token_decimals'), ('chain_payment_sessions','expected_raw_amount'),
    ('chain_payment_sessions','confirmed_raw_amount'), ('chain_payment_sessions','exchange_rate'),
    ('chain_payment_sessions','expires_at'), ('chain_payment_sessions','submitted_tx_hash'),
    ('chain_transactions','chain_payment_session_id'), ('chain_transactions','order_id'),
    ('chain_transactions','chain_id'), ('chain_transactions','tx_hash'),
    ('chain_transactions','log_index'), ('chain_transactions','block_timestamp'),
    ('chain_transactions','raw_amount'), ('chain_transactions','normalized_amount'),
    ('chain_transactions','confirmation_count'),
    ('chain_transaction_claims','chain_id'), ('chain_transaction_claims','tx_hash'),
    ('chain_transaction_claims','order_id'), ('chain_transaction_claims','chain_payment_session_id'),
    ('profiles','id'), ('profiles','balance'),
    ('balance_transactions','id'), ('balance_transactions','transaction_no'),
    ('balance_transactions','business_type'), ('balance_transactions','business_id'),
    ('balance_transactions','amount'), ('balance_transactions','balance_before'),
    ('balance_transactions','balance_after'), ('balance_transactions','status'),
    ('bep20_overpayment_dispositions','chain_session_id'),
    ('bep20_overpayment_dispositions','payment_id'),
    ('bep20_overpayment_dispositions','balance_transaction_id'),
    ('account_recharges','status'), ('account_recharges','provider_trade_no'),
    ('site_settings','setting_key'), ('site_settings','setting_value'),
    ('site_settings','setting_type'), ('site_settings','setting_group'),
    ('site_settings','is_public'), ('site_settings','updated_by')
  ) as b(table_name, column_name)
  union all
  values
    ('bep20_overpayment_dispositions','settlement_source','migration_expected_new'),
    ('account_recharges','transaction_reference','optional_compatibility')
)
select
  '01_required_columns'::text as query_id,
  r.table_name,
  r.column_name,
  r.requirement,
  (c.column_name is not null) as exists,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.numeric_precision,
  c.numeric_scale,
  case
    when r.requirement = 'baseline_required' and c.column_name is null
      then 'MISSING_BASELINE_BLOCKER'
    when r.table_name = 'profiles' and r.column_name = 'balance'
         and not (
           c.data_type = 'numeric'
           and c.numeric_precision = 12
           and c.numeric_scale = 2
         )
      then 'INCOMPATIBLE_BASELINE_BLOCKER'
    when r.requirement = 'migration_expected_new' and c.column_name is null
      then 'ABSENT_EXPECTED_BEFORE_MIGRATION'
    when r.requirement = 'migration_expected_new'
         and not (
           c.data_type = 'text'
           and c.is_nullable = 'NO'
           and coalesce(c.column_default, '') ilike '%manual_admin%'
         )
      then 'EXISTING_NEW_COLUMN_INCOMPATIBLE_BLOCKER'
    when r.requirement = 'optional_compatibility' and c.column_name is null
      then 'ABSENT_MIGRATION_WILL_ADD'
    when r.requirement = 'optional_compatibility'
         and not (
           c.data_type = 'text'
           and c.is_nullable = 'YES'
           and c.column_default is null
         )
      then 'OPTIONAL_COLUMN_INCOMPATIBLE_BLOCKER'
    else 'COMPATIBLE'
  end as preflight_status
from required r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by r.table_name, r.column_name;

-- Query 02 - Constraints and foreign keys on settlement objects.
select
  '02_constraints'::text as query_id,
  n.nspname as schema_name,
  cls.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class cls on cls.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'payment_sessions','chain_payment_sessions','chain_transactions',
    'chain_transaction_claims','profiles','balance_transactions',
    'bep20_overpayment_dispositions','account_recharges'
  )
order by cls.relname, con.conname;

-- Query 03 - Unique and supporting indexes used for idempotency.
select
  '03_indexes'::text as query_id,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'payment_sessions','chain_payment_sessions','chain_transactions',
    'chain_transaction_claims','balance_transactions',
    'bep20_overpayment_dispositions','account_recharges'
  )
order by tablename, indexname;

-- Query 04 - Related RPC signatures and security metadata.
select
  '04_function_metadata'::text as query_id,
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proparallel as parallel_safety,
  p.proconfig,
  p.proacl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'settle_bep20_automatic_overpayment',
    'credit_bep20_overpayment_to_wallet',
    'complete_payment_session',
    'claim_bep20_chain_transaction',
    'deliver_digital_order',
    'configure_bep20_automatic_overpayment_limits',
    'protect_bep20_overpayment_risk_settings'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- Query 05 - Full related RPC definitions for manual review.
select
  '05_function_definitions'::text as query_id,
  p.oid::regprocedure::text as function_signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'settle_bep20_automatic_overpayment',
    'credit_bep20_overpayment_to_wallet',
    'complete_payment_session',
    'claim_bep20_chain_transaction',
    'enforce_bep20_txhash_business_uniqueness',
    'configure_bep20_automatic_overpayment_limits',
    'protect_bep20_overpayment_risk_settings'
  )
order by p.oid::regprocedure::text;

-- Query 06 - Effective EXECUTE permissions for application roles.
with functions as (
  select p.oid, p.oid::regprocedure::text as function_signature
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'settle_bep20_automatic_overpayment',
      'credit_bep20_overpayment_to_wallet',
      'complete_payment_session',
      'claim_bep20_chain_transaction',
      'deliver_digital_order',
      'configure_bep20_automatic_overpayment_limits',
      'protect_bep20_overpayment_risk_settings'
    )
), roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
)
select
  '06_function_permissions'::text as query_id,
  f.function_signature,
  r.role_name,
  has_function_privilege(r.role_name, f.oid, 'EXECUTE') as can_execute
from functions f
cross join roles r
order by f.function_signature, r.role_name;

-- Query 07 - RLS and table ACL summaries. No business rows are read.
with targets(table_name) as (
  values
    ('orders'), ('payment_sessions'), ('chain_payment_sessions'),
    ('chain_transactions'), ('chain_transaction_claims'), ('profiles'),
    ('balance_transactions'), ('bep20_overpayment_dispositions'),
    ('order_deliveries'), ('digital_delivery_secrets'), ('digital_inventory'),
    ('site_settings'), ('site_setting_logs')
)
select
  '07_rls_acl'::text as query_id,
  t.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced,
  coalesce(c.relacl::text, 'NO_EXPLICIT_TABLE_ACL') as relacl
from targets t
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = t.table_name
order by t.table_name;

-- Query 08 - Policies and trigger installation state.
select
  '08_policies_and_triggers'::text as query_id,
  'policy'::text as object_type,
  p.tablename as table_name,
  p.policyname as object_name,
  concat_ws(' | ', p.cmd, array_to_string(p.roles, ','), p.qual, p.with_check) as definition
from pg_catalog.pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('profiles','balance_transactions','bep20_overpayment_dispositions','site_settings','site_setting_logs')
union all
select
  '08_policies_and_triggers',
  'trigger',
  c.relname,
  t.tgname,
  pg_get_triggerdef(t.oid, true)
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and t.tgname in (
    'trg_chain_claim_reject_completed_recharge_tx',
    'trg_recharge_reject_claimed_bep20_tx',
    'trg_protect_bep20_overpayment_risk_settings'
  )
order by table_name, object_type, object_name;

-- Query 09 - Safe aggregate integrity summary; no identifiers or TxHash values.
select
  '09_integrity_summary'::text as query_id,
  (select count(*) from public.bep20_overpayment_dispositions) as disposition_count,
  (select count(*)
   from public.bep20_overpayment_dispositions d
   where to_jsonb(d) ->> 'settlement_source' = 'automatic_service') as automatic_disposition_count,
  (select count(*)
   from public.bep20_overpayment_dispositions d
   where coalesce(to_jsonb(d) ->> 'settlement_source', 'manual_admin') = 'manual_admin') as manual_disposition_count,
  (select count(*) from (
     select payment_id from public.bep20_overpayment_dispositions group by payment_id having count(*) > 1
   ) duplicates) as duplicate_payment_disposition_groups,
  (select count(*)
   from public.bep20_overpayment_dispositions d
   left join public.balance_transactions bt on bt.id = d.balance_transaction_id
   where bt.id is null
      or bt.status <> 'completed'
      or bt.direction <> 'credit'
      or bt.amount <> d.credited_cny
      or bt.business_type <> 'system'
      or bt.business_id <> d.chain_session_id::text) as disposition_ledger_mismatch_count,
  (select count(*)
   from public.bep20_overpayment_dispositions d
   join public.orders o on o.id = d.order_id
   where o.payment_status <> 'paid') as credited_order_not_paid_count;

-- Query 10 - Safe anomaly and cross-business conflict counts.
select
  '10_conflict_summary'::text as query_id,
  (select count(*)
   from public.chain_transaction_claims ctc
   join public.account_recharges ar
     on ar.status in ('paid', 'succeeded')
    and (
      regexp_replace(lower(nullif(btrim(ar.provider_trade_no), '')), ':[0-9]+$', '') = lower(ctc.tx_hash)
      or regexp_replace(
        lower(nullif(btrim(to_jsonb(ar) ->> 'transaction_reference'), '')),
        ':[0-9]+$',
        ''
      ) = lower(ctc.tx_hash)
    )) as completed_recharge_order_tx_conflicts,
  (select count(*)
   from public.chain_payment_sessions cps
   join public.orders o on o.id = cps.order_id
   where cps.status = 'paid'
     and cps.confirmed_raw_amount > cps.expected_raw_amount
     and not exists (
       select 1 from public.bep20_overpayment_dispositions d
       where d.chain_session_id = cps.id
     )) as paid_overpayment_without_disposition_count,
  (select count(*)
   from public.bep20_overpayment_dispositions d
   join public.chain_payment_sessions cps on cps.id = d.chain_session_id
   where cps.status <> 'paid') as disposition_chain_not_paid_count;

-- Query 11 - Private automatic-overpayment risk limits and protection state.
-- Values are business risk thresholds, not credentials; null means fail closed.
select
  '11_risk_limit_summary'::text as query_id,
  ss.setting_key,
  ss.setting_type,
  ss.setting_group,
  ss.is_public,
  jsonb_typeof(ss.setting_value -> 'value') as value_json_type,
  case
    when jsonb_typeof(ss.setting_value -> 'value') = 'number'
    then ss.setting_value ->> 'value'
    else null
  end as configured_value,
  exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.site_settings'::regclass
      and t.tgname = 'trg_protect_bep20_overpayment_risk_settings'
      and not t.tgisinternal
  ) as protected_by_trigger
from public.site_settings ss
where ss.setting_key in (
  'max_auto_overpayment_usdt',
  'max_auto_overpayment_ratio'
)
union all
select
  '11_risk_limit_summary',
  'NO_ROWS',
  null,
  null,
  null,
  null,
  null,
  false
where not exists (
  select 1
  from public.site_settings ss
  where ss.setting_key in (
    'max_auto_overpayment_usdt',
    'max_auto_overpayment_ratio'
  )
)
order by setting_key;
