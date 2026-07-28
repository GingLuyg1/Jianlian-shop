-- Digital inventory and private delivery-content table privilege hardening.
--
-- Security purpose:
-- - remove direct client-role access to inventory rows and delivery secrets;
-- - keep authenticated read-only access to inventory batch summaries;
-- - leave service_role/postgres privileges, RLS policies, function grants,
--   table structures, indexes, constraints, and data unchanged.
--
-- Explicit column ACLs are cleared separately because REVOKE ALL PRIVILEGES ON
-- TABLE does not remove historical column-level SELECT/INSERT/UPDATE/REFERENCES
-- grants. Dynamic SQL is limited to quoting the real, non-dropped column names
-- of these three fixed tables.

begin;

revoke all privileges
on table public.digital_inventory
from anon, authenticated;

revoke all privileges
on table public.digital_delivery_secrets
from anon, authenticated;

revoke all privileges
on table public.digital_inventory_batches
from anon, authenticated;

do $$
declare
  v_table_name text;
  v_column_list text;
begin
  foreach v_table_name in array array[
    'digital_inventory',
    'digital_delivery_secrets',
    'digital_inventory_batches'
  ]
  loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into v_column_list
    from pg_catalog.pg_attribute a
    where a.attrelid = format('public.%I', v_table_name)::regclass
      and a.attnum > 0
      and not a.attisdropped;

    if v_column_list is null then
      raise exception 'DIGITAL_DELIVERY_PRIVILEGE_HARDENING_COLUMNS_MISSING: public.%', v_table_name;
    end if;

    execute format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from anon, authenticated',
      v_column_list,
      v_table_name
    );
  end loop;
end
$$;

grant select
on table public.digital_inventory_batches
to authenticated;

commit;
