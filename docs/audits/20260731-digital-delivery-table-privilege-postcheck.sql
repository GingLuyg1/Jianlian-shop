-- Read-only postcheck A for 20260731_digital_delivery_table_privilege_hardening.sql.
-- This file reads PostgreSQL catalogs only. It never reads inventory or
-- delivery-secret rows.
--
-- Target matrix:
-- - PUBLIC, anon, authenticated: no table or explicit column privileges;
-- - service_role: all seven table privileges (unchanged by the migration);
-- - RLS remains enabled on all three tables;
-- - the historical authenticated administrator batch policy remains present,
--   but direct access is blocked by the table ACL;
-- - no PUBLIC/anon batch read policy and no permissive ordinary-user policy.

-- 1) Effective table privileges with an explicit expected/pass result.
-- PUBLIC is PostgreSQL's ACL pseudo-role (grantee OID 0), so it must not be
-- passed to has_table_privilege() as a role name.
with target_tables(table_name) as (
  values
    ('digital_inventory'::text),
    ('digital_delivery_secrets'::text),
    ('digital_inventory_batches'::text)
),
target_roles(role_name, role_oid, expected_allowed) as (
  values
    ('PUBLIC'::text, 0::oid, false),
    ('anon'::text, (select oid from pg_catalog.pg_roles where rolname = 'anon'), false),
    ('authenticated'::text, (select oid from pg_catalog.pg_roles where rolname = 'authenticated'), false),
    ('service_role'::text, (select oid from pg_catalog.pg_roles where rolname = 'service_role'), true)
),
target_privileges(privilege_type) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text)
),
matrix as (
  select
    tr.role_name,
    tt.table_name,
    tp.privilege_type,
    tr.expected_allowed,
    case
      when tr.role_name = 'PUBLIC' then exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        cross join lateral pg_catalog.aclexplode(
          coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
        ) acl
        where n.nspname = 'public'
          and c.relname = tt.table_name
          and acl.grantee = 0
          and acl.privilege_type = tp.privilege_type
      )
      when tr.role_oid is null then null
      else pg_catalog.has_table_privilege(
        tr.role_oid,
        format('public.%I', tt.table_name),
        tp.privilege_type
      )
    end as actual_allowed
  from target_tables tt
  cross join target_roles tr
  cross join target_privileges tp
)
select
  role_name,
  table_name,
  privilege_type,
  expected_allowed,
  actual_allowed,
  actual_allowed is not distinct from expected_allowed as is_expected
from matrix
order by table_name, role_name, privilege_type;

-- 2a) Explicit column ACL details. Expected: zero rows.
select
  c.relname as table_name,
  a.attname as column_name,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(acl.grantee)
  end as grantee,
  acl.privilege_type,
  false as expected_allowed,
  false as is_expected
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
join pg_catalog.pg_attribute a
  on a.attrelid = c.oid
cross join lateral pg_catalog.aclexplode(a.attacl) as acl
where n.nspname = 'public'
  and c.relname in (
    'digital_inventory',
    'digital_delivery_secrets',
    'digital_inventory_batches'
  )
  and a.attnum > 0
  and not a.attisdropped
  and a.attacl is not null
  and pg_catalog.cardinality(a.attacl) > 0
  and (
    acl.grantee = 0
    or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
  )
order by c.relname, a.attnum, grantee, acl.privilege_type;

-- 2b) Explicit column ACL summary. This always returns exactly one row, so an
-- empty detail result cannot be mistaken for an unexecuted check.
with unexpected_column_acls as (
  select 1
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a
    on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(a.attacl) as acl
  where n.nspname = 'public'
    and c.relname in (
      'digital_inventory',
      'digital_delivery_secrets',
      'digital_inventory_batches'
    )
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and pg_catalog.cardinality(a.attacl) > 0
    and (
      acl.grantee = 0
      or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
    )
)
select
  count(*)::bigint as unexpected_column_acl_count,
  count(*) = 0 as is_expected
from unexpected_column_acls;

-- 3) RLS state. Expected: all three rows have rls_enabled=true and
-- is_expected=true.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relrowsecurity as is_expected
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'digital_inventory',
    'digital_delivery_secrets',
    'digital_inventory_batches'
  )
order by c.relname;

-- 4) Batch-policy safety summary. The retained admin policy is defense in
-- depth only: authenticated has no table ACL after this migration.
with batch_table as (
  select c.oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'digital_inventory_batches'
),
batch_policies as (
  select
    p.*,
    pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')),
      '[[:space:]()]',
      '',
      'g'
    ) as normalized_using_expression,
    p.polroles = array[
      (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
    ]::oid[] as roles_are_exactly_authenticated
  from pg_catalog.pg_policy p
  cross join batch_table bt
  where p.polrelid = bt.oid
),
classified_policies as (
  select
    bp.*,
    bp.normalized_using_expression in (
      'is_adminauth.uid',
      'public.is_adminauth.uid'
    ) as has_strict_admin_using,
    bp.normalized_using_expression = 'false' as has_deny_all_using,
    (
      0::oid = any(bp.polroles)
      or (select oid from pg_catalog.pg_roles where rolname = 'anon') = any(bp.polroles)
      or (select oid from pg_catalog.pg_roles where rolname = 'authenticated') = any(bp.polroles)
    ) as client_role_can_hit
  from batch_policies bp
),
policy_checks as (
  select
    exists (
      select 1
      from classified_policies p
      where p.polname = 'Admins can read inventory batches'
        and p.polcmd = 'r'
        and p.polpermissive
        and p.roles_are_exactly_authenticated
        and p.has_strict_admin_using
    ) as has_authenticated_admin_select_policy,
    exists (
      select 1
      from classified_policies p
      where p.polcmd in ('r', '*')
        and (
          0::oid = any(p.polroles)
          or (select oid from pg_catalog.pg_roles where rolname = 'anon') = any(p.polroles)
        )
    ) as has_public_or_anon_select_policy,
    exists (
      select 1
      from classified_policies p
      where p.polcmd in ('r', '*')
        and p.polpermissive
        and p.client_role_can_hit
        and not p.has_strict_admin_using
        and not p.has_deny_all_using
    ) as has_dangerous_client_read_policy
)
select
  has_authenticated_admin_select_policy,
  has_public_or_anon_select_policy,
  has_dangerous_client_read_policy,
  has_authenticated_admin_select_policy
    and not has_public_or_anon_select_policy
    and not has_dangerous_client_read_policy as is_expected
from policy_checks;

-- 5) Raw batch policy definitions for human review. No business rows are read.
with batch_policies as (
  select
    p.*,
    pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')),
      '[[:space:]()]',
      '',
      'g'
    ) as normalized_using_expression,
    p.polroles = array[
      (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
    ]::oid[] as roles_are_exactly_authenticated
  from pg_catalog.pg_policy p
  where p.polrelid = 'public.digital_inventory_batches'::regclass
)
select
  p.polname as policy_name,
  case p.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end as command,
  p.polpermissive as permissive,
  array(
    select case
      when role_oid = 0 then 'PUBLIC'
      else pg_catalog.pg_get_userbyid(role_oid)
    end
    from unnest(p.polroles) as policy_role(role_oid)
  ) as roles,
  pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expression,
  p.normalized_using_expression,
  p.roles_are_exactly_authenticated,
  p.normalized_using_expression in (
    'is_adminauth.uid',
    'public.is_adminauth.uid'
  ) as has_strict_admin_using,
  p.normalized_using_expression = 'false' as has_deny_all_using,
  (
    p.polcmd in ('r', '*')
    and p.polpermissive
    and (
      0::oid = any(p.polroles)
      or (select oid from pg_catalog.pg_roles where rolname = 'anon') = any(p.polroles)
      or (select oid from pg_catalog.pg_roles where rolname = 'authenticated') = any(p.polroles)
    )
    and p.normalized_using_expression not in (
      'is_adminauth.uid',
      'public.is_adminauth.uid',
      'false'
    )
  ) as is_dangerous_client_read_policy,
  pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
from batch_policies p
order by p.polname;
