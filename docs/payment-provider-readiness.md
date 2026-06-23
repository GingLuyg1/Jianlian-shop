# Jianlian Shop 支付 Provider 接入准备报告

更新日期：2026-06-23

## 最终结论

当前结论：`partial`

支付核心代码框架已经完整接通，可以开始实现真实 Provider 适配器；在以下条件完成前不得开放生产自动到账：

1. 手动执行 `20260623_payment_core_linkage.sql`。
2. 配置服务端 `SUPABASE_SERVICE_ROLE_KEY`。
3. 配置并启用至少一个真实支付渠道。
4. 根据渠道文档实现真实创建、查询、关闭、验签和回调解析。
5. 在支付平台沙箱完成重复回调、金额不一致、币种不一致和自动恢复测试。

## 已完成

- 同一业务有效支付会话复用。
- `pending`、`processing` 会话并发唯一约束。
- 先占用支付会话，再调用 Provider，避免重复调用渠道创建接口。
- 订单和账户充值共用统一支付会话服务。
- Provider 统一接口：`createPayment`、`queryPayment`、`closePayment`、`verifyCallback`、`parseCallback`。
- 支持 `redirect`、`qrcode`、`address` 三种返回类型。
- 支付宝、微信、币安、USDT-TRC20、USDT-BEP20 渠道白名单。
- TRC20 固定对应 TRON，BEP20 固定对应 BSC。
- 统一回调入口：
  - `POST /api/payments/callback`
  - `POST /api/payments/callback/[channel]`
- 回调先验签，再解析、校验会话、金额、币种和渠道交易号。
- 统一支付完成服务 `complete-payment-service`。
- 充值调用受控原子入账 RPC。
- 订单调用受控支付完成 RPC，支付确认后再独立触发数字发货。
- 数字发货失败不会回滚已确认支付。
- 对账恢复与回调共用同一个支付完成服务。
- readiness 接口检查代码链路、数据库表、RPC、唯一索引和渠道配置。

## 仍缺失

- 真实支付平台适配器。
- 真实签名算法。
- 真实回调成功响应格式。
- 真实渠道订单状态字段映射。
- 支付平台沙箱和生产联调结果。
- 定时对账任务的外部调度器。

## 新增 migration

按顺序手动执行：

1. `20260623_payment_provider_core.sql`
2. `20260623_payment_reconciliation_system.sql`
3. `20260623_payment_core_linkage.sql`

此前订单、充值、余额、库存和交付 migration 仍需按项目原执行顺序完成。

`20260623_payment_core_linkage.sql` 新增：

- `reserve_payment_session`
- `complete_order_payment`
- `complete_payment_session`
- `payment_core_readiness_probe`
- 有效支付会话唯一索引
- 支付回调日志状态兼容字段与约束
- service role 调用数字发货所需的管理员函数兼容

SQL 不会由应用自动执行。

## 会话复用

创建流程：

1. 服务端读取真实业务单。
2. 服务端读取已启用渠道。
3. RPC 过期旧会话。
4. RPC 原子查询或创建有效会话占位。
5. 只有成功创建占位的请求调用 Provider。
6. 并发请求直接复用已存在会话。
7. Provider 创建失败时会话标记为 `failed`，允许后续重建。

有效状态仅为：

- `pending`
- `processing`

终态：

- `paid`
- `failed`
- `expired`
- `closed`

## Provider 接口

当前 Provider 是明确失败的占位实现：

- 不模拟支付成功。
- 不生成二维码。
- 不生成钱包地址。
- 不生成渠道交易号。
- 返回稳定错误码 `PROVIDER_NOT_CONFIGURED`。

真实 Provider 接入后只替换适配器，不修改支付业务层。

## 回调处理

统一回调流程：

1. 读取原始请求体。
2. 校验渠道白名单。
3. 加载渠道 Provider。
4. 写入 `received` 回调日志。
5. 执行 `verifyCallback`。
6. 执行 `parseCallback`。
7. 标准化渠道状态。
8. 匹配支付会话。
9. 校验金额、币种和交易号。
10. 调用统一支付完成服务。
11. 更新脱敏回调日志。

回调日志状态：

- `received`
- `verified`
- `signature_failed`
- `parsed`
- `amount_mismatch`
- `currency_mismatch`
- `duplicate`
- `business_not_found`
- `processing_failed`
- `success`

## 支付成功分发

### 账户充值

调用：

`complete_account_recharge`

同一事务完成：

- 锁定充值单。
- 校验金额、币种和交易号。
- 更新充值状态。
- 增加用户余额。
- 写入余额流水。

重复调用返回原结果，不重复增加余额。

### 商品订单

调用：

`complete_order_payment`

同一事务完成：

- 锁定订单。
- 校验金额和币种。
- 校验渠道交易号。
- 检查并扣减非数字库存。
- 更新订单支付状态。
- 写入订单支付记录。
- 写入订单状态日志。

事务完成后调用数字发货。数字发货失败只记录错误，订单仍保持已支付。

## 对账自动恢复

当渠道查询结果为 `paid`：

1. 校验金额。
2. 校验币种。
3. 校验渠道交易号。
4. 调用统一 `completePayment`。
5. 成功后对账结果标记为 `resolved`。

金额或币种不一致进入 `manual_review`。本站已支付、渠道未支付不会自动回滚。

## readiness 接口

接口：

`GET /api/admin/payments/readiness`

仅超级管理员可访问。检查：

- 关键表和字段。
- 有效会话唯一索引。
- 会话占用 RPC。
- 充值入账 RPC。
- 订单支付完成 RPC。
- 统一支付完成 RPC。
- Provider 接口完整性。
- 按渠道回调入口。
- 对账恢复调用链。
- service role 配置状态。
- 渠道启用和配置状态。

状态规则：

- `blocked`：数据库、service role 或核心代码链路缺失。
- `partial`：核心链路完整，但真实 Provider 未配置。
- `ready`：核心链路和 Provider 配置完成。生产开放前仍需沙箱验收。

## 必须配置的环境变量

基础：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

真实 Provider 变量名称按渠道文档确定，至少需要：

- API 基础地址
- 商户号或 App ID
- API Key
- 签名密钥或公私钥
- 回调验签参数
- 查询和关闭接口凭据

## 真实 Provider 仍需提供

- 创建支付接口
- 查询支付接口
- 关闭支付接口
- 回调地址要求
- 签名和验签算法
- 回调成功响应格式
- 渠道代码
- 金额单位
- 币种精度
- 订单有效期
- IP 白名单
- 沙箱环境
- 商户号
- 密钥类型与轮换规则

## 接入前最后检查

- [ ] 所有 payment migration 已手动执行。
- [ ] readiness 数据库检查无阻塞项。
- [ ] service role 仅配置在服务端。
- [ ] 至少一个真实 Provider 已配置。
- [ ] 创建支付沙箱测试通过。
- [ ] 查询支付沙箱测试通过。
- [ ] 关闭支付沙箱测试通过。
- [ ] 回调验签测试通过。
- [ ] 重复回调幂等测试通过。
- [ ] 金额和币种不一致测试通过。
- [ ] 充值只入账一次。
- [ ] 订单只确认支付一次。
- [ ] 数字库存只交付一次。
- [ ] 对账自动恢复测试通过。

