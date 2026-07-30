-- READ-ONLY / NO BUSINESS DATA MUTATION
-- Catalog-only postcheck. This script does not read account recharge rows.

with object_state as (
  select
    c.oid as table_oid,
    c.relowner,
    c.relacl,
    c.relrowsecurity as rls_enabled
  from (values (1)) seed(n)
  left join pg_catalog.pg_class c
    on c.oid = to_regclass('public.account_recharges')
),
table_acl as (
  select
    acl.grantee,
    acl.privilege_type
  from object_state o
  cross join lateral pg_catalog.aclexplode(
    coalesce(o.relacl, pg_catalog.acldefault('r', o.relowner))
  ) acl
  where o.table_oid is not null
),
column_insert_acl as (
  select
    acl.grantee,
    count(*)::integer as acl_count
  from object_state o
  join pg_catalog.pg_attribute a
    on a.attrelid = o.table_oid
   and a.attnum > 0
   and not a.attisdropped
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  where acl.privilege_type = 'INSERT'
  group by acl.grantee
),
policy_state as (
  select
    exists (
      select 1
      from object_state o
      join pg_catalog.pg_policy p on p.polrelid = o.table_oid
      where p.polname = 'Users can create own recharge records'
        and p.polcmd in ('a', '*')
    ) as users_create_policy_exists,
    exists (
      select 1
      from object_state o
      join pg_catalog.pg_policy p on p.polrelid = o.table_oid
      cross join lateral (
        select lower(
          regexp_replace(
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
            '\s+',
            '',
            'g'
          )
        ) as normalized_with_check
      ) expression
      where p.polname = 'Users can create own recharge records'
        and p.polcmd in ('a', '*')
        and expression.normalized_with_check like '%user_id=auth.uid()%'
        and expression.normalized_with_check like '%status=''pending''%'
        and expression.normalized_with_check not like '%waiting_payment%'
        and expression.normalized_with_check not like '%submitted%'
        and expression.normalized_with_check not like '%approved%'
        and expression.normalized_with_check not like '%succeeded%'
    ) as users_create_policy_status_check_is_pending_only
),
privilege_state as (
  select
    o.table_oid,
    o.rls_enabled,
    exists (
      select 1 from table_acl a
      where a.grantee = 0 and a.privilege_type = 'INSERT'
    ) as public_insert,
    case
      when o.table_oid is null or to_regrole('anon') is null then null
      else has_table_privilege('anon', o.table_oid, 'INSERT')
    end as anon_insert,
    case
      when o.table_oid is null or to_regrole('authenticated') is null then null
      else has_table_privilege('authenticated', o.table_oid, 'INSERT')
    end as authenticated_insert,
    case
      when o.table_oid is null or to_regrole('service_role') is null then null
      else has_table_privilege('service_role', o.table_oid, 'INSERT')
    end as service_role_insert,
    coalesce((
      select c.acl_count from column_insert_acl c where c.grantee = 0
    ), 0) as public_column_insert_acl_count,
    case
      when to_regrole('anon') is null then null
      else coalesce((
        select c.acl_count
        from column_insert_acl c
        where c.grantee = to_regrole('anon')
      ), 0)
    end as anon_column_insert_acl_count,
    case
      when to_regrole('authenticated') is null then null
      else coalesce((
        select c.acl_count
        from column_insert_acl c
        where c.grantee = to_regrole('authenticated')
      ), 0)
    end as authenticated_column_insert_acl_count,
    case
      when o.table_oid is null or to_regrole('anon') is null then null
      else (
        select count(*)::integer
        from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid
          and a.attnum > 0
          and not a.attisdropped
          and has_column_privilege(
            'anon',
            o.table_oid,
            a.attnum,
            'INSERT'
          )
      )
    end as anon_effective_column_insert_count,
    case
      when o.table_oid is null or to_regrole('authenticated') is null then null
      else (
        select count(*)::integer
        from pg_catalog.pg_attribute a
        where a.attrelid = o.table_oid
          and a.attnum > 0
          and not a.attisdropped
          and has_column_privilege(
            'authenticated',
            o.table_oid,
            a.attnum,
            'INSERT'
          )
      )
    end as authenticated_effective_column_insert_count,
    case
      when o.table_oid is null or to_regrole('service_role') is null then null
      else has_table_privilege('service_role', o.table_oid, 'UPDATE')
    end as service_role_update
  from object_state o
),
assessed as (
  select
    p.*,
    s.users_create_policy_exists,
    s.users_create_policy_status_check_is_pending_only,
    case
      when p.table_oid is null then 'TABLE_MISSING'
      when not p.public_insert
        and p.anon_insert is false
        and p.authenticated_insert is false
        and p.public_column_insert_acl_count = 0
        and p.anon_column_insert_acl_count = 0
        and p.authenticated_column_insert_acl_count = 0
        and p.anon_effective_column_insert_count = 0
        and p.authenticated_effective_column_insert_count = 0
        then 'BLOCKED_BY_ACL'
      else 'CLIENT_INSERT_STILL_OPEN'
    end as direct_client_insert_path_status
  from privilege_state p
  cross join policy_state s
)
select
  table_oid is not null as account_recharges_table_exists,
  public_insert,
  anon_insert,
  authenticated_insert,
  service_role_insert,
  public_column_insert_acl_count,
  anon_column_insert_acl_count,
  authenticated_column_insert_acl_count,
  anon_effective_column_insert_count,
  authenticated_effective_column_insert_count,
  service_role_update,
  rls_enabled,
  users_create_policy_exists,
  users_create_policy_status_check_is_pending_only,
  direct_client_insert_path_status,
  case
    when table_oid is null then 'TABLE_MISSING'
    when to_regrole('anon') is null
      or to_regrole('authenticated') is null
      or to_regrole('service_role') is null
      then 'NOT_CHECKED_MISSING_ROLE'
    when direct_client_insert_path_status = 'BLOCKED_BY_ACL'
      and anon_effective_column_insert_count = 0
      and authenticated_effective_column_insert_count = 0
      and service_role_insert
      and service_role_update
      and rls_enabled
      and users_create_policy_exists
      and users_create_policy_status_check_is_pending_only
      then 'PASS'
    else 'REVIEW_REQUIRED'
  end as assessment
from assessed;
