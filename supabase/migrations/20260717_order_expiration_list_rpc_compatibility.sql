-- Order expiration list RPC compatibility.
--
-- Scope:
-- - Only creates or replaces public.list_expirable_unpaid_orders(p_limit integer).
-- - Does not alter order data, inventory data, tables, indexes, triggers, RLS, or other RPCs.
--
-- Core candidate logic is aligned with:
-- - 20260701_order_expiration_inventory_release.sql
-- - 20260709_order_lifecycle_non_payment_hardening.sql

create or replace function public.list_expirable_unpaid_orders(p_limit integer default 50)
returns table(order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_sql text;
begin
  v_sql := $query$
    select o.id
    from public.orders o
    where o.status = 'pending_payment'
      and o.payment_status = 'unpaid'
      and o.reservation_released_at is null
      and coalesce(o.payment_expires_at, o.created_at + interval '30 minutes') <= now()
  $query$;

  if to_regclass('public.chain_payment_sessions') is not null then
    v_sql := v_sql || $query$
      and not exists (
        select 1
        from public.chain_payment_sessions cps
        where cps.order_id = o.id
          and (
            cps.status in (
              'confirming',
              'verified',
              'completing',
              'manual_review',
              'underpaid',
              'overpaid',
              'paid',
              'payment_failed'
            )
            or (
              cps.status = 'submitted'
              and nullif(btrim(coalesce(cps.failure_reason, '')), '') is null
            )
          )
      )
    $query$;
  end if;

  v_sql := v_sql || $query$
    order by coalesce(o.payment_expires_at, o.created_at + interval '30 minutes') asc
    limit $1
  $query$;

  return query execute v_sql using v_limit;
end;
$$;

revoke execute on function public.list_expirable_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.list_expirable_unpaid_orders(integer) to service_role;

-- Read-only verification SQL for manual execution after applying this migration:
--
-- select
--   n.nspname as schema_name,
--   p.proname as function_name,
--   pg_get_function_identity_arguments(p.oid) as identity_arguments,
--   pg_get_function_result(p.oid) as return_type,
--   p.prosecdef as security_definer,
--   pg_get_functiondef(p.oid) as function_definition
-- from pg_catalog.pg_proc p
-- join pg_catalog.pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'list_expirable_unpaid_orders'
-- order by pg_get_function_identity_arguments(p.oid);
