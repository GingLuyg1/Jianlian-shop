-- Harden the controlled 10-argument order creation RPC execution context.
-- Execute manually after 20260710_create_order_with_item_compatibility.sql.
-- This migration removes direct authenticated INSERT policies while preserving
-- own-order reads, controlled cancellation, and administrator management.

do $$
declare
  v_function oid;
  v_function_definition text;
  v_result text;
  v_input_names text[];
  v_matching_signatures integer;
  v_orders_rls boolean;
  v_owner_can_bypass_rls boolean;
begin
  if to_regclass('public.orders') is null then
    raise exception 'order creation RPC hardening requires public.orders';
  end if;

  select c.relrowsecurity
    into v_orders_rls
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'orders';

  if not coalesce(v_orders_rls, false) then
    raise exception 'public.orders RLS must remain enabled before order creation RPC hardening';
  end if;

  v_function := to_regprocedure(
    'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'missing create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)';
  end if;

  select count(*)::integer
    into v_matching_signatures
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_order_with_item'
    and pg_get_function_identity_arguments(p.oid) =
      'p_product_id uuid, p_quantity integer, p_customer_email text, p_customer_name text, p_customer_phone text, p_customer_note text, p_shipping_address jsonb, p_sku_id uuid, p_payment_method text, p_client_request_id text';

  if v_matching_signatures <> 1 then
    raise exception 'unexpected 10-argument create_order_with_item signature count: %', v_matching_signatures;
  end if;

  select
    pg_get_functiondef(p.oid),
    lower(regexp_replace(pg_get_function_result(p.oid), '\s+', '', 'g')),
    p.proargnames[1:p.pronargs]
  into v_function_definition, v_result, v_input_names
  from pg_proc as p
  where p.oid = v_function;

  if v_result <> 'table(order_iduuid,order_notext,statustext,payment_statustext,total_amountnumeric)' then
    raise exception 'unexpected create_order_with_item return type: %', pg_get_function_result(v_function);
  end if;

  if position('auth.uid()' in lower(regexp_replace(v_function_definition, '\s+', '', 'g'))) = 0 then
    raise exception 'create_order_with_item must derive user ownership from auth.uid()';
  end if;

  if exists (
    select 1
    from unnest(v_input_names) as input_name
    where lower(input_name) in ('user_id', 'p_user_id')
  ) then
    raise exception 'create_order_with_item must not accept a client-supplied user id';
  end if;

  select r.rolsuper or r.rolbypassrls
    into v_owner_can_bypass_rls
  from pg_roles as r
  where r.rolname = 'postgres';

  if not coalesce(v_owner_can_bypass_rls, false) then
    raise exception 'postgres role is missing or cannot bypass RLS';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'Supabase API roles are missing';
  end if;
end;
$$;

drop policy if exists "users can create own orders"
on public.orders;

-- Historical environments may use a different name for the same direct INSERT
-- policy. Remove only INSERT policies exposed to PUBLIC/authenticated; do not
-- touch SELECT, UPDATE, or administrator ALL policies.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'orders'
      and p.cmd = 'INSERT'
      and (
        'public' = any(p.roles)
        or 'authenticated' = any(p.roles)
      )
  loop
    execute format('drop policy if exists %I on public.orders', v_policy.policyname);
    raise notice 'Removed direct order INSERT policy: %', v_policy.policyname;
  end loop;
end;
$$;

alter function public.create_order_with_item(
  uuid, integer, text, text, text, text, jsonb, uuid, text, text
) owner to postgres;

alter function public.create_order_with_item(
  uuid, integer, text, text, text, text, jsonb, uuid, text, text
) security definer;

alter function public.create_order_with_item(
  uuid, integer, text, text, text, text, jsonb, uuid, text, text
) set search_path to public;

revoke all on function public.create_order_with_item(
  uuid, integer, text, text, text, text, jsonb, uuid, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.create_order_with_item(
  uuid, integer, text, text, text, text, jsonb, uuid, text, text
) to authenticated, service_role;

do $$
declare
  v_function oid := to_regprocedure(
    'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
  );
  v_public_can_execute boolean;
begin
  select exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_can_execute
  from pg_proc as p
  where p.oid = v_function;

  if not exists (
    select 1
    from pg_proc as p
    join pg_roles as r on r.oid = p.proowner
    where p.oid = v_function
      and p.prosecdef
      and r.rolname = 'postgres'
      and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
  ) then
    raise exception 'create_order_with_item execution context hardening did not apply';
  end if;

  if v_public_can_execute
     or has_function_privilege('anon', v_function, 'EXECUTE')
     or not has_function_privilege('authenticated', v_function, 'EXECUTE')
     or not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'create_order_with_item grants are not restricted to authenticated and service_role';
  end if;

  if exists (
    select 1
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'orders'
      and p.cmd in ('INSERT', 'ALL')
      and (
        'public' = any(p.roles)
        or 'authenticated' = any(p.roles)
      )
      and not (
        p.cmd = 'ALL'
        and regexp_replace(lower(coalesce(p.qual, '')), '[[:space:]()]', '', 'g')
          in ('is_admin', 'public.is_admin')
        and regexp_replace(
          lower(coalesce(p.with_check, p.qual, '')),
          '[[:space:]()]', '', 'g'
        ) in ('is_admin', 'public.is_admin')
      )
  ) then
    raise exception 'direct authenticated order INSERT/ALL policy still exists';
  end if;
end;
$$;
