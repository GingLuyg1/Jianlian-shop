begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Forward-only compatibility migration.
--
-- Production can legitimately be in one of three states:
--   1. both the expiry function and trigger are missing;
--   2. the known legacy 30-minute function and INSERT/UPDATE trigger exist;
--   3. the desired 15-minute function and INSERT-only trigger already exist.
-- Every other or partial state fails closed before any object is changed.
--
-- create_order_with_item may still provide an explicit 30-minute value. The
-- BEFORE INSERT trigger below is authoritative for every new pending, unpaid
-- order and deliberately overwrites that proposed value with 15 minutes.
-- Existing rows are never updated. The 30-minute NULL-expiry fallbacks in
-- expire_unpaid_order and list_expirable_unpaid_orders remain unchanged for
-- historical or anomalous rows that do not have a persisted expiry.

do $$
declare
  orders_oid oid;
  function_oid oid;
  named_function_count integer;
  exact_function_count integer;
  named_trigger_count integer;
  function_trigger_count integer;
  function_definition text;
  function_source text;
  function_returns_trigger boolean;
  function_language name;
  function_security_definer boolean;
  function_config text[];
  trigger_function_oid oid;
  trigger_type smallint;
  trigger_enabled "char";
  trigger_definition text;
  existing_state text;
begin
  select relation.oid
    into orders_oid
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'orders'
    and relation.relkind in ('r', 'p');

  if orders_oid is null then
    raise exception '15-minute payment expiry preflight failed: public.orders is missing or is not a table';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = orders_oid
      and attribute.attname = 'payment_expires_at'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception '15-minute payment expiry preflight failed: public.orders.payment_expires_at is missing';
  end if;

  select
    count(*)::integer,
    count(*) filter (where function_row.pronargs = 0)::integer
    into named_function_count, exact_function_count
  from pg_catalog.pg_proc as function_row
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_row.pronamespace
  where namespace.nspname = 'public'
    and function_row.proname = 'set_order_payment_expiration'
    and function_row.prokind = 'f';

  select count(*)::integer
    into named_trigger_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = orders_oid
    and trigger_row.tgname = 'trg_orders_set_payment_expiration'
    and not trigger_row.tgisinternal;

  if named_function_count = 0 and named_trigger_count = 0 then
    existing_state := 'missing';
  elsif named_function_count = 1
        and exact_function_count = 1
        and named_trigger_count = 1 then
    select
      function_row.oid,
      lower(pg_catalog.pg_get_functiondef(function_row.oid)),
      lower(function_row.prosrc),
      function_row.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype,
      language.lanname,
      function_row.prosecdef,
      function_row.proconfig
      into
        function_oid,
        function_definition,
        function_source,
        function_returns_trigger,
        function_language,
        function_security_definer,
        function_config
    from pg_catalog.pg_proc as function_row
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_language as language
      on language.oid = function_row.prolang
    where namespace.nspname = 'public'
      and function_row.proname = 'set_order_payment_expiration'
      and function_row.prokind = 'f'
      and function_row.pronargs = 0;

    select
      trigger_row.tgfoid,
      trigger_row.tgtype,
      trigger_row.tgenabled,
      lower(pg_catalog.pg_get_triggerdef(trigger_row.oid, true))
      into
        trigger_function_oid,
        trigger_type,
        trigger_enabled,
        trigger_definition
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = orders_oid
      and trigger_row.tgname = 'trg_orders_set_payment_expiration'
      and not trigger_row.tgisinternal;

    select count(*)::integer
      into function_trigger_count
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgfoid = function_oid
      and not trigger_row.tgisinternal;

    if not function_returns_trigger
       or function_language <> 'plpgsql'
       or function_security_definer
       or not (coalesce(function_config, array[]::text[]) @> array['search_path=public']::text[]) then
      raise exception '15-minute payment expiry preflight failed: unexpected function metadata';
    end if;

    if trigger_function_oid <> function_oid
       or function_trigger_count <> 1
       or trigger_enabled <> 'O' then
      raise exception '15-minute payment expiry preflight failed: trigger ownership, count, or enabled state is unexpected';
    end if;

    if position('interval ''30 minutes''' in function_definition) > 0
       and position('interval ''15 minutes''' in function_definition) = 0
       and position('new.status = ''pending_payment''' in function_source) > 0
       and position('new.payment_status <> ''paid''' in function_source) > 0
       and position('new.payment_expires_at is null' in function_source) > 0
       and position('new.payment_expires_at :=' in function_source) > 0
       and trigger_type = 23
       and position('before insert or update' in trigger_definition) > 0
       and position('status' in trigger_definition) > 0
       and position('payment_status' in trigger_definition) > 0
       and position('payment_expires_at' in trigger_definition) > 0 then
      existing_state := 'legacy_30_minutes';
    elsif position('interval ''15 minutes''' in function_definition) > 0
          and position('interval ''30 minutes''' in function_definition) = 0
          and position('tg_op = ''insert''' in function_source) > 0
          and position('new.status = ''pending_payment''' in function_source) > 0
          and position('new.payment_status <> ''paid''' in function_source) > 0
          and position('new.payment_expires_at :=' in function_source) > 0
          and position('new.payment_expires_at is null' in function_source) = 0
          and trigger_type = 7
          and position('before insert' in trigger_definition) > 0
          and position('update' in trigger_definition) = 0 then
      existing_state := 'current_15_minutes';
    else
      raise exception '15-minute payment expiry preflight failed: function or trigger definition is unknown';
    end if;
  else
    raise exception
      '15-minute payment expiry preflight failed: partial or ambiguous state (functions %, zero-argument functions %, triggers %)',
      named_function_count,
      exact_function_count,
      named_trigger_count;
  end if;

  raise notice '15-minute payment expiry preflight accepted state: %', existing_state;
end;
$$;

create or replace function public.set_order_payment_expiration()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- INSERT-only and authoritative: an RPC-provided 30-minute value is
  -- replaced before persistence. Existing rows are never recalculated.
  if tg_op = 'INSERT'
     and new.status = 'pending_payment'
     and new.payment_status <> 'paid' then
    new.payment_expires_at := coalesce(new.created_at, statement_timestamp()) + interval '15 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_payment_expiration on public.orders;

create trigger trg_orders_set_payment_expiration
before insert on public.orders
for each row execute function public.set_order_payment_expiration();

do $$
declare
  orders_oid oid;
  function_oid oid;
  named_function_count integer;
  exact_function_count integer;
  named_trigger_count integer;
  function_trigger_count integer;
  function_definition text;
  function_source text;
  function_returns_trigger boolean;
  function_language name;
  function_security_definer boolean;
  function_config text[];
  trigger_function_oid oid;
  trigger_type smallint;
  trigger_enabled "char";
  trigger_definition text;
begin
  select relation.oid
    into orders_oid
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'orders'
    and relation.relkind in ('r', 'p');

  if orders_oid is null then
    raise exception '15-minute payment expiry post-check failed: public.orders is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = orders_oid
      and attribute.attname = 'payment_expires_at'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception '15-minute payment expiry post-check failed: public.orders.payment_expires_at is missing';
  end if;

  select
    count(*)::integer,
    count(*) filter (where function_row.pronargs = 0)::integer
    into named_function_count, exact_function_count
  from pg_catalog.pg_proc as function_row
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_row.pronamespace
  where namespace.nspname = 'public'
    and function_row.proname = 'set_order_payment_expiration'
    and function_row.prokind = 'f';

  if named_function_count <> 1 or exact_function_count <> 1 then
    raise exception '15-minute payment expiry post-check failed: expected exactly one zero-argument function';
  end if;

  select
    function_row.oid,
    lower(pg_catalog.pg_get_functiondef(function_row.oid)),
    lower(function_row.prosrc),
    function_row.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype,
    language.lanname,
    function_row.prosecdef,
    function_row.proconfig
    into
      function_oid,
      function_definition,
      function_source,
      function_returns_trigger,
      function_language,
      function_security_definer,
      function_config
  from pg_catalog.pg_proc as function_row
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_row.pronamespace
  join pg_catalog.pg_language as language
    on language.oid = function_row.prolang
  where namespace.nspname = 'public'
    and function_row.proname = 'set_order_payment_expiration'
    and function_row.prokind = 'f'
    and function_row.pronargs = 0;

  select count(*)::integer
    into named_trigger_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = orders_oid
    and trigger_row.tgname = 'trg_orders_set_payment_expiration'
    and not trigger_row.tgisinternal;

  if named_trigger_count <> 1 then
    raise exception '15-minute payment expiry post-check failed: expected exactly one named trigger, found %', named_trigger_count;
  end if;

  select
    trigger_row.tgfoid,
    trigger_row.tgtype,
    trigger_row.tgenabled,
    lower(pg_catalog.pg_get_triggerdef(trigger_row.oid, true))
    into
      trigger_function_oid,
      trigger_type,
      trigger_enabled,
      trigger_definition
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = orders_oid
    and trigger_row.tgname = 'trg_orders_set_payment_expiration'
    and not trigger_row.tgisinternal;

  select count(*)::integer
    into function_trigger_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgfoid = function_oid
    and not trigger_row.tgisinternal;

  if not function_returns_trigger
     or function_language <> 'plpgsql'
     or function_security_definer
     or not (coalesce(function_config, array[]::text[]) @> array['search_path=public']::text[])
     or position('interval ''15 minutes''' in function_definition) = 0
     or position('interval ''30 minutes''' in function_definition) > 0
     or position('tg_op = ''insert''' in function_source) = 0
     or position('new.status = ''pending_payment''' in function_source) = 0
     or position('new.payment_status <> ''paid''' in function_source) = 0
     or position('new.payment_expires_at :=' in function_source) = 0
     or position('new.payment_expires_at is null' in function_source) > 0 then
    raise exception '15-minute payment expiry post-check failed: function definition or metadata is incorrect';
  end if;

  if trigger_function_oid <> function_oid
     or function_trigger_count <> 1
     or trigger_type <> 7
     or trigger_enabled <> 'O'
     or position('before insert' in trigger_definition) = 0
     or position('update' in trigger_definition) > 0 then
    raise exception '15-minute payment expiry post-check failed: trigger is not the unique enabled BEFORE INSERT trigger';
  end if;
end;
$$;

-- No UPDATE/INSERT/DELETE statement targets business rows in this migration.
-- Historical orders, payment sessions, recharges, balances, and inventory are unchanged.

commit;
