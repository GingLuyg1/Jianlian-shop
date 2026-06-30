# 限流、幂等与并发保护验收报告

## 接口风险矩阵

| 接口/服务 | 权限 | 幂等保护 | 限流 | 大小限制 | 风险 |
| --- | --- | --- | --- | --- | --- |
| 登录/注册/忘记密码 | 匿名 | Supabase 侧能力为主 | 需在认证接口继续接入 | 表单大小自然受限 | P1 |
| 商品搜索 | 公开 | 读请求无业务幂等 | `catalog_read` 来源哈希 | URL 参数限制待继续收紧 | P2 |
| 商品保存 | 超级管理员 | 数据库更新返回校验 | `admin_write` 管理员哈希 | 64KB | P1 |
| 订单创建 | 登录用户 | `client_request_id` + RPC | `order_create` 用户哈希 | 16KB | P0 |
| 支付会话创建 | 登录用户 | 业务单复用有效会话 | `payment_session_create` 用户和业务对象 | 8KB | P0 |
| 支付状态查询 | 登录用户 | 读请求 | `payment_status_query` 支付单对象 | 无请求体 | P1 |
| 充值创建 | 登录用户 | `client_request_id` 复用 | `recharge_create` 用户哈希 | 12KB | P0 |
| 退款申请 | 登录用户 | RPC `client_request_id` | `refund_create` 用户哈希 | 12KB | P0 |
| 数字库存导入 | 超级管理员 | 批次和内容去重 | `inventory_import` 管理员哈希 | 2MB | P0 |
| 媒体上传 | 超级管理员 | 文件引用 | `media_upload` 管理员哈希 | 8MB | P1 |
| 支付对账 | 内部密钥 | 任务锁和批处理 | `internal_task` 密钥哈希 | 8KB | P0 |
| 游客订单查询 | 匿名 | 只读 | `order_lookup` 来源和订单号摘要 | 8KB | P1 |

## 统一限流实现

- 新增 `lib/security/rate-limit.ts`。
- 统一工具包括 `checkRateLimit`、`checkRequestSize`、`getRequestSourceKey`、`getUserRateLimitKey`、`getAdminRateLimitKey`、`getBusinessRateLimitKey`。
- 限流键使用 SHA-256 摘要，不保存完整 IP、邮箱、Token、密码或查询凭证。
- 触发限流时返回 429，并设置 `Retry-After`、`X-RateLimit-Limit`、`X-RateLimit-Remaining` 和 `X-RateLimit-Reset`。

## 各接口限流策略

- `catalog_read`：60 秒 120 次，适用于商品读取。
- `order_create`：60 秒 8 次，适用于创建订单。
- `order_lookup`：5 分钟 8 次，适用于游客订单查询和订单绑定。
- `payment_session_create`：60 秒 10 次，适用于创建支付会话。
- `payment_status_query`：30 秒 30 次，适用于轮询支付状态。
- `recharge_create`：60 秒 6 次，适用于充值创建。
- `refund_create`：5 分钟 5 次，适用于退款申请。
- `admin_write`：60 秒 30 次，适用于后台写操作。
- `inventory_import`：5 分钟 6 次，适用于库存导入。
- `media_upload`：5 分钟 10 次，适用于媒体上传。
- `internal_task`：5 分钟 3 次，适用于对账和巡检任务。

## 幂等保护结果

- 订单创建继续使用 `client_request_id`，服务端传入 RPC，不信任前端金额。
- 支付会话创建按业务对象优先复用有效会话，切换渠道时由支付服务处理旧会话。
- 充值创建使用 `client_request_id` 和已有兼容逻辑复用。
- 退款申请通过 RPC 参数传入 `clientRequestId`。
- 库存导入仍依赖批次和内容去重，超大请求会被 2MB 请求体限制拒绝。

## 并发保护结果

- 资金、订单和库存的最终一致性仍依赖数据库唯一约束、RPC 和事务。
- 服务端限流只负责削峰，不能替代数据库原子保护。
- 多实例部署下当前内存限流不是全局强一致，生产高并发建议接入 Redis、Cloudflare Rate Limiting 或 Supabase RPC 计数表。

## 请求大小限制

- 订单创建：16KB。
- 支付会话：8KB。
- 充值和退款：12KB。
- 游客订单查询和绑定：8KB。
- 库存导入：2MB。
- 媒体上传：8MB。
- 内部对账：8KB。

## 高负载降级结果

- 商品读取、游客订单查询、支付状态查询都有独立错误响应，不会导致整页白屏。
- 支付 Provider 未配置时仍返回明确未配置状态，不生成假支付数据。
- 控制台、对账和巡检类任务通过单次处理上限和内部限流降低雪崩风险。

## 当前限制

- 当前限流为单实例内存实现，PM2 多实例或多服务器时不共享计数。
- 登录、注册、忘记密码仍主要依赖 Supabase 侧保护，建议在后续认证接口中统一接入同一限流抽象。
- 本任务未执行真实压测，只完成代码级和构建级验收。

## 未来扩展方案

- 使用 Redis 或 Upstash 做共享令牌桶。
- 使用 Cloudflare 或 Nginx 对匿名接口做边缘限流。
- 对高价值业务对象使用数据库唯一约束和 advisory lock 作为最终保护。

## 需要执行的 Migration

- 本次限流实现不需要新增 migration。
- 订单查询凭证需要执行 `supabase/migrations/20260630_order_query_tokens.sql`。

## 需要人工配置的服务器项目

- Nginx 可增加 `/api/auth/*`、`/api/order-query`、`/api/payments/status/*` 的基础限速。
- Cloudflare 可按路径设置 Bot Fight Mode、Turnstile 或 Rate Limiting。
- 生产多实例部署前需要共享限流存储。

## 发现的问题

- 高风险接口缺少统一限流入口。
- 游客订单查询缺少防枚举限流。
- 后台商品保存接口缺少请求大小限制。

## 已修复的问题

- 新增统一限流工具。
- 接入订单创建、支付会话、支付状态、充值、退款、库存导入、媒体上传、商品保存、商品读取、内部对账和游客订单查询。
- 新增请求体大小限制。

## 仍存在的问题

- 未进行真实压力测试。
- 认证类接口仍需进一步接入统一限流。
- 单实例内存限流不适合作为生产多实例最终方案。
