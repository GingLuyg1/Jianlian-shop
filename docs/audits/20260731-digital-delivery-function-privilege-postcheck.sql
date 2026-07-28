-- Read-only postcheck B for 20260731_digital_delivery_table_privilege_hardening.sql.
-- Expected:
-- - every function exists, is owned by postgres, is SECURITY DEFINER, and has
--   search_path=public;
-- - write functions: service_role only;
-- - user-read functions: authenticated and service_role only;
-- - PUBLIC and anon cannot execute any of the five functions.

with target_functions(signature, expected_authenticated_execute) as (
  values
    ('public.deliver_digital_order(uuid,text)'::text, false),
    ('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::text, false),
    ('public.refresh_order_fulfillment_status(uuid)'::text, false),
    ('public.get_order_delivery_for_user(text)'::text, true),
    ('public.get_order_fulfillment_for_user(text)'::text, true)
)
select
  tf.signature,
  p.oid is not null as function_exists,
  pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
  p.prosecdef as security_definer,
  coalesce(
    (
      select setting
      from unnest(p.proconfig) as setting
      where setting like 'search_path=%'
      limit 1
    ),
    ''
  ) as configured_search_path,
  exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_can_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  tf.expected_authenticated_execute
from target_functions tf
left join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(tf.signature)
order by tf.signature;
