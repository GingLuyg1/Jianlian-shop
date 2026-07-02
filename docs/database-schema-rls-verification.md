# Jianlian Shop 数据库结构与 RLS 核验报告

本报告基于当前代码和 `supabase/migrations` 静态核验生成。没有连接生产 Supabase，没有执行 SQL。真实线上状态必须通过本文的只读 SQL 在 Supabase SQL Editor 中确认。

## 核验范围

- 商品与分类：`categories`、`products`、`product_option_groups`、`product_option_values`、`product_skus`、`product_sku_values`
- 订单：`orders`、`order_items`、`order_status_logs`、`order_deliveries`
- 支付与充值：`order_payments`、`account_recharges`、`payment_channels`、`payment_sessions`、`payment_callback_logs`、`payment_reconciliations`
- 余额：`balance_transactions`、`profiles.balance`
- 数字库存：`digital_inventory`、`digital_inventory_batches`、`delivery_logs`
- 审计与运维：`admin_audit_logs`、`system_error_events`、`data_consistency_*`

## 代码依赖但需要数据库确认的关键字段

### products

代码依赖：

```text
id, category_id, name, slug, short_description, description, image_url,
gallery, price, original_price, stock, delivery_type, status, sort_order,
has_skus, metadata, created_at, updated_at
```

核验结果：当前 migration 没有基础建表文件，只有后续索引和兼容补充。已新增 `20260702_schema_rls_consistency_compatibility.sql` 用于补齐 `gallery`、`has_skus` 等兼容列。

### categories

代码依赖：

```text
id, parent_id, level, name, slug, icon, description, sort_order,
status, is_active, created_at, updated_at
```

风险：后台分类规范化仍限制 level 仅 1/2，但前台类型支持 1/2/3。若继续使用三级分类，需要同步后台接口校验规则；本次未修改业务代码。

### product_skus

代码依赖：

```text
id, product_id, sku_code, sku_title, combination_key, price,
original_price, stock, status, delivery_type, image_url, sort_order,
note, metadata, created_at, updated_at
```

已有 `20260629_multi_sku_core.sql` 创建表和唯一约束。需要只读确认是否存在重复 SKU 编码或组合。

### orders / order_items

代码依赖订单字段：

```text
order_no, user_id, status, payment_status, payment_method,
subtotal, discount_amount, total_amount, currency, customer_email,
customer_name, customer_phone, shipping_address, customer_note,
delivery_type, client_request_id, payment_expires_at, expired_at, closed_at
```

代码依赖订单项字段：

```text
product_id, sku_id, sku_code, sku_title, option_snapshot,
product_name, product_slug, product_image_url, category_name,
unit_price, quantity, line_total, currency, delivery_type, delivery_status,
delivery_started_at, delivery_completed_at, delivered_quantity,
delivery_failure_reason, product_snapshot
```

风险：基础订单建表 migration 不在仓库中；必须确认线上已具备基础列。

## RLS 核验结果

静态 migration 中已看到：

- `digital_inventory` 默认 deny direct reads/writes，符合库存明文保护原则。
- `payment_sessions` 用户只能读自己的会话，直接写入拒绝。
- `balance_transactions` 用户只能读自己的流水，直接写入拒绝。
- `legal_documents` 公开只读已发布协议，订单协议/证据直接写入拒绝。
- `admin_audit_logs` 有超级管理员只读和服务端写入设计。

需要线上确认：

- `products`、`categories` 是否启用 RLS 后仍允许前台读启用/上架数据。
- `orders`、`order_items`、`order_status_logs` 是否只允许用户读取自己的数据。
- `order_deliveries` 是否不泄露其他用户交付信息。
- `payment_channels` 是否只返回公开安全字段，不泄露 `secret_config`。

## 新增兼容 migration

新增文件：

```text
supabase/migrations/20260702_schema_rls_consistency_compatibility.sql
```

作用：

- 补齐代码依赖的兼容字段。
- 对 slug、SKU、client_request_id 只在数据无重复时创建唯一索引。
- 补齐核心查询索引。
- 补齐前台商品/分类只读 RLS、用户订单只读 RLS、数字库存 deny read 策略。

不做的事：

- 不删除、清空或重写任何数据。
- 不自动修复重复 slug 或重复 SKU。
- 不创建缺失的基础业务表。
- 不执行任何数据迁移或伪造历史数据。

## 执行前只读检查 SQL

在执行兼容 migration 前先运行以下 SQL。

### 基础表存在性

```sql
select table_name, to_regclass('public.' || table_name) as regclass
from (values
  ('profiles'), ('categories'), ('products'), ('product_option_groups'),
  ('product_option_values'), ('product_skus'), ('product_sku_values'),
  ('orders'), ('order_items'), ('order_status_logs'), ('order_deliveries'),
  ('order_payments'), ('account_recharges'), ('payment_channels'),
  ('payment_sessions'), ('payment_callback_logs'), ('balance_transactions'),
  ('digital_inventory'), ('digital_inventory_batches'), ('delivery_logs'),
  ('admin_audit_logs')
) as t(table_name);
```

### 核心字段存在性

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'categories','products','product_skus','orders','order_items',
    'order_payments','account_recharges','payment_sessions',
    'balance_transactions','digital_inventory','order_deliveries'
  )
order by table_name, ordinal_position;
```

### 重复 slug / SKU / 幂等键

```sql
select lower(btrim(slug)) as slug, count(*)
from public.products
where nullif(btrim(slug), '') is not null
group by lower(btrim(slug))
having count(*) > 1;

select lower(btrim(slug)) as slug, count(*)
from public.categories
where nullif(btrim(slug), '') is not null
group by lower(btrim(slug))
having count(*) > 1;

select product_id, lower(btrim(sku_code)) as sku_code, count(*)
from public.product_skus
where nullif(btrim(sku_code), '') is not null
group by product_id, lower(btrim(sku_code))
having count(*) > 1;

select user_id, client_request_id, count(*)
from public.orders
where nullif(btrim(client_request_id), '') is not null
group by user_id, client_request_id
having count(*) > 1;
```

### 支付会话重复有效会话

```sql
select business_type, business_id, count(*)
from public.payment_sessions
where status in ('pending','processing')
group by business_type, business_id
having count(*) > 1;
```

### RLS 与策略

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'categories','products','product_skus','orders','order_items',
    'order_status_logs','order_deliveries','order_payments',
    'account_recharges','payment_sessions','balance_transactions',
    'digital_inventory','admin_audit_logs'
  )
order by tablename;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'categories','products','product_skus','orders','order_items',
    'order_status_logs','order_deliveries','order_payments',
    'account_recharges','payment_sessions','balance_transactions',
    'digital_inventory','admin_audit_logs'
  )
order by tablename, policyname;
```

### 支付渠道敏感字段抽样

```sql
select code, channel, enabled, configured, provider, currency, network,
       public_config is not null as has_public_config,
       provider_config is not null as has_provider_config,
       secret_config is not null as has_secret_config
from public.payment_channels
order by sort_order, code;
```

不要在普通前端接口返回 `provider_config` 或 `secret_config`。

## P0 阻塞项

1. 基础建表 migration 缺失：仓库内没有 `categories`、`products`、`orders`、`order_items`、`order_status_logs` 的完整建表 SQL。新环境无法仅靠当前 migration 复建数据库。
2. 若线上存在重复 `products.slug`、重复 `categories.slug`、重复 `product_skus(product_id, sku_code)`，唯一约束无法安全添加，且前台/后台查询会出现歧义。
3. 若 `orders`/`order_items`/`order_deliveries` RLS 未按用户隔离，存在跨用户订单或交付信息泄露风险。
4. 若 `digital_inventory` 可被普通用户直接读取，则数字库存明文泄露，禁止上线。

## P1 上线前必须修复

1. 三级分类：前台类型支持三级，后台分类保存校验仍限制一级/二级，后续若继续维护三级分类需统一。
2. `create_order_with_item` 多次覆盖且部分旧 migration 文本乱码，建议最终保留最后版本并补充数据库函数验收 SQL。
3. `recharge_records` 与 `account_recharges` 并存，需要明确 `account_recharges` 为主链路，避免后台统计双口径。
4. 支付 Provider 未配置时只能停留在 readiness partial，不可标记为 ready 或正式收款。

## P2/P3

- 建议把基础建表 SQL 纳入 `supabase/migrations` 或单独 `supabase/base-schema.sql`。
- 建议给所有业务 RPC 增加 `to_regprocedure` 自检 SQL。
- 建议统一 `is_admin()` 与 `is_super_admin_user(uuid)` 的使用方式，降低 RLS 策略维护成本。

## 当前结论

代码侧已经具备较多兼容检查和受控服务端接口，但数据库 migration 链仍依赖历史手工基础表。执行 `20260702_schema_rls_consistency_compatibility.sql` 前，必须先完成本文只读检查；如果 P0 检查项不通过，不能正式上线。
