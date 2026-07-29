-- Forward-fix: account recharge creation is service-role-only.
-- ACL only: no business data, RLS policy, service_role, default privilege,
-- business RPC, or automatic-settlement changes.

begin;

set local search_path = pg_catalog, public;

do $account_recharge_service_write_hardening$
declare
  v_table_oid oid := to_regclass('public.account_recharges');
  v_all_columns text;
begin
  if v_table_oid is null then
    raise notice 'ACCOUNT_RECHARGE_SERVICE_WRITE_HARDENING_SKIP table=account_recharges';
    return;
  end if;

  execute
    'revoke insert on table public.account_recharges from public, anon, authenticated';

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
  into v_all_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table_oid
    and a.attnum > 0
    and not a.attisdropped;

  if v_all_columns is not null then
    execute format(
      'revoke insert (%s) on table public.account_recharges from public, anon, authenticated',
      v_all_columns
    );
  end if;
end
$account_recharge_service_write_hardening$;

commit;
