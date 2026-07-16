-- Read-only verification for the create_order_with_item overloads.
-- Run after manually applying 20260710_create_order_with_item_compatibility.sql.

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns as c
where c.table_schema = 'public'
  and (
    (c.table_name = 'orders' and c.column_name = 'client_request_id')
    or (c.table_name = 'digital_inventory' and c.column_name = 'reserved_user_id')
  )
order by c.table_name, c.column_name;

select
  i.indexname,
  i.indexdef,
  i.indexdef ilike 'create unique index%' as is_unique,
  replace(lower(i.indexdef), ' ', '') like '%onpublic.ordersusingbtree(user_id,client_request_id)%'
    as has_expected_columns,
  replace(lower(i.indexdef), ' ', '') like '%client_request_idisnotnull%'
    and replace(lower(i.indexdef), ' ', '') like '%btrim(client_request_id)<>''%'
    as has_expected_nonblank_predicate
from pg_indexes as i
where i.schemaname = 'public'
  and i.indexname = 'orders_user_client_request_uidx';

select
  o.user_id,
  o.client_request_id,
  count(*)::bigint as duplicate_count
from public.orders as o
where o.client_request_id is not null
  and btrim(o.client_request_id) <> ''
group by o.user_id, o.client_request_id
having count(*) > 1;

select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config,
  md5(pg_get_functiondef(p.oid)) as function_hash
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_order_with_item'
  and p.oid in (
    to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb)'),
    to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)')
  )
order by p.pronargs;

select
  r.routine_name,
  r.specific_name,
  r.grantee,
  r.privilege_type
from information_schema.routine_privileges as r
where r.specific_schema = 'public'
  and r.routine_name = 'create_order_with_item'
order by r.specific_name, r.grantee;

with overloads as (
  select
    p.oid,
    p.oid::regprocedure::text as signature,
    lower(pg_get_functiondef(p.oid)) as definition,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ', '), '') as function_config
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_order_with_item'
)
select
  to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb)') is not null
    as legacy_7_argument_overload_exists,
  to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') is not null
    as current_10_argument_overload_exists,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and prosecdef
          and function_config ilike '%search_path=public%') as current_overload_is_hardened,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and definition like '%p_sku_id%'
          and definition like '%update public.product_skus%') as current_overload_has_sku_branch,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and definition like '%p_client_request_id%'
          and definition like '%pg_advisory_xact_lock%') as current_overload_has_idempotency_lock,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and definition like '%status = ''reserved''%'
          and definition like '%reserved_order_item_id%') as current_overload_reserves_digital_inventory,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and definition not like '%reserved_user_id%') as current_overload_does_not_require_reserved_user_id,
  bool_or(signature = 'create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'
          and definition not like '%complete_order_payment(%'
          and definition not like '%deliver_digital_order(%') as current_overload_does_not_complete_or_deliver
from overloads;

select
  has_function_privilege('anon', 'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE')
    as anon_can_execute,
  has_function_privilege('authenticated', 'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE')
    as authenticated_can_execute,
  has_function_privilege('service_role', 'public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE')
    as service_role_can_execute;
