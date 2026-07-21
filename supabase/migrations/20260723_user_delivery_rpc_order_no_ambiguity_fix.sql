-- Remove PL/pgSQL output-parameter ambiguity from the two owned-user delivery
-- readers. This migration does not widen direct table access.

begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(v.object_name order by v.object_name)
    into v_missing
  from (
    values
      ('public.orders'),
      ('public.order_items'),
      ('public.order_deliveries'),
      ('public.digital_delivery_secrets')
  ) as v(object_name)
  where to_regclass(v.object_name) is null;

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'USER_DELIVERY_RPC_PREFLIGHT_TABLES_MISSING: %', v_missing;
  end if;

  if to_regprocedure('public.mask_delivery_secret(text)') is null then
    raise exception 'USER_DELIVERY_RPC_PREFLIGHT_MASK_FUNCTION_MISSING';
  end if;

  if to_regprocedure('public.normalize_order_item_delivery_type(text)') is null then
    raise exception 'USER_DELIVERY_RPC_PREFLIGHT_NORMALIZE_FUNCTION_MISSING';
  end if;
end;
$$;

create or replace function public.get_order_fulfillment_for_user(p_order_no text)
returns table (
  order_item_id uuid,
  product_name text,
  delivery_status text,
  delivery_type text,
  quantity integer,
  delivered_quantity integer,
  delivered_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'please sign in first';
  end if;

  select o.*
    into v_order
  from public.orders as o
  where o.order_no = p_order_no
    and o.user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'order not found or access denied';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'order is not paid';
  end if;
  if v_order.status in ('cancelled', 'expired', 'failed') then
    raise exception 'order status does not allow delivery access';
  end if;

  update public.order_deliveries as od
     set viewed_at = coalesce(od.viewed_at, clock_timestamp())
   where od.order_id = v_order.id
     and od.user_id = auth.uid()
     and od.delivery_status = 'delivered'
     and od.viewed_at is null;

  return query
  select
    oi.id,
    oi.product_name,
    coalesce(oi.delivery_status, 'pending'),
    public.normalize_order_item_delivery_type(oi.delivery_type),
    coalesce(oi.quantity, 1)::integer,
    coalesce(oi.delivered_quantity, 0)::integer,
    coalesce(oi.delivery_completed_at, max(od.delivered_at)),
    public.mask_delivery_secret(string_agg(ds.content, E'\n' order by od.delivered_at asc)),
    case
      when coalesce(oi.delivery_status, '') = 'delivered'
        then string_agg(ds.content, E'\n' order by od.delivered_at asc)
      else null
    end,
    max(od.delivery_note)
  from public.order_items as oi
  left join public.order_deliveries as od
    on od.order_item_id = oi.id
   and od.order_id = v_order.id
   and od.user_id = auth.uid()
   and od.delivery_status = 'delivered'
  left join public.digital_delivery_secrets as ds
    on ds.delivery_id = od.id
  where oi.order_id = v_order.id
  group by
    oi.id,
    oi.product_name,
    oi.delivery_status,
    oi.delivery_type,
    oi.quantity,
    oi.delivered_quantity,
    oi.delivery_completed_at
  order by min(oi.created_at) asc;
end;
$$;

create or replace function public.get_order_delivery_for_user(p_order_no text)
returns table (
  order_no text,
  order_status text,
  payment_status text,
  product_name text,
  delivery_id uuid,
  delivery_status text,
  delivery_type text,
  delivered_at timestamptz,
  viewed_at timestamptz,
  masked_content text,
  content text,
  delivery_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'please sign in first';
  end if;

  select o.*
    into v_order
  from public.orders as o
  where o.order_no = p_order_no
    and o.user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'order not found or access denied';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'order is not paid';
  end if;
  if v_order.status in ('cancelled', 'expired', 'failed') then
    raise exception 'order status does not allow delivery access';
  end if;

  update public.order_deliveries as od
     set viewed_at = coalesce(od.viewed_at, clock_timestamp())
   where od.order_id = v_order.id
     and od.user_id = auth.uid()
     and od.delivery_status = 'delivered'
     and od.viewed_at is null;

  return query
  select
    v_order.order_no,
    v_order.status,
    v_order.payment_status,
    oi.product_name,
    od.id,
    od.delivery_status,
    od.delivery_type,
    od.delivered_at,
    od.viewed_at,
    public.mask_delivery_secret(ds.content),
    ds.content,
    od.delivery_note
  from public.order_deliveries as od
  join public.order_items as oi
    on oi.id = od.order_item_id
   and oi.order_id = v_order.id
  join public.digital_delivery_secrets as ds
    on ds.delivery_id = od.id
  where od.order_id = v_order.id
    and od.user_id = auth.uid()
    and od.delivery_status = 'delivered'
  order by od.delivered_at asc, od.id asc;
end;
$$;

revoke execute on function public.get_order_fulfillment_for_user(text) from public, anon;
revoke execute on function public.get_order_delivery_for_user(text) from public, anon;
grant execute on function public.get_order_fulfillment_for_user(text) to authenticated, service_role;
grant execute on function public.get_order_delivery_for_user(text) to authenticated, service_role;

do $$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_order_fulfillment_for_user', 'get_order_delivery_for_user')
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_no text'
  loop
    if not v_function.prosecdef
       or not coalesce(v_function.proconfig, '{}'::text[]) @> array['search_path=public'] then
      raise exception 'USER_DELIVERY_RPC_POSTCHECK_SECURITY_FAILED: %', v_function.proname;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
    if v_definition !~ 'o[.]order_no[[:space:]]*=[[:space:]]*p_order_no'
       or v_definition ~ '[[:space:]]where[[:space:]]+order_no[[:space:]]*=' then
      raise exception 'USER_DELIVERY_RPC_POSTCHECK_QUALIFICATION_FAILED: %', v_function.proname;
    end if;
  end loop;

  if (
    select count(*)
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_order_fulfillment_for_user', 'get_order_delivery_for_user')
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_no text'
  ) <> 2 then
    raise exception 'USER_DELIVERY_RPC_POSTCHECK_SIGNATURE_COUNT_FAILED';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_proc as p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) as acl
       where p.oid in (
         'public.get_order_fulfillment_for_user(text)'::regprocedure,
         'public.get_order_delivery_for_user(text)'::regprocedure
       )
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_order_delivery_for_user(text)', 'EXECUTE') then
    raise exception 'USER_DELIVERY_RPC_POSTCHECK_EXECUTE_PRIVILEGES_FAILED';
  end if;
end;
$$;

commit;
