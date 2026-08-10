-- Restore reliable service-role recognition for the currently deployed
-- deliver_digital_order definition without replacing any delivery behavior.
--
-- 20260722_digital_delivery_service_role_claim_compatibility.sql established
-- auth.role() as the repository contract. Some environments later retained the
-- legacy request.jwt.claim.role GUC in the effective function definition. This
-- follow-up patches only that expression in the exact deployed CREATE OR
-- REPLACE FUNCTION statement returned by pg_get_functiondef().

begin;

do $patch_delivery_auth$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.deliver_digital_order(uuid,text)'
  );
  v_definition text;
  v_patched_definition text;
  v_legacy_expression constant text :=
    'coalesce(current_setting(''request.jwt.claim.role'', true), '''')';
  v_auth_expression constant text := 'coalesce(auth.role(), '''')';
  v_legacy_match_count integer;
begin
  if v_function_oid is null then
    raise exception 'DELIVER_DIGITAL_ORDER_AUTH_COMPATIBILITY_FUNCTION_MISSING';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = v_function_oid
    and p.prosecdef
    and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public'];

  if v_definition is null then
    raise exception 'DELIVER_DIGITAL_ORDER_AUTH_COMPATIBILITY_SECURITY_CONTRACT_DRIFT';
  end if;

  if position('payment_status <> ''paid''' in v_definition) = 0
     or position('digital_delivery_secrets' in v_definition) = 0
     or position('status = ''reserved''' in v_definition) = 0
     or position('supplier_fulfillment_requests as local_sfr' in v_definition) = 0
     or position('and not public.is_admin()' in v_definition) = 0 then
    raise exception 'DELIVER_DIGITAL_ORDER_AUTH_COMPATIBILITY_BUSINESS_CONTRACT_DRIFT';
  end if;

  if position(v_auth_expression in v_definition) > 0
     and position('request.jwt.claim.role' in v_definition) = 0 then
    return;
  end if;

  v_legacy_match_count := (
    length(v_definition) - length(replace(v_definition, v_legacy_expression, ''))
  ) / length(v_legacy_expression);

  if v_legacy_match_count <> 1
     or position(v_auth_expression in v_definition) > 0 then
    raise exception 'DELIVER_DIGITAL_ORDER_AUTH_COMPATIBILITY_UNKNOWN_AUTH_CONTRACT';
  end if;

  v_patched_definition := replace(
    v_definition,
    v_legacy_expression,
    v_auth_expression
  );

  if v_patched_definition = v_definition
     or position('request.jwt.claim.role' in v_patched_definition) > 0
     or position(v_auth_expression in v_patched_definition) = 0
     or position('and not public.is_admin()' in v_patched_definition) = 0 then
    raise exception 'DELIVER_DIGITAL_ORDER_AUTH_COMPATIBILITY_PATCH_FAILED';
  end if;

  -- pg_get_functiondef returns the exact CREATE OR REPLACE FUNCTION statement,
  -- so every delivery, supplier-routing and local-inventory clause is retained.
  execute v_patched_definition;
end
$patch_delivery_auth$;

commit;
