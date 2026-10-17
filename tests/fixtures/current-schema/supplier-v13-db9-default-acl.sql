-- LOCAL SYNTHETIC DEFAULT-ACL REPRODUCTION ONLY. No Production connection.
-- Mirrors DB8 postgres/public default table + function grants, not all of Supabase.
-- DB8 did not capture pg_auth_members; actual Production membership remains DB10 work.
do $local_guard$
begin
  if current_database() !~ '^jianlian_bitrefill_v13_db5_[0-9a-f]{8}$'
     or inet_server_addr() is distinct from '127.0.0.1'::inet
     or replace(current_setting('data_directory'), '\', '/') <>
        replace(current_setting('v13.expected_data_directory'), '\', '/') then
    raise exception 'DB9_DISPOSABLE_DEFAULT_ACL_ONLY';
  end if;
end
$local_guard$;

-- Standard function PUBLIC EXECUTE is deliberately retained before migration.
alter default privileges in schema public grant all on tables
  to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions
  to anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
