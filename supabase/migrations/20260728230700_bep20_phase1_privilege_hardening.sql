-- BEP20 phase 1 table and completion-function privilege hardening.
--
-- Security purpose:
-- - keep authenticated users read-only on their own chain payment data through RLS;
-- - remove every direct write/DDL-style table privilege from client roles;
-- - remove historical client column ACLs that table-level REVOKE does not clear;
-- - keep the legacy completion-acquisition RPC callable only by service_role;
-- - leave table structures, RLS policies, payment state, orders, balances, and chain data unchanged.

begin;

do $precheck$
begin
  if pg_catalog.to_regclass('public.chain_payment_sessions') is null then
    raise exception 'BEP20_PRIVILEGE_HARDENING_TABLE_MISSING: public.chain_payment_sessions';
  end if;

  if pg_catalog.to_regclass('public.chain_transactions') is null then
    raise exception 'BEP20_PRIVILEGE_HARDENING_TABLE_MISSING: public.chain_transactions';
  end if;

  if pg_catalog.to_regprocedure(
    'public.begin_bep20_payment_completion(uuid,boolean)'
  ) is null then
    raise exception 'BEP20_PRIVILEGE_HARDENING_FUNCTION_MISSING: public.begin_bep20_payment_completion(uuid,boolean)';
  end if;

  if pg_catalog.to_regrole('anon') is null
     or pg_catalog.to_regrole('authenticated') is null
     or pg_catalog.to_regrole('service_role') is null then
    raise exception 'BEP20_PRIVILEGE_HARDENING_REQUIRED_ROLE_MISSING';
  end if;
end
$precheck$;

revoke all privileges
on table
  public.chain_payment_sessions,
  public.chain_transactions
from public, anon, authenticated;

do $column_acl_cleanup$
declare
  v_table_name text;
  v_column_list text;
begin
  foreach v_table_name in array array[
    'chain_payment_sessions',
    'chain_transactions'
  ]
  loop
    select pg_catalog.string_agg(
      pg_catalog.format('%I', a.attname),
      ', ' order by a.attnum
    )
      into v_column_list
    from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.format('public.%I', v_table_name)::regclass
      and a.attnum > 0
      and not a.attisdropped;

    if v_column_list is null then
      raise exception 'BEP20_PRIVILEGE_HARDENING_COLUMNS_MISSING: public.%', v_table_name;
    end if;

    execute pg_catalog.format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from public, anon, authenticated',
      v_column_list,
      v_table_name
    );
  end loop;
end
$column_acl_cleanup$;

grant select
on table
  public.chain_payment_sessions,
  public.chain_transactions
to authenticated;

grant all privileges
on table
  public.chain_payment_sessions,
  public.chain_transactions
to service_role;

revoke execute
on function public.begin_bep20_payment_completion(uuid, boolean)
from public, anon, authenticated;

grant execute
on function public.begin_bep20_payment_completion(uuid, boolean)
to service_role;

do $postcheck$
declare
  v_unexpected_public_or_anon integer;
  v_unexpected_authenticated_nonselect integer;
  v_missing_authenticated_select integer;
  v_missing_service_role integer;
  v_unexpected_column_acl integer;
  v_rls_disabled integer;
  v_function_oid oid;
  v_function_owner text;
  v_function_security_definer boolean;
  v_function_config text[];
  v_public_execute boolean;
begin
  select count(*)
    into v_rls_disabled
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('chain_payment_sessions', 'chain_transactions')
    and not c.relrowsecurity;

  if v_rls_disabled <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_RLS_DISABLED:%', v_rls_disabled;
  end if;

  with target_tables as (
    select c.relname, c.relowner, c.relacl
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('chain_payment_sessions', 'chain_transactions')
  ),
  privileges(privilege_type) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  ),
  findings as (
    select 1
    from target_tables t
    cross join privileges p
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
    cross join privileges p
    where pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', t.relname),
      p.privilege_type
    )
  )
  select count(*)
    into v_unexpected_public_or_anon
  from findings;

  if v_unexpected_public_or_anon <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_PUBLIC_OR_ANON_TABLE_PRIVILEGES:%',
      v_unexpected_public_or_anon;
  end if;

  with target_tables(relname) as (
    values
      ('chain_payment_sessions'::text),
      ('chain_transactions'::text)
  ),
  nonselect_privileges(privilege_type) as (
    values
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  )
  select count(*)
    into v_unexpected_authenticated_nonselect
  from target_tables t
  cross join nonselect_privileges p
  where pg_catalog.has_table_privilege(
    'authenticated',
    pg_catalog.format('public.%I', t.relname),
    p.privilege_type
  );

  if v_unexpected_authenticated_nonselect <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_AUTHENTICATED_NONSEL_PRIVILEGES:%',
      v_unexpected_authenticated_nonselect;
  end if;

  with target_tables(relname) as (
    values
      ('chain_payment_sessions'::text),
      ('chain_transactions'::text)
  )
  select count(*)
    into v_missing_authenticated_select
  from target_tables t
  where not pg_catalog.has_table_privilege(
    'authenticated',
    pg_catalog.format('public.%I', t.relname),
    'SELECT'
  );

  if v_missing_authenticated_select <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_AUTHENTICATED_SELECT_MISSING:%',
      v_missing_authenticated_select;
  end if;

  with target_tables(relname) as (
    values
      ('chain_payment_sessions'::text),
      ('chain_transactions'::text)
  ),
  privileges(privilege_type) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  )
  select count(*)
    into v_missing_service_role
  from target_tables t
  cross join privileges p
  where not pg_catalog.has_table_privilege(
    'service_role',
    pg_catalog.format('public.%I', t.relname),
    p.privilege_type
  );

  if v_missing_service_role <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_SERVICE_ROLE_TABLE_PRIVILEGES_MISSING:%',
      v_missing_service_role;
  end if;

  select count(*)
    into v_unexpected_column_acl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a
    on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  where n.nspname = 'public'
    and c.relname in ('chain_payment_sessions', 'chain_transactions')
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and pg_catalog.cardinality(a.attacl) > 0
    and (
      acl.grantee = 0
      or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
    );

  if v_unexpected_column_acl <> 0 then
    raise exception 'BEP20_PRIVILEGE_HARDENING_CLIENT_COLUMN_ACLS:%',
      v_unexpected_column_acl;
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.begin_bep20_payment_completion(uuid,boolean)'
  );

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig
  into
    v_function_owner,
    v_function_security_definer,
    v_function_config
  from pg_catalog.pg_proc p
  where p.oid = v_function_oid;

  if v_function_owner <> 'postgres'
     or v_function_security_definer is not true
     or not (
       coalesce(v_function_config, array[]::text[])
       @> array['search_path=public']::text[]
     ) then
    raise exception 'BEP20_PRIVILEGE_HARDENING_FUNCTION_DEFINITION_CONTRACT_FAILED';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        p.proacl,
        pg_catalog.acldefault('f', p.proowner)
      )
    ) acl
    where p.oid = v_function_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_execute;

  if v_public_execute
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'BEP20_PRIVILEGE_HARDENING_FUNCTION_GRANTS_FAILED';
  end if;
end
$postcheck$;

commit;
