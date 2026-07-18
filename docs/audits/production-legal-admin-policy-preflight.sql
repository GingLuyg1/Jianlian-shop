-- Jianlian Shop 正式库协议管理员 policy 执行前只读核验
--
-- 必须先在 Supabase Dashboard 人工确认：
--   Project name: Jianlian-shop
--   Project ref:  qvbovrvybirscaurwuov
--
-- 人工说明：
--   1. 本文件不是 Migration，只包含 8 个只读查询块。
--   2. 建议优先使用 docs/audits/legal-admin-policy-preflight/ 下的拆分文件逐个执行和导出。
--   3. 不要点击 Run all，不要临时修改查询，不要调用任何业务 RPC。
--   4. 查询 07 只输出计数和脱敏 UUID 摘要，不输出邮箱或完整用户标识。
--   5. 将全部结果交回 Codex 分析后，才判断是否创建 policy-only 最小 Migration。


-- 查询 01：两个 public.is_admin 重载的精确签名与安全属性。
with expected(expected_signature, procedure_name) as (
  values
    ('public.is_admin()', 'public.is_admin()'),
    ('public.is_admin(uuid)', 'public.is_admin(uuid)')
), resolved as (
  select
    e.expected_signature,
    pg_catalog.to_regprocedure(e.procedure_name) as function_oid
  from expected e
)
select
  '01-is-admin-signatures'::text as query_id,
  r.expected_signature,
  (p.oid is not null) as function_exists,
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  l.lanname as language,
  p.prosecdef as security_definer,
  (
    select setting
    from unnest(p.proconfig) as setting
    where setting like 'search_path=%'
    limit 1
  ) as search_path_setting,
  p.proconfig,
  case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' when 'v' then 'VOLATILE' end as volatility,
  case p.proparallel when 's' then 'SAFE' when 'r' then 'RESTRICTED' when 'u' then 'UNSAFE' end as parallel_safety
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
left join pg_catalog.pg_namespace n on n.oid = p.pronamespace
left join pg_catalog.pg_language l on l.oid = p.prolang
order by r.expected_signature;


-- 查询 02：两个 public.is_admin 重载的完整定义。
with expected(expected_signature, procedure_name) as (
  values
    ('public.is_admin()', 'public.is_admin()'),
    ('public.is_admin(uuid)', 'public.is_admin(uuid)')
), resolved as (
  select
    e.expected_signature,
    pg_catalog.to_regprocedure(e.procedure_name) as function_oid
  from expected e
)
select
  '02-is-admin-definitions'::text as query_id,
  r.expected_signature,
  (p.oid is not null) as function_exists,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
left join pg_catalog.pg_namespace n on n.oid = p.pronamespace
order by r.expected_signature;


-- 查询 03：PUBLIC、anon、authenticated、service_role 的有效 EXECUTE 权限。
with expected_functions(expected_signature, procedure_name) as (
  values
    ('public.is_admin()', 'public.is_admin()'),
    ('public.is_admin(uuid)', 'public.is_admin(uuid)')
), resolved as (
  select
    e.expected_signature,
    pg_catalog.to_regprocedure(e.procedure_name) as function_oid
  from expected_functions e
), audited_roles(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
)
select
  '03-is-admin-permissions'::text as query_id,
  f.expected_signature,
  (p.oid is not null) as function_exists,
  r.role_name,
  case
    when p.oid is null then false
    when r.role_name = 'PUBLIC' then exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    else pg_catalog.has_function_privilege(r.role_name, p.oid, 'EXECUTE')
  end as has_execute
from resolved f
cross join audited_roles r
left join pg_catalog.pg_proc p on p.oid = f.function_oid
order by f.expected_signature, r.role_name;


-- 查询 04：public.admin_users 全部字段、类型、默认值与可空性。
with rows as (
  select
    c.table_schema,
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.udt_schema,
    c.udt_name,
    c.is_nullable,
    c.column_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'admin_users'
)
select
  '04-admin-users-columns'::text as query_id,
  'FOUND'::text as result_state,
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
from rows
union all
select
  '04-admin-users-columns'::text,
  'NO_ROWS'::text,
  null::text,
  null::text,
  null::integer,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text
where not exists (select 1 from rows)
order by ordinal_position nulls last;


-- 查询 05：public.admin_users 主键、唯一约束、外键、CHECK 与索引。
with constraint_rows as (
  select
    'CONSTRAINT'::text as object_kind,
    con.conname::text as object_name,
    case con.contype
      when 'p' then 'PRIMARY KEY'
      when 'u' then 'UNIQUE'
      when 'f' then 'FOREIGN KEY'
      when 'c' then 'CHECK'
      when 'x' then 'EXCLUSION'
      else con.contype::text
    end as object_type,
    pg_catalog.pg_get_constraintdef(con.oid, true) as object_definition,
    null::boolean as is_primary,
    (con.contype in ('p', 'u')) as is_unique,
    con.convalidated as is_valid,
    null::text as predicate
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'admin_users'
), index_rows as (
  select
    'INDEX'::text as object_kind,
    idx.relname::text as object_name,
    'INDEX'::text as object_type,
    pg_catalog.pg_get_indexdef(i.indexrelid) as object_definition,
    i.indisprimary as is_primary,
    i.indisunique as is_unique,
    i.indisvalid as is_valid,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate
  from pg_catalog.pg_index i
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  where n.nspname = 'public'
    and tbl.relname = 'admin_users'
), rows as (
  select * from constraint_rows
  union all
  select * from index_rows
)
select
  '05-admin-users-constraints-indexes'::text as query_id,
  'FOUND'::text as result_state,
  object_kind,
  object_name,
  object_type,
  object_definition,
  is_primary,
  is_unique,
  is_valid,
  predicate
from rows
union all
select
  '05-admin-users-constraints-indexes'::text,
  'NO_ROWS'::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::boolean,
  null::boolean,
  null::text
where not exists (select 1 from rows)
order by object_kind nulls last, object_name nulls last;


-- 查询 06：public.admin_users RLS 状态与全部 policy。
with table_status as (
  select
    'RLS_STATUS'::text as row_kind,
    'public'::text as schema_name,
    'admin_users'::text as table_name,
    null::text as policy_name,
    null::text as permissive,
    null::text as roles,
    null::text as command,
    null::text as using_expression,
    null::text as with_check_expression,
    (c.oid is not null) as table_exists,
    pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from (values ('public', 'admin_users')) expected(schema_name, table_name)
  left join pg_catalog.pg_namespace n on n.nspname = expected.schema_name
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = expected.table_name
), policy_rows as (
  select
    'POLICY'::text as row_kind,
    p.schemaname::text as schema_name,
    p.tablename::text as table_name,
    p.policyname::text as policy_name,
    p.permissive::text,
    p.roles::text,
    p.cmd::text as command,
    p.qual::text as using_expression,
    p.with_check::text as with_check_expression,
    true as table_exists,
    null::text as owner,
    null::boolean as rls_enabled,
    null::boolean as rls_forced
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'admin_users'
)
select
  '06-admin-users-rls-policies'::text as query_id,
  row_kind,
  schema_name,
  table_name,
  policy_name,
  permissive,
  roles,
  command,
  using_expression,
  with_check_expression,
  table_exists,
  owner,
  rls_enabled,
  rls_forced
from table_status
union all
select
  '06-admin-users-rls-policies'::text,
  row_kind,
  schema_name,
  table_name,
  policy_name,
  permissive,
  roles,
  command,
  using_expression,
  with_check_expression,
  table_exists,
  owner,
  rls_enabled,
  rls_forced
from policy_rows
order by row_kind, policy_name nulls first;


-- 查询 07：管理员授权数量与脱敏 UUID 摘要，不输出邮箱或完整用户标识。
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


-- 查询 08：public.legal_documents 当前全部 policy 定义。
with rows as (
  select
    p.schemaname,
    p.tablename,
    p.policyname,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,
    p.with_check
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'legal_documents'
)
select
  '08-legal-current-admin-policies'::text as query_id,
  'FOUND'::text as result_state,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from rows
union all
select
  '08-legal-current-admin-policies'::text,
  'NO_ROWS'::text,
  null::name,
  null::name,
  null::name,
  null::text,
  null::name[],
  null::text,
  null::text,
  null::text
where not exists (select 1 from rows)
order by policyname nulls last;
