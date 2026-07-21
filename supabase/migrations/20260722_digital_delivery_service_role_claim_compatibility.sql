-- Fix service-role claim recognition for the deployed digital-delivery writers.
--
-- Context:
-- - The server already calls these RPCs with the service-role client.
-- - The deployed functions read request.jwt.claim.role directly. That legacy GUC
--   can be empty even though auth.role() correctly reports service_role to the
--   other payment-completion RPCs in the same request.
-- - This migration patches only the role-expression in the existing, audited
--   function definitions. Every payment, order, inventory, idempotency and
--   private-secret check remains byte-for-byte unchanged.
--
-- This file is intentionally separate from the already-deployed 20260720
-- security hardening migration. Do not run a delivery RPC from this migration.

begin;

do $precheck$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.deliver_digital_order(uuid,text)'::regprocedure,
    'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure
  ]
  loop
    select pg_catalog.pg_get_functiondef(v_signature)
      into v_definition;

    if v_definition is null then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PRECHECK_FUNCTION_MISSING: %', v_signature::text;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = v_signature
        and p.prosecdef
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public']
    ) then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PRECHECK_SECURITY_CONTRACT_FAILED: %', v_signature::text;
    end if;

    if position('current_setting(''request.jwt.claim.role'', true)' in v_definition) = 0
       and position('auth.role()' in v_definition) = 0 then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PRECHECK_UNKNOWN_ROLE_CONTRACT: %', v_signature::text;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef('public.deliver_digital_order(uuid,text)'::regprocedure)
    into v_definition;
  if position('payment_status <> ''paid''' in v_definition) = 0
     or position('digital_delivery_secrets' in v_definition) = 0
     or position('status = ''reserved''' in v_definition) = 0
     or position('order_deliveries' in v_definition) = 0 then
    raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PRECHECK_AUTO_DELIVERY_CONTRACT_DRIFT';
  end if;

  select pg_catalog.pg_get_functiondef('public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure)
    into v_definition;
  if position('payment_status <> ''paid''' in v_definition) = 0
     or position('digital_delivery_secrets' in v_definition) = 0
     or position('manual_delivery' in v_definition) = 0
     or position('order_item_id = p_order_item_id' in v_definition) = 0 then
    raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PRECHECK_MANUAL_DELIVERY_CONTRACT_DRIFT';
  end if;
end
$precheck$;

do $patch_role_claim$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched_definition text;
begin
  foreach v_signature in array array[
    'public.deliver_digital_order(uuid,text)'::regprocedure,
    'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure
  ]
  loop
    select pg_catalog.pg_get_functiondef(v_signature)
      into v_definition;

    if position('auth.role()' in v_definition) > 0
       and position('request.jwt.claim.role' in v_definition) = 0 then
      raise notice 'service-role claim check already compatible: %', v_signature::text;
      continue;
    end if;

    v_patched_definition := replace(
      v_definition,
      'coalesce(current_setting(''request.jwt.claim.role'', true), '''')',
      'coalesce(auth.role(), '''')'
    );

    if v_patched_definition = v_definition
       or position('request.jwt.claim.role' in v_patched_definition) > 0
       or position('auth.role()' in v_patched_definition) = 0 then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_PATCH_FAILED: %', v_signature::text;
    end if;

    execute v_patched_definition;
  end loop;
end
$patch_role_claim$;

revoke execute on function public.deliver_digital_order(uuid,text)
  from public, anon, authenticated;
grant execute on function public.deliver_digital_order(uuid,text)
  to service_role;

revoke execute on function public.admin_deliver_order_item_manual(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_deliver_order_item_manual(uuid,uuid,text,text)
  to service_role;

do $postcheck$
declare
  v_signature regprocedure;
  v_definition text;
  v_public_execute boolean;
begin
  foreach v_signature in array array[
    'public.deliver_digital_order(uuid,text)'::regprocedure,
    'public.admin_deliver_order_item_manual(uuid,uuid,text,text)'::regprocedure
  ]
  loop
    select pg_catalog.pg_get_functiondef(v_signature)
      into v_definition;

    if position('auth.role()' in v_definition) = 0
       or position('request.jwt.claim.role' in v_definition) > 0 then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_POSTCHECK_DEFINITION_FAILED: %', v_signature::text;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = v_signature
        and p.prosecdef
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public']
    ) then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_POSTCHECK_SECURITY_FAILED: %', v_signature::text;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where p.oid = v_signature
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_public_execute
       or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'DIGITAL_DELIVERY_ROLE_CLAIM_POSTCHECK_EXECUTE_ACL_FAILED: %', v_signature::text;
    end if;
  end loop;
end
$postcheck$;

commit;

-- Manual rollback guidance (do not run automatically): restore the exact
-- pre-migration pg_get_functiondef() output for both signatures, then reapply
-- the same service-role-only REVOKE/GRANT statements above. Rolling back the
-- role check reintroduces the production delivery failure and is not a data
-- rollback; already completed deliveries must never be deleted or reopened.
