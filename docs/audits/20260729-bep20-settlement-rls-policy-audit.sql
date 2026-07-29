-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Jianlian Shop BEP20 settlement RLS policy and effective client privilege audit.
-- This query returns only catalog metadata, policy-expression hashes and risk-setting booleans.

with target_tables(table_name) as (
  values
    ('account_recharges'::text),
    ('admin_audit_logs'),
    ('balance_transactions'),
    ('order_payments'),
    ('order_status_logs'),
    ('orders'),
    ('payment_sessions'),
    ('profiles'),
    ('site_setting_logs'),
    ('site_settings')
),
target_roles(role_name, role_oid) as (
  values
    ('PUBLIC'::text, 0::oid),
    ('anon', to_regrole('anon')),
    ('authenticated', to_regrole('authenticated')),
    ('service_role', to_regrole('service_role'))
),
target_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER'),
    ('MAINTAIN')
),
table_catalog as (
  select
    tt.table_name,
    c.oid as table_oid,
    c.relowner,
    pg_get_userbyid(c.relowner) as owner_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    c.relacl
  from target_tables tt
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', tt.table_name))
),
effective_table_privileges as (
  select
    tc.table_name,
    tr.role_name,
    tp.privilege_name,
    case
      when tc.table_oid is null then null::boolean
      when tr.role_name = 'PUBLIC' then exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(tc.relacl, pg_catalog.acldefault('r', tc.relowner))
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = tp.privilege_name
      )
      when tr.role_oid is null then null::boolean
      when tp.privilege_name = 'MAINTAIN'
        and current_setting('server_version_num')::integer < 170000
        then false
      else has_table_privilege(
        tr.role_oid,
        tc.table_oid,
        tp.privilege_name
      )
    end as privilege_held
  from table_catalog tc
  cross join target_roles tr
  cross join target_privileges tp
),
table_acl as (
  select
    tc.table_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'grantor', pg_get_userbyid(acl.grantor),
            'grantee',
              case
                when acl.grantee = 0 then 'PUBLIC'
                else pg_get_userbyid(acl.grantee)
              end,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          order by acl.grantee, acl.privilege_type
        )
        from pg_catalog.aclexplode(
          coalesce(tc.relacl, pg_catalog.acldefault('r', tc.relowner))
        ) acl
      ),
      '[]'::jsonb
    ) as table_acl_summary
  from table_catalog tc
),
client_column_acl as (
  select
    tc.table_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'column_name', a.attname,
            'grantee',
              case
                when acl.grantee = 0 then 'PUBLIC'
                else pg_get_userbyid(acl.grantee)
              end,
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          order by a.attname, acl.grantee, acl.privilege_type
        )
        from pg_catalog.pg_attribute a
        cross join lateral pg_catalog.aclexplode(a.attacl) acl
        where a.attrelid = tc.table_oid
          and a.attnum > 0
          and not a.attisdropped
          and a.attacl is not null
          and (
            acl.grantee = 0
            or pg_get_userbyid(acl.grantee) in ('anon','authenticated')
          )
      ),
      '[]'::jsonb
    ) as client_column_acl_summary
  from table_catalog tc
),
policy_catalog as (
  select
    tc.table_name,
    p.oid as policy_oid,
    p.polname as policy_name,
    p.polpermissive,
    p.polroles,
    p.polcmd,
    p.polqual,
    p.polwithcheck,
    case p.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      when '*' then 'ALL'
      else 'UNKNOWN'
    end as command_name,
    array(
      select
        case
          when policy_role = 0 then 'public'
          else coalesce(pg_get_userbyid(policy_role), policy_role::text)
        end
      from unnest(coalesce(p.polroles, '{}'::oid[])) policy_role
      order by policy_role
    ) as policy_role_names,
    case
      when p.polqual is null then null::text
      else md5(
        regexp_replace(
          pg_get_expr(p.polqual, p.polrelid, true),
          '\s+',
          ' ',
          'g'
        )
      )
    end as qual_hash,
    case
      when p.polwithcheck is null then null::text
      else md5(
        regexp_replace(
          pg_get_expr(p.polwithcheck, p.polrelid, true),
          '\s+',
          ' ',
          'g'
        )
      )
    end as with_check_hash
  from table_catalog tc
  left join pg_catalog.pg_policy p on p.polrelid = tc.table_oid
),
policy_summary as (
  select
    tc.table_name,
    count(pc.policy_oid)::bigint as policy_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_name', pc.table_name,
          'policy_name', pc.policy_name,
          'policy_mode',
            case when pc.polpermissive then 'permissive' else 'restrictive' end,
          'policy_roles', to_jsonb(pc.policy_role_names),
          'command', pc.command_name,
          'qual_exists', pc.polqual is not null,
          'with_check_exists', pc.polwithcheck is not null,
          'qual_md5', pc.qual_hash,
          'with_check_md5', pc.with_check_hash
        )
        order by pc.policy_name
      ) filter (where pc.policy_oid is not null),
      '[]'::jsonb
    ) as policies,
    count(*) filter (
      where pc.policy_oid is not null
        and 0::oid = any(pc.polroles)
        and pc.polcmd in ('a','w','d','*')
    )::bigint as public_applicable_write_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and 0::oid = any(pc.polroles)
        and pc.polcmd in ('a','*')
    )::bigint as public_applicable_insert_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and 0::oid = any(pc.polroles)
        and pc.polcmd in ('w','*')
    )::bigint as public_applicable_update_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and 0::oid = any(pc.polroles)
        and pc.polcmd in ('d','*')
    )::bigint as public_applicable_delete_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('anon') = any(pc.polroles)
        )
        and pc.polcmd in ('a','*')
    )::bigint as anon_applicable_insert_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('anon') = any(pc.polroles)
        )
        and pc.polcmd in ('w','*')
    )::bigint as anon_applicable_update_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('anon') = any(pc.polroles)
        )
        and pc.polcmd in ('d','*')
    )::bigint as anon_applicable_delete_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('authenticated') = any(pc.polroles)
        )
        and pc.polcmd in ('a','*')
    )::bigint as authenticated_applicable_insert_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('authenticated') = any(pc.polroles)
        )
        and pc.polcmd in ('w','*')
    )::bigint as authenticated_applicable_update_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and (
          0::oid = any(pc.polroles)
          or to_regrole('authenticated') = any(pc.polroles)
        )
        and pc.polcmd in ('d','*')
    )::bigint as authenticated_applicable_delete_policy_count,
    count(*) filter (
      where pc.policy_oid is not null and pc.polcmd = '*'
    )::bigint as all_policy_count,
    count(*) filter (
      where pc.policy_oid is not null
        and pc.polcmd in ('a','w','*')
        and pc.polwithcheck is null
    )::bigint as insert_update_policy_without_with_check_count,
    count(*) filter (
      where pc.policy_oid is not null
        and pc.polcmd in ('w','d','*')
        and pc.polqual is null
    )::bigint as update_delete_policy_without_using_count
  from table_catalog tc
  left join policy_catalog pc using (table_name)
  group by tc.table_name
),
privilege_matrix as (
  select
    etp.table_name,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'SELECT'
    ), false) as public_select,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'INSERT'
    ), false) as public_insert,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'UPDATE'
    ), false) as public_update,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'DELETE'
    ), false) as public_delete,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'TRUNCATE'
    ), false) as public_truncate,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'REFERENCES'
    ), false) as public_references,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'TRIGGER'
    ), false) as public_trigger,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'PUBLIC' and etp.privilege_name = 'MAINTAIN'
    ), false) as public_maintain,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'SELECT'
    ), false) as anon_select,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'INSERT'
    ), false) as anon_insert,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'UPDATE'
    ), false) as anon_update,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'DELETE'
    ), false) as anon_delete,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'TRUNCATE'
    ), false) as anon_truncate,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'REFERENCES'
    ), false) as anon_references,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'TRIGGER'
    ), false) as anon_trigger,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'anon' and etp.privilege_name = 'MAINTAIN'
    ), false) as anon_maintain,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'SELECT'
    ), false) as authenticated_select,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'INSERT'
    ), false) as authenticated_insert,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'UPDATE'
    ), false) as authenticated_update,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'DELETE'
    ), false) as authenticated_delete,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'TRUNCATE'
    ), false) as authenticated_truncate,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'REFERENCES'
    ), false) as authenticated_references,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'TRIGGER'
    ), false) as authenticated_trigger,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'authenticated' and etp.privilege_name = 'MAINTAIN'
    ), false) as authenticated_maintain,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'SELECT'
    ), false) as service_role_select,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'INSERT'
    ), false) as service_role_insert,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'UPDATE'
    ), false) as service_role_update,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'DELETE'
    ), false) as service_role_delete,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'TRUNCATE'
    ), false) as service_role_truncate,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'REFERENCES'
    ), false) as service_role_references,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'TRIGGER'
    ), false) as service_role_trigger,
    coalesce(bool_or(etp.privilege_held) filter (
      where etp.role_name = 'service_role' and etp.privilege_name = 'MAINTAIN'
    ), false) as service_role_maintain
  from effective_table_privileges etp
  group by etp.table_name
),
default_table_acl as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'default_owner', pg_get_userbyid(d.defaclrole),
        'schema_scope',
          case
            when d.defaclnamespace = 0 then 'all_schemas'
            else n.nspname
          end,
        'grantee',
          case
            when acl.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl.grantee)
          end,
        'privilege', acl.privilege_type,
        'grantable', acl.is_grantable
      )
      order by d.defaclrole, d.defaclnamespace, acl.grantee, acl.privilege_type
    ),
    '[]'::jsonb
  ) as public_schema_client_default_table_acl_summary
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
  where d.defaclobjtype = 'r'
    and (d.defaclnamespace = 0 or n.nspname = 'public')
    and (
      acl.grantee = 0
      or pg_get_userbyid(acl.grantee) in ('anon','authenticated')
    )
),
risk_setting_object_state as (
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
    ) as setting_value_exists
),
risk_setting_document as (
  select
    case
      when not rsos.table_exists
        or not rsos.setting_key_exists
        or not rsos.setting_value_exists
        then null::xml
      else query_to_xml(
        $audit$
          with expected(setting_key) as (
            values
              ('max_auto_overpayment_usdt'::text),
              ('max_auto_overpayment_ratio'::text)
          ),
          normalized as (
            select
              expected.setting_key,
              ss.setting_key is not null as record_exists,
              to_jsonb(ss.setting_value) as setting_json
            from expected
            left join public.site_settings ss using (setting_key)
          ),
          assessed as (
            select
              setting_key,
              record_exists,
              setting_json is null
                or setting_json = 'null'::jsonb
                or (
                  jsonb_typeof(setting_json) = 'object'
                  and (
                    setting_json -> 'value' is null
                    or setting_json -> 'value' = 'null'::jsonb
                  )
                ) as value_is_null,
              case
                when jsonb_typeof(setting_json) = 'number'
                  then (setting_json #>> '{}')::numeric > 0
                when jsonb_typeof(setting_json) = 'object'
                  and jsonb_typeof(setting_json -> 'value') = 'number'
                  then (setting_json ->> 'value')::numeric > 0
                else false
              end as value_is_positive,
              setting_json is null
                or setting_json = 'null'::jsonb
                or jsonb_typeof(setting_json) = 'number'
                or (
                  jsonb_typeof(setting_json) = 'object'
                  and (
                    setting_json -> 'value' is null
                    or setting_json -> 'value' = 'null'::jsonb
                    or jsonb_typeof(setting_json -> 'value') = 'number'
                  )
                ) as value_type_is_expected
            from normalized
          )
          select
            bool_or(record_exists) filter (
              where setting_key = 'max_auto_overpayment_usdt'
            ) as max_auto_overpayment_usdt_record_exists,
            bool_or(value_is_null) filter (
              where setting_key = 'max_auto_overpayment_usdt'
            ) as max_auto_overpayment_usdt_value_is_null,
            bool_or(value_is_positive) filter (
              where setting_key = 'max_auto_overpayment_usdt'
            ) as max_auto_overpayment_usdt_value_is_positive,
            bool_or(record_exists) filter (
              where setting_key = 'max_auto_overpayment_ratio'
            ) as max_auto_overpayment_ratio_record_exists,
            bool_or(value_is_null) filter (
              where setting_key = 'max_auto_overpayment_ratio'
            ) as max_auto_overpayment_ratio_value_is_null,
            bool_or(value_is_positive) filter (
              where setting_key = 'max_auto_overpayment_ratio'
            ) as max_auto_overpayment_ratio_value_is_positive,
            bool_and(value_type_is_expected) as values_have_expected_type
          from assessed
        $audit$,
        true,
        false,
        ''
      )
    end as document
  from risk_setting_object_state rsos
),
risk_setting_shape as (
  select
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_usdt_record_exists/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_usdt_record_exists,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_usdt_value_is_null/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_usdt_value_is_null,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_usdt_value_is_positive/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_usdt_value_is_positive,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_ratio_record_exists/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_ratio_record_exists,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_ratio_value_is_null/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_ratio_value_is_null,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/max_auto_overpayment_ratio_value_is_positive/text()',
        rsd.document
      ))[1]::text
    )::boolean end as max_auto_overpayment_ratio_value_is_positive,
    case when rsd.document is null then null::boolean else (
      (xpath(
        '/table/row/values_have_expected_type/text()',
        rsd.document
      ))[1]::text
    )::boolean end as values_have_expected_type
  from risk_setting_document rsd
),
assessment_input as (
  select
    tc.*,
    pm.public_select,
    pm.public_insert,
    pm.public_update,
    pm.public_delete,
    pm.public_truncate,
    pm.public_references,
    pm.public_trigger,
    pm.public_maintain,
    pm.anon_select,
    pm.anon_insert,
    pm.anon_update,
    pm.anon_delete,
    pm.anon_truncate,
    pm.anon_references,
    pm.anon_trigger,
    pm.anon_maintain,
    pm.authenticated_select,
    pm.authenticated_insert,
    pm.authenticated_update,
    pm.authenticated_delete,
    pm.authenticated_truncate,
    pm.authenticated_references,
    pm.authenticated_trigger,
    pm.authenticated_maintain,
    pm.service_role_select,
    pm.service_role_insert,
    pm.service_role_update,
    pm.service_role_delete,
    pm.service_role_truncate,
    pm.service_role_references,
    pm.service_role_trigger,
    pm.service_role_maintain,
    ps.policy_count,
    ps.policies,
    ps.public_applicable_write_policy_count,
    ps.public_applicable_insert_policy_count,
    ps.public_applicable_update_policy_count,
    ps.public_applicable_delete_policy_count,
    ps.anon_applicable_insert_policy_count,
    ps.anon_applicable_update_policy_count,
    ps.anon_applicable_delete_policy_count,
    ps.authenticated_applicable_insert_policy_count,
    ps.authenticated_applicable_update_policy_count,
    ps.authenticated_applicable_delete_policy_count,
    ps.all_policy_count,
    ps.insert_update_policy_without_with_check_count,
    ps.update_delete_policy_without_using_count,
    ta.table_acl_summary,
    cca.client_column_acl_summary
  from table_catalog tc
  join privilege_matrix pm using (table_name)
  join policy_summary ps using (table_name)
  join table_acl ta using (table_name)
  join client_column_acl cca using (table_name)
)
select
  'bep20_settlement_rls_policy_audit'::text as audit_name,
  ai.table_name,
  ai.table_oid is not null as table_exists,
  ai.owner_name as owner,
  ai.rls_enabled,
  ai.rls_forced,
  ai.public_select,
  ai.public_insert,
  ai.public_update,
  ai.public_delete,
  ai.public_truncate,
  ai.public_references,
  ai.public_trigger,
  ai.public_maintain,
  ai.anon_select,
  ai.anon_insert,
  ai.anon_update,
  ai.anon_delete,
  ai.anon_truncate,
  ai.anon_references,
  ai.anon_trigger,
  ai.anon_maintain,
  ai.authenticated_select,
  ai.authenticated_insert,
  ai.authenticated_update,
  ai.authenticated_delete,
  ai.authenticated_truncate,
  ai.authenticated_references,
  ai.authenticated_trigger,
  ai.authenticated_maintain,
  ai.service_role_select,
  ai.service_role_insert,
  ai.service_role_update,
  ai.service_role_delete,
  ai.service_role_truncate,
  ai.service_role_references,
  ai.service_role_trigger,
  ai.service_role_maintain,
  ai.table_acl_summary,
  ai.client_column_acl_summary,
  ai.policy_count,
  ai.policies as policy_summary,
  ai.public_applicable_write_policy_count,
  ai.public_applicable_insert_policy_count,
  ai.public_applicable_update_policy_count,
  ai.public_applicable_delete_policy_count,
  ai.anon_applicable_insert_policy_count,
  ai.anon_applicable_update_policy_count,
  ai.anon_applicable_delete_policy_count,
  ai.authenticated_applicable_insert_policy_count,
  ai.authenticated_applicable_update_policy_count,
  ai.authenticated_applicable_delete_policy_count,
  ai.all_policy_count,
  ai.insert_update_policy_without_with_check_count,
  ai.update_delete_policy_without_using_count,
  dta.public_schema_client_default_table_acl_summary,
  rss.max_auto_overpayment_usdt_record_exists,
  rss.max_auto_overpayment_usdt_value_is_null,
  rss.max_auto_overpayment_usdt_value_is_positive,
  rss.max_auto_overpayment_ratio_record_exists,
  rss.max_auto_overpayment_ratio_value_is_null,
  rss.max_auto_overpayment_ratio_value_is_positive,
  case
    when rss.max_auto_overpayment_usdt_record_exists is null
      or rss.max_auto_overpayment_ratio_record_exists is null
      then 'MISSING_SETTING'
    when not rss.max_auto_overpayment_usdt_record_exists
      or not rss.max_auto_overpayment_ratio_record_exists
      then 'MISSING_SETTING'
    when rss.values_have_expected_type is not true
      then 'UNEXPECTED_TYPE'
    when rss.max_auto_overpayment_usdt_value_is_positive
      and rss.max_auto_overpayment_ratio_value_is_positive
      then 'CONFIGURED_POSITIVE'
    else 'FAIL_CLOSED'
  end as automatic_overpayment_risk_setting_status,
  case
    when ai.table_oid is null then 'MISSING_TABLE'
    when ai.rls_enabled is not true then 'RLS_DISABLED'
    when (
      ai.public_truncate or ai.public_references
      or ai.public_trigger or ai.public_maintain
      or ai.anon_truncate or ai.anon_references
      or ai.anon_trigger or ai.anon_maintain
      or ai.authenticated_truncate or ai.authenticated_references
      or ai.authenticated_trigger or ai.authenticated_maintain
    ) then 'CLIENT_TRUNCATE_OR_DDL_LIKE_PRIVILEGE'
    when (
      (ai.public_insert and ai.public_applicable_insert_policy_count = 0)
      or (ai.public_update and ai.public_applicable_update_policy_count = 0)
      or (ai.public_delete and ai.public_applicable_delete_policy_count = 0)
      or (ai.anon_insert and ai.anon_applicable_insert_policy_count = 0)
      or (ai.anon_update and ai.anon_applicable_update_policy_count = 0)
      or (ai.anon_delete and ai.anon_applicable_delete_policy_count = 0)
      or (
        ai.authenticated_insert
        and ai.authenticated_applicable_insert_policy_count = 0
      )
      or (
        ai.authenticated_update
        and ai.authenticated_applicable_update_policy_count = 0
      )
      or (
        ai.authenticated_delete
        and ai.authenticated_applicable_delete_policy_count = 0
      )
    ) then 'CLIENT_WRITE_GRANT_WITHOUT_APPLICABLE_POLICY'
    when (
      ai.public_insert or ai.public_update or ai.public_delete
      or ai.anon_insert or ai.anon_update or ai.anon_delete
      or ai.authenticated_insert
      or ai.authenticated_update
      or ai.authenticated_delete
    ) then 'CLIENT_WRITE_GRANT_WITH_APPLICABLE_POLICY'
    when ai.public_select or ai.anon_select or ai.authenticated_select
      then 'CLIENT_READ_ONLY'
    when (
      ai.service_role_select or ai.service_role_insert
      or ai.service_role_update or ai.service_role_delete
      or ai.service_role_truncate or ai.service_role_references
      or ai.service_role_trigger or ai.service_role_maintain
    ) then 'SERVICE_ROLE_ONLY'
    else 'REVIEW_REQUIRED'
  end as assessment
from assessment_input ai
cross join default_table_acl dta
cross join risk_setting_shape rss
order by ai.table_name;
