-- Read-only postcheck A for 20260731_digital_delivery_table_privilege_hardening.sql.
-- Expected:
-- - anon: no privileges on all three tables;
-- - authenticated: SELECT only on digital_inventory_batches;
-- - service_role: unchanged from the pre-migration baseline.

select
  r.role_name,
  t.table_name,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'SELECT') as can_select,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'INSERT') as can_insert,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'UPDATE') as can_update,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'DELETE') as can_delete,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'TRUNCATE') as can_truncate,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'REFERENCES') as can_reference,
  has_table_privilege(r.role_name, format('public.%I', t.table_name), 'TRIGGER') as can_trigger
from (
  values
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text)
) as r(role_name)
cross join (
  values
    ('digital_inventory'::text),
    ('digital_delivery_secrets'::text),
    ('digital_inventory_batches'::text)
) as t(table_name)
order by t.table_name, r.role_name;

-- Expected: zero rows. This distinguishes explicit column ACLs from the
-- table-level privileges reported above without reading any table contents.
select
  c.relname as table_name,
  a.attname as column_name,
  pg_catalog.pg_get_userbyid(acl.grantee) as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
join pg_catalog.pg_attribute a
  on a.attrelid = c.oid
cross join lateral pg_catalog.aclexplode(a.attacl) as acl
where n.nspname = 'public'
  and c.relname in (
    'digital_inventory',
    'digital_delivery_secrets',
    'digital_inventory_batches'
  )
  and a.attnum > 0
  and not a.attisdropped
  and a.attacl is not null
  and pg_catalog.cardinality(a.attacl) > 0
  and pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
order by c.relname, a.attnum, grantee, acl.privilege_type;
