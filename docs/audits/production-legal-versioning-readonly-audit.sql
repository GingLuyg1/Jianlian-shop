-- Jianlian Shop 正式库协议版本功能只读审计
--
-- 目标项目（必须由人工在 Supabase Dashboard 二次确认）：
--   Project name: Jianlian-shop
--   Project ref:  qvbovrvybirscaurwuov
--
-- 执行说明：
--   1. 仅在上述正式项目的 SQL Editor 中人工执行。
--   2. 建议按编号逐块执行并分别导出结果；不要点击 Run all。
--   3. 不要临时改写查询，也不要补入任何写语句或业务 RPC 调用。
--   4. 查询 10 只返回聚合数量，不返回协议正文、标题、版本、内容摘要或用户信息。
--   5. 如果前置对象不存在，依赖该对象的后续查询可能报 relation does not exist；记录原始错误后停止该块。
--   6. 将导出结果交回 Codex 分析后，再判断原 Migration、部分兼容修复或 RLS/权限修复；本文件不是 Migration。


-- 查询 1：相关表及基线依赖表的存在性与表类型
-- 用途：确认协议版本、订单协议确认、订单证据三张表及 orders/profiles/auth.users 依赖是否存在。
select
  n.nspname as schema_name,
  c.relname as table_name,
  case c.relkind
    when 'r' then 'ordinary table'
    when 'p' then 'partitioned table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    when 'f' then 'foreign table'
    else c.relkind::text
  end as table_type,
  c.oid
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where (
    n.nspname = 'public'
    and c.relname in (
      'legal_documents',
      'order_agreement_acceptances',
      'order_evidence_events',
      'orders',
      'profiles'
    )
  )
  or (
    n.nspname = 'auth'
    and c.relname = 'users'
  )
order by n.nspname, c.relname;


-- 查询 1B：UUID 默认值函数依赖
-- 用途：确认基线 Migration 使用的 gen_random_uuid() 是否可解析；只读取函数和扩展元数据。
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  e.extname as owning_extension
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
left join pg_catalog.pg_depend d
  on d.classid = 'pg_catalog.pg_proc'::regclass
 and d.objid = p.oid
 and d.deptype = 'e'
left join pg_catalog.pg_extension e on e.oid = d.refobjid
where p.proname = 'gen_random_uuid'
  and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
order by n.nspname;


-- 查询 2：相关表全部字段
-- 用途：核对字段类型、底层类型、默认值和可空性；特别检查新旧代码分歧字段
-- is_current、archived_at、archived_by 是否实际存在。
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
  and c.table_name in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
order by c.table_name, c.ordinal_position;


-- 查询 3：主键、唯一约束、外键和 CHECK 约束
-- 用途：核对 document_type/version 唯一性、状态合法值、订单/用户/版本外键及删除规则。
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_definition,
  case con.confupdtype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as update_rule,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as delete_rule,
  con.convalidated as is_validated
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
order by c.relname, constraint_type, con.conname;


-- 查询 4：全部索引及部分索引条件
-- 用途：确认每类协议最多一个 published 版本、类型/状态查询索引及订单证据索引是否存在。
select
  ns.nspname as schema_name,
  tbl.relname as table_name,
  idx.relname as index_name,
  i.indisprimary as is_primary,
  i.indisunique as is_unique,
  i.indisvalid as is_valid,
  pg_catalog.pg_get_indexdef(i.indexrelid) as index_definition,
  pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate
from pg_catalog.pg_index i
join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
join pg_catalog.pg_class idx on idx.oid = i.indexrelid
where ns.nspname = 'public'
  and tbl.relname in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
order by tbl.relname, idx.relname;


-- 查询 5：RLS 开关、强制 RLS 与表 owner
-- 用途：确认三张表是否启用 RLS，以及 owner 身份；这不等同于当前登录管理员一定满足 policy。
select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
order by c.relname;


-- 查询 6：RLS policy 完整定义
-- 用途：核对公开读取、管理员读取/管理和订单证据读取规则，重点观察管理员规则是否仅依赖 profiles.role。
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
order by tablename, policyname;


-- 查询 7：表级权限
-- 用途：区分 relation grant 与 RLS policy；不读取当前用户身份或任何用户资料。
select
  n.nspname as table_schema,
  c.relname as table_name,
  case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
) acl
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'public'
  and c.relname in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
  and (
    acl.grantee = 0
    or grantee.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
  )
order by c.relname, grantee, acl.privilege_type;


-- 查询 8：相关触发器
-- 用途：确认是否存在仓库基线 Migration 未声明的更新时间、归档或发布触发器。
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as trigger_enabled,
  pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'legal_documents',
    'order_agreement_acceptances',
    'order_evidence_events'
  )
  and not t.tgisinternal
order by c.relname, t.tgname;


-- 查询 9A：协议/证据相关函数的签名、属性和 ACL
-- 用途：仓库两份协议 Migration 未声明 RPC；该查询用于发现正式库额外存在的相关函数或重载。
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proparallel as parallel_safety,
  p.proconfig,
  p.proacl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ~* '(legal|agreement|evidence)'
    or exists (
      select 1
      from pg_catalog.pg_depend d
      join pg_catalog.pg_class c on c.oid = d.refobjid
      join pg_catalog.pg_namespace tn on tn.oid = c.relnamespace
      where d.classid = 'pg_catalog.pg_proc'::regclass
        and d.objid = p.oid
        and d.refclassid = 'pg_catalog.pg_class'::regclass
        and tn.nspname = 'public'
        and c.relname in (
          'legal_documents',
          'order_agreement_acceptances',
          'order_evidence_events'
        )
    )
  )
order by p.proname, identity_arguments;


-- 查询 9B：协议/证据相关函数完整定义
-- 用途：只读取查询 9A 命中的正式库函数定义，不调用任何业务函数。
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ~* '(legal|agreement|evidence)'
    or exists (
      select 1
      from pg_catalog.pg_depend d
      join pg_catalog.pg_class c on c.oid = d.refobjid
      join pg_catalog.pg_namespace tn on tn.oid = c.relnamespace
      where d.classid = 'pg_catalog.pg_proc'::regclass
        and d.objid = p.oid
        and d.refclassid = 'pg_catalog.pg_class'::regclass
        and tn.nspname = 'public'
        and c.relname in (
          'legal_documents',
          'order_agreement_acceptances',
          'order_evidence_events'
        )
    )
  )
order by p.proname, identity_arguments;


-- 查询 9C：相关函数对常用 Supabase 角色的 EXECUTE 权限
-- 用途：确认正式库额外函数是否意外向 anon、authenticated 或 PUBLIC 开放。
with relevant_functions as (
  select p.*, n.nspname as schema_name
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ~* '(legal|agreement|evidence)'
      or exists (
        select 1
        from pg_catalog.pg_depend d
        join pg_catalog.pg_class c on c.oid = d.refobjid
        join pg_catalog.pg_namespace tn on tn.oid = c.relnamespace
        where d.classid = 'pg_catalog.pg_proc'::regclass
          and d.objid = p.oid
          and d.refclassid = 'pg_catalog.pg_class'::regclass
          and tn.nspname = 'public'
          and c.relname in (
            'legal_documents',
            'order_agreement_acceptances',
            'order_evidence_events'
          )
      )
    )
), audited_roles as (
  select r.rolname as role_name, r.oid as role_oid
  from pg_catalog.pg_roles r
  where r.rolname in ('anon', 'authenticated', 'service_role')
  union all
  select 'PUBLIC'::name as role_name, 0::oid as role_oid
)
select
  f.schema_name,
  f.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(f.oid) as identity_arguments,
  r.role_name,
  coalesce(
    bool_or(
      acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = r.role_oid
        or (r.role_oid <> 0 and acl.grantee = 0)
      )
    ),
    false
  ) as has_execute
from relevant_functions f
cross join audited_roles r
left join lateral pg_catalog.aclexplode(
  coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
) acl on true
group by f.schema_name, f.proname, f.oid, r.role_name
order by f.proname, identity_arguments, r.role_name;


-- 查询 10：当前协议记录数量、类型和状态汇总
-- 用途：确认已有发布记录是否需要保护。只返回聚合数量，不返回正文、标题、版本、哈希或用户信息。
-- 仅当查询 1 确认 public.legal_documents 存在时执行。
select
  document_type,
  status,
  count(*) as record_count,
  count(*) filter (where effective_at is null or effective_at <= now()) as effective_or_unscheduled_count,
  count(*) filter (where published_at is not null) as has_published_timestamp_count
from public.legal_documents
group by document_type, status
order by document_type, status;


-- 查询 11：基线与增强代码字段依赖汇总
-- 用途：单行列出旧页面/API 所需基线字段和仓库内另一套新 API 额外字段的存在性与实际类型。
with expected(table_name, column_name, expected_udt_name, dependency_group) as (
  values
    ('legal_documents', 'id', 'uuid', 'baseline'),
    ('legal_documents', 'document_type', 'text', 'baseline'),
    ('legal_documents', 'version', 'text', 'baseline'),
    ('legal_documents', 'title', 'text', 'baseline'),
    ('legal_documents', 'content', 'text', 'baseline'),
    ('legal_documents', 'content_hash', 'text', 'baseline'),
    ('legal_documents', 'status', 'text', 'baseline'),
    ('legal_documents', 'effective_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'published_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'published_by', 'uuid', 'baseline'),
    ('legal_documents', 'publish_reason', 'text', 'baseline'),
    ('legal_documents', 'created_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'updated_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'is_current', 'bool', 'enhanced_api_only'),
    ('legal_documents', 'archived_at', 'timestamptz', 'enhanced_api_only'),
    ('legal_documents', 'archived_by', 'uuid', 'enhanced_api_only'),
    ('order_agreement_acceptances', 'order_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'user_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'document_version_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'document_type', 'text', 'order_evidence'),
    ('order_agreement_acceptances', 'document_version', 'text', 'order_evidence'),
    ('order_agreement_acceptances', 'content_hash', 'text', 'order_evidence'),
    ('order_evidence_events', 'order_id', 'uuid', 'order_evidence'),
    ('order_evidence_events', 'metadata', 'jsonb', 'order_evidence'),
    ('orders', 'id', 'uuid', 'baseline_dependency'),
    ('profiles', 'id', 'uuid', 'baseline_dependency'),
    ('profiles', 'role', 'text', 'baseline_dependency')
)
select
  e.dependency_group,
  e.table_name,
  e.column_name,
  e.expected_udt_name,
  c.udt_name as actual_udt_name,
  (c.column_name is not null) as column_exists,
  (c.udt_name = e.expected_udt_name) as type_matches
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.dependency_group, e.table_name, e.column_name;
