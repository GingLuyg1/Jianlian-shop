-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 settlement Migration History and schema-evidence audit.
-- Run this file alone. It returns only the five requested version summaries.

with target_versions(version, expected_schema_evidence) as (
  values
    (
      '20260727'::text,
      'multi-object automatic-overpayment schema contract; schema state cannot uniquely identify the migration'::text
    ),
    ('20260728'::text, 'bep20_underpayment_dispositions + list_expirable_bep20_underpayments(integer)'::text),
    ('20260729'::text, 'seven-argument underpayment RPC present; six-argument RPC absent'::text),
    ('20260730'::text, 'no unique persistent marker; confirmation column and seven-argument RPC are supporting evidence only'::text),
    (
      '20260728230700'::text,
      'phase-1 table and function permission contract; schema state cannot uniquely identify the migration'::text
    )
),
phase_one_table_acl_state as (
  select
    count(*) filter (where c.oid is not null) = 2 as target_tables_exist,
    coalesce(
      bool_and(
        c.oid is not null
        and c.relrowsecurity
        and not exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
          ) acl
          where acl.grantee = 0
        )
        and not exists (
          select 1
          from pg_catalog.pg_attribute a
          cross join lateral pg_catalog.aclexplode(a.attacl) acl
          where a.attrelid = c.oid
            and a.attnum > 0
            and not a.attisdropped
            and a.attacl is not null
            and cardinality(a.attacl) > 0
            and (
              acl.grantee = 0
              or pg_get_userbyid(acl.grantee) in ('anon','authenticated')
            )
        )
        and (
          to_regrole('anon') is not null
          and not exists (
            select 1
            from unnest(array[
              'SELECT','INSERT','UPDATE','DELETE',
              'TRUNCATE','REFERENCES','TRIGGER'
            ]::text[]) client_privilege(privilege_type)
            where has_table_privilege(
              to_regrole('anon'),
              c.oid,
              client_privilege.privilege_type
            )
          )
        )
        and (
          to_regrole('authenticated') is not null
          and has_table_privilege(to_regrole('authenticated'), c.oid, 'SELECT')
          and not exists (
            select 1
            from unnest(array[
              'INSERT','UPDATE','DELETE',
              'TRUNCATE','REFERENCES','TRIGGER'
            ]::text[]) write_privilege(privilege_type)
            where has_table_privilege(
              to_regrole('authenticated'),
              c.oid,
              write_privilege.privilege_type
            )
          )
        )
        and (
          to_regrole('service_role') is not null
          and not exists (
            select 1
            from unnest(array[
              'SELECT','INSERT','UPDATE','DELETE',
              'TRUNCATE','REFERENCES','TRIGGER'
            ]::text[]) required_privilege(privilege_type)
            where not has_table_privilege(
              to_regrole('service_role'),
              c.oid,
              required_privilege.privilege_type
            )
          )
        )
      ),
      false
    ) as table_acl_contract_met
  from (
    values
      ('chain_payment_sessions'::text),
      ('chain_transactions'::text)
  ) target(table_name)
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', target.table_name))
),
phase_one_function_acl_state as (
  select
    p.oid is not null as function_exists,
    case
      when p.oid is null then null::boolean
      else exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
    end as public_can_execute,
    case
      when p.oid is null or to_regrole('anon') is null then null::boolean
      else has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE')
    end as anon_can_execute,
    case
      when p.oid is null or to_regrole('authenticated') is null then null::boolean
      else has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE')
    end as authenticated_can_execute,
    case
      when p.oid is null or to_regrole('service_role') is null then null::boolean
      else has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE')
    end as service_role_can_execute
  from (values (1)) seed(value)
  left join pg_catalog.pg_proc p
    on p.oid = to_regprocedure(
      'public.begin_bep20_payment_completion(uuid,boolean)'
    )
),
automatic_overpayment_schema_state as (
  select
    to_regprocedure(
      'public.settle_bep20_automatic_overpayment(uuid,text,integer,text)'
    ) is not null as automatic_settlement_exact_signature_exists,
    to_regprocedure(
      'public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)'
    ) is not null as current_wallet_credit_signature_exists,
    to_regprocedure(
      'public.credit_bep20_overpayment_to_wallet(uuid,text,text)'
    ) is not null as legacy_wallet_credit_signature_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'bep20_overpayment_dispositions'
        and c.column_name = 'settlement_source'
    ) as settlement_source_column_exists,
    exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.bep20_overpayment_dispositions')
        and pg_get_constraintdef(c.oid) ilike '%settlement_source%'
        and pg_get_constraintdef(c.oid) ilike '%manual_admin%'
        and pg_get_constraintdef(c.oid) ilike '%automatic_service%'
    ) as settlement_source_check_contract_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'account_recharges'
        and c.column_name = 'transaction_reference'
    ) as account_recharge_transaction_reference_exists,
    to_regclass('public.site_settings') is not null as site_settings_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_key'
    ) as site_settings_key_column_exists
),
automatic_overpayment_risk_settings_document as (
  select
    case
      when aos.site_settings_exists and aos.site_settings_key_column_exists
        then query_to_xml(
          $audit$
            select
              count(*) filter (
                where setting_key = 'max_auto_overpayment_usdt'
              ) > 0 as max_auto_overpayment_usdt_setting_exists,
              count(*) filter (
                where setting_key = 'max_auto_overpayment_ratio'
              ) > 0 as max_auto_overpayment_ratio_setting_exists
            from public.site_settings
          $audit$,
          true,
          false,
          ''
        )
      else null::xml
    end as document
  from automatic_overpayment_schema_state aos
),
catalog_state as (
  select
    to_regclass('supabase_migrations.schema_migrations') as history_relation,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'supabase_migrations'
        and c.table_name = 'schema_migrations'
        and c.column_name = 'version'
    ) as history_version_column_exists,
    to_regclass('public.bep20_underpayment_dispositions') as underpayment_disposition_relation,
    to_regprocedure('public.settle_bep20_automatic_overpayment(uuid,text,integer,text)') as automatic_overpayment_rpc,
    aos.automatic_settlement_exact_signature_exists,
    aos.current_wallet_credit_signature_exists,
    aos.legacy_wallet_credit_signature_exists,
    aos.settlement_source_column_exists,
    aos.settlement_source_check_contract_exists,
    aos.account_recharge_transaction_reference_exists,
    case
      when ard.document is null then null::boolean
      else (
        (xpath(
          '/table/row/max_auto_overpayment_usdt_setting_exists/text()',
          ard.document
        ))[1]::text
      )::boolean
    end as max_auto_overpayment_usdt_setting_exists,
    case
      when ard.document is null then null::boolean
      else (
        (xpath(
          '/table/row/max_auto_overpayment_ratio_setting_exists/text()',
          ard.document
        ))[1]::text
      )::boolean
    end as max_auto_overpayment_ratio_setting_exists,
    to_regprocedure('public.list_expirable_bep20_underpayments(integer)') as underpayment_list_rpc,
    to_regprocedure(
      'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)'
    ) as underpayment_seven_argument_rpc,
    to_regprocedure(
      'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)'
    ) as underpayment_six_argument_rpc,
    to_regprocedure('public.begin_bep20_payment_completion(uuid,boolean)') as phase_one_completion_rpc,
    po.target_tables_exist as phase_one_target_tables_exist,
    po.table_acl_contract_met as phase_one_table_acl_contract_met,
    pf.public_can_execute as phase_one_public_execute,
    pf.anon_can_execute as phase_one_anon_execute,
    pf.authenticated_can_execute as phase_one_authenticated_execute,
    pf.service_role_can_execute as phase_one_service_role_execute,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'chain_payment_sessions'
        and c.column_name = 'confirmed_at'
    ) as confirmation_column_exists
  from phase_one_table_acl_state po
  cross join phase_one_function_acl_state pf
  cross join automatic_overpayment_schema_state aos
  cross join automatic_overpayment_risk_settings_document ard
),
history_document as (
  select
    case
      when cs.history_relation is null or not cs.history_version_column_exists then null::xml
      else query_to_xml(
        'select version::text as version from supabase_migrations.schema_migrations where version::text in (''20260727'',''20260728'',''20260729'',''20260730'',''20260728230700'')',
        true,
        false,
        ''
      )
    end as document
  from catalog_state cs
),
assessment as (
  select
    tv.version,
    tv.expected_schema_evidence,
    (cs.history_relation is not null) as migration_history_table_exists,
    cs.history_version_column_exists,
    case
      when hd.document is null then null::boolean
      else cardinality(
        xpath(
          format('/table/row/version[text()="%s"]/text()', tv.version),
          hd.document
        )
      ) > 0
    end as recorded,
    case tv.version
      when '20260727' then
        cs.automatic_settlement_exact_signature_exists
        and cs.current_wallet_credit_signature_exists
        and not cs.legacy_wallet_credit_signature_exists
        and cs.settlement_source_column_exists
        and cs.settlement_source_check_contract_exists
        and cs.account_recharge_transaction_reference_exists
        and cs.max_auto_overpayment_usdt_setting_exists is true
        and cs.max_auto_overpayment_ratio_setting_exists is true
      when '20260728' then
        cs.underpayment_disposition_relation is not null
        and cs.underpayment_list_rpc is not null
      when '20260729' then
        cs.underpayment_seven_argument_rpc is not null
        and cs.underpayment_six_argument_rpc is null
      when '20260730' then
        cs.confirmation_column_exists
        and cs.underpayment_seven_argument_rpc is not null
      when '20260728230700' then
        cs.phase_one_target_tables_exist
        and cs.phase_one_table_acl_contract_met
        and cs.phase_one_completion_rpc is not null
        and cs.phase_one_public_execute is false
        and cs.phase_one_anon_execute is false
        and cs.phase_one_authenticated_execute is false
        and cs.phase_one_service_role_execute is true
      else false
    end as schema_evidence_present,
    case tv.version
      when '20260727' then false
      when '20260730' then false
      when '20260728230700' then false
      else true
    end as schema_evidence_can_identify_migration,
    case when tv.version = '20260727'
      then cs.automatic_settlement_exact_signature_exists
    end as automatic_settlement_exact_signature_exists,
    case when tv.version = '20260727'
      then cs.current_wallet_credit_signature_exists
    end as current_wallet_credit_signature_exists,
    case when tv.version = '20260727'
      then cs.legacy_wallet_credit_signature_exists
    end as legacy_wallet_credit_signature_exists,
    case when tv.version = '20260727'
      then cs.settlement_source_column_exists
    end as settlement_source_column_exists,
    case when tv.version = '20260727'
      then cs.settlement_source_check_contract_exists
    end as settlement_source_check_contract_exists,
    case when tv.version = '20260727'
      then cs.account_recharge_transaction_reference_exists
    end as account_recharge_transaction_reference_exists,
    case when tv.version = '20260727'
      then cs.max_auto_overpayment_usdt_setting_exists
    end as max_auto_overpayment_usdt_setting_exists,
    case when tv.version = '20260727'
      then cs.max_auto_overpayment_ratio_setting_exists
    end as max_auto_overpayment_ratio_setting_exists,
    case when tv.version = '20260727' then (
      cs.automatic_settlement_exact_signature_exists::integer
      + cs.current_wallet_credit_signature_exists::integer
      + (not cs.legacy_wallet_credit_signature_exists)::integer
      + cs.settlement_source_column_exists::integer
      + cs.settlement_source_check_contract_exists::integer
      + cs.account_recharge_transaction_reference_exists::integer
      + coalesce(cs.max_auto_overpayment_usdt_setting_exists, false)::integer
      + coalesce(cs.max_auto_overpayment_ratio_setting_exists, false)::integer
    ) end as automatic_overpayment_evidence_component_count,
    case when tv.version = '20260727' then (
      cs.automatic_settlement_exact_signature_exists::integer
      + cs.current_wallet_credit_signature_exists::integer
      + cs.settlement_source_column_exists::integer
      + cs.settlement_source_check_contract_exists::integer
      + cs.account_recharge_transaction_reference_exists::integer
      + coalesce(cs.max_auto_overpayment_usdt_setting_exists, false)::integer
      + coalesce(cs.max_auto_overpayment_ratio_setting_exists, false)::integer
    ) end as automatic_overpayment_positive_evidence_component_count,
    case when tv.version = '20260728230700'
      then cs.phase_one_target_tables_exist
    end as phase_one_target_tables_exist,
    case when tv.version = '20260728230700'
      then cs.phase_one_table_acl_contract_met
    end as phase_one_table_acl_contract_met,
    case when tv.version = '20260728230700'
      then cs.phase_one_public_execute
    end as begin_completion_public_execute,
    case when tv.version = '20260728230700'
      then cs.phase_one_anon_execute
    end as begin_completion_anon_execute,
    case when tv.version = '20260728230700'
      then cs.phase_one_authenticated_execute
    end as begin_completion_authenticated_execute,
    case when tv.version = '20260728230700'
      then cs.phase_one_service_role_execute
    end as begin_completion_service_role_execute
  from target_versions tv
  cross join catalog_state cs
  cross join history_document hd
)
select
  'bep20_settlement_migration_history_audit'::text as audit_name,
  version,
  migration_history_table_exists,
  history_version_column_exists,
  recorded,
  schema_evidence_present,
  schema_evidence_can_identify_migration,
  automatic_settlement_exact_signature_exists,
  current_wallet_credit_signature_exists,
  legacy_wallet_credit_signature_exists,
  settlement_source_column_exists,
  settlement_source_check_contract_exists,
  account_recharge_transaction_reference_exists,
  max_auto_overpayment_usdt_setting_exists,
  max_auto_overpayment_ratio_setting_exists,
  phase_one_target_tables_exist,
  phase_one_table_acl_contract_met,
  begin_completion_public_execute,
  begin_completion_anon_execute,
  begin_completion_authenticated_execute,
  begin_completion_service_role_execute,
  expected_schema_evidence,
  case
    when not migration_history_table_exists then 'HISTORY_TABLE_MISSING'
    when not history_version_column_exists then 'HISTORY_VERSION_COLUMN_MISSING'
    when version = '20260727'
      and automatic_overpayment_positive_evidence_component_count > 0
      and schema_evidence_present is not true
      then 'PARTIAL_SCHEMA_EVIDENCE'
    when not schema_evidence_can_identify_migration and recorded is true
      then 'RECORDED_SCHEMA_EVIDENCE_NON_UNIQUE'
    when not schema_evidence_can_identify_migration and recorded is false
      then 'NOT_RECORDED_EXECUTION_NOT_PROVABLE_FROM_SCHEMA'
    when recorded is true and schema_evidence_present then 'RECORDED_AND_SCHEMA_PRESENT'
    when recorded is true and not schema_evidence_present then 'RECORDED_BUT_SCHEMA_MISSING'
    when recorded is false and schema_evidence_present then 'HISTORY_SCHEMA_DRIFT'
    else 'NOT_RECORDED_AND_SCHEMA_MISSING'
  end as audit_status
from assessment
order by
  case version
    when '20260727' then 1
    when '20260728' then 2
    when '20260728230700' then 3
    when '20260729' then 4
    when '20260730' then 5
    else 99
  end;
