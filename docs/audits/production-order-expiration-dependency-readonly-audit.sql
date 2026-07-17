-- Jianlian Shop 正式库订单过期依赖只读审计
--
-- 人工执行说明：
-- 1. 必须先在 Supabase Dashboard 人工确认项目名为 Jianlian-shop。
-- 2. 必须确认 Project ref 为 qvbovrvybirscaurwuov。
-- 3. 建议每个查询块单独执行，不要点击 Run all。
-- 4. 不要临时改写查询内容。
-- 5. 结果复制或导出后交回 Codex 分析。
-- 6. 本文件仅查询系统元数据，不调用业务 RPC，不读取业务表数据。


-- 查询 1：chain_payment_sessions 表存在性
-- 用途：确认目标关系是否存在，并返回 schema、表名和表类型。

SELECT
  t.table_schema AS schema,
  t.table_name,
  t.table_type
FROM information_schema.tables AS t
WHERE t.table_schema = 'public'
  AND t.table_name = 'chain_payment_sessions'
ORDER BY t.table_schema, t.table_name;


-- 查询 2：chain_payment_sessions 依赖字段
-- 用途：核对列表 RPC 所需三个字段的类型、可空性和默认值。

SELECT
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'chain_payment_sessions'
  AND c.column_name IN ('order_id', 'status', 'failure_reason')
ORDER BY
  CASE c.column_name
    WHEN 'order_id' THEN 1
    WHEN 'status' THEN 2
    WHEN 'failure_reason' THEN 3
    ELSE 99
  END;


-- 查询 3：chain_payment_sessions 外键
-- 用途：确认 order_id 的引用目标、约束名称及引用动作规则。

SELECT
  source_ns.nspname AS schema,
  source_table.relname AS table_name,
  con.conname AS constraint_name,
  source_column.attname AS column_name,
  target_ns.nspname AS referenced_schema,
  target_table.relname AS referenced_table,
  target_column.attname AS referenced_column,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS update_rule,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS delete_rule,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS source_table
  ON source_table.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS source_ns
  ON source_ns.oid = source_table.relnamespace
JOIN pg_catalog.pg_class AS target_table
  ON target_table.oid = con.confrelid
JOIN pg_catalog.pg_namespace AS target_ns
  ON target_ns.oid = target_table.relnamespace
JOIN LATERAL pg_catalog.unnest(con.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
  ON true
JOIN LATERAL pg_catalog.unnest(con.confkey) WITH ORDINALITY AS target_key(attnum, ordinality)
  ON target_key.ordinality = source_key.ordinality
JOIN pg_catalog.pg_attribute AS source_column
  ON source_column.attrelid = source_table.oid
  AND source_column.attnum = source_key.attnum
JOIN pg_catalog.pg_attribute AS target_column
  ON target_column.attrelid = target_table.oid
  AND target_column.attnum = target_key.attnum
WHERE con.contype = 'f'
  AND source_ns.nspname = 'public'
  AND source_table.relname = 'chain_payment_sessions'
ORDER BY con.conname, source_key.ordinality;


-- 查询 4：chain_payment_sessions 的 CHECK、ENUM 和状态约束
-- 用途：读取该表的检查约束，并在 status 使用 enum 时列出全部合法值；不读取实际状态数据。

WITH target_relation AS (
  SELECT c.oid
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'chain_payment_sessions'
), check_constraints AS (
  SELECT
    'check_constraint'::text AS record_type,
    con.conname AS constraint_name,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition,
    NULL::text AS enum_type,
    NULL::text AS enum_value,
    NULL::real AS enum_sort_order
  FROM pg_catalog.pg_constraint AS con
  JOIN target_relation AS rel
    ON rel.oid = con.conrelid
  WHERE con.contype = 'c'
), status_enum_values AS (
  SELECT
    'status_enum_value'::text AS record_type,
    NULL::name AS constraint_name,
    NULL::text AS constraint_definition,
    pg_catalog.format('%I.%I', type_ns.nspname, typ.typname) AS enum_type,
    enum.enumlabel AS enum_value,
    enum.enumsortorder AS enum_sort_order
  FROM target_relation AS rel
  JOIN pg_catalog.pg_attribute AS attr
    ON attr.attrelid = rel.oid
    AND attr.attname = 'status'
    AND NOT attr.attisdropped
  JOIN pg_catalog.pg_type AS typ
    ON typ.oid = attr.atttypid
    AND typ.typtype = 'e'
  JOIN pg_catalog.pg_namespace AS type_ns
    ON type_ns.oid = typ.typnamespace
  JOIN pg_catalog.pg_enum AS enum
    ON enum.enumtypid = typ.oid
)
SELECT
  record_type,
  constraint_name,
  constraint_definition,
  enum_type,
  enum_value,
  enum_sort_order
FROM check_constraints

UNION ALL

SELECT
  record_type,
  constraint_name,
  constraint_definition,
  enum_type,
  enum_value,
  enum_sort_order
FROM status_enum_values
ORDER BY record_type, constraint_name, enum_sort_order;


-- 查询 5：chain_payment_sessions 索引
-- 用途：返回全部索引定义，人工重点核对 order_id、status、组合索引和活跃会话部分索引。

SELECT
  i.indexname,
  i.indexdef
FROM pg_catalog.pg_indexes AS i
WHERE i.schemaname = 'public'
  AND i.tablename = 'chain_payment_sessions'
ORDER BY i.indexname;


-- 查询 6：orders 补充字段
-- 用途：核对 reservation_release_reason 的类型、可空性和默认值。

SELECT
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'orders'
  AND c.column_name = 'reservation_release_reason';


-- 查询 7：orders 状态约束
-- 用途：返回定义中涉及 status 或 payment_status 的 CHECK 约束。

SELECT
  con.conname AS constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS rel
  ON rel.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = rel.relnamespace
WHERE con.contype = 'c'
  AND n.nspname = 'public'
  AND rel.relname = 'orders'
  AND (
    pg_catalog.pg_get_constraintdef(con.oid, true) ILIKE '%status%'
    OR pg_catalog.pg_get_constraintdef(con.oid, true) ILIKE '%payment_status%'
  )
ORDER BY con.conname;


-- 查询 8：20260717 列表 RPC 依赖完整性总结
-- 用途：仅通过字段元数据逐项确认列表 RPC 的八个直接依赖。

WITH required_columns(table_schema, table_name, column_name) AS (
  VALUES
    ('public', 'orders', 'id'),
    ('public', 'orders', 'payment_expires_at'),
    ('public', 'orders', 'reservation_released_at'),
    ('public', 'orders', 'status'),
    ('public', 'orders', 'payment_status'),
    ('public', 'chain_payment_sessions', 'order_id'),
    ('public', 'chain_payment_sessions', 'status'),
    ('public', 'chain_payment_sessions', 'failure_reason')
)
SELECT
  required.table_schema AS schema,
  required.table_name,
  required.column_name,
  (actual.column_name IS NOT NULL) AS column_exists,
  actual.data_type,
  actual.udt_name,
  actual.is_nullable,
  actual.column_default
FROM required_columns AS required
LEFT JOIN information_schema.columns AS actual
  ON actual.table_schema = required.table_schema
  AND actual.table_name = required.table_name
  AND actual.column_name = required.column_name
ORDER BY
  CASE required.table_name WHEN 'orders' THEN 1 ELSE 2 END,
  required.column_name;
