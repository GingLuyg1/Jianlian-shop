-- Read-only postcheck for 20260810200000_daju_local_inventory_priority_v1.sql.

begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '120s';

with functions as (
  select
    p.proname,
    p.prosecdef,
    coalesce(p.proconfig, '{}'::text[]) as proconfig,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      (p.proname = 'reserve_local_inventory_for_daju_order'
       and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_trigger_source text')
      or (p.proname = 'deliver_digital_order'
          and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_trigger_source text')
    )
), summary as (
  select
    case when exists (
      select 1 from functions
      where proname = 'reserve_local_inventory_for_daju_order'
        and prosecdef
        and proconfig @> array['search_path=pg_catalog, public']
        and definition ~ 'coalesce\(auth[.]role\(\), ''''\) <> ''service_role'''
        and definition ~ 'for update skip locked'
        and definition ~ 'cardinality\(v_inventory_ids\).*= v_required'
        and definition ~ 'v_reserved > 0'
        and definition ~ 'v_blocked_count := v_blocked_count \+ 1'
        and definition !~ 'insert[[:space:]]+into[[:space:]]+public[.]supplier_fulfillment_requests'
    ) then 0 else 1 end as reservation_contract_blocker_count,
    case when exists (
      select 1 from functions
      where proname = 'deliver_digital_order'
        and definition ~ 'not exists.*supplier_fulfillment_requests'
        and definition ~ 'local_di[.]status = ''reserved'''
        and definition ~ 'local_di[.]reserved_order_item_id = order_items[.]id'
        and definition ~ 'local_od[.]delivery_status = ''delivered'''
    ) then 0 else 1 end as local_delivery_contract_blocker_count,
    case when not pg_catalog.has_function_privilege('public', 'public.reserve_local_inventory_for_daju_order(uuid,text)', 'EXECUTE')
           and not pg_catalog.has_function_privilege('anon', 'public.reserve_local_inventory_for_daju_order(uuid,text)', 'EXECUTE')
           and not pg_catalog.has_function_privilege('authenticated', 'public.reserve_local_inventory_for_daju_order(uuid,text)', 'EXECUTE')
           and pg_catalog.has_function_privilege('service_role', 'public.reserve_local_inventory_for_daju_order(uuid,text)', 'EXECUTE')
      then 0 else 1 end as acl_blocker_count
)
select
  summary.*,
  case when reservation_contract_blocker_count = 0
          and local_delivery_contract_blocker_count = 0
          and acl_blocker_count = 0
    then 'PASS'
    else 'BLOCKED'
  end as assessment
from summary;

rollback;
