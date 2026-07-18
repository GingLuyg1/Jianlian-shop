-- Query 07: aggregate admin authorization alignment with masked UUID summaries only.
with raw_admin_users as (
  select to_jsonb(au) as row_data
  from public.admin_users au
), normalized as (
  select
    nullif(row_data ->> 'user_id', '') as user_id_text,
    coalesce(nullif(row_data ->> 'admin_level', ''), nullif(row_data ->> 'role', '')) as authorization_role,
    nullif(row_data ->> 'status', '') as authorization_status,
    case
      when lower(coalesce(row_data ->> 'status', '')) = 'active' then true
      when lower(coalesce(row_data ->> 'is_active', '')) in ('true', 't', '1', 'yes') then true
      else false
    end as is_active
  from raw_admin_users
), aligned as (
  select
    n.authorization_role,
    n.authorization_status,
    n.is_active,
    p.role as profile_role,
    case
      when n.user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then left(n.user_id_text, 8) || '…' || right(n.user_id_text, 6)
      else '[missing-or-invalid]'
    end as masked_user_id
  from normalized n
  left join public.profiles p
    on p.id = case
      when n.user_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then n.user_id_text::uuid
      else null::uuid
    end
), metrics as (
  select
    'active_admin_users'::text as metric,
    count(*) filter (where is_active) as metric_count,
    string_agg(masked_user_id, ', ' order by masked_user_id) filter (where is_active) as masked_user_ids
  from aligned
  union all
  select
    'active_super_admins'::text,
    count(*) filter (where is_active and authorization_role = 'super_admin'),
    string_agg(masked_user_id, ', ' order by masked_user_id)
      filter (where is_active and authorization_role = 'super_admin')
  from aligned
  union all
  select
    'active_admin_users_with_profile_admin'::text,
    count(*) filter (
      where is_active
        and authorization_role in ('admin', 'super_admin')
        and profile_role = 'admin'
    ),
    string_agg(masked_user_id, ', ' order by masked_user_id) filter (
      where is_active
        and authorization_role in ('admin', 'super_admin')
        and profile_role = 'admin'
    )
  from aligned
  union all
  select
    'active_admin_users_without_profile_admin'::text,
    count(*) filter (
      where is_active
        and authorization_role in ('admin', 'super_admin')
        and profile_role is distinct from 'admin'
    ),
    string_agg(masked_user_id, ', ' order by masked_user_id) filter (
      where is_active
        and authorization_role in ('admin', 'super_admin')
        and profile_role is distinct from 'admin'
    )
  from aligned
)
select
  '07-admin-authorization-summary'::text as query_id,
  metric,
  metric_count,
  coalesce(masked_user_ids, 'NONE') as masked_user_ids
from metrics
order by metric;
