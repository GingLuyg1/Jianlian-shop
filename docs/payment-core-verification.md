# 支付核心链路联调与验收报告

## 测试环境

- 项目：Jianlian Shop
- 日期：2026-06-29
- 范围：支付会话、回调验签、订单支付、账户充值、幂等处理、自动发货触发、自动对账入口
- 限制：未接入真实 Provider，未模拟支付成功，未自动执行 Supabase SQL，未启动开发服务

## 数据库结构结果

已检查的核心表和 migration：

| 模块 | 主要表 | migration |
| --- | --- | --- |
| 统一支付会话 | `payment_sessions` | `20260623_payment_provider_core.sql` |
| 支付渠道 | `payment_channels` | `20260622_super_admin_payment_console.sql`, `20260623_payment_provider_core.sql` |
| 支付回调日志 | `payment_callback_logs` | `20260622_super_admin_payment_console.sql` |
| 订单支付 | `orders`, `order_items`, `order_payments` | `20260620_order_payments.sql`, `20260623_payment_provider_core.sql` |
| 账户充值 | `account_recharges` | `20260622_recharge_records.sql`, `20260623_payment_provider_core.sql` |
| 余额流水 | `balance_transactions` | `20260623_payment_balance_transactions_compatibility.sql` |
| 自动发货 | `digital_inventory`, `order_deliveries`, `delivery_logs` | `20260620_digital_inventory_delivery.sql`, `20260622_digital_delivery_hardening.sql` |
| 对账记录 | `payment_reconciliations` | `20260623_payment_reconciliation_system.sql` |
| 对账运行记录 | `payment_reconciliation_runs`, `payment_reconciliation_logs` | `20260629_payment_reconciliation_runs_logs.sql` |
| 管理员审计 | `admin_audit_logs` | `20260623_admin_audit_logs.sql` |

`payment_sessions` 已具备支付单号唯一约束、有效业务单唯一会话约束、Provider 订单号和交易号唯一约束。金额字段使用 `numeric(18,6)`，币种字段由服务端业务和渠道配置确认。

## 支付状态机

新增统一服务：

```text
lib/payments/payment-status-machine.ts
```

统一映射：

| 规范状态 | 当前存储兼容 |
| --- | --- |
| `created` | `pending` |
| `pending` | `pending` |
| `processing` | `processing` |
| `succeeded` | `paid` |
| `failed` | `failed` |
| `expired` | `expired` |
| `closed` | `closed` |

已限制的非法流转：

- `succeeded` 不允许回退为 `pending` 或 `processing`
- `failed`、`expired`、`closed` 不允许由普通回调直接变为 `succeeded`
- 只有后续对账补偿流程才允许恢复类成功处理
- 非法流转返回中文错误，不直接写库

## 支付会话复用

检查结果：

- 同一业务单的 `pending` / `processing` 会话优先复用。
- 已支付业务拒绝再次创建支付会话。
- 切换渠道时关闭旧会话后创建新会话。
- 金额、币种、手续费由服务端业务和渠道配置计算。
- Provider 未配置时返回“支付渠道未配置”，不生成假二维码或假地址。

仍需真实 Provider 接入后复测：Provider 创建支付返回值、Provider 订单号写入、支付地址展示。

## 回调验签

统一入口：

```text
app/api/payments/callback/[channel]/route.ts
lib/payments/payment-callback-service.ts
```

验收结果：

- 渠道参数必须在允许列表内。
- Provider 未配置时 `verifyCallback` 不会伪造成功。
- 缺失或错误签名不会更新支付状态。
- 回调 payload 只保存脱敏摘要。
- 回调处理异常不返回数据库堆栈或密钥信息。
- 回调非成功状态更新已接入统一状态机。

## 金额币种校验

回调完成业务前校验：

- 支付会话匹配
- 支付金额一致
- 支付币种一致
- Provider 交易号由数据库唯一约束保护
- 订单支付和充值支付通过 `business_type` 分流到对应 RPC

修复项：

- 金额不一致写入 `payment_reconciliations` 异常记录。
- 币种不一致写入 `payment_reconciliations` 异常记录。
- 非法状态流转写入 `payment_reconciliations` 人工复核记录。

## 订单支付幂等

订单支付成功通过 `complete_payment_session` RPC 进入 `complete_order_payment`。

检查结果：

- RPC 使用行锁处理支付会话。
- 已 `paid` 会话重复调用返回幂等结果。
- 订单已支付时重复调用不会重复更新支付。
- `order_payments.payment_no` 使用唯一冲突处理。
- Provider 交易号唯一约束防止同一交易号绑定多个支付会话。
- 自动发货失败不会回滚已成功支付。

## 充值入账幂等

充值通过 `complete_payment_session` RPC 进入 `complete_account_recharge`。

检查结果：

- 充值单行锁保护。
- 已支付充值重复调用返回幂等结果。
- `balance_transactions` 存在业务唯一约束。
- 余额更新、充值状态、流水写入由 RPC 在同一事务内完成。
- 普通浏览器不能直接使用 service role 调用可信写入。

## 自动发货幂等

订单支付完成后由服务端调用现有自动发货逻辑。

检查结果：

- 自动发货只在服务端支付完成流程后触发。
- 数字库存已交付记录不会再次恢复为可用。
- 自动发货错误被记录到支付会话错误摘要，不回滚支付。
- 混合订单交付状态由订单项维度维护。

仍需真实数据复测：库存充足、库存不足、重复回调、混合订单人工交付组合。

## 支付对账结果

统一服务：

```text
lib/payments/reconciliation-service.ts
```

内部入口：

```text
POST /api/internal/payments/reconcile
```

验收结果：

- 使用 `PAYMENT_RECONCILIATION_SECRET` 或 `INTERNAL_API_SECRET` 保护。
- 缺少密钥或密钥错误返回 `403`。
- 同一进程内互斥执行，重复调用返回 `429`。
- Provider 未配置时不会伪造查询结果。
- 对账补偿经过统一服务和 RPC。
- 每次运行可写入 `payment_reconciliation_runs`。
- 单次错误摘要可写入 `payment_reconciliation_logs`。
- migration 未执行时运行记录写入失败会降级，不影响对账主流程。

## 定时任务方案

已新增：

```text
docs/payment-reconciliation-cron.md
```

建议生产每 5 分钟执行一次，使用服务器环境变量提供密钥，不自动修改 Crontab。

## 已修复的问题

1. 回调接口可绕过统一状态流转直接写入非成功状态。
2. 回调成功前缺少明确的终态保护，失败、关闭、过期会话可能进入后续完成流程。
3. 金额和币种异常仅写回调日志，不利于支付异常后台追踪。
4. 内部对账接口没有持久化运行记录，定时任务和排障缺少审计证据。

## 仍存在的问题

1. 当前数据库仍以 `paid` 作为成功支付存储状态，`succeeded` 通过服务层映射兼容，暂未改动历史约束。
2. 真实 Provider 未接入，无法完成真实验签、真实渠道查询和真实回调格式验收。
3. `failed`、`expired`、`closed` 到成功的恢复仍依赖对账服务和现有 RPC 能力；如果需要恢复终态会话，需要新增专用补偿 RPC 并保留人工复核记录。

## 真实 Provider 接入前置条件

- Provider 商户号、App ID、API 地址、回调地址
- 验签公钥或回调签名密钥
- 查询订单接口文档
- 关闭支付接口文档
- Provider 成功、失败、处理中、关闭、退款状态枚举
- 金额精度和币种规则
- 回调响应格式要求
- IP 白名单或回调来源校验规则

## 需要执行的 migration

```text
supabase/migrations/20260629_payment_reconciliation_runs_logs.sql
```

执行后检查：

```sql
select to_regclass('public.payment_reconciliation_runs');
select to_regclass('public.payment_reconciliation_logs');
```

预期均返回对应表名。
