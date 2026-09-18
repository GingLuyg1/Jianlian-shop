begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  function_definition text;
  matching_trigger_count integer;
begin
  if to_regprocedure('public.set_order_payment_expiration()') is null then
    raise exception '15-minute payment expiry preflight failed: public.set_order_payment_expiration() is missing';
  end if;

  select pg_catalog.pg_get_functiondef(to_regprocedure('public.set_order_payment_expiration()'))
    into function_definition;

  if position('interval ''30 minutes''' in function_definition) = 0
     or position('payment_expires_at' in function_definition) = 0 then
    raise exception '15-minute payment expiry preflight failed: unexpected order expiry function definition';
  end if;

  select count(*)::integer
    into matching_trigger_count
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_class as relation on relation.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'orders'
    and trigger_row.tgname = 'trg_orders_set_payment_expiration'
    and not trigger_row.tgisinternal
    and trigger_row.tgfoid = to_regprocedure('public.set_order_payment_expiration()');

  if matching_trigger_count <> 1 then
    raise exception '15-minute payment expiry preflight failed: expected one authoritative orders expiry trigger, found %', matching_trigger_count;
  end if;
end;
$$;

create or replace function public.set_order_payment_expiration()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Forward-only: every newly inserted unpaid order receives the shared
  -- 15-minute local payment window. UPDATE never recomputes persisted expiry.
  if tg_op = 'INSERT'
     and new.status = 'pending_payment'
     and new.payment_status <> 'paid' then
    new.payment_expires_at := coalesce(new.created_at, statement_timestamp()) + interval '15 minutes';
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE preserves owner and ACL. No historical rows are updated.

commit;
