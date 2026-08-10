-- Read-only postcheck for 20260810190000_user_delivery_compatibility.sql.

begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '120s';

with functions as (
  select
    p.proname,
    p.prosecdef,
    coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public'] as safe_search_path,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('get_order_delivery_for_user', 'get_order_fulfillment_for_user')
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_no text'
), summary as (
  select
    case when exists (
      select 1
      from pg_catalog.pg_attribute as a
      where a.attrelid = pg_catalog.to_regclass('public.order_deliveries')
        and a.attname = 'delivery_no'
        and a.atttypid = 'text'::pg_catalog.regtype
        and a.attnum > 0
        and not a.attisdropped
    ) then 0 else 1 end as delivery_no_blocker_count,
    case when (select count(*) from functions) = 2 then 0 else 1 end as function_count_blocker_count,
    case when not exists (
      select 1 from functions where not prosecdef or not safe_search_path
    ) then 0 else 1 end as function_security_blocker_count,
    case when not exists (
      select 1 from functions
      where definition !~ 'from[[:space:]]+public[.]orders[[:space:]]+as[[:space:]]+o'
         or definition !~ 'o[.]order_no[[:space:]]*=[[:space:]]*p_order_no'
         or definition ~ '[[:space:]]where[[:space:]]+order_no[[:space:]]*='
    ) then 0 else 1 end as order_alias_blocker_count,
    case when exists (
      select 1 from functions
      where proname = 'get_order_fulfillment_for_user'
        and definition ~ 'from[[:space:]]+public[.]order_items[[:space:]]+as[[:space:]]+oi'
        and definition ~ 'join[[:space:]]+public[.]order_deliveries[[:space:]]+as[[:space:]]+od'
        and definition !~ '[[:space:]]where[[:space:]]+delivery_status[[:space:]]*='
    ) then 0 else 1 end as fulfillment_alias_blocker_count,
    case when not pg_catalog.has_function_privilege('anon', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
           and not pg_catalog.has_function_privilege('anon', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
           and pg_catalog.has_function_privilege('authenticated', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
           and pg_catalog.has_function_privilege('authenticated', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
           and pg_catalog.has_function_privilege('service_role', 'public.get_order_delivery_for_user(text)', 'EXECUTE')
           and pg_catalog.has_function_privilege('service_role', 'public.get_order_fulfillment_for_user(text)', 'EXECUTE')
      then 0 else 1 end as acl_blocker_count
)
select
  summary.*,
  case when delivery_no_blocker_count = 0
          and function_count_blocker_count = 0
          and function_security_blocker_count = 0
          and order_alias_blocker_count = 0
          and fulfillment_alias_blocker_count = 0
          and acl_blocker_count = 0
    then 'PASS'
    else 'BLOCKED'
  end as assessment
from summary;

rollback;
