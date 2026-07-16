# 账户充值流程验收

更新时间：2026-07-04

## 当前充值调用链路

用户在账户充值页选择金额和渠道后，前端调用 `POST /api/recharges`。接口要求登录用户，会校验请求大小、频率、账户状态、金额、币种、支付渠道和 `client_request_id`。服务端重新读取 `payment_channels`，只允许 `enabled = true` 且 `configured = true` 的渠道创建充值单。

创建成功后写入 `account_recharges`，包含充值单号、用户、渠道、币种、申请金额、手续费、应付金额、状态、幂等请求号、审核模式和用户备注。手工审核渠道进入 `waiting_payment`，用户随后通过 `POST /api/recharges/[rechargeNo]/proof` 提交付款凭证。自动 Provider 渠道仍走统一 Provider 创建链路，未配置 Provider 时不会生成假二维码、假地址或假交易号。

管理员在后台支付管理详情中查看充值扩展信息，并通过 `POST /api/admin/recharges/[rechargeId]/actions` 执行开始审核、通过、驳回、要求补充凭证、取消或重新处理失败入账。审核通过后调用受控 RPC `complete_account_recharge` 执行余额原子入账。

## 充值状态机结果

统一状态：

- `pending`：刚创建。
- `waiting_payment`：等待用户付款或上传凭证。
- `submitted`：用户已提交凭证。
- `reviewing`：管理员审核中。
- `approved`：审核通过，等待入账或可重试入账。
- `processing`：正在执行余额入账。
- `succeeded`：最终成功。
- `failed`：处理失败。
- `rejected`：审核驳回。
- `cancelled`：已取消。
- `expired`：已过期。

兼容旧状态：`paid` 映射为 `succeeded`，`closed` 映射为 `cancelled`。

## 用户充值申请结果

- 登录校验：已接入。
- 金额校验：服务端校验正数、最低金额和可选最高金额。
- 币种校验：请求币种必须与渠道币种一致。
- 渠道校验：服务端只接受已启用且已配置渠道。
- 幂等保护：`client_request_id` 绑定用户唯一，重复请求返回已有充值单；覆盖 `pending`、`waiting_payment`、`submitted`、`reviewing`、`approved`、`processing`、`failed`、`rejected`、`succeeded` 和旧 `paid`。
- 备注限制：最多 500 字符。

## 支付方式结果

充值渠道继续复用 `payment_channels`。前台只展示启用渠道，接口会再次校验 `configured`。未配置渠道返回“支付渠道暂未开放”，不会创建假支付结果。

手工审核渠道通过 `payment_channels.public_config.review_mode = "manual"` 或等效配置识别。自动 Provider 渠道必须有真实 Provider 配置，否则返回安全中文错误。

## 支付凭证结果

新增凭证提交接口：

- 路由：`POST /api/recharges/[rechargeNo]/proof`
- 允许状态：`pending`、`waiting_payment`、`submitted`、`rejected`
- 仅允许本人充值单。
- 仅允许手工审核渠道。
- 文件类型：`jpg`、`jpeg`、`png`、`webp`、`pdf`
- 单文件最大 5MB。
- 单充值单最多 3 个凭证文件。
- 存储路径：`payment-proofs/<user-id>/recharges/<recharge-id>/<filename>`
- 文件名使用安全随机前缀，不使用用户原始文件名作为可信路径。
- 凭证提交不会增加余额，也不会把充值标记为成功。

## 管理员审核结果

新增管理员审核动作：

- `start_review`
- `approve`
- `reject`
- `request_more_proof`
- `cancel`
- `retry_credit`

审核通过、驳回、要求补充凭证和取消必须填写原因。审核通过要求存在真实交易流水号或 Provider 交易号。所有操作写入 `recharge_review_events`，并调用管理员审计日志服务记录成功或失败。

## 余额原子入账结果

审核通过后调用 RPC：

```text
complete_account_recharge(
  p_recharge_id,
  p_provider_transaction_id,
  p_paid_amount,
  p_currency
)
```

RPC 负责锁定充值单、校验状态、金额、币种和交易号唯一性，更新充值状态，增加用户余额并写入余额流水。当前代码不通过前端直接修改余额。

## 重复入账保护结果

- 用户重复创建：通过 `client_request_id` 和唯一索引保护。
- 管理员重复点击审核通过：审核服务先读取最新状态，RPC 负责最终幂等。
- Provider 重复回调：由统一支付回调和 `complete_account_recharge` 的交易号唯一性保护。
- 入账失败：充值回到 `approved`，记录 `exception_type = credit_failed` 和安全错误摘要，可由管理员重试。

## 用户充值记录结果

用户记录接口 `GET /api/recharges` 只查询当前登录用户，支持状态和渠道筛选。记录展示充值单号、金额、渠道、状态、创建时间、完成时间、驳回或失败原因。不会展示 Provider 密钥、完整回调内容或管理员内部敏感备注。

## 余额流水结果

余额流水仍由 `complete_account_recharge` 在同一事务内写入。新增代码不提供任何浏览器直写余额流水的入口。

## 权限与审计结果

- 普通用户只能创建和查看自己的充值、提交自己的凭证。
- 普通用户不能审核、不能修改充值状态、不能增加余额。
- 管理员接口要求超级管理员。
- 管理员操作写入 `admin_audit_logs`。
- 充值审核事件写入 `recharge_review_events`。

## 需要手动执行的 Migration

必须先执行：

```text
supabase/migrations/20260704_recharge_review_flow.sql
```

并确认此前支付、充值、余额 RPC 相关 migration 已执行，尤其是 `complete_account_recharge`。

## 需要人工配置的支付渠道

在 `payment_channels` 中为可用渠道设置：

- `enabled = true`
- `configured = true`
- `public_config.review_mode = "manual"` 或真实 Provider 配置
- `min_amount` / `minimum_amount`
- 可选 `public_config.maximum_amount`

未完成配置的渠道会显示或返回“暂未开放”。

## 仍存在的问题

- 本次不接入真实 Provider，因此自动回调只能通过既有 Provider 框架等待真实渠道实现。
- `payment-proofs` Bucket 需要在 Supabase 手动创建，并配置为私有访问。
- 充值审核后台现在在支付详情抽屉旁增加审核面板，后续可进一步整合到抽屉内部。
