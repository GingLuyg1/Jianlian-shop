# Jianlian Shop 支付 Provider 接入准备报告

检查日期：2026-06-23  
范围：支付会话、充值、余额流水、回调验签框架、支付渠道配置、后台运维能力。  
说明：本次没有接入真实支付平台，没有模拟支付成功，也没有执行 Supabase SQL。

## 最终结论

**有条件可以开始接入真实 Provider。**

当前已经补齐真实 Provider 接入前需要的核心框架：支付会话表 migration、统一 Provider 接口、创建/查询/关闭支付会话 API、回调验签入口、充值原子入账 RPC migration、余额流水兼容、后台 readiness 自检接口。  
但在正式接入生产 Provider 前，仍必须先完成：

1. 在 Supabase SQL Editor 手动执行新增 migration。
2. 配置 `SUPABASE_SERVICE_ROLE_KEY`。
3. 配置真实 Provider 的商户号、API 地址、签名密钥和回调验签参数。
4. 用真实 Provider 沙箱跑通创建支付、查询、关闭、回调、重复回调和金额不一致场景。
5. 确认 payment_channels 的公开字段不会暴露密钥，只向前端返回白名单安全字段。

如果上述条件未完成，仍不能开放真实自动到账。

## 已完成模块

- `payment_channels`：五个渠道配置框架，默认 disabled。
- `account_recharges`：账户充值单结构。
- `order_payments`：人工支付凭证记录。
- `payment_callback_logs`：支付回调日志。
- `payment_reconciliations`：支付对账记录。
- `balance_transactions`：余额流水兼容表。
- `credit_account_recharge_balance`：已有余额入账函数。
- `payment_sessions`：新增兼容 migration，支持会话生命周期。
- `complete_account_recharge`：新增可信服务端充值原子入账 RPC。
- `/api/payments/create`：统一创建支付会话接口。
- `/api/payments/status/[sessionNo]`：支付会话状态查询接口。
- `/api/payments/close`：用户关闭未支付会话接口。
- `/api/payments/callback`：Provider 回调验签框架。
- `/api/admin/payments/readiness`：后台支付接入自检接口。

## 仍缺失模块

- 真实 Provider adapter：当前 `generic_api`、`binance`、`crypto_address` 都是明确不可用占位实现。
- 真实签名算法：需要 Provider 文档后实现。
- 真实查询/关闭接口：需要 Provider 文档后实现。
- 真实回调字段映射：需要 Provider 文档后实现。
- 订单自动支付成功联动：当前回调框架不绕过现有订单库存规则，订单仍保留人工确认路径。
- 生产级密钥存储方案：当前只检查环境变量和配置字段，不保存真实密钥。

## 支付 migration 执行顺序

新环境建议按顺序手动执行：

1. `supabase/profiles.sql`
2. `supabase/schema.sql`
3. `supabase/orders-schema.sql`
4. `supabase/migrations/20260620_order_payments.sql`
5. `supabase/migrations/20260620_digital_inventory_delivery.sql`
6. `supabase/migrations/20260622_digital_delivery_hardening.sql`
7. `supabase/migrations/20260623_mixed_order_item_fulfillment.sql`
8. `supabase/migrations/20260622_super_admin_payment_console.sql`
9. `supabase/migrations/20260623_payment_reconciliation_system.sql`
10. `supabase/migrations/20260623_payment_balance_transactions_compatibility.sql`
11. `supabase/migrations/20260623_payment_provider_core.sql`
12. `supabase/migrations/20260623_admin_audit_logs.sql`
13. `supabase/migrations/20260623_digital_inventory_batches.sql`

`20260622_recharge_records.sql` 与当前主链路 `account_recharges` 存在重复，建议保留为 legacy，不纳入新的自动支付主链路。

## 支付表结构检查结果

| 表 | 当前用途 | 本次结论 |
| --- | --- | --- |
| `order_payments` | 人工订单支付凭证 | 保留，不作为 Provider 会话表 |
| `account_recharges` | 账户充值单 | 继续作为充值业务单主表 |
| `payment_channels` | 渠道配置 | 新增 `configured`、`public_config`、`provider_config`、`secret_config` 兼容字段 |
| `payment_sessions` | Provider 支付会话 | 新增 migration 创建 |
| `payment_callback_logs` | 回调日志 | 复用，回调只保存脱敏摘要 |
| `balance_transactions` | 余额流水 | 已有兼容 migration，继续复用 |
| `payment_reconciliations` | 支付对账 | 继续复用 |
| `profiles` | 用户余额 | `complete_account_recharge` 在事务中更新 `profiles.balance` |

## Provider 接口说明

统一接口位于 `lib/payments/channel-types.ts` 和 `lib/payments/providers.ts`：

- `createPayment()`
- `queryPayment()`
- `closePayment()`
- `verifyCallback()`
- `parseCallback()`

支持结果类型：

- `redirect`
- `qrcode`
- `address`

支持渠道代码：

- `alipay`
- `wechat`
- `binance_pay`
- `usdt_trc20`
- `usdt_bep20`

TRC20 与 BEP20 分别通过 `usdt_trc20` 和 `usdt_bep20` 独立处理，不混用网络。

当前 Provider 是未配置占位实现，只会返回“渠道尚未配置”，不会生成假二维码、假地址或假支付链接。

## 回调验签说明

`POST /api/payments/callback` 已建立框架：

1. 读取原始请求体。
2. 根据 `channel` 参数或 `x-payment-channel` 头选择渠道。
3. 调用 Provider `verifyCallback()`。
4. 验签失败只写脱敏日志，不更新支付状态。
5. 验签通过后调用 `parseCallback()`。
6. 校验业务单、金额、币种和渠道交易号。
7. 重复回调不会重复入账。
8. 充值回调用 `complete_account_recharge` 入账。
9. 当前不绕过订单人工确认和库存规则。

## 充值原子入账说明

新增 `complete_account_recharge` RPC：

- 只能由 `service_role` 调用。
- 锁定充值单。
- 校验状态、金额、币种、渠道交易号唯一性。
- 调用现有 `credit_account_recharge_balance`。
- 同一充值单重复调用返回已有结果，不重复增加余额。
- 失败时事务整体回滚。

## 余额流水说明

`balance_transactions` 继续作为余额流水表：

- 用户只能读取自己的流水。
- 管理员只读全部流水。
- 浏览器不能直接写入。
- 入账与余额更新在数据库事务中完成。
- 同一 `account_recharge` 业务只允许一条 completed 流水。

## 渠道配置与 RLS 说明

支付渠道要求：

- 五个渠道默认 disabled。
- 前台只展示 enabled 渠道的安全字段。
- 商户号、API Key、签名密钥不能返回浏览器。
- 密钥未重新填写时，后台保存不能清空旧值。
- 普通用户不能修改渠道配置。
- 管理员修改渠道配置必须走服务端校验并写审计日志。

RLS 检查 SQL：

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('payment_sessions','payment_channels','account_recharges','balance_transactions');

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('payment_sessions','payment_channels','account_recharges','balance_transactions')
order by tablename, policyname;
```

## Readiness 接口说明

`GET /api/admin/payments/readiness`：

- 仅 admin 可访问。
- 不返回任何密钥内容。
- 检查关键表字段是否可查询。
- 检查渠道是否启用并配置。
- 检查 `SUPABASE_SERVICE_ROLE_KEY` 是否配置。
- 检查回调/内部对账密钥是否配置。
- 返回 `ready`、`partial` 或 `blocked`。

## 必须配置的环境变量

基础：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

支付安全：

```text
PAYMENT_CALLBACK_SECRET
INTERNAL_PAYMENT_RECONCILE_KEY
```

真实 Provider 接入后按渠道补充，例如：

```text
ALIPAY_API_BASE_URL
ALIPAY_MERCHANT_ID
ALIPAY_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
WECHAT_API_BASE_URL
WECHAT_MERCHANT_ID
WECHAT_API_KEY
BINANCE_PAY_API_BASE_URL
BINANCE_PAY_MERCHANT_ID
BINANCE_PAY_SECRET_KEY
USDT_TRC20_PROVIDER_API_BASE_URL
USDT_BEP20_PROVIDER_API_BASE_URL
```

实际变量名以选定 Provider 文档为准。

## 接真实 Provider 前最后检查

- [ ] 新增 migration 已在 Supabase SQL Editor 执行。
- [ ] `/api/admin/payments/readiness` 返回 `partial` 或 `ready`，不是 `blocked`。
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已配置在服务端。
- [ ] 支付渠道密钥不会返回前端。
- [ ] Provider 沙箱创建支付成功。
- [ ] Provider 沙箱查询支付成功。
- [ ] Provider 沙箱关闭支付成功。
- [ ] Provider 沙箱回调验签成功。
- [ ] 回调金额不一致会拒绝入账。
- [ ] 重复回调不会重复入账。
- [ ] 同一充值单不会重复增加余额。
- [ ] 余额流水与用户余额一致。
- [ ] 订单支付成功联动方案确认后再启用自动订单 paid。

## 测试场景清单

1. 未登录创建支付会话返回 401。
2. 用户为他人订单/充值单创建支付会话返回 400/403。
3. 渠道 disabled 时无法创建会话。
4. 渠道未配置 Provider 时不返回假付款信息。
5. 同一未过期业务单重复创建会话时复用。
6. 过期会话标记 expired 后允许重建。
7. 已支付业务单不能重复创建会话。
8. 验签失败回调不更新任何状态。
9. 金额不一致回调不入账。
10. 重复回调不重复入账。
11. `complete_account_recharge` 重复调用不重复加余额。
12. readiness 缺表时显示中文说明，不白屏。

## 存在风险

- 未执行 migration 前，线上 readiness 会显示 blocked。
- Provider adapter 仍未接真实平台，不能自动收款。
- 订单自动 paid 仍需单独确认库存/发货事务方案。
- `payment_channels` 如果直接暴露整行给前端，会有列级泄露风险，必须使用白名单 API。
- 旧 `recharge_records` 与主链路 `account_recharges` 并存，后续应明确废弃或迁移。

## 结论

**有条件可以接入真实 Provider。**

条件是：先手动执行新增 migration，配置服务端密钥和真实 Provider 参数，再用沙箱完成创建、查询、关闭、回调、重复回调、金额不一致和入账幂等测试。未完成这些条件前，不应开放生产自动到账。
