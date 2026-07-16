-- Read-only verification for 20260714_order_creation_rls_rpc_hardening.sql.
-- Run only in Jianlian-shop-test. This file does not insert or update data.

select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled,
  pg_get_userbyid(c.relowner) as table_owner
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'orders';

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'orders'
order by policyname;

with classified_policies as (
  select
    p.*,
    regexp_replace(lower(coalesce(p.qual, '')), '[[:space:]()]', '', 'g')
      as normalized_qual,
    regexp_replace(
      lower(coalesce(p.with_check, p.qual, '')),
      '[[:space:]()]', '', 'g'
    ) as normalized_with_check
  from pg_policies as p
  where p.schemaname = 'public'
    and p.tablename = 'orders'
)
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled,
  has_table_privilege('authenticated', 'public.orders', 'INSERT') as authenticated_has_table_insert_grant,
  count(*) filter (
    where p.cmd = 'INSERT'
      and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
  ) as ordinary_user_insert_policy_count,
  count(*) filter (
    where p.cmd = 'ALL'
      and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
      and p.normalized_qual in ('is_admin', 'public.is_admin')
      and p.normalized_with_check in ('is_admin', 'public.is_admin')
  ) as admin_is_admin_all_policy_count,
  count(*) filter (
    where p.cmd in ('INSERT', 'ALL')
      and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
      and not (
        p.cmd = 'ALL'
        and p.normalized_qual in ('is_admin', 'public.is_admin')
        and p.normalized_with_check in ('is_admin', 'public.is_admin')
      )
  ) as unexpected_authenticated_insert_or_all_policy_count,
  c.relrowsecurity
    and count(*) filter (
      where p.cmd in ('INSERT', 'ALL')
        and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
        and not (
          p.cmd = 'ALL'
          and p.normalized_qual in ('is_admin', 'public.is_admin')
          and p.normalized_with_check in ('is_admin', 'public.is_admin')
        )
    ) = 0 as authenticated_direct_insert_blocked_by_rls
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
left join classified_policies as p on true
where n.nspname = 'public'
  and c.relname = 'orders'
group by c.relrowsecurity, c.relforcerowsecurity;

select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as function_owner,
  owner_role.rolsuper as owner_is_superuser,
  owner_role.rolbypassrls as owner_bypasses_rls,
  p.proconfig,
  md5(pg_get_functiondef(p.oid)) as function_hash,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  not exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_cannot_execute
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
join pg_roles as owner_role on owner_role.oid = p.proowner
where n.nspname = 'public'
  and p.oid = to_regprocedure(
    'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
  );

select
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.proargnames[1:p.pronargs] as input_argument_names,
  position('auth.uid()' in lower(regexp_replace(pg_get_functiondef(p.oid), '\s+', '', 'g'))) > 0
    as derives_user_from_auth_uid,
  not exists (
    select 1
    from unnest(p.proargnames[1:p.pronargs]) as input_name
    where lower(input_name) in ('user_id', 'p_user_id')
  ) as rejects_client_user_id_parameter,
  position('complete_order_payment' in lower(pg_get_functiondef(p.oid))) = 0
    as does_not_complete_payment,
  position('deliver_digital_order' in lower(pg_get_functiondef(p.oid))) = 0
    as does_not_deliver_digital_order
from pg_proc as p
where p.oid = to_regprocedure(
  'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
);
