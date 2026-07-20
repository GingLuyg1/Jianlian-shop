-- Digital delivery security hardening.
--
-- IMPORTANT:
-- - This migration must be run only after the production preflight is reviewed.
-- - It does not read delivery_content or digital inventory secret content.
-- - It does not migrate delivery rows or add a redundant order_deliveries.user_id.
-- - Deploy the application change that removes the legacy delivery RPC calls before
--   applying this migration.

begin;

-- -----------------------------------------------------------------------------
-- 1. Precheck: dependencies, exact signatures, RLS, row count, current ACL/policy.
-- -----------------------------------------------------------------------------
do $$
declare
  v_expected_columns text[] := array[
    'id', 'order_id', 'order_item_id', 'delivery_type', 'delivery_content',
    'delivery_status', 'delivered_at', 'created_at', 'updated_at', 'sku_id',
    'user_id', 'product_id', 'inventory_id', 'encrypted_content', 'viewed_at',
    'failure_reason', 'delivery_note', 'delivery_status_updated_at'
  ];
  v_missing_columns text[];
  v_missing_functions text[];
  v_delivery_count bigint;
  v_user_policy_count integer;
  v_admin_policy_count integer;
  v_explicit_column_acl_count integer;
  v_record record;
begin
  if to_regclass('public.order_deliveries') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.digital_delivery_secrets') is null then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_TABLE_MISSING';
  end if;

  select array_agg(expected.column_name order by expected.column_name)
    into v_missing_columns
  from unnest(v_expected_columns) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'order_deliveries'
      and c.column_name = expected.column_name
  );

  if cardinality(v_missing_columns) > 0 then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_COLUMNS_MISSING: %', v_missing_columns;
  end if;

  select array_agg(expected.signature order by expected.signature)
    into v_missing_functions
  from unnest(array[
    'public.refresh_order_fulfillment_status(uuid)',
    'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)',
    'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)',
    'public.sync_product_available_stock(uuid)',
    'public.deliver_digital_order(uuid,text)',
    'public.get_order_fulfillment_for_user(text)',
    'public.get_order_delivery_for_user(text)',
    'public.auto_deliver_order(uuid)',
    'public.admin_retry_auto_delivery(uuid)',
    'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)',
    'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)'
  ]::text[]) as expected(signature)
  where to_regprocedure(expected.signature) is null;

  if cardinality(v_missing_functions) > 0 then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_FUNCTIONS_MISSING: %', v_missing_functions;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'order_deliveries'
      and c.relrowsecurity
  ) then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_RLS_DISABLED';
  end if;

  select count(*) into v_delivery_count from public.order_deliveries;
  raise notice 'order_deliveries row count (content not read): %', v_delivery_count;

  select count(*)
    into v_user_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'order_deliveries'
    and p.policyname = 'users can read own deliveries'
    and p.cmd = 'SELECT';

  if v_user_policy_count <> 1 then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_USER_POLICY_COUNT: %', v_user_policy_count;
  end if;

  select count(*)
    into v_admin_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'order_deliveries'
    and p.policyname = 'admins can manage deliveries'
    and p.cmd = 'ALL'
    and coalesce(p.qual, '') ~ 'is_admin[(][)]'
    and coalesce(p.with_check, '') ~ 'is_admin[(][)]';

  if v_admin_policy_count <> 1 then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_ADMIN_POLICY_COUNT: %', v_admin_policy_count;
  end if;

  select
    p.policyname,
    p.roles,
    p.permissive,
    p.cmd,
    p.qual,
    p.with_check
    into strict v_record
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'order_deliveries'
    and p.policyname = 'users can read own deliveries'
    and p.cmd = 'SELECT';

  raise notice 'pre-migration user policy: % roles=% permissive=% cmd=% using=% check=%',
    v_record.policyname, v_record.roles, v_record.permissive, v_record.cmd,
    v_record.qual, v_record.with_check;

  if pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure)
       !~ 'digital_delivery_secrets'
     or pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure)
       ~ 'delivery_content[[:space:]]*[,)]' then
    raise exception 'DIGITAL_DELIVERY_PREFLIGHT_AUTO_DELIVERY_DEFINITION_UNSAFE';
  end if;

  for v_record in
    select
      p.policyname,
      p.roles,
      p.permissive,
      p.cmd,
      p.qual,
      p.with_check
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'order_deliveries'
    order by p.policyname
  loop
    raise notice 'pre-migration policy: % roles=% permissive=% cmd=% using=% check=%',
      v_record.policyname, v_record.roles, v_record.permissive, v_record.cmd,
      v_record.qual, v_record.with_check;
  end loop;

  for v_record in
    select
      p.oid::regprocedure as signature,
      p.proacl
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid in (
        'public.refresh_order_fulfillment_status(uuid)'::regprocedure,
        'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)'::regprocedure,
        'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure,
        'public.sync_product_available_stock(uuid)'::regprocedure,
        'public.deliver_digital_order(uuid,text)'::regprocedure,
        'public.get_order_fulfillment_for_user(text)'::regprocedure,
        'public.get_order_delivery_for_user(text)'::regprocedure,
        'public.auto_deliver_order(uuid)'::regprocedure,
        'public.admin_retry_auto_delivery(uuid)'::regprocedure,
        'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)'::regprocedure,
        'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)'::regprocedure
      )
    order by p.oid::regprocedure::text
  loop
    raise notice 'pre-migration function ACL: % acl=%', v_record.signature, v_record.proacl;
  end loop;

  select c.relacl
    into v_record
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'order_deliveries';
  raise notice 'pre-migration order_deliveries table ACL: %', v_record.relacl;

  select count(*)
    into v_explicit_column_acl_count
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.order_deliveries'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and cardinality(a.attacl) > 0;
  raise notice 'pre-migration order_deliveries columns with explicit ACL entries: %',
    v_explicit_column_acl_count;

  for v_record in
    select a.attname as column_name, a.attacl
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.order_deliveries'::regclass
      and a.attnum > 0
      and not a.attisdropped
    order by a.attnum
  loop
    raise notice 'pre-migration order_deliveries column ACL: % acl=%',
      v_record.column_name, v_record.attacl;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Make the safe manual-delivery function compatible with its service-role-only
--    caller. All payment, order-state, item-type, duplicate and secret-storage
--    checks from the deployed safe implementation remain in place.
-- -----------------------------------------------------------------------------
create or replace function public.admin_deliver_order_item_manual(
  p_order_id uuid,
  p_order_item_id uuid,
  p_delivery_content text,
  p_delivery_note text default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
  v_delivery public.order_deliveries;
  v_now timestamptz := now();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_jwt_role <> 'service_role' then
    raise exception 'manual delivery requires service role';
  end if;
  if nullif(btrim(coalesce(p_delivery_content, '')), '') is null then
    raise exception '交付内容为空';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception '订单不存在'; end if;
  if v_order.payment_status <> 'paid' then raise exception '订单未支付'; end if;
  if v_order.status in ('cancelled','expired','refunded','failed') then
    raise exception '订单已取消、过期、退款或失败';
  end if;

  select * into v_item
  from public.order_items
  where id = p_order_item_id and order_id = p_order_id
  for update;
  if not found then raise exception '订单项不存在'; end if;
  if public.normalize_order_item_delivery_type(v_item.delivery_type) <> 'manual_delivery' then
    raise exception '交付类型不匹配';
  end if;
  if coalesce(v_item.delivery_status, '') in ('delivered','not_required')
    or exists (
      select 1
      from public.order_deliveries
      where order_item_id = p_order_item_id
        and delivery_status = 'delivered'
    ) then
    raise exception '重复交付';
  end if;

  insert into public.order_deliveries (
    order_id, order_item_id, user_id, product_id, sku_id, delivery_type,
    encrypted_content, delivery_status, delivered_at, delivery_note, created_at, updated_at
  )
  values (
    p_order_id, p_order_item_id, v_order.user_id, v_item.product_id, v_item.sku_id, 'manual_delivery',
    'stored_in_private_table', 'delivered', v_now,
    nullif(btrim(coalesce(p_delivery_note, '')), ''), v_now, v_now
  )
  returning * into v_delivery;

  insert into public.digital_delivery_secrets (delivery_id, content)
  values (v_delivery.id, btrim(p_delivery_content));

  update public.order_items
  set delivery_status = 'delivered',
      delivered_quantity = coalesce(quantity, 1),
      delivery_completed_at = v_now,
      delivery_status_updated_at = v_now,
      delivery_failure_reason = null
  where id = p_order_item_id;

  perform public.log_order_item_delivery_status(
    p_order_id, p_order_item_id, v_item.delivery_status, 'delivered',
    'admin', '管理员提交人工交付内容'
  );
  perform public.write_delivery_log(
    p_order_id, p_order_item_id, null, 'manual_admin', 'delivery_success',
    '管理员人工交付完成', jsonb_build_object('has_delivery_content', true)
  );
  perform public.refresh_order_fulfillment_status(p_order_id);

  return v_delivery;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Replace the legacy PUBLIC user SELECT policy with an authenticated-only
--    policy. Administrator access remains governed by the separate
--    "admins can manage deliveries" policy and is not changed here.
-- -----------------------------------------------------------------------------
drop policy if exists "users can read own deliveries"
  on public.order_deliveries;

create policy "users can read own deliveries"
  on public.order_deliveries
  for select
  to authenticated
  using (
    order_deliveries.delivery_status = 'delivered'
    and exists (
      select 1
      from public.orders o
      where o.id = order_deliveries.order_id
        and o.user_id = auth.uid()
        and o.payment_status = 'paid'
        and o.status not in ('cancelled', 'expired', 'failed')
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Reset table and explicit column ACLs, then grant only the permissions used by
--    the current server and authenticated user queries.
--
-- user_id is required by the authenticated privacy summary/count query.
-- failure_reason is required by the current authenticated browser admin dashboard.
-- The RLS policies still separate ordinary users from administrators row-by-row.
-- -----------------------------------------------------------------------------
revoke all privileges on table public.order_deliveries
  from public, anon, authenticated, service_role;

-- REVOKE ALL PRIVILEGES ON TABLE does not remove historical column-specific ACLs.
-- Build the complete deployed column list from pg_attribute and revoke every
-- column-grantable privilege before applying the safe allow-list below.
do $$
declare
  v_column_list text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_column_list
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.order_deliveries'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if nullif(v_column_list, '') is null then
    raise exception 'DIGITAL_DELIVERY_COLUMN_ACL_RESET_NO_COLUMNS';
  end if;

  execute format(
    'revoke select (%s) on table public.order_deliveries from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke insert (%s) on table public.order_deliveries from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke update (%s) on table public.order_deliveries from public, anon, authenticated, service_role',
    v_column_list
  );
  execute format(
    'revoke references (%s) on table public.order_deliveries from public, anon, authenticated, service_role',
    v_column_list
  );
end
$$;

grant select (
  id,
  order_id,
  order_item_id,
  user_id,
  delivery_type,
  delivery_status,
  failure_reason,
  delivered_at,
  created_at,
  updated_at
) on table public.order_deliveries to authenticated;

grant select, insert, update, delete on table public.order_deliveries to service_role;

-- -----------------------------------------------------------------------------
-- 5. Delivery write functions and internal helpers: service-role only.
--    SECURITY DEFINER owner calls from approved outer functions remain valid.
-- -----------------------------------------------------------------------------
revoke execute on function public.refresh_order_fulfillment_status(uuid) from public, anon, authenticated;
revoke execute on function public.log_order_item_delivery_status(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.sync_product_available_stock(uuid) from public, anon, authenticated;

grant execute on function public.refresh_order_fulfillment_status(uuid) to service_role;
grant execute on function public.log_order_item_delivery_status(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.sync_product_available_stock(uuid) to service_role;

-- User read functions retain their internal auth.uid(), ownership, paid-state,
-- order-state and delivered-state checks.
revoke execute on function public.get_order_fulfillment_for_user(text) from public, anon;
revoke execute on function public.get_order_delivery_for_user(text) from public, anon;
grant execute on function public.get_order_fulfillment_for_user(text) to authenticated, service_role;
grant execute on function public.get_order_delivery_for_user(text) to authenticated, service_role;

-- Administrator routes authenticate and authorize with their Cookie client first,
-- then explicitly use a server-only service-role client for these RPCs.
revoke execute on function public.deliver_digital_order(uuid,text) from public, anon, authenticated;
revoke execute on function public.admin_deliver_order_item_manual(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.deliver_digital_order(uuid,text) to service_role;
grant execute on function public.admin_deliver_order_item_manual(uuid,uuid,text,text) to service_role;

-- Fully deprecate unsafe legacy entry points. They are intentionally not granted
-- to service_role because their audited definitions can mark unpaid orders paid,
-- deliver pending orders, select arbitrary available inventory, or write plaintext
-- into order_deliveries.delivery_content. They remain owner-callable for forensic
-- rollback only and are not dropped in this compatibility migration.
revoke execute on function public.auto_deliver_order(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_retry_auto_delivery(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_deliver_inventory_item(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_append_manual_delivery(uuid,uuid,text,text,text,text) from public, anon, authenticated, service_role;

comment on function public.auto_deliver_order(uuid) is 'DEPRECATED: unsafe legacy delivery entry point; use deliver_digital_order(uuid,text).';
comment on function public.admin_retry_auto_delivery(uuid) is 'DEPRECATED: unsafe legacy retry entry point; use deliver_digital_order(uuid,text).';
comment on function public.admin_deliver_inventory_item(uuid,uuid,uuid,text) is 'DEPRECATED: unsafe legacy inventory delivery entry point.';
comment on function public.admin_append_manual_delivery(uuid,uuid,text,text,text,text) is 'DEPRECATED: unsafe plaintext delivery entry point; use admin_deliver_order_item_manual(uuid,uuid,text,text).';

-- -----------------------------------------------------------------------------
-- 6. Postcheck: exact policy behavior and effective role permissions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_policy_count integer;
  v_admin_policy_count integer;
  v_secure_function_count integer;
  v_manual_function_oid oid;
  v_manual_public_execute boolean;
  v_unexpected_table_acl text;
  v_missing_service_table_privilege text;
  v_unexpected_service_table_privilege text;
  v_unexpected_column_acl text;
  v_missing_authenticated_column text;
begin
  select p.oid
    into v_manual_function_oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_deliver_order_item_manual'
    and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_order_item_id uuid, p_delivery_content text, p_delivery_note text';

  if v_manual_function_oid is null
     or v_manual_function_oid <> to_regprocedure(
       'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'
     ) then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_MANUAL_DELIVERY_SIGNATURE_MISSING';
  end if;

  select exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
    into v_manual_public_execute
  from pg_catalog.pg_proc p
  where p.oid = v_manual_function_oid;

  if coalesce(v_manual_public_execute, false) then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_MANUAL_DELIVERY_PUBLIC_EXECUTE';
  end if;

  select count(*)
    into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'order_deliveries'
    and p.policyname = 'users can read own deliveries'
    and p.cmd = 'SELECT'
    and p.roles = array['authenticated']::name[]
    and coalesce(p.qual, '') ~ 'auth[.]uid[(][)]'
    and coalesce(p.qual, '') ~ 'payment_status[^'']*''paid'''
    and coalesce(p.qual, '') ~ 'delivery_status[^'']*''delivered'''
    and coalesce(p.qual, '') ~ '''cancelled''[^;]*''expired''[^;]*''failed'''
    and coalesce(p.qual, '') !~ 'is_admin';

  if v_policy_count <> 1 then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_USER_POLICY_FAILED: %', v_policy_count;
  end if;

  select count(*)
    into v_admin_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'order_deliveries'
    and p.policyname = 'admins can manage deliveries'
    and p.cmd = 'ALL'
    and coalesce(p.qual, '') ~ 'is_admin[(][)]'
    and coalesce(p.with_check, '') ~ 'is_admin[(][)]';

  if v_admin_policy_count <> 1 then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_ADMIN_POLICY_MISSING: %', v_admin_policy_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'order_deliveries'
      and c.relrowsecurity
  ) then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_RLS_DISABLED';
  end if;

  select count(*)
    into v_secure_function_count
  from pg_catalog.pg_proc p
  where p.oid in (
      'public.refresh_order_fulfillment_status(uuid)'::regprocedure,
      'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)'::regprocedure,
      'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure,
      'public.sync_product_available_stock(uuid)'::regprocedure,
      'public.deliver_digital_order(uuid,text)'::regprocedure,
      'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure,
      'public.get_order_fulfillment_for_user(text)'::regprocedure,
      'public.get_order_delivery_for_user(text)'::regprocedure
    )
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public'];

  if v_secure_function_count <> 8 then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_SECURITY_CONFIGURATION_FAILED: %', v_secure_function_count;
  end if;

  if pg_get_functiondef('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure)
       !~ 'request[.]jwt[.]claim[.]role'
     or pg_get_functiondef('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure)
       !~ 'service_role'
     or pg_get_functiondef('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure)
       !~ 'payment_status[^;]*paid'
     or pg_get_functiondef('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure)
       !~ 'digital_delivery_secrets' then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_MANUAL_DELIVERY_DEFINITION_FAILED';
  end if;

  -- Inspect direct table ACL entries only. PostgreSQL owner privileges are ignored,
  -- and column grants are checked separately from pg_attribute.attacl below.
  select format(
      '%s:%s',
      case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end,
      acl.privilege_type
    )
    into v_unexpected_table_acl
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  where c.oid = 'public.order_deliveries'::regclass
    and (
      acl.grantee = 0
      or acl.grantee in (
        select r.oid from pg_catalog.pg_roles r
        where r.rolname in ('anon', 'authenticated')
      )
    )
  order by 1
  limit 1;

  if v_unexpected_table_acl is not null then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_UNEXPECTED_TABLE_ACL: %',
      v_unexpected_table_acl;
  end if;

  select required.privilege_type
    into v_missing_service_table_privilege
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
    required(privilege_type)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    join pg_catalog.pg_roles r on r.oid = acl.grantee
    where c.oid = 'public.order_deliveries'::regclass
      and r.rolname = 'service_role'
      and acl.privilege_type = required.privilege_type
  )
  order by required.privilege_type
  limit 1;

  if v_missing_service_table_privilege is not null then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_SERVICE_TABLE_ACL_MISSING: %',
      v_missing_service_table_privilege;
  end if;

  select acl.privilege_type
    into v_unexpected_service_table_privilege
  from pg_catalog.pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  join pg_catalog.pg_roles r on r.oid = acl.grantee
  where c.oid = 'public.order_deliveries'::regclass
    and r.rolname = 'service_role'
    and acl.privilege_type <> all(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
  order by acl.privilege_type
  limit 1;

  if v_unexpected_service_table_privilege is not null then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_SERVICE_TABLE_ACL_UNEXPECTED: %',
      v_unexpected_service_table_privilege;
  end if;

  select allowed.column_name
    into v_missing_authenticated_column
  from unnest(array[
    'id', 'order_id', 'order_item_id', 'user_id', 'delivery_type',
    'delivery_status', 'failure_reason', 'delivered_at', 'created_at', 'updated_at'
  ]::text[]) allowed(column_name)
  where not exists (
    select 1
    from pg_catalog.pg_attribute a
    cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
    join pg_catalog.pg_roles r on r.oid = acl.grantee
    where a.attrelid = 'public.order_deliveries'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = allowed.column_name
      and r.rolname = 'authenticated'
      and acl.privilege_type = 'SELECT'
  )
  order by allowed.column_name
  limit 1;

  if v_missing_authenticated_column is not null then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_REQUIRED_AUTHENTICATED_COLUMN_MISSING: %',
      v_missing_authenticated_column;
  end if;

  select format(
      '%s.%s:%s',
      case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end,
      a.attname,
      acl.privilege_type
    )
    into v_unexpected_column_acl
  from pg_catalog.pg_attribute a
  cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  where a.attrelid = 'public.order_deliveries'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and (
      acl.grantee = 0
      or acl.grantee in (
        select r.oid from pg_catalog.pg_roles r
        where r.rolname in ('anon', 'service_role')
      )
      or (
        acl.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
        and (
          acl.privilege_type <> 'SELECT'
          or a.attname <> all(array[
            'id', 'order_id', 'order_item_id', 'user_id', 'delivery_type',
            'delivery_status', 'failure_reason', 'delivered_at', 'created_at', 'updated_at'
          ]::name[])
        )
      )
    )
  order by a.attnum, acl.privilege_type
  limit 1;

  if v_unexpected_column_acl is not null then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_UNEXPECTED_COLUMN_ACL: %',
      v_unexpected_column_acl;
  end if;

  if has_function_privilege('anon', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_order_delivery_for_user(text)', 'EXECUTE') then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_USER_READ_ACL_FAILED';
  end if;

  if has_function_privilege('anon', 'public.deliver_digital_order(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.deliver_digital_order(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.deliver_digital_order(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_deliver_order_item_manual(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_deliver_order_item_manual(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_deliver_order_item_manual(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_DELIVER_ACL_FAILED';
  end if;

  if has_function_privilege('anon', 'public.refresh_order_fulfillment_status(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.refresh_order_fulfillment_status(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.refresh_order_fulfillment_status(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.sync_product_available_stock(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_product_available_stock(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.sync_product_available_stock(uuid)', 'EXECUTE') then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_INTERNAL_ACL_FAILED';
  end if;

  if has_function_privilege('anon', 'public.auto_deliver_order(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auto_deliver_order(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.auto_deliver_order(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_retry_auto_delivery(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_retry_auto_delivery(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.admin_retry_auto_delivery(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'DIGITAL_DELIVERY_POSTCHECK_LEGACY_ACL_FAILED';
  end if;
end
$$;

-- Export-friendly effective permission postcheck. PUBLIC is evaluated from the
-- function ACL because it is a pseudo-role rather than a login role.
select
  'digital-delivery-function-permissions'::text as check_id,
  p.oid::regprocedure::text as function_signature,
  roles.role_name,
  case
    when roles.role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    else has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
  end as can_execute
from pg_catalog.pg_proc p
cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
where p.oid in (
  'public.refresh_order_fulfillment_status(uuid)'::regprocedure,
  'public.log_order_item_delivery_status(uuid,uuid,text,text,text,text)'::regprocedure,
  'public.write_delivery_log(uuid,uuid,uuid,text,text,text,jsonb)'::regprocedure,
  'public.sync_product_available_stock(uuid)'::regprocedure,
  'public.deliver_digital_order(uuid,text)'::regprocedure,
  'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure,
  'public.get_order_fulfillment_for_user(text)'::regprocedure,
  'public.get_order_delivery_for_user(text)'::regprocedure,
  'public.auto_deliver_order(uuid)'::regprocedure,
  'public.admin_retry_auto_delivery(uuid)'::regprocedure,
  'public.admin_deliver_inventory_item(uuid,uuid,uuid,text)'::regprocedure,
  'public.admin_append_manual_delivery(uuid,uuid,text,text,text,text)'::regprocedure
)
order by function_signature, roles.role_name;

commit;

-- -----------------------------------------------------------------------------
-- Rollback / downgrade guidance (intentionally not executable here)
-- -----------------------------------------------------------------------------
-- The precheck emits the exact pre-migration policy expressions, table/column ACLs,
-- and pg_proc.proacl values. Preserve that output with the execution record before
-- applying this file.
--
-- Policy rollback:
--   The production precheck record is the source of truth. It currently records
--   policy "users can read own deliveries" with roles={public}, its original USING
--   expression (including the legacy admin compatibility branch), and a null
--   WITH CHECK expression. Recreate it only from those captured fields:
--   DROP POLICY IF EXISTS "users can read own deliveries" ON public.order_deliveries;
--   CREATE POLICY "users can read own deliveries" ON public.order_deliveries
--     AS <captured_permissive> FOR SELECT TO <captured_roles>
--     USING (<captured_pre_migration_using_expression>);
--   The captured WITH CHECK is null for this SELECT policy, so rollback must omit
--   WITH CHECK rather than inventing an expression. If a future capture is non-null,
--   restore that exact captured expression as well.
--
-- ACL rollback:
--   Restore only the exact table, column and function grants shown in the captured
--   pre-migration ACL values.
--   This file intentionally does not guess prior grants. Reopening PUBLIC/anon access
--   or re-enabling the four unsafe legacy functions is a security downgrade.
--
-- Application downgrade must happen after ACL rollback if an older deployment still
-- calls the deprecated RPCs. No table data is changed by this migration.
