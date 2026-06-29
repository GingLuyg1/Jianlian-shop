# Jianlian Shop 生产安全验收报告

## 验收范围

本次检查覆盖前台商城、后台管理、商品分类、多 SKU、订单、充值、支付核心、数字库存、自动发货、访客统计、管理员审计日志、Supabase、Next.js、PM2 与 Nginx 上线流程。

本次没有接入新的真实支付 Provider，没有删除现有数据，没有自动执行 Supabase SQL，没有自动修改服务器配置。

## 身份认证检查

结果：已修复一处后台入口风险。

- `/admin` 现在在服务端布局中调用 `getServerAdminContext()` 校验当前用户。
- 未登录访问后台会跳转 `/login?redirect=/admin`。
- 非管理员访问后台会显示“无后台访问权限”。
- 后台布局不再只依赖客户端 `AdminGuard`。
- 客户端 `AdminGuard` 已移除浏览器端自动 upsert 管理员 role 的逻辑。

## 管理员权限检查

结果：主要管理员 API 已使用服务端校验。

已确认项目存在服务端管理员校验入口：

- `lib/auth/require-admin.ts`
- `lib/admin/api-auth.ts`

管理员身份读取规则：服务端读取当前 Supabase user，再按 `user.id` 查询 `profiles.role`，不信任客户端传入的 role、user_id 或 is_admin。

仍需人工抽样验证：所有 `/api/admin/*` 在线上均返回 401/403 给未登录和普通用户。

## 用户数据隔离

结果：代码结构具备隔离基础，仍需线上双账号测试。

检查要求：

- 用户订单、充值、余额流水、交付内容必须按当前登录用户过滤。
- 管理员访问全部数据必须通过服务端管理员校验。
- URL 中的 user_id、role、is_admin 不可信。

上线前必须使用用户 A / 用户 B 测试：订单详情、充值详情、交付内容、支付会话和余额流水互相不可读。

## RLS 检查

本地 migration 文件覆盖以下关键表 RLS：

- `profiles`
- `orders`
- `order_items`
- `order_status_logs`
- `order_deliveries`
- `order_payments`
- `payment_sessions`
- `payment_callback_logs`
- `account_recharges`
- `balance_transactions`
- `payment_reconciliations`
- `digital_inventory`
- `digital_inventory_batches`
- `product_skus`
- `page_visit_events` 或访客统计相关表

限制：本次未自动连接 Supabase 执行 SQL，因此“线上当前策略是否已执行”需要人工在 Supabase SQL Editor 核对。

建议人工执行只读核对：

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','products','categories','orders','order_items','payment_sessions',
    'order_payments','account_recharges','balance_transactions','digital_inventory',
    'digital_inventory_batches','order_deliveries','product_skus','admin_audit_logs'
  )
order by tablename;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Service Role 检查

结果：未发现源码中硬编码 service role key。

- Service Role 读取集中在 server-only 模块。
- 未发现 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 这类前端公开变量。
- 浏览器端不得使用 service role。

需要人工确认服务器环境变量中没有把 service role 配成 `NEXT_PUBLIC_*`。

## 密钥与日志检查

结果：已修复内部对账接口返回原始错误的问题。

- 内部支付对账接口现在只返回脱敏后的错误摘要和 `error_count`。
- 对账运行日志保存脱敏 message，不返回原始错误对象。
- 回调日志逻辑已有 payload 摘要过滤，避免保存 key、secret、sign、token、password、private、credential 等敏感字段。

需要人工轮换但不展示值的密钥名称：

- `SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_SERVICE_ROLE`
- `PAYMENT_RECONCILIATION_SECRET`
- `INTERNAL_API_SECRET`
- 后续真实支付 Provider 的 API Key、私钥、Webhook Secret、签名密钥
- 数字库存备份加密密钥

## 输入校验检查

重点要求：

- 商品价格、订单金额、支付状态、余额入账、库存扣减必须由服务端计算或校验。
- 数字库存导入必须限制行数、内容长度、去重和状态流转。
- 订单创建不能信任前端价格。
- 充值创建不能信任前端手续费、到账金额和状态。

当前仍需人工接口测试：伪造价格、伪造支付成功、错误对账密钥、越权读取数字库存。

## 安全响应头

已在 `next.config.js` 增加基础安全头：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `/api/*` 增加 `Cache-Control: no-store, max-age=0`

CSP 建议先在 staging 观察资源域名后再启用，避免破坏 Supabase、图片和支付页面。Nginx 可补充相同响应头，但本次未自动修改服务器。

## 数据库备份方案

已新增 `docs/database-backup-restore.md`，包含：

- 每日、每周、每月备份建议。
- 关键表优先级。
- 数字库存加密备份要求。
- 恢复前暂停写入。
- 恢复后订单、余额、库存和交付校验。
- 灾难恢复检查清单。

## 部署与回滚方案

已新增：

- `docs/production-deployment.md`
- `docs/production-rollback.md`
- `docs/production-health-check.md`

包含 git、npm build、PM2、Nginx、curl 健康检查、停止条件和紧急回滚步骤。

## 高风险问题

已修复：后台原先主要依赖客户端 guard，且客户端曾可按邮箱尝试 upsert admin role。现在后台入口增加服务端校验，客户端不再写 admin role。

需人工确认：线上 Supabase RLS 是否全部执行到位，尤其数字库存、支付、余额流水、交付内容相关表。

## 中风险问题

已修复：内部对账接口曾返回原始 result errors。现在返回脱敏摘要。

需人工确认：PM2/Nginx 日志中没有历史密钥、Token、完整支付回调、完整数字库存内容。

## 低风险问题

已补充：基础安全响应头、部署文档、备份恢复文档、健康检查文档。

## 需要执行的 migration

本次没有新增 migration。

## 仍需人工处理

- 在 Supabase SQL Editor 执行只读 RLS/Policy 核对。
- 使用两个普通用户做越权读取测试。
- 使用错误对账密钥测试 403。
- 检查服务器环境变量和 PM2 ecosystem，确认密钥不使用 `NEXT_PUBLIC_*`。
- 检查 Nginx 是否也需要补充同等安全头和 HTTPS HSTS。