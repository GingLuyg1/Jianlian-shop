-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Catalog-only precheck/postcheck for client privilege hardening phase 1.
-- This script does not read rows from any business table.

with target_tables as (
  select *
  from (
    values
      ('account_recharges'::text, false, true,  false, false),
      ('admin_audit_logs'::text, false, false, false, false),
      ('balance_transactions'::text, false, false, false, false),
      ('order_payments'::text, false, false, false, false),
      ('order_status_logs'::text, false, false, false, false),
      ('orders'::text, false, false, true,  false),
      ('payment_sessions'::text, false, false, false, false),
      ('profiles'::text, false, true,  false, false),
      ('site_setting_logs'::text, true, true,  false, false),
      ('site_settings'::text, true, true,  true,  false)
  ) as expected(
    table_name,
    optional_table,
    expected_authenticated_insert,
    expected_authenticated_update,
    expected_authenticated_delete
  )
),
objects as (
  select
    t.*,
    c.oid as table_oid,
    c.relowner,
    c.relacl
  from target_tables t
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', t.table_name))
),
table_acl as (
  select
    o.table_name,
    acl.grantee,
    acl.privilege_type
  from objects o
  cross join lateral pg_catalog.aclexplode(
    coalesce(o.relacl, pg_catalog.acldefault('r', o.relowner))
  ) acl
  where o.table_oid is not null
),
privileges as (
  select
    o.*,
    current_setting('server_version_num')::integer as server_version_num,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'INSERT'
    ) or exists (
      select 1
      from pg_catalog.pg_attribute a
      cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where a.attrelid = o.table_oid
        and a.attnum > 0
        and not a.attisdropped
        and acl.grantee = 0
        and acl.privilege_type = 'INSERT'
    ) as public_insert,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'UPDATE'
    ) or exists (
      select 1
      from pg_catalog.pg_attribute a
      cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where a.attrelid = o.table_oid
        and a.attnum > 0
        and not a.attisdropped
        and acl.grantee = 0
        and acl.privilege_type = 'UPDATE'
    ) as public_update,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'DELETE'
    ) as public_delete,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'TRUNCATE'
    ) as public_truncate,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'REFERENCES'
    ) or exists (
      select 1
      from pg_catalog.pg_attribute a
      cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where a.attrelid = o.table_oid
        and a.attnum > 0
        and not a.attisdropped
        and acl.grantee = 0
        and acl.privilege_type = 'REFERENCES'
    ) as public_references,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'TRIGGER'
    ) as public_trigger,
    exists (
      select 1 from table_acl a
      where a.table_name = o.table_name and a.grantee = 0 and a.privilege_type = 'MAINTAIN'
    ) as public_maintain,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'INSERT')
        or has_any_column_privilege('anon', o.table_oid, 'INSERT') end as anon_insert,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'UPDATE')
        or has_any_column_privilege('anon', o.table_oid, 'UPDATE') end as anon_update,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'DELETE') end as anon_delete,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'TRUNCATE') end as anon_truncate,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'REFERENCES')
        or has_any_column_privilege('anon', o.table_oid, 'REFERENCES') end as anon_references,
    case when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'TRIGGER') end as anon_trigger,
    case
      when o.table_oid is null or to_regrole('anon') is null then null
      when current_setting('server_version_num')::integer < 170000 then false
      else has_table_privilege('anon', o.table_oid, 'MAINTAIN')
    end as anon_maintain,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'INSERT')
        or has_any_column_privilege('authenticated', o.table_oid, 'INSERT') end as authenticated_insert,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'UPDATE') end as authenticated_update,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'DELETE') end as authenticated_delete,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'TRUNCATE') end as authenticated_truncate,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'REFERENCES')
        or has_any_column_privilege('authenticated', o.table_oid, 'REFERENCES') end as authenticated_references,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'TRIGGER') end as authenticated_trigger,
    case
      when o.table_oid is null or to_regrole('authenticated') is null then null
      when current_setting('server_version_num')::integer < 170000 then false
      else has_table_privilege('authenticated', o.table_oid, 'MAINTAIN')
    end as authenticated_maintain,
    case when o.table_oid is null or to_regrole('service_role') is null then null
      else has_table_privilege('service_role', o.table_oid, 'INSERT') end as service_role_insert,
    case when o.table_oid is null or to_regrole('service_role') is null then null
      else has_table_privilege('service_role', o.table_oid, 'UPDATE') end as service_role_update,
    case when o.table_oid is null or to_regrole('service_role') is null then null
      else has_table_privilege('service_role', o.table_oid, 'DELETE') end as service_role_delete,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_any_column_privilege('authenticated', o.table_oid, 'UPDATE') end
      as authenticated_has_any_column_update,
    case when o.table_name = 'profiles' and o.table_oid is not null
      and to_regrole('authenticated') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid and a.attname = 'display_name'
          and a.attnum > 0 and not a.attisdropped
      )
      then has_column_privilege('authenticated', o.table_oid, 'display_name', 'UPDATE') end
      as profiles_display_name_update,
    case when o.table_name = 'profiles' and o.table_oid is not null
      and to_regrole('authenticated') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid and a.attname = 'phone'
          and a.attnum > 0 and not a.attisdropped
      )
      then has_column_privilege('authenticated', o.table_oid, 'phone', 'UPDATE') end
      as profiles_phone_update,
    case when o.table_name = 'profiles' and o.table_oid is not null
      and to_regrole('authenticated') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid and a.attname = 'recipient_name'
          and a.attnum > 0 and not a.attisdropped
      )
      then has_column_privilege('authenticated', o.table_oid, 'recipient_name', 'UPDATE') end
      as profiles_recipient_name_update,
    case when o.table_name = 'profiles' and o.table_oid is not null
      and to_regrole('authenticated') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid and a.attname = 'shipping_address'
          and a.attnum > 0 and not a.attisdropped
      )
      then has_column_privilege('authenticated', o.table_oid, 'shipping_address', 'UPDATE') end
      as profiles_shipping_address_update,
    case when o.table_name = 'profiles' and o.table_oid is not null
      and to_regrole('authenticated') is not null
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid and a.attname = 'avatar_url'
          and a.attnum > 0 and not a.attisdropped
      )
      then has_column_privilege('authenticated', o.table_oid, 'avatar_url', 'UPDATE') end
      as profiles_avatar_url_update,
    case
      when o.table_name <> 'profiles' then null
      when o.table_oid is null or to_regrole('authenticated') is null then null
      else (
        select count(*)::integer
        from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid
          and a.attnum > 0
          and not a.attisdropped
          and a.attname <> all (
            array[
              'display_name',
              'phone',
              'recipient_name',
              'shipping_address',
              'avatar_url'
            ]::text[]
          )
          and has_column_privilege('authenticated', o.table_oid, a.attnum, 'UPDATE')
      )
    end as profiles_sensitive_column_abnormal_update_count
  from objects o
),
assessed as (
  select
    p.*,
    case
      when p.table_oid is null and p.optional_table then 'OPTIONAL_TABLE_MISSING'
      when p.table_oid is null then 'MISSING_TABLE'
      when to_regrole('anon') is null
        or to_regrole('authenticated') is null
        or to_regrole('service_role') is null
        then 'NOT_CHECKED_MISSING_ROLE'
      when p.public_truncate or p.public_references or p.public_trigger or p.public_maintain
        or p.anon_truncate or p.anon_references or p.anon_trigger or p.anon_maintain
        or p.authenticated_truncate or p.authenticated_references
        or p.authenticated_trigger or p.authenticated_maintain
        then 'UNEXPECTED_CLIENT_DDL_LIKE_PRIVILEGE'
      when p.anon_insert or p.anon_update or p.anon_delete
        then 'UNEXPECTED_ANON_WRITE_PRIVILEGE'
      when p.authenticated_insert is distinct from p.expected_authenticated_insert
        or p.authenticated_update is distinct from p.expected_authenticated_update
        or p.authenticated_delete is distinct from p.expected_authenticated_delete
        then 'UNEXPECTED_AUTHENTICATED_WRITE_PRIVILEGE'
      when p.table_name <> 'profiles'
        and not p.expected_authenticated_update
        and p.authenticated_has_any_column_update
        then 'UNEXPECTED_AUTHENTICATED_WRITE_PRIVILEGE'
      when p.table_name = 'profiles'
        and (
          p.profiles_display_name_update is false
          or p.profiles_phone_update is false
          or p.profiles_recipient_name_update is false
          or p.profiles_shipping_address_update is false
          or p.profiles_avatar_url_update is false
          or p.profiles_sensitive_column_abnormal_update_count <> 0
        )
        then 'UNEXPECTED_PROFILE_COLUMN_UPDATE_PRIVILEGE'
      else 'PASS'
    end as assessment
  from privileges p
)
select
  table_name,
  table_oid is not null as table_exists,
  public_insert,
  public_update,
  public_delete,
  public_truncate,
  public_references,
  public_trigger,
  public_maintain,
  anon_insert,
  anon_update,
  anon_delete,
  anon_truncate,
  anon_references,
  anon_trigger,
  anon_maintain,
  authenticated_insert,
  authenticated_update,
  authenticated_delete,
  authenticated_truncate,
  authenticated_references,
  authenticated_trigger,
  authenticated_maintain,
  service_role_insert,
  service_role_update,
  service_role_delete,
  authenticated_has_any_column_update,
  profiles_display_name_update,
  profiles_phone_update,
  profiles_recipient_name_update,
  profiles_shipping_address_update,
  profiles_avatar_url_update,
  profiles_sensitive_column_abnormal_update_count,
  case when table_name = 'orders' then authenticated_update end
    as orders_authenticated_update_retained,
  case when table_name = 'account_recharges' then authenticated_insert end
    as account_recharges_authenticated_insert_retained,
  case when table_name = 'account_recharges' then not authenticated_update end
    as account_recharges_authenticated_update_revoked,
  case when table_name = 'account_recharges' then not authenticated_delete end
    as account_recharges_authenticated_delete_revoked,
  assessment
from assessed
order by table_name;

with target_tables as (
  select *
  from (
    values
      ('account_recharges'::text, false, true,  false, false),
      ('admin_audit_logs'::text, false, false, false, false),
      ('balance_transactions'::text, false, false, false, false),
      ('order_payments'::text, false, false, false, false),
      ('order_status_logs'::text, false, false, false, false),
      ('orders'::text, false, false, true,  false),
      ('payment_sessions'::text, false, false, false, false),
      ('profiles'::text, false, true,  false, false),
      ('site_setting_logs'::text, true, true,  false, false),
      ('site_settings'::text, true, true,  true,  false)
  ) as expected(
    table_name,
    optional_table,
    expected_authenticated_insert,
    expected_authenticated_update,
    expected_authenticated_delete
  )
),
objects as (
  select t.*, c.oid as table_oid, c.relowner, c.relacl
  from target_tables t
  left join pg_catalog.pg_class c
    on c.oid = to_regclass(format('public.%I', t.table_name))
),
table_acl as (
  select o.table_name, acl.grantee, acl.privilege_type
  from objects o
  cross join lateral pg_catalog.aclexplode(
    coalesce(o.relacl, pg_catalog.acldefault('r', o.relowner))
  ) acl
  where o.table_oid is not null
),
checks as (
  select
    o.*,
    (
      exists (
        select 1 from table_acl a
        where a.table_name = o.table_name and a.grantee = 0
          and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
      )
      or exists (
        select 1
        from pg_catalog.pg_attribute a
        cross join lateral pg_catalog.aclexplode(a.attacl) acl
        where a.attrelid = o.table_oid
          and a.attnum > 0
          and not a.attisdropped
          and acl.grantee = 0
          and acl.privilege_type = 'REFERENCES'
      )
    ) as public_ddl_like,
    case when o.table_oid is null or to_regrole('anon') is null then null else
      has_table_privilege('anon', o.table_oid, 'INSERT')
      or has_any_column_privilege('anon', o.table_oid, 'INSERT')
      or has_table_privilege('anon', o.table_oid, 'UPDATE')
      or has_any_column_privilege('anon', o.table_oid, 'UPDATE')
      or has_table_privilege('anon', o.table_oid, 'DELETE')
    end as anon_write,
    case when o.table_oid is null or to_regrole('anon') is null then null else
      has_table_privilege('anon', o.table_oid, 'TRUNCATE')
      or has_table_privilege('anon', o.table_oid, 'REFERENCES')
      or has_any_column_privilege('anon', o.table_oid, 'REFERENCES')
      or has_table_privilege('anon', o.table_oid, 'TRIGGER')
      or case when current_setting('server_version_num')::integer >= 170000
        then has_table_privilege('anon', o.table_oid, 'MAINTAIN')
        else false end
    end as anon_ddl_like,
    case when o.table_oid is null or to_regrole('authenticated') is null then null else
      has_table_privilege('authenticated', o.table_oid, 'TRUNCATE')
      or has_table_privilege('authenticated', o.table_oid, 'REFERENCES')
      or has_any_column_privilege('authenticated', o.table_oid, 'REFERENCES')
      or has_table_privilege('authenticated', o.table_oid, 'TRIGGER')
      or case when current_setting('server_version_num')::integer >= 170000
        then has_table_privilege('authenticated', o.table_oid, 'MAINTAIN')
        else false end
    end as authenticated_ddl_like,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'INSERT')
        or has_any_column_privilege('authenticated', o.table_oid, 'INSERT') end
      as authenticated_insert,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'UPDATE') end
      as authenticated_update,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'DELETE') end
      as authenticated_delete,
    case when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_any_column_privilege('authenticated', o.table_oid, 'UPDATE') end
      as authenticated_has_any_column_update,
    case
      when o.table_name <> 'profiles' then 0
      when o.table_oid is null or to_regrole('authenticated') is null then null
      else (
        (
          select count(*)::integer
          from pg_catalog.pg_attribute a
          where a.attrelid = o.table_oid
            and a.attnum > 0
            and not a.attisdropped
            and a.attname = any (
              array[
                'display_name',
                'phone',
                'recipient_name',
                'shipping_address',
                'avatar_url'
              ]::text[]
            )
            and not has_column_privilege(
              'authenticated',
              o.table_oid,
              a.attnum,
              'UPDATE'
            )
        )
        + (
          select count(*)::integer
          from pg_catalog.pg_attribute a
          where a.attrelid = o.table_oid
            and a.attnum > 0
            and not a.attisdropped
            and a.attname <> all (
              array[
                'display_name',
                'phone',
                'recipient_name',
                'shipping_address',
                'avatar_url'
              ]::text[]
            )
            and has_column_privilege('authenticated', o.table_oid, a.attnum, 'UPDATE')
        )
      )
    end as profile_column_contract_violation_count
  from objects o
)
select
  count(*) filter (
    where table_oid is not null
      and (public_ddl_like or anon_ddl_like or authenticated_ddl_like)
  )::integer as unexpected_client_ddl_like_privilege_count,
  count(*) filter (
    where table_oid is not null and anon_write
  )::integer as unexpected_anon_write_privilege_count,
  (
    count(*) filter (
      where table_oid is not null
        and (
          authenticated_insert is distinct from expected_authenticated_insert
          or authenticated_update is distinct from expected_authenticated_update
          or authenticated_delete is distinct from expected_authenticated_delete
          or (
            table_name <> 'profiles'
            and not expected_authenticated_update
            and authenticated_has_any_column_update
          )
        )
    )
    + coalesce(sum(profile_column_contract_violation_count), 0)
  )::integer as unexpected_authenticated_write_privilege_count,
  bool_and(authenticated_update) filter (where table_name = 'orders')
    as orders_authenticated_update_retained,
  bool_and(authenticated_insert) filter (where table_name = 'account_recharges')
    as account_recharges_authenticated_insert_retained,
  bool_and(not authenticated_update) filter (where table_name = 'account_recharges')
    as account_recharges_authenticated_update_revoked,
  bool_and(not authenticated_delete) filter (where table_name = 'account_recharges')
    as account_recharges_authenticated_delete_revoked
from checks;

with default_table_acl as (
  select
    coalesce(n.nspname, '<all_schemas>') as schema_scope,
    coalesce(grantee.rolname, 'PUBLIC') as grantee,
    array_agg(distinct acl.privilege_type order by acl.privilege_type) as privileges
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where d.defaclobjtype = 'r'
    and (d.defaclnamespace = 0 or n.nspname = 'public')
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated')
    )
  group by coalesce(n.nspname, '<all_schemas>'), coalesce(grantee.rolname, 'PUBLIC')
)
select
  'DEFERRED_TO_PHASE_2'::text as default_acl_hardening_status,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema_scope', schema_scope,
        'grantee', grantee,
        'privileges', privileges
      )
      order by schema_scope, grantee
    ),
    '[]'::jsonb
  ) as public_schema_client_default_table_acl_summary
from default_table_acl;
