-- FUTURE REVIEW ONLY. Never run by this task against Production.
-- Execute within an independently authorized READ ONLY transaction.
-- Exactly one SELECT; metadata/history only. No business row or secret reads.
-- A migration version is NOT proof of the deployed source-file SHA. Pair the
-- history result with the independently verified release artifact/checksum.
with
expected_tables(name, checks, foreign_keys, unique_keys) as (values
  ('supplier_purchase_attempts',8,0,1),
  ('supplier_purchase_attempt_items',7,3,2),
  ('supplier_external_orders',5,3,3),
  ('supplier_webhook_receipts',5,0,1),
  ('supplier_reconciliation_evidence',3,2,0)
),
target_tables as (
  select e.*, c.oid, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
  from expected_tables e left join pg_catalog.pg_namespace n on n.nspname='public'
  left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.name and c.relkind='r'
),
app_roles(name) as (values ('anon'),('authenticated'),('service_role')),
reachable as (
  select a.name caller, r.oid, r.rolname from app_roles a cross join pg_catalog.pg_roles r
  where r.rolname=a.name or pg_catalog.pg_has_role(a.name,r.oid,'USAGE')
     or pg_catalog.pg_has_role(a.name,r.oid,'SET')
),
expected_functions(signature, definer, worker_execute) as (values
  ('public.internal_supplier_purchase_claim(text,text,text,jsonb)',true,true),
  ('public.internal_supplier_purchase_transition(uuid,text,text,text)',true,true),
  ('public.internal_supplier_purchase_record_child(uuid,text)',true,true),
  ('public.internal_supplier_purchase_record_evidence(uuid,uuid,text,text,text,timestamptz)',true,true),
  ('public.internal_supplier_purchase_record_webhook(text,text,text,text)',true,true),
  ('public.internal_supplier_purchase_deliver_child(uuid,text,uuid,text)',true,true),
  ('public.supplier_purchase_guard_attempt_item()',false,false),
  ('public.supplier_purchase_guard_attempt_update()',false,false),
  ('public.supplier_purchase_guard_external_order()',false,false)
),
target_functions as (
  select e.*, p.oid, p.proowner, p.prosecdef, p.proconfig, p.proacl, p.prorettype,
    case when p.oid is not null then pg_catalog.pg_get_functiondef(p.oid) end definition
  from expected_functions e left join pg_catalog.pg_proc p
    on p.oid=pg_catalog.to_regprocedure(e.signature)
),
expected_indexes(name) as (values
  ('supplier_purchase_attempts_pkey'),('supplier_purchase_attempts_logical_key_uidx'),
  ('supplier_purchase_attempts_external_invoice_uidx'),('supplier_purchase_attempts_reconcile_idx'),
  ('supplier_purchase_attempt_items_pkey'),('supplier_purchase_unit_logical_uidx'),
  ('supplier_purchase_attempt_unit_uidx'),('supplier_purchase_attempt_items_attempt_idx'),
  ('supplier_purchase_attempt_items_order_item_idx'),('supplier_external_orders_pkey'),
  ('supplier_external_orders_attempt_item_id_key'),('supplier_external_orders_delivery_id_key'),
  ('supplier_external_orders_provider_id_uidx'),('supplier_external_orders_attempt_status_idx'),
  ('supplier_webhook_receipts_pkey'),('supplier_webhook_receipts_fingerprint_uidx'),
  ('supplier_webhook_receipts_pending_idx'),('supplier_reconciliation_evidence_pkey'),
  ('supplier_reconciliation_evidence_attempt_checked_idx'),
  ('supplier_reconciliation_evidence_order_checked_idx'),
  ('supplier_reconciliation_evidence_child_fingerprint_uidx'),
  ('supplier_reconciliation_evidence_invoice_fingerprint_uidx')
),
expected_triggers(table_name,name,function_signature) as (values
  ('supplier_purchase_attempts','supplier_purchase_attempt_update_guard','public.supplier_purchase_guard_attempt_update()'),
  ('supplier_purchase_attempt_items','supplier_purchase_attempt_item_guard','public.supplier_purchase_guard_attempt_item()'),
  ('supplier_external_orders','supplier_external_order_guard','public.supplier_purchase_guard_external_order()')
),
evidence as (
  select 'session' section,'read_only' name,
    current_setting('transaction_read_only')='on' pass,
    jsonb_build_object('transaction_read_only',current_setting('transaction_read_only'),
      'current_user',current_user,'database',current_database()) detail
  union all
  select 'table',t.name, t.oid is not null and pg_catalog.pg_get_userbyid(t.relowner)='postgres'
    and t.relrowsecurity and not t.relforcerowsecurity
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=t.oid)
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(t.relacl,
      pg_catalog.acldefault('r',t.relowner))) a where a.grantee=0),
    jsonb_build_object('exists',t.oid is not null,'owner',pg_catalog.pg_get_userbyid(t.relowner),
      'rls',t.relrowsecurity,'forced',t.relforcerowsecurity,
      'policy_count',(select count(*) from pg_catalog.pg_policy p where p.polrelid=t.oid))
  from target_tables t
  union all
  select 'table_acl',t.name||':'||a.name, t.oid is not null
    and pg_catalog.has_table_privilege(a.name,t.oid,'SELECT')=(a.name='service_role')
    and not exists(
      select 1 from reachable r cross join
        (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(privilege)
      where r.caller=a.name and pg_catalog.has_table_privilege(r.oid,t.oid,v.privilege))
    and not exists(
      select 1 from reachable r join pg_catalog.pg_attribute c on c.attrelid=t.oid
        and c.attnum>0 and not c.attisdropped
      cross join (values ('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
      where r.caller=a.name and pg_catalog.has_column_privilege(r.oid,t.oid,c.attnum,v.privilege))
    and (a.name='service_role' or not exists(
      select 1 from reachable r join pg_catalog.pg_attribute c on c.attrelid=t.oid
        and c.attnum>0 and not c.attisdropped
      where r.caller=a.name and pg_catalog.has_column_privilege(r.oid,t.oid,c.attnum,'SELECT'))),
    jsonb_build_object('select',pg_catalog.has_table_privilege(a.name,t.oid,'SELECT'),
      'expected_select',a.name='service_role','mutation_rights_expected',false)
  from target_tables t cross join app_roles a
  union all
  select 'role_boundary',a.name, not r.rolsuper and (r.rolbypassrls=(a.name='service_role'))
    and not r.rolcreaterole and not r.rolcreatedb
    and not pg_catalog.has_schema_privilege(a.name,'public','CREATE')
    and not exists(select 1 from reachable x where x.caller=a.name and x.rolname='postgres'),
    jsonb_build_object('superuser',r.rolsuper,'bypassrls',r.rolbypassrls,
      'owner_reachable',exists(select 1 from reachable x where x.caller=a.name and x.rolname='postgres'))
  from app_roles a left join pg_catalog.pg_roles r on r.rolname=a.name
  union all
  select 'function',f.signature, f.oid is not null and pg_catalog.pg_get_userbyid(f.proowner)='postgres'
    and f.prosecdef=f.definer and f.proconfig @> array['search_path=pg_catalog']::text[]
    and f.prorettype=case when f.definer then 'jsonb'::regtype else 'trigger'::regtype end
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(f.proacl,
      pg_catalog.acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
    and not exists(select 1 from reachable r where r.caller in ('anon','authenticated')
      and pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE'))
    and pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE')=f.worker_execute
    and (f.worker_execute or not exists(select 1 from reachable r where r.caller='service_role'
      and pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE'))),
    jsonb_build_object('exists',f.oid is not null,'owner',pg_catalog.pg_get_userbyid(f.proowner),
      'definer',f.prosecdef,'config',f.proconfig,'source_md5',md5(f.definition))
  from target_functions f
  union all
  select 'index',e.name, coalesce(i.indisvalid and i.indisready,false),
    jsonb_build_object('exists',i.indexrelid is not null,'valid',i.indisvalid,'ready',i.indisready,
      'definition',case when i.indexrelid is not null then pg_catalog.pg_get_indexdef(i.indexrelid) end)
  from expected_indexes e left join pg_catalog.pg_namespace n on n.nspname='public'
  left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.name
  left join pg_catalog.pg_index i on i.indexrelid=c.oid and i.indrelid in(select oid from target_tables)
  union all
  select 'constraints',t.name, t.oid is not null
    and (select count(*) from pg_catalog.pg_constraint c where c.conrelid=t.oid and c.contype='p')=1
    and (select count(*) from pg_catalog.pg_constraint c where c.conrelid=t.oid and c.contype='c')=t.checks
    and (select count(*) from pg_catalog.pg_constraint c where c.conrelid=t.oid and c.contype='f')=t.foreign_keys
    and (select count(*) from pg_catalog.pg_constraint c where c.conrelid=t.oid and c.contype='u')=t.unique_keys
    and not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=t.oid and not c.convalidated),
    jsonb_build_object('expected_checks',t.checks,'expected_fks',t.foreign_keys,'expected_unique',t.unique_keys,
      'definitions',(select jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,
        'validated',c.convalidated,'definition',pg_catalog.pg_get_constraintdef(c.oid,true)) order by c.conname)
        from pg_catalog.pg_constraint c where c.conrelid=t.oid))
  from target_tables t
  union all
  select 'trigger',e.name, coalesce(t.tgenabled='O' and
    t.tgfoid=pg_catalog.to_regprocedure(e.function_signature),false),
    jsonb_build_object('enabled',t.tgenabled,'definition',
      case when t.oid is not null then pg_catalog.pg_get_triggerdef(t.oid,true) end)
  from expected_triggers e left join target_tables c on c.name=e.table_name
  left join pg_catalog.pg_trigger t on t.tgrelid=c.oid and t.tgname=e.name and not t.tgisinternal
  union all
  select 'migration_history','20261015063415',count(*)=1,
    jsonb_build_object('version_count',count(*),
      'reviewed_artifact_sha256','90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0',
      'source_sha_proven_by_version',false,
      'requirement','Compare release artifact bytes independently; history version alone is insufficient')
  from supabase_migrations.schema_migrations where version='20261015063415'
)
select section,name,coalesce(pass,false) pass,detail from evidence order by section,name;
