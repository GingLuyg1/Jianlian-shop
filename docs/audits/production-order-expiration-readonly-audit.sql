-- Jianlian Shop 正式库订单过期只读审计
--
-- 人工执行说明：
-- 1. 必须先在 Supabase Dashboard 人工确认项目名为 Jianlian-shop。
-- 2. 必须确认 Project ref 为 qvbovrvybirscaurwuov。
-- 3. 建议每个查询块单独执行。
-- 4. 不要点击 Run all。
-- 5. 不要对查询内容进行临时修改。
-- 6. 执行结果需要复制或导出后交回 Codex 分析。
-- 7. 本文件仅查询系统元数据，不调用任何业务 RPC，也不扫描订单业务数据。


-- 查询 1：orders 字段
-- 用途：核对订单过期所需字段的数据类型、底层类型、可空性和默认值。

SELECT
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'orders'
  AND c.column_name IN (
    'payment_expires_at',
    'reservation_released_at',
    'expired_at',
    'status',
    'payment_status'
  )
ORDER BY
  CASE c.column_name
    WHEN 'payment_expires_at' THEN 1
    WHEN 'reservation_released_at' THEN 2
    WHEN 'expired_at' THEN 3
    WHEN 'status' THEN 4
    WHEN 'payment_status' THEN 5
    ELSE 99
  END;


-- 查询 2：订单过期相关索引
-- 用途：列出 public.orders 的全部索引，重点核对 orders_unpaid_expiration_idx 的完整定义和条件表达式。

SELECT
  i.indexname,
  i.indexdef
FROM pg_catalog.pg_indexes AS i
WHERE i.schemaname = 'public'
  AND i.tablename = 'orders'
ORDER BY
  CASE WHEN i.indexname = 'orders_unpaid_expiration_idx' THEN 0 ELSE 1 END,
  i.indexname;


-- 查询 3：相关 RPC 的所有重载签名
-- 用途：按 OID 区分同名重载，并核对签名、返回类型、属主、安全模式、运行属性、配置和 ACL。

SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.format_type(p.prorettype, NULL) AS result_type,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'immutable'
    WHEN 's' THEN 'stable'
    WHEN 'v' THEN 'volatile'
  END AS volatility,
  CASE p.proparallel
    WHEN 's' THEN 'safe'
    WHEN 'r' THEN 'restricted'
    WHEN 'u' THEN 'unsafe'
  END AS parallel_status,
  p.proconfig,
  p.proacl AS acl
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE p.proname IN (
    'release_order_inventory',
    'cancel_unpaid_order',
    'expire_unpaid_order',
    'list_expirable_unpaid_orders'
  )
ORDER BY n.nspname, p.proname, p.oid;


-- 查询 4：相关 RPC 完整定义
-- 用途：读取上述函数全部重载版本的服务端定义；本查询只读取定义文本，不调用这些函数。

SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  p.oid,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE p.proname IN (
    'release_order_inventory',
    'cancel_unpaid_order',
    'expire_unpaid_order',
    'list_expirable_unpaid_orders'
  )
ORDER BY n.nspname, p.proname, p.oid;


-- 查询 5：函数执行权限
-- 用途：展开函数 ACL，核对 anon、authenticated、service_role 和 public 的直接或默认执行权限。

WITH target_functions AS (
  SELECT
    p.oid AS function_oid,
    p.proowner,
    p.proacl,
    n.nspname AS schema,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE p.proname IN (
      'release_order_inventory',
      'cancel_unpaid_order',
      'expire_unpaid_order',
      'list_expirable_unpaid_orders'
    )
), requested_roles AS (
  SELECT r.oid AS role_oid, r.rolname::text AS role_name
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  SELECT 0::oid AS role_oid, 'public'::text AS role_name
), expanded_acl AS (
  SELECT
    f.function_oid,
    a.grantee,
    a.privilege_type
  FROM target_functions AS f
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(f.proacl, pg_catalog.acldefault('f', f.proowner))
  ) AS a
)
SELECT
  f.schema,
  f.function_name,
  f.function_oid AS oid,
  f.identity_arguments,
  r.role_name,
  COALESCE(
    bool_or(a.privilege_type = 'EXECUTE') FILTER (
      WHERE a.grantee = r.role_oid
    ),
    false
  ) AS has_execute_privilege
FROM target_functions AS f
CROSS JOIN requested_roles AS r
LEFT JOIN expanded_acl AS a
  ON a.function_oid = f.function_oid
GROUP BY
  f.schema,
  f.function_name,
  f.function_oid,
  f.identity_arguments,
  r.role_name
ORDER BY f.schema, f.function_name, f.function_oid, r.role_name;


-- 查询 6：扩展状态
-- 用途：同时核对 pg_cron、pg_net、supabase_vault 和 vault 的已安装状态、可用状态及版本。

WITH requested_extensions(extension_name) AS (
  VALUES
    ('pg_cron'),
    ('pg_net'),
    ('supabase_vault'),
    ('vault')
)
SELECT
  r.extension_name,
  (e.extname IS NOT NULL) AS is_installed,
  e.extversion AS installed_version,
  (a.name IS NOT NULL) AS is_available,
  a.default_version,
  a.installed_version AS available_view_installed_version,
  a.comment
FROM requested_extensions AS r
LEFT JOIN pg_catalog.pg_extension AS e
  ON e.extname = r.extension_name
LEFT JOIN pg_catalog.pg_available_extensions AS a
  ON a.name = r.extension_name
ORDER BY r.extension_name;


-- 查询 7：Cron 现有任务的安全前置检查
-- 用途：只确认 cron schema 与 cron.job 表是否存在。为保证本块在对象缺失时仍可独立执行，本块不读取任务行。

SELECT
  (pg_catalog.to_regnamespace('cron') IS NOT NULL) AS cron_schema_exists,
  (pg_catalog.to_regclass('cron.job') IS NOT NULL) AS cron_job_table_exists;


-- 查询 8：与订单过期有关的数据库对象汇总
-- 用途：仅搜索系统元数据中名称包含 expire、expiration、reservation 或 inventory 的函数、索引、触发器和表。

WITH keyword_patterns(pattern) AS (
  VALUES
    ('%expire%'),
    ('%expiration%'),
    ('%reservation%'),
    ('%inventory%')
), matching_functions AS (
  SELECT DISTINCT
    'function'::text AS object_type,
    n.nspname AS schema,
    p.proname AS object_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS details
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  JOIN keyword_patterns AS k
    ON p.proname ILIKE k.pattern
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
), matching_indexes AS (
  SELECT DISTINCT
    'index'::text AS object_type,
    n.nspname AS schema,
    c.relname AS object_name,
    pg_catalog.pg_get_indexdef(c.oid) AS details
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
  JOIN keyword_patterns AS k
    ON c.relname ILIKE k.pattern
  WHERE c.relkind = 'i'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
), matching_triggers AS (
  SELECT DISTINCT
    'trigger'::text AS object_type,
    n.nspname AS schema,
    t.tgname AS object_name,
    pg_catalog.format('%I.%I', n.nspname, c.relname) AS details
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c
    ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
  JOIN keyword_patterns AS k
    ON t.tgname ILIKE k.pattern
  WHERE NOT t.tgisinternal
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
), matching_relations AS (
  SELECT DISTINCT
    CASE c.relkind
      WHEN 'r' THEN 'table'
      WHEN 'p' THEN 'partitioned table'
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized view'
      WHEN 'f' THEN 'foreign table'
      ELSE 'relation'
    END AS object_type,
    n.nspname AS schema,
    c.relname AS object_name,
    pg_catalog.format('relkind=%s', c.relkind) AS details
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
  JOIN keyword_patterns AS k
    ON c.relname ILIKE k.pattern
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT object_type, schema, object_name, details FROM matching_functions
UNION ALL
SELECT object_type, schema, object_name, details FROM matching_indexes
UNION ALL
SELECT object_type, schema, object_name, details FROM matching_triggers
UNION ALL
SELECT object_type, schema, object_name, details FROM matching_relations
ORDER BY object_type, schema, object_name;
