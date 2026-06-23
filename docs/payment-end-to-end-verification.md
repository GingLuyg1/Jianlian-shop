# Jianlian Shop 支付链路端到端验收报告

生成日期：2026-06-23

## 测试环境

- 项目：`D:\Jianlian-shop`
- 分支：`main`
- 验收方式：静态代码审计、migration 审计、服务端测试 harness 补充
- 未执行事项：未启动 `npm run dev`，未连接 Supabase，未自动执行 SQL，未接入真实支付 Provider，未模拟真实渠道成功

## 已执行 migration

用户确认已在 Supabase SQL Editor 成功执行：

1. `20260620_order_payments.sql`
2. `20260620_digital_inventory_delivery.sql`
3. `20260620_site_settings.sql`
4. `20260622_super_admin_payment_console.sql`
5. `20260623_admin_audit_logs.sql`
6. `20260623_payment_reconciliation_system.sql`

用户确认 `20260623_digital_inventory_batches.sql` 曾因 `content_type` 缺失失败；该文件已修复，但仍需要手动重新执行。

## 建议 migration 执行顺序

1. `20260620_order_payments.sql`
2. `20260620_digital_inventory_delivery.sql`
3. `20260620_referral_system.sql`
4. `20260620_site_settings.sql`
5. `20260622_recharge_records.sql`（历史充值兼容表，当前主链路使用 `account_recharges`）
6. `20260622_super_admin_payment_console.sql`
7. `20260622_digital_delivery_hardening.sql`
8. `20260623_admin_audit_logs.sql`
9. `20260623_payment_reconciliation_system.sql`
10. `20260623_mixed_order_item_fulfillment.sql`
11. `20260623_digital_inventory_batches.sql`
12. `20260623_payment_balance_transactions_compatibility.sql`

## migration 审计结果

| 对象 | 状态 | 说明 |
| --- | --- | --- |
| `order_payments` | 通过 | 有 RLS、支付号唯一、渠道交易号唯一索引、状态约束 |
| `account_recharges` | 部分通过 | 有 RLS、充值号唯一、渠道交易号唯一索引；创建流程尚未复用有效会话 |
| `payment_channels` | 通过 | 有 RLS；公开侧只读启用渠道；管理侧通过 admin API |
| `payment_callback_logs` | 部分通过 | 表和 RLS 已有；未发现真实回调处理 API |
| `payment_reconciliations` | 部分通过 | 表、RLS、幂等 `dedupe_key` 已有；自动恢复仍标记 blocked |
| `balance_transactions` | 已补充 | 新增兼容 migration，含 RLS 与 `business_type,business_id` 完成态唯一约束 |
| `digital_inventory` | 部分通过 | 有 RLS、库存状态、唯一库存内容索引；批次 migration 需手动执行修复版 |
| `digital_inventory_batches` | 待执行 | 修复后的 migration 可创建批次表、统计 RPC 和管理 RPC |
| `order_deliveries` | 通过 | 有库存唯一交付约束，混合订单 migration 将敏感内容迁移到私有表 |
| `delivery_logs` / `order_item_delivery_logs` | 部分通过 | 有交付日志与 RLS；需确认 hardening 和 mixed fulfillment migration 均已执行 |
| `admin_audit_logs` | 通过 | 后台交付、支付配置、对账重查等操作有审计接入 |

## 已通过场景

### 充值创建流程

- 未登录用户：API 使用 `supabase.auth.getUser()`，未登录返回 401。
- 渠道启用校验：只查询 `payment_channels.enabled = true` 的渠道。
- 服务端手续费：`calculateRechargeAmounts()` 在服务端基于渠道配置计算金额、手续费和应付金额。
- 前端金额/手续费篡改：POST 只接受 `channel` 和 `amount`，额外字段会返回 400，手续费不接受前端传入。
- 低于最低金额：服务端按渠道 `minimumAmount` 校验。
- Provider 未配置：`providers.ts` 默认抛出 `PaymentProviderError`，不会返回真实二维码、地址或成功状态。

### 回调和幂等

- Provider 验签默认返回 `false`，不会模拟成功。
- 渠道交易号唯一索引已覆盖 `order_payments.provider_trade_no` 和 `account_recharges.provider_trade_no`。
- `payment_callback_logs` 表存在并带有脱敏摘要字段 `payload_summary`。
- 当前未发现真实回调处理 API，因此不会出现测试代码绕过验签直接置 paid 的路径。

### 原子入账

- 新增 `balance_transactions` 兼容 migration，包含完成态业务唯一约束。
- 新增 `credit_account_recharge_balance()` RPC，单事务内更新用户余额、充值状态和余额流水。
- RPC 具备幂等返回：同一 `account_recharge` 已完成流水再次调用返回原流水。
- RPC 不授予 `anon`，仅授予 `service_role`，函数内再次限制 `service_role` 或管理员。

### 订单支付与自动发货

- `submit_order_payment` 和 `review_order_payment` 已存在，人工审核 paid 后更新订单支付状态。
- 数字库存唯一交付约束 `order_deliveries_delivered_inventory_uidx` 防止同一库存重复交付。
- 混合订单 migration 按订单项维护 `delivery_status`，并聚合 `orders.fulfillment_status`。
- 自动发货库存不足会将对应订单项标记失败，不回滚订单已支付状态。
- 人工交付 API 通过 `getServerAdminContext()` 校验管理员，并写入审计日志，不记录完整交付内容。

### 权限和数据隔离

- 后台支付、充值、库存、审计、手动交付 API 均使用服务端管理员校验。
- 普通用户充值列表按当前用户 Supabase session 查询，RLS 也限制 `user_id = auth.uid()`。
- 数字库存表启用 RLS，普通用户不能直接读取库存明文。
- 内部对账接口要求 `PAYMENT_RECONCILIATION_SECRET` 或 `INTERNAL_API_SECRET`，并有进程级互斥保护。
- Service Role 只在服务端模块中使用，未发现浏览器侧导出 service role key。

## 失败场景

1. 真实回调处理 API 缺失：无法完整验收“正常回调、重复回调、验签失败、金额不一致、币种不一致”的端到端执行结果。
2. 自动恢复未完成：对账检测到“渠道已付本站未付”时，目前会进入 `manual_review`，不会调用订单 paid 服务或充值入账 RPC。
3. 充值创建没有复用现有有效会话：当前每次 POST 都新建 `account_recharges`，不满足“同一业务不能创建多个有效会话”。
4. `20260623_digital_inventory_batches.sql`、`20260623_mixed_order_item_fulfillment.sql`、`20260623_payment_balance_transactions_compatibility.sql` 需要上线前手动执行后再验收。

## 阻塞项

- 缺少真实 Provider 回调入口与统一回调处理服务。
- 自动恢复链路尚未接入订单 paid 服务和充值原子入账 RPC。
- 充值会话复用规则未实现。
- 关键新 migration 尚未确认在线上 Supabase 执行成功。

## 安全问题

- 当前未发现 service role key 前端暴露。
- 当前未发现测试代码直接修改 paid 状态。
- 支付相关错误提示存在部分编码异常文案，需要修复为正常中文，避免用户侧可读性问题。
- `account_recharges` RLS 允许用户 insert 自己的 pending 记录；实际创建仍建议继续只走服务端 API，避免客户端绕过手续费计算直接插入。

## 必须修复项

1. 实现真实 Provider 回调 API，统一验签、解析、记录 `payment_callback_logs`，并禁止验签失败更新状态。
2. 接入对账恢复时的订单 paid 服务和充值 `credit_account_recharge_balance()` RPC。
3. 充值创建增加有效会话复用和过期重建规则。
4. 手动执行并验证库存批次、混合交付和余额流水兼容 migration。
5. 修复支付/充值 API 的中文编码异常。

## 可以延后项

- 普通管理员、财务管理员和细粒度权限。
- 退款和售后。
- 真实支付渠道 UI 的完整体验优化。
- 自动定时任务调度平台接入。

## 是否可以接真实 Provider

结论：`blocked`

原因：支付会话、基础支付管理、对账记录、数字库存和混合交付已有基础，但真实回调处理、自动恢复、充值会话复用和线上 migration 执行确认仍未完成。根据验收标准，存在入账/回调/恢复链路缺口，不能判定为 `ready` 或 `partial`。
