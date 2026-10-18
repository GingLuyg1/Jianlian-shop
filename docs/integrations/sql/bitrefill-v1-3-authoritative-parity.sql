-- V1.3 canonical contract v1. SELECT-only. No business rows are returned.
-- Production use requires separate DB8 read authorization.
with scope_tables(name,columns) as (values
  ('products',array['id','stock']::text[]),
  ('product_skus',array['id']::text[]),
  ('orders',array['id','order_no','user_id','status','payment_status','fulfillment_status']::text[]),
  ('order_items',array['id','order_id','product_id','sku_id','product_name','unit_price','line_total',
    'quantity','delivery_type','product_snapshot','delivery_status','delivered_quantity',
    'delivery_failure_reason','delivery_started_at','delivery_completed_at',
    'delivery_status_updated_at']::text[]),
  ('order_deliveries',array['id','order_id','order_item_id','user_id','product_id','sku_id',
    'delivery_type','delivery_content','encrypted_content','delivery_no','delivery_status',
    'delivered_at','created_at','updated_at']::text[]),
  ('supplier_fulfillment_requests',array['id','order_id','order_item_id','supplier',
    'supplier_product_id','supplier_sku','request_id','attempt_token','attempt_count',
    'status','retryable','provider_order_code','supplier_unit_price','supplier_total_price',
    'last_error_code','trigger_source','last_attempt_at','completed_at','created_at',
    'updated_at']::text[]),
  ('digital_inventory',array['id','content','status']::text[]),
  ('digital_delivery_secrets',array['delivery_id','content']::text[]),
  ('delivery_logs',array['id','message','detail']::text[])
), scope_constraints(name) as (values
  ('products_pkey'),('product_skus_pkey'),('orders_pkey'),('orders_order_no_key'),
  ('orders_status_check'),('orders_payment_status_check'),('orders_fulfillment_status_check'),
  ('order_items_pkey'),('order_items_order_id_fkey'),('order_items_sku_id_fkey'),
  ('order_items_delivery_status_check'),
  ('order_deliveries_pkey'),('order_deliveries_order_id_fkey'),
  ('order_deliveries_order_item_id_fkey'),('order_deliveries_sku_id_fkey'),
  ('order_deliveries_status_check'),
  ('digital_inventory_pkey'),('digital_delivery_secrets_pkey'),
  ('digital_delivery_secrets_delivery_id_fkey'),('delivery_logs_pkey')
), scope_indexes(name) as (values
  ('order_deliveries_supplier_item_delivered_uidx'),
  ('supplier_fulfillment_requests_order_item_id_key'),
  ('supplier_fulfillment_requests_request_id_key')
), scope_policies(name) as (values
  ('users can read own orders'),('users can read own order items'),
  ('admins can manage order items'),('admins can manage deliveries'),
  ('users can read own deliveries'),('deny direct delivery secret reads'),
  ('deny direct delivery secret writes'),('deny direct inventory reads'),
  ('deny direct inventory inserts'),('deny direct inventory updates'),
  ('deny direct inventory deletes')
), scope_functions(schema_name,name) as (values
  ('public','admin_evaluate_product_sku_activation'),('public','is_admin'),
  ('public','set_updated_at'),('public','record_supplier_fulfillment_outcome'),
  ('public','log_order_item_delivery_status'),('public','write_delivery_log'),
  ('public','refresh_order_fulfillment_status'),('auth','uid'),('auth','role')
), scope_triggers(name) as (values
  ('order_deliveries_set_updated_at'),('supplier_fulfillment_requests_set_updated_at')
), role_scope(label,actual_role) as (values
  ('anon','anon'),('authenticated','authenticated'),('service_role','service_role'),
  ('postgres',case when to_regrole('postgres') is null then current_user else 'postgres' end)
), privilege_scope(name) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')),
column_privilege_scope(name) as (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')),
contract as (
  select 'table'::text object_type,'public'::text schema_name,c.relname::text object_name,
    jsonb_build_object('rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity)::text definition
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join scope_tables s on s.name=c.relname
  where n.nspname='public' and c.relkind in ('r','p')
  union all
  select 'column','public',x.table_name||'.'||x.column_name,
    jsonb_build_object('type',x.data_type,'udt',x.udt_name,
      'nullable',x.is_nullable,'default',x.column_default)::text
  from information_schema.columns x join scope_tables s on s.name=x.table_name
  where x.table_schema='public' and x.column_name=any(s.columns)
  union all
  select 'constraint','public',c.relname||'.'||con.conname,
    jsonb_build_object('type',con.contype,'definition',pg_get_constraintdef(con.oid))::text
  from pg_constraint con join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace join scope_tables s on s.name=c.relname
  where n.nspname='public' and
    (c.relname='supplier_fulfillment_requests' or con.conname in (select name from scope_constraints))
  union all
  select 'index','public',i.indexname,i.indexdef
  from pg_indexes i join scope_indexes s on s.name=i.indexname where i.schemaname='public'
  union all
  select 'policy','public',c.relname||'.'||p.polname,
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select coalesce(jsonb_agg(coalesce(r.rolname,'PUBLIC') order by
        coalesce(r.rolname,'PUBLIC')),'[]'::jsonb)
        from unnest(p.polroles) as x(role_oid) left join pg_roles r on r.oid=x.role_oid),
      'qual',pg_get_expr(p.polqual,p.polrelid),
      'with_check',pg_get_expr(p.polwithcheck,p.polrelid))::text
  from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace join scope_tables s on s.name=c.relname
  join scope_policies sp on sp.name=p.polname where n.nspname='public'
  union all
  select 'function',n.nspname,p.oid::regprocedure::text,
    jsonb_build_object('return',p.prorettype::regtype::text,'language',l.lanname,
      'volatility',p.provolatile,'security_definer',p.prosecdef,
      'search_path',p.proconfig,
      'definition_md5',md5(pg_get_functiondef(p.oid)))::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang
  join scope_functions s on s.name=p.proname and s.schema_name=n.nspname
  union all
  select 'trigger','public',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace join scope_triggers s on s.name=t.tgname
  where n.nspname='public' and not t.tgisinternal
  union all
  select 'table_acl','public',c.relname||'.'||r.label||'.'||v.name,
    has_table_privilege(r.actual_role,c.oid,v.name)::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join scope_tables s on s.name=c.relname cross join role_scope r cross join privilege_scope v
  where n.nspname='public' and c.relkind in ('r','p')
  union all
  select 'column_acl','public',c.relname||'.'||a.attname||'.'||r.label||'.'||v.name,
    has_column_privilege(r.actual_role,c.oid,a.attname,v.name)::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join scope_tables s on s.name=c.relname
  join pg_attribute a on a.attrelid=c.oid and a.attname=any(s.columns)
  cross join role_scope r cross join column_privilege_scope v
  where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
  union all
  select 'function_acl',n.nspname,p.oid::regprocedure::text||'.'||r.label||'.EXECUTE',
    has_function_privilege(r.actual_role,p.oid,'EXECUTE')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join scope_functions s on s.name=p.proname and s.schema_name=n.nspname
  cross join role_scope r
), results as (
  select 'contract'::text section,object_type,schema_name,object_name,definition from contract
  union all select 'session','setting','pg_catalog','transaction_read_only',
    current_setting('transaction_read_only')
  union all select 'session','setting','pg_catalog','default_transaction_read_only',
    current_setting('default_transaction_read_only')
  union all select 'migration_history','version','supabase_migrations','20261015063415',
    (select count(*)::text from supabase_migrations.schema_migrations
      where version='20261015063415' or name='supplier_purchase_persistence_v1_3')
  union all select 'authoritative_extra_policy','policy','public',c.relname||'.'||p.polname,
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select coalesce(jsonb_agg(coalesce(r.rolname,'PUBLIC') order by
        coalesce(r.rolname,'PUBLIC')),'[]'::jsonb)
        from unnest(p.polroles) as x(role_oid) left join pg_roles r on r.oid=x.role_oid),
      'qual',pg_get_expr(p.polqual,p.polrelid),
      'with_check',pg_get_expr(p.polwithcheck,p.polrelid))::text
    from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace join scope_tables s on s.name=c.relname
    where n.nspname='public' and p.polname not in (select name from scope_policies)
  union all select 'authoritative_dependency_function','function',n.nspname,
    p.oid::regprocedure::text,
    jsonb_build_object('return',p.prorettype::regtype::text,
      'security_definer',p.prosecdef,'volatility',p.provolatile,
      'search_path',p.proconfig,'owner',r.rolname,
      'definition_md5',md5(pg_get_functiondef(p.oid)),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE'))::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    left join pg_roles r on r.oid=p.proowner
    join scope_functions s on s.name=p.proname and s.schema_name=n.nspname
  union all select 'authoritative_owner','table','public',c.relname,r.rolname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join scope_tables s on s.name=c.relname
    join pg_roles r on r.oid=c.relowner
    where n.nspname='public' and c.relkind in ('r','p')
  union all select 'authoritative_acl_explicit','table','public',
    c.relname||'.'||coalesce(grantee.rolname,'PUBLIC')||'.'||x.privilege_type,
    jsonb_build_object('grantor',grantor.rolname,'grantable',x.is_grantable)::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join scope_tables s on s.name=c.relname
    cross join lateral aclexplode(c.relacl) x
    left join pg_roles grantor on grantor.oid=x.grantor
    left join pg_roles grantee on grantee.oid=x.grantee
    where n.nspname='public' and c.relkind in ('r','p')
  union all select 'authoritative_acl_explicit','column','public',
    c.relname||'.'||a.attname||'.'||coalesce(grantee.rolname,'PUBLIC')||'.'||x.privilege_type,
    jsonb_build_object('grantor',grantor.rolname,'grantable',x.is_grantable)::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join scope_tables s on s.name=c.relname
    join pg_attribute a on a.attrelid=c.oid and a.attname=any(s.columns)
    cross join lateral aclexplode(a.attacl) x
    left join pg_roles grantor on grantor.oid=x.grantor
    left join pg_roles grantee on grantee.oid=x.grantee
    where n.nspname='public' and a.attnum>0 and not a.attisdropped
  union all select 'authoritative_acl_explicit','function',n.nspname,
    p.oid::regprocedure::text||'.'||coalesce(grantee.rolname,'PUBLIC')||'.'||x.privilege_type,
    jsonb_build_object('grantor',grantor.rolname,'grantable',x.is_grantable)::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join scope_functions s on s.name=p.proname and s.schema_name=n.nspname
    cross join lateral aclexplode(p.proacl) x
    left join pg_roles grantor on grantor.oid=x.grantor
    left join pg_roles grantee on grantee.oid=x.grantee
  union all select 'target_conflict','object','public',c.relname,
    jsonb_build_object('kind',c.relkind,'owner',r.rolname)::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_roles r on r.oid=c.relowner
    where n.nspname='public' and (c.relname like 'supplier_purchase_%'
      or c.relname like 'supplier_external_orders%'
      or c.relname like 'supplier_webhook_receipts%'
      or c.relname like 'supplier_reconciliation_evidence%')
  union all select 'target_conflict','function','public',p.oid::regprocedure::text,
    jsonb_build_object('return',p.prorettype::regtype::text,
      'security_definer',p.prosecdef,'search_path',p.proconfig,
      'owner',r.rolname,'definition_md5',md5(pg_get_functiondef(p.oid)))::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    left join pg_roles r on r.oid=p.proowner
    where n.nspname='public' and (p.proname like 'internal_supplier_purchase_%'
      or p.proname like 'supplier_purchase_guard_%'
      or p.proname='supplier_external_order_guard')
  union all select 'target_conflict','constraint','public',con.conname,
    jsonb_build_object('type',con.contype,'definition',pg_get_constraintdef(con.oid))::text
    from pg_constraint con join pg_namespace n on n.oid=con.connamespace
    where n.nspname='public' and (con.conname like 'supplier_purchase_%'
      or con.conname like 'supplier_external_orders%'
      or con.conname like 'supplier_webhook_receipts%'
      or con.conname like 'supplier_reconciliation_evidence%')
  union all select 'target_conflict','trigger','public',t.tgname,
    pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal
      and t.tgname in ('supplier_purchase_attempt_item_guard',
        'supplier_purchase_attempt_update_guard','supplier_external_order_guard')
  union all select 'dirty','count','public','logical_purchase',
    ((select count(*) from (select order_item_id from public.supplier_fulfillment_requests
      group by order_item_id having count(*)>1) d)
    +(select count(*) from (select supplier,request_id from public.supplier_fulfillment_requests
      group by supplier,request_id having count(*)>1) d))::text
  union all select 'dirty','count','public','external_invoice',
    (select count(*)::text from (select supplier,provider_order_code
      from public.supplier_fulfillment_requests where provider_order_code is not null
      group by supplier,provider_order_code having count(*)>1) d)
  union all select 'dirty','count','public','orphan_attempt',
    (select count(*)::text from public.supplier_fulfillment_requests r
      left join public.order_items i on i.id=r.order_item_id where i.id is null)
  union all select 'dirty','count','public','invalid_state',
    (select count(*)::text from public.supplier_fulfillment_requests where status not in
      ('PENDING','PURCHASING','FULFILLED','FAILED','UNCERTAIN','RECONCILIATION',
       'NEEDS_INPUT','FAILED_VALIDATION'))
  union all select 'dirty','count','public','missing_binding',
    (select count(*)::text from public.supplier_fulfillment_requests where supplier='bitrefill'
      and (nullif(btrim(coalesce(supplier_product_id,'')),'') is null
        or nullif(btrim(coalesce(supplier_sku,'')),'') is null))
)
select 'v1'::text schema_version,section,object_type,schema_name,object_name,definition
from results order by section,object_type,schema_name,object_name,definition;
