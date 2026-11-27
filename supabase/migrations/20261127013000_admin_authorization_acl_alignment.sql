begin;

set local lock_timeout = '2s';
set local statement_timeout = '15s';

do $$
begin
  if not exists (
    select 1 from public.admin_users where admin_level = 'super_admin' and status = 'active'
  ) then
    raise exception 'ADMIN_AUTHORIZATION_CUTOVER_NO_ACTIVE_SUPER_ADMIN';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.role = 'admin'
      and not exists (select 1 from public.admin_users a where a.user_id = p.id)
  ) then
    raise exception 'ADMIN_AUTHORIZATION_CUTOVER_LEGACY_ACCOUNTS_REMAIN';
  end if;
end;
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = $1 and au.status = 'active'
      and au.admin_level in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.is_admin(uuid) from public, anon;

revoke execute on function
  public.admin_disable_digital_inventory(uuid, text),
  public.admin_import_digital_inventory(uuid, text[], text, text, timestamp with time zone),
  public.admin_list_digital_inventory_items(uuid, text, text, integer, integer),
  public.admin_list_digital_inventory_summary(text, text, integer, integer),
  public.admin_mark_delivery_failed(uuid, text),
  public.admin_review_order_payment(uuid, text, text),
  public.admin_update_order_status(uuid, text, text, text),
  public.admin_user_controls_assert_admin()
from public, anon;

commit;
