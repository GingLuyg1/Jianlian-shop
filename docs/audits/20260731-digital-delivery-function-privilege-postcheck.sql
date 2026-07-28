-- Read-only postcheck B for 20260731_digital_delivery_table_privilege_hardening.sql.
-- The migration does not modify functions. This postcheck proves that the five
-- existing delivery RPC contracts remain unchanged.

-- 1) Function contract matrix with an explicit is_expected result.
with target_functions(signature, expected_authenticated_execute) as (
  values
    ('public.deliver_digital_order(uuid,text)'::text, false),
    ('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::text, false),
    ('public.refresh_order_fulfillment_status(uuid)'::text, false),
    ('public.get_order_delivery_for_user(text)'::text, true),
    ('public.get_order_fulfillment_for_user(text)'::text, true)
),
actual as (
  select
    tf.signature,
    tf.expected_authenticated_execute,
    p.oid,
    p.proowner,
    p.prosecdef as security_definer,
    p.proconfig,
    pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_can_execute,
    coalesce(pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'), false) as anon_can_execute,
    coalesce(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) as authenticated_can_execute,
    coalesce(pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'), false) as service_role_can_execute
  from target_functions tf
  left join pg_catalog.pg_proc p
    on p.oid = pg_catalog.to_regprocedure(tf.signature)
)
select
  signature,
  oid is not null as function_exists,
  owner_name,
  security_definer,
  proconfig as function_configuration,
  proconfig = array['search_path=public']::text[] as search_path_is_strict_public,
  public_can_execute,
  anon_can_execute,
  authenticated_can_execute,
  expected_authenticated_execute,
  service_role_can_execute,
  (
    oid is not null
    and owner_name = 'postgres'
    and security_definer
    and proconfig = array['search_path=public']::text[]
    and not public_can_execute
    and not anon_can_execute
    and authenticated_can_execute = expected_authenticated_execute
    and service_role_can_execute
  ) as is_expected
from actual
order by signature;

-- 2) Enumerate every effective EXECUTE grantee. Any row with
-- is_expected_grantee=false is a blocker.
with target_functions(signature, expected_authenticated_execute, function_oid) as (
  values
    (
      'public.deliver_digital_order(uuid,text)'::text,
      false,
      pg_catalog.to_regprocedure('public.deliver_digital_order(uuid,text)')
    ),
    (
      'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::text,
      false,
      pg_catalog.to_regprocedure('public.admin_deliver_order_item_manual(uuid,uuid,text,text)')
    ),
    (
      'public.refresh_order_fulfillment_status(uuid)'::text,
      false,
      pg_catalog.to_regprocedure('public.refresh_order_fulfillment_status(uuid)')
    ),
    (
      'public.get_order_delivery_for_user(text)'::text,
      true,
      pg_catalog.to_regprocedure('public.get_order_delivery_for_user(text)')
    ),
    (
      'public.get_order_fulfillment_for_user(text)'::text,
      true,
      pg_catalog.to_regprocedure('public.get_order_fulfillment_for_user(text)')
    )
)
select
  tf.signature,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(acl.grantee)
  end as execute_grantee,
  acl.is_grantable,
  (
    pg_catalog.pg_get_userbyid(acl.grantee) in ('postgres', 'service_role')
    or (
      tf.expected_authenticated_execute
      and pg_catalog.pg_get_userbyid(acl.grantee) = 'authenticated'
    )
  ) as is_expected_grantee
from target_functions tf
join pg_catalog.pg_proc p
  on p.oid = tf.function_oid
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) acl
where acl.privilege_type = 'EXECUTE'
order by tf.signature, execute_grantee;
