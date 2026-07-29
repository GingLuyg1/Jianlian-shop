-- Phase 1 client table privilege hardening.
-- ACL only: no business data mutation, RLS policy change, default ACL change,
-- service_role grant change, or automatic-settlement configuration.

begin;

set local search_path = pg_catalog, public;

do $client_privilege_hardening$
declare
  v_target record;
  v_table_oid oid;
  v_all_columns text;
  v_safe_profile_columns text;
  v_server_version_num integer := current_setting('server_version_num')::integer;
begin
  for v_target in
    select *
    from (
      values
        ('account_recharges'::text, true,  false, false),
        ('admin_audit_logs'::text, false, false, false),
        ('balance_transactions'::text, false, false, false),
        ('order_payments'::text, false, false, false),
        ('order_status_logs'::text, false, false, false),
        ('orders'::text, false, true,  false),
        ('payment_sessions'::text, false, false, false),
        ('profiles'::text, true,  false, false),
        ('site_setting_logs'::text, true,  false, false),
        ('site_settings'::text, true,  true,  false)
    ) as expected(
      table_name,
      authenticated_insert,
      authenticated_update,
      authenticated_delete
    )
  loop
    v_table_oid := to_regclass(format('public.%I', v_target.table_name));
    if v_table_oid is null then
      raise notice 'CLIENT_PRIVILEGE_HARDENING_OPTIONAL_SKIP table=%', v_target.table_name;
      continue;
    end if;

    execute format(
      'revoke truncate, references, trigger on table public.%I from public, anon, authenticated',
      v_target.table_name
    );

    if v_server_version_num >= 170000 then
      execute format(
        'revoke maintain on table public.%I from public, anon, authenticated',
        v_target.table_name
      );
    end if;

    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_all_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped;

    if v_all_columns is not null then
      execute format(
        'revoke references (%s) on table public.%I from public, anon, authenticated',
        v_all_columns,
        v_target.table_name
      );
      execute format(
        'revoke insert (%s) on table public.%I from anon',
        v_all_columns,
        v_target.table_name
      );
      execute format(
        'revoke update (%s) on table public.%I from anon',
        v_all_columns,
        v_target.table_name
      );
      execute format(
        'revoke insert (%s) on table public.%I from authenticated',
        v_all_columns,
        v_target.table_name
      );
      execute format(
        'revoke update (%s) on table public.%I from authenticated',
        v_all_columns,
        v_target.table_name
      );
    end if;

    execute format(
      'revoke insert, update, delete on table public.%I from anon',
      v_target.table_name
    );
    execute format(
      'revoke insert, update, delete on table public.%I from authenticated',
      v_target.table_name
    );

    if v_target.authenticated_insert then
      execute format(
        'grant insert on table public.%I to authenticated',
        v_target.table_name
      );
    end if;
    if v_target.authenticated_update then
      execute format(
        'grant update on table public.%I to authenticated',
        v_target.table_name
      );
    end if;
    if v_target.authenticated_delete then
      execute format(
        'grant delete on table public.%I to authenticated',
        v_target.table_name
      );
    end if;
  end loop;

  v_table_oid := to_regclass('public.profiles');
  if v_table_oid is not null then
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_safe_profile_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = any (
        array[
          'display_name',
          'phone',
          'recipient_name',
          'shipping_address',
          'avatar_url'
        ]::text[]
      );

    if v_safe_profile_columns is not null then
      execute format(
        'grant update (%s) on table public.profiles to authenticated',
        v_safe_profile_columns
      );
    end if;
  end if;
end
$client_privilege_hardening$;

commit;
