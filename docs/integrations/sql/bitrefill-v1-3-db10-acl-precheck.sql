-- DB10 DRAFT: SELECT-only metadata; NOT executed by DB9.
-- Separate user authorization and target identity confirmation are REQUIRED.
-- Expected candidate SHA256:
-- 90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0
-- Absence before migration is expected, not proof of post-migration denial.
begin transaction read only;

with app_roles as (
  select oid,rolname,rolinherit,rolsuper,rolbypassrls from pg_catalog.pg_roles
  where rolname in ('anon','authenticated','service_role','postgres')
), targets as (
  select name,to_regclass('public.'||name) oid from (values
    ('supplier_purchase_attempts'),('supplier_purchase_attempt_items'),
    ('supplier_external_orders'),('supplier_webhook_receipts'),
    ('supplier_reconciliation_evidence')) t(name)
), metadata as (
  select 'session' kind,'read_only' name,jsonb_build_object(
    'transaction_read_only',current_setting('transaction_read_only'),
    'default_transaction_read_only',current_setting('default_transaction_read_only')) value
  union all select 'role',rolname,jsonb_build_object('inherit',rolinherit,
    'superuser',rolsuper,'bypassrls',rolbypassrls) from app_roles
  union all select 'role_path',a.rolname||'->'||r.rolname,jsonb_build_object(
    'usage',pg_catalog.pg_has_role(a.oid,r.oid,'USAGE'),
    'set',pg_catalog.pg_has_role(a.oid,r.oid,'SET'))
    from app_roles a cross join pg_catalog.pg_roles r
    where a.oid<>r.oid and (pg_catalog.pg_has_role(a.oid,r.oid,'USAGE')
      or pg_catalog.pg_has_role(a.oid,r.oid,'SET'))
  union all select 'membership',member.rolname||'->'||parent.rolname,
    jsonb_build_object('inherit_option',m.inherit_option,'set_option',m.set_option,
      'admin_option',m.admin_option,'grantor',pg_catalog.pg_get_userbyid(m.grantor))
    from pg_catalog.pg_auth_members m join pg_catalog.pg_roles member on member.oid=m.member
    join pg_catalog.pg_roles parent on parent.oid=m.roleid
    where member.oid in (select oid from app_roles)
      or exists (select 1 from app_roles a where pg_catalog.pg_has_role(a.oid,member.oid,'MEMBER'))
  union all select 'schema_acl',r.rolname||':'||n.nspname,jsonb_build_object(
    'usage',pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE'),
    'create',pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE'),
    'owner',pg_catalog.pg_get_userbyid(n.nspowner),'acl',n.nspacl::text)
    from app_roles r cross join pg_catalog.pg_namespace n where n.nspname in ('public','auth')
  union all select 'default_acl',coalesce(n.nspname,'<global>')||':'||d.defaclobjtype::text||':'||
    coalesce(grantee.rolname,'PUBLIC')||':'||x.privilege_type,jsonb_build_object(
      'owner',pg_catalog.pg_get_userbyid(d.defaclrole),'grantable',x.is_grantable)
    from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) x
    left join pg_catalog.pg_roles grantee on grantee.oid=x.grantee
    where d.defaclrole='postgres'::regrole and (d.defaclnamespace=0 or n.nspname='public')
      and d.defaclobjtype in ('r','f')
  union all select 'table',t.name,jsonb_build_object('status',case when t.oid is null
    then 'ABSENT_PREMIGRATION' else 'PRESENT_REQUIRES_HISTORY_AND_CONFLICT_REVIEW' end,
    'owner',pg_catalog.pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'acl',c.relacl::text) from targets t left join pg_catalog.pg_class c on c.oid=t.oid
  union all select 'effective_table_acl',t.name||':'||r.rolname||':'||p.privilege,
    jsonb_build_object('allowed',pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege))
    from targets t cross join app_roles r cross join (values ('SELECT'),('INSERT'),('UPDATE'),
      ('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) where t.oid is not null
  union all select 'effective_column_acl',t.name||'.'||a.attname||':'||r.rolname||':'||p.privilege,
    jsonb_build_object('allowed',pg_catalog.has_column_privilege(r.oid,t.oid,a.attnum,p.privilege))
    from targets t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
    cross join app_roles r cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
  union all select 'function',p.oid::regprocedure::text,jsonb_build_object(
    'owner',pg_catalog.pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,
    'definition',pg_catalog.pg_get_functiondef(p.oid),'acl',p.proacl::text,
    'anon_execute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'))
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'internal_supplier_purchase_%'
      or p.proname like 'supplier_purchase_guard_%')
)
select kind,name,value from metadata order by kind,name;

rollback;
