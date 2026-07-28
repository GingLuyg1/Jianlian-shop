-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 settlement schema, dependency, RLS and ACL audit.
-- This query reads only PostgreSQL catalogs and information_schema.

with target_tables(table_name) as (
  values
    ('chain_payment_sessions'::text),
    ('chain_transactions'),
    ('chain_transaction_claims'),
    ('payment_sessions'),
    ('order_payments'),
    ('orders'),
    ('profiles'),
    ('balance_transactions'),
    ('bep20_overpayment_dispositions'),
    ('bep20_underpayment_dispositions'),
    ('site_settings'),
    ('site_setting_logs'),
    ('account_recharges'),
    ('bep20_admin_review_attempts'),
    ('admin_audit_logs'),
    ('order_status_logs')
),
target_columns(table_name, column_name) as (
  values
    ('chain_payment_sessions','id'),
    ('chain_payment_sessions','order_id'),
    ('chain_payment_sessions','payment_id'),
    ('chain_payment_sessions','payment_session_id'),
    ('chain_payment_sessions','expected_amount'),
    ('chain_payment_sessions','confirmed_amount'),
    ('chain_payment_sessions','expected_raw_amount'),
    ('chain_payment_sessions','confirmed_raw_amount'),
    ('chain_payment_sessions','submitted_tx_hash'),
    ('chain_payment_sessions','expires_at'),
    ('chain_payment_sessions','confirmed_at'),
    ('chain_payment_sessions','created_at'),
    ('chain_payment_sessions','status'),
    ('chain_payment_sessions','chain_id'),
    ('chain_payment_sessions','token_contract'),
    ('chain_payment_sessions','receive_address'),
    ('chain_payment_sessions','manual_review_decision'),
    ('chain_transactions','chain_payment_session_id'),
    ('chain_transactions','order_id'),
    ('chain_transactions','chain_id'),
    ('chain_transactions','tx_hash'),
    ('chain_transactions','log_index'),
    ('chain_transactions','confirmation_count'),
    ('chain_transactions','raw_amount'),
    ('chain_transactions','normalized_amount'),
    ('chain_transactions','token_contract'),
    ('chain_transactions','to_address'),
    ('chain_transactions','block_timestamp'),
    ('chain_transactions','created_at'),
    ('chain_transactions','status'),
    ('chain_transaction_claims','order_id'),
    ('chain_transaction_claims','chain_payment_session_id'),
    ('chain_transaction_claims','chain_id'),
    ('chain_transaction_claims','tx_hash'),
    ('payment_sessions','business_type'),
    ('payment_sessions','business_id'),
    ('payment_sessions','user_id'),
    ('payment_sessions','payable_amount'),
    ('payment_sessions','currency'),
    ('payment_sessions','expires_at'),
    ('payment_sessions','status'),
    ('order_payments','order_id'),
    ('order_payments','user_id'),
    ('order_payments','payment_session_id'),
    ('order_payments','payable_amount'),
    ('order_payments','payable_currency'),
    ('order_payments','received_amount'),
    ('order_payments','received_currency'),
    ('order_payments','status'),
    ('orders','id'),
    ('orders','user_id'),
    ('orders','currency'),
    ('orders','payment_method'),
    ('orders','payment_expires_at'),
    ('orders','status'),
    ('orders','payment_status'),
    ('profiles','id'),
    ('profiles','balance'),
    ('balance_transactions','id'),
    ('balance_transactions','business_id'),
    ('balance_transactions','amount'),
    ('balance_transactions','balance_before'),
    ('balance_transactions','balance_after'),
    ('balance_transactions','metadata'),
    ('balance_transactions','status'),
    ('bep20_overpayment_dispositions','chain_session_id'),
    ('bep20_overpayment_dispositions','order_id'),
    ('bep20_overpayment_dispositions','payment_id'),
    ('bep20_overpayment_dispositions','balance_transaction_id'),
    ('bep20_overpayment_dispositions','credited_cny'),
    ('bep20_overpayment_dispositions','disposition'),
    ('bep20_overpayment_dispositions','settlement_source'),
    ('bep20_underpayment_dispositions','order_id'),
    ('bep20_underpayment_dispositions','chain_session_id'),
    ('bep20_underpayment_dispositions','payment_id'),
    ('bep20_underpayment_dispositions','payment_session_id'),
    ('bep20_underpayment_dispositions','balance_transaction_id'),
    ('bep20_underpayment_dispositions','credited_cny'),
    ('bep20_underpayment_dispositions','disposition'),
    ('bep20_underpayment_dispositions','settlement_source'),
    ('site_settings','setting_key'),
    ('site_settings','setting_value'),
    ('account_recharges','id'),
    ('account_recharges','user_id'),
    ('account_recharges','provider_trade_no'),
    ('account_recharges','status'),
    ('bep20_admin_review_attempts','chain_payment_session_id'),
    ('bep20_admin_review_attempts','action'),
    ('bep20_admin_review_attempts','result_status'),
    ('admin_audit_logs','target_type'),
    ('admin_audit_logs','target_id'),
    ('admin_audit_logs','result'),
    ('order_status_logs','order_id')
),
target_functions(function_name, signature, expected_state) as (
  values
    ('complete_payment_session', 'public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)', 'service_role_execute'),
    ('begin_bep20_payment_completion', 'public.begin_bep20_payment_completion(uuid,boolean)', 'service_role_execute'),
    ('prepare_bep20_payment_completion', 'public.prepare_bep20_payment_completion(uuid,text,numeric,numeric,boolean,uuid)', 'service_role_execute'),
    ('finish_bep20_payment_completion', 'public.finish_bep20_payment_completion(uuid,uuid,text,text,uuid)', 'service_role_execute'),
    ('release_order_inventory', 'public.release_order_inventory(uuid,text)', 'service_role_execute'),
    ('cancel_unpaid_order', 'public.cancel_unpaid_order(uuid,text)', 'authenticated_and_service_role_execute'),
    ('is_admin', 'public.is_admin(uuid)', 'policy_helper_review'),
    ('is_super_admin', 'public.is_super_admin(uuid)', 'policy_helper_review'),
    ('sync_bep20_chain_order_payment', 'public.sync_bep20_chain_order_payment()', 'trigger_function_review'),
    ('settle_bep20_automatic_overpayment', 'public.settle_bep20_automatic_overpayment(uuid,text,integer,text)', 'service_role_execute'),
    ('credit_bep20_overpayment_to_wallet_legacy', 'public.credit_bep20_overpayment_to_wallet(uuid,text,text)', 'expected_absent_after_20260727'),
    ('credit_bep20_overpayment_to_wallet_current', 'public.credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)', 'service_role_execute'),
    ('list_expirable_bep20_underpayments', 'public.list_expirable_bep20_underpayments(integer)', 'service_role_execute'),
    ('settle_bep20_underpayment_to_wallet_current', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid,boolean)', 'service_role_execute'),
    ('settle_bep20_underpayment_to_wallet_legacy', 'public.settle_bep20_underpayment_to_wallet(uuid,integer,text,text,text,uuid)', 'expected_absent_after_20260729')
),
table_catalog as (
  select
    tt.table_name,
    c.oid,
    c.relrowsecurity,
    c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) as owner_name
  from target_tables tt
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', tt.table_name))
),
table_acl as (
  select
    tc.table_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grantee',
          case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        )
        order by acl.grantee, acl.privilege_type
      ) filter (where acl.privilege_type is not null),
      '[]'::jsonb
    ) as acl_summary,
    count(*) filter (
      where (
        acl.grantee = 0
        or pg_get_userbyid(acl.grantee) in ('anon','authenticated')
      )
      and acl.privilege_type <> 'SELECT'
    ) as unexpected_client_table_write_acl_count
  from table_catalog tc
  left join lateral pg_catalog.aclexplode(
    coalesce(
      (select c.relacl from pg_catalog.pg_class c where c.oid = tc.oid),
      case
        when tc.oid is null then null::aclitem[]
        else pg_catalog.acldefault(
          'r',
          (select c.relowner from pg_catalog.pg_class c where c.oid = tc.oid)
        )
      end
    )
  ) acl on tc.oid is not null
  group by tc.table_name
),
column_catalog as (
  select
    tcol.table_name,
    tcol.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.numeric_precision,
    c.numeric_scale
  from target_columns tcol
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = tcol.table_name
   and c.column_name = tcol.column_name
),
column_acl as (
  select
    count(*) filter (
      where (
        acl.grantee = 0
        or pg_get_userbyid(acl.grantee) in ('anon','authenticated')
      )
      and acl.privilege_type <> 'SELECT'
      and (
        cls.relname <> 'profiles'
        or a.attname = 'balance'
      )
    ) as unexpected_client_column_write_acl_count
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class cls on cls.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = cls.relnamespace
  cross join lateral pg_catalog.aclexplode(
    case
      when a.attacl is not null and cardinality(a.attacl) > 0 then a.attacl
      else null::aclitem[]
    end
  ) acl
  where n.nspname = 'public'
    and cls.relname in (select table_name from target_tables)
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and cardinality(a.attacl) > 0
),
profiles_balance_acl as (
  select
    case
      when c.oid is null or a.attnum is null then null::boolean
      else exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'UPDATE'
      )
      or exists (
        select 1
        from pg_catalog.aclexplode(
          case
            when a.attacl is not null and cardinality(a.attacl) > 0
              then a.attacl
            else null::aclitem[]
          end
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'UPDATE'
      )
    end as public_can_update_profiles_balance,
    case
      when c.oid is null or a.attnum is null or to_regrole('anon') is null
        then null::boolean
      else has_column_privilege(
        to_regrole('anon'),
        c.oid,
        a.attname,
        'UPDATE'
      )
    end as anon_can_update_profiles_balance,
    case
      when c.oid is null or a.attnum is null or to_regrole('authenticated') is null
        then null::boolean
      else has_column_privilege(
        to_regrole('authenticated'),
        c.oid,
        a.attname,
        'UPDATE'
      )
    end as authenticated_can_update_profiles_balance,
    case
      when c.oid is null or a.attnum is null or to_regrole('service_role') is null
        then null::boolean
      else has_column_privilege(
        to_regrole('service_role'),
        c.oid,
        a.attname,
        'UPDATE'
      )
    end as service_role_can_update_profiles_balance
  from (values (1)) seed(value)
  left join pg_catalog.pg_class c
    on c.oid = to_regclass('public.profiles')
  left join pg_catalog.pg_attribute a
    on a.attrelid = c.oid
   and a.attname = 'balance'
   and a.attnum > 0
   and not a.attisdropped
),
constraint_catalog as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table_name', c.relname,
        'constraint_name', con.conname,
        'constraint_type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      )
      order by c.relname, con.conname
    ),
    '[]'::jsonb
  ) as definitions
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (select table_name from target_tables)
    and con.contype in ('c','u','f','p')
),
index_catalog as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table_name', tablename,
        'index_name', indexname,
        'definition', indexdef
      )
      order by tablename, indexname
    ),
    '[]'::jsonb
  ) as definitions
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
),
risk_setting_state as (
  select
    to_regclass('public.site_settings') is not null as table_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_key'
    ) as setting_key_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_value'
    ) as setting_value_exists,
    (
      select c.udt_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'site_settings'
        and c.column_name = 'setting_value'
    ) as setting_value_udt_name
),
risk_setting_document as (
  select
    case
      when not rss.table_exists
        or not rss.setting_key_exists
        or not rss.setting_value_exists
        then null::xml
      else query_to_xml(
        $audit$
          select jsonb_agg(
            jsonb_build_object(
              'setting_key', expected.setting_key,
              'record_exists', ss.setting_key is not null,
              'value_is_null',
                ss.setting_key is null
                or ss.setting_value is null
                or normalized.setting_json = 'null'::jsonb
                or (
                  jsonb_typeof(normalized.setting_json) = 'object'
                  and (
                    normalized.setting_json -> 'value' is null
                    or normalized.setting_json -> 'value' = 'null'::jsonb
                  )
                ),
              'value_is_positive',
                case
                  when jsonb_typeof(normalized.setting_json) = 'number'
                    then (normalized.setting_json #>> '{}')::numeric > 0
                  when jsonb_typeof(normalized.setting_json -> 'value') = 'number'
                    then (normalized.setting_json ->> 'value')::numeric > 0
                  else false
                end,
              'value_json_type',
                case
                  when jsonb_typeof(normalized.setting_json) = 'object'
                    then coalesce(
                      jsonb_typeof(normalized.setting_json -> 'value'),
                      'missing'
                    )
                  else coalesce(jsonb_typeof(normalized.setting_json), 'missing')
                end
            )
            order by expected.setting_key
          )::text as risk_setting_shape
          from (
            values
              ('max_auto_overpayment_ratio'::text),
              ('max_auto_overpayment_usdt'::text)
          ) expected(setting_key)
          left join public.site_settings ss using (setting_key)
          left join lateral (
            select to_jsonb(ss.setting_value) as setting_json
          ) normalized on true
        $audit$,
        true,
        false,
        ''
      )
    end as document
  from risk_setting_state rss
),
function_catalog as (
  select
    tf.function_name,
    tf.signature,
    tf.expected_state,
    p.oid,
    case
      when p.oid is null then null
      else format(
        '%I.%I(%s)',
        pn.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid)
      )
    end as actual_signature,
    pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,
    (
      select setting
      from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
      limit 1
    ) as search_path_setting,
    md5(p.prosrc) as source_hash,
    exists (
      select 1
      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_can_execute,
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
    end as service_role_can_execute,
    (
      select count(*)
      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
      where acl.privilege_type = 'EXECUTE'
        and case
          when tf.expected_state = 'service_role_execute'
            then acl.grantee = 0
              or (
                acl.grantee <> p.proowner
                and pg_get_userbyid(acl.grantee) <> 'service_role'
              )
          when tf.expected_state = 'authenticated_and_service_role_execute'
            then acl.grantee = 0
              or (
                acl.grantee <> p.proowner
                and pg_get_userbyid(acl.grantee) not in ('authenticated','service_role')
              )
          when tf.expected_state like 'expected_absent%'
            then true
          else false
        end
    ) as unexpected_execute_grantee_count,
    case
      when p.oid is null and tf.expected_state in (
        'service_role_execute',
        'authenticated_and_service_role_execute'
      ) then null::bigint
      when tf.expected_state like 'expected_absent%' then 0::bigint
      when tf.expected_state = 'service_role_execute' then
        (
          to_regrole('service_role') is null
          or not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) acl
            where acl.grantee = to_regrole('service_role')
              and acl.privilege_type = 'EXECUTE'
          )
        )::integer
      when tf.expected_state = 'authenticated_and_service_role_execute' then
        (
          to_regrole('authenticated') is null
          or not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) acl
            where acl.grantee = to_regrole('authenticated')
              and acl.privilege_type = 'EXECUTE'
          )
        )::integer
        +
        (
          to_regrole('service_role') is null
          or not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) acl
            where acl.grantee = to_regrole('service_role')
              and acl.privilege_type = 'EXECUTE'
          )
        )::integer
      else 0::bigint
    end as missing_expected_execute_grantee_count
  from target_functions tf
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(tf.signature)
  left join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
),
function_assessment as (
  select
    fc.*,
    case
      when fc.expected_state like 'expected_absent%' and fc.oid is null
        then 'PASS'
      when fc.expected_state like 'expected_absent%' and fc.oid is not null
        then 'REVIEW_REQUIRED'
      when fc.expected_state in (
        'service_role_execute',
        'authenticated_and_service_role_execute'
      ) and fc.oid is null
        then 'MISSING_FUNCTION'
      when fc.expected_state in (
        'service_role_execute',
        'authenticated_and_service_role_execute'
      ) and (
        fc.security_definer is not true
        or fc.search_path_setting is distinct from 'search_path=public'
        or fc.unexpected_execute_grantee_count <> 0
        or fc.missing_expected_execute_grantee_count <> 0
      )
        then 'REVIEW_REQUIRED'
      when fc.expected_state in (
        'service_role_execute',
        'authenticated_and_service_role_execute'
      )
        then 'PASS'
      when fc.oid is null
        then 'MISSING_FUNCTION'
      else 'REVIEW_REQUIRED'
    end as function_contract_status
  from function_catalog fc
)
select
  'bep20_settlement_schema_permission_audit'::text as audit_name,
  (
    select jsonb_agg(
      jsonb_build_object(
        'table_name', tc.table_name,
        'exists', tc.oid is not null,
        'owner', tc.owner_name,
        'rls_enabled', tc.relrowsecurity,
        'rls_forced', tc.relforcerowsecurity,
        'acl', ta.acl_summary,
        'unexpected_client_table_write_acl_count',
          ta.unexpected_client_table_write_acl_count
      )
      order by tc.table_name
    )
    from table_catalog tc
    join table_acl ta using (table_name)
  ) as table_summary,
  (
    select jsonb_agg(
      jsonb_build_object(
        'table_name', cc.table_name,
        'column_name', cc.column_name,
        'exists', cc.data_type is not null,
        'data_type', cc.data_type,
        'udt_name', cc.udt_name,
        'nullable', cc.is_nullable,
        'default', cc.column_default,
        'numeric_precision', cc.numeric_precision,
        'numeric_scale', cc.numeric_scale
      )
      order by cc.table_name, cc.column_name
    )
    from column_catalog cc
  ) as column_summary,
  (select unexpected_client_column_write_acl_count from column_acl)
    as unexpected_client_column_acl_count,
  (select public_can_update_profiles_balance from profiles_balance_acl)
    as public_can_update_profiles_balance,
  (select anon_can_update_profiles_balance from profiles_balance_acl)
    as anon_can_update_profiles_balance,
  (select authenticated_can_update_profiles_balance from profiles_balance_acl)
    as authenticated_can_update_profiles_balance,
  (select service_role_can_update_profiles_balance from profiles_balance_acl)
    as service_role_can_update_profiles_balance,
  case
    when (select public_can_update_profiles_balance from profiles_balance_acl) is null
      or (select anon_can_update_profiles_balance from profiles_balance_acl) is null
      or (select authenticated_can_update_profiles_balance from profiles_balance_acl) is null
      or (select service_role_can_update_profiles_balance from profiles_balance_acl) is null
      then 'NOT_CHECKED_MISSING_OBJECTS'
    when (select public_can_update_profiles_balance from profiles_balance_acl)
      or (select anon_can_update_profiles_balance from profiles_balance_acl)
      or (select authenticated_can_update_profiles_balance from profiles_balance_acl)
      or not (select service_role_can_update_profiles_balance from profiles_balance_acl)
      then 'REVIEW_REQUIRED'
    else 'PASS'
  end as profiles_balance_acl_status,
  (
    select jsonb_agg(
      jsonb_build_object(
        'function_name', fc.function_name,
        'signature', fc.signature,
        'actual_signature', fc.actual_signature,
        'expected_state', fc.expected_state,
        'function_exists', fc.oid is not null,
        'owner', fc.owner_name,
        'security_definer', fc.security_definer,
        'search_path', fc.search_path_setting,
        'search_path_public', fc.search_path_setting = 'search_path=public',
        'source_hash', fc.source_hash,
        'public_execute', fc.public_can_execute,
        'anon_execute', fc.anon_can_execute,
        'authenticated_execute', fc.authenticated_can_execute,
        'service_role_execute', fc.service_role_can_execute,
        'unexpected_execute_grantee_count', fc.unexpected_execute_grantee_count,
        'missing_expected_execute_grantee_count',
          fc.missing_expected_execute_grantee_count,
        'function_contract_status', fc.function_contract_status
      )
      order by fc.function_name
    )
    from function_assessment fc
  ) as function_summary,
  jsonb_build_object(
    'site_settings_exists', rss.table_exists,
    'setting_key_exists', rss.setting_key_exists,
    'setting_value_exists', rss.setting_value_exists,
    'setting_value_udt_name', rss.setting_value_udt_name
  ) as risk_setting_object_state,
  case
    when (select document from risk_setting_document) is null then null::jsonb
    else (
      (xpath(
        '/table/row/risk_setting_shape/text()',
        (select document from risk_setting_document)
      ))[1]::text
    )::jsonb
  end as risk_setting_shape,
  (select definitions from constraint_catalog) as constraint_summary,
  (select definitions from index_catalog) as index_summary
from risk_setting_state rss;
