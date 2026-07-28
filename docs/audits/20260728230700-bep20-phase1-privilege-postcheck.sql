-- Read-only BEP20 phase 1 privilege postcheck.
-- Returns one summary row and never changes tables, functions, orders, balances,
-- payment state, or chain transaction data.

with target_tables as (
  select
    c.oid,
    c.relname,
    c.relowner,
    c.relacl,
    c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'chain_payment_sessions',
      'chain_transactions'
    )
),
table_privileges(privilege_type) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text)
),
unexpected_public_or_anon as (
  select 1
  from target_tables t
  cross join table_privileges p
  where exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        t.relacl,
        pg_catalog.acldefault('r', t.relowner)
      )
    ) acl
    where acl.grantee = 0
      and acl.privilege_type = p.privilege_type
  )

  union all

  select 1
  from target_tables t
  cross join table_privileges p
  where pg_catalog.has_table_privilege(
    'anon',
    pg_catalog.format('public.%I', t.relname),
    p.privilege_type
  )
),
unexpected_authenticated_nonselect as (
  select 1
  from target_tables t
  cross join (
    values
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  ) p(privilege_type)
  where pg_catalog.has_table_privilege(
    'authenticated',
    pg_catalog.format('public.%I', t.relname),
    p.privilege_type
  )
),
missing_authenticated_select as (
  select 1
  from target_tables t
  where not pg_catalog.has_table_privilege(
    'authenticated',
    pg_catalog.format('public.%I', t.relname),
    'SELECT'
  )
),
missing_service_role_table_privileges as (
  select 1
  from target_tables t
  cross join table_privileges p
  where not pg_catalog.has_table_privilege(
    'service_role',
    pg_catalog.format('public.%I', t.relname),
    p.privilege_type
  )
),
unexpected_client_column_acls as (
  select 1
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a
    on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  where n.nspname = 'public'
    and c.relname in (
      'chain_payment_sessions',
      'chain_transactions'
    )
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and pg_catalog.cardinality(a.attacl) > 0
    and (
      acl.grantee = 0
      or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
    )
),
target_function as (
  select
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,
    p.proconfig,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          p.proacl,
          pg_catalog.acldefault('f', p.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_can_execute
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_bep20_payment_completion(uuid,boolean)'
  )
)
select
  (select count(*) from target_tables)
    as target_table_count,

  (select count(*) from target_tables where not relrowsecurity)
    as rls_disabled_table_count,

  (select count(*) from unexpected_public_or_anon)
    as unexpected_public_or_anon_table_privilege_count,

  (select count(*) from unexpected_authenticated_nonselect)
    as unexpected_authenticated_nonselect_count,

  (select count(*) from missing_authenticated_select)
    as missing_authenticated_select_count,

  (select count(*) from missing_service_role_table_privileges)
    as missing_service_role_table_privilege_count,

  (select count(*) from unexpected_client_column_acls)
    as unexpected_client_column_acl_count,

  (select count(*) from target_function)
    as target_function_count,

  (select count(*) from target_function where owner_name <> 'postgres')
    as unexpected_function_owner_count,

  (select count(*) from target_function where not security_definer)
    as not_security_definer_count,

  (
    select count(*)
    from target_function
    where not (
      coalesce(proconfig, array[]::text[])
      @> array['search_path=public']::text[]
    )
  ) as unexpected_search_path_count,

  coalesce(
    (select public_can_execute from target_function),
    false
  ) as public_can_execute,

  coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure(
        'public.begin_bep20_payment_completion(uuid,boolean)'
      ),
      'EXECUTE'
    ),
    false
  ) as anon_can_execute,

  coalesce(
    pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure(
        'public.begin_bep20_payment_completion(uuid,boolean)'
      ),
      'EXECUTE'
    ),
    false
  ) as authenticated_can_execute,

  coalesce(
    pg_catalog.has_function_privilege(
      'service_role',
      pg_catalog.to_regprocedure(
        'public.begin_bep20_payment_completion(uuid,boolean)'
      ),
      'EXECUTE'
    ),
    false
  ) as service_role_can_execute;
