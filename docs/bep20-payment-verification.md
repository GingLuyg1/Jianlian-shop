# USDT-BEP20 支付验证说明

## 定价快照

`chain_payment_sessions` 保存链上支付单，同时保存支付创建时的定价证据：

- `order_currency`
- `order_amount`
- `payment_currency=USDT`
- `exchange_rate`
- `exchange_rate_source`
- `exchange_rate_fetched_at`
- `exchange_rate_expires_at`
- `expected_amount`
- `expected_raw_amount`
- `pricing_status`

示例：

```text
69 CNY / 7.2 CNY-USDT = 9.583333... USDT
USDT_AMOUNT_SCALE=6
最终应付 USDT = 9.583334
```

规则：金额向上保留到 `USDT_AMOUNT_SCALE` 位，避免少收。最终链上比较使用 token 最小单位整数，不用 JavaScript 浮点数。

异常：

- 订单金额为 0：拒绝创建。
- 汇率小于等于 0：拒绝创建。
- 汇率 Provider 未接入：拒绝创建。
- 汇率过期：已有会话继续使用冻结金额，新建会话必须重新取服务端汇率。
- 极小金额换算后为 0：拒绝创建。

## TxHash 校验 API

```text
POST /api/payments/bep20/verify
```

请求：

```json
{
  "order": "订单号",
  "tx_hash": "0x..."
}
```

服务端校验：

- 当前登录用户必须拥有该订单。
- 订单支付方式必须是 `usdt_bep20`。
- 订单未支付且未取消。
- TxHash 必须是 `0x` 开头 32 字节哈希。
- BSC RPC `eth_chainId` 必须返回 `56`。
- `eth_getTransactionReceipt` 必须可查。
- `receipt.status` 必须成功。
- 必须解析到指定 USDT 合约的 `Transfer` 日志。
- Transfer `to` 必须是配置的固定收款地址。
- TxHash + logIndex 不能被其他订单使用。
- 金额使用 `expected_raw_amount` 与链上 raw amount 比较。

## 状态映射

- `underpaid`：到账金额低于应付金额。
- `confirming`：金额相等但确认数不足。
- `paid`：金额相等且确认数满足要求。
- `manual_review`：超额到账或过期后到账。
- `failed`：错误合约、错误地址或链上交易失败。

## 支付成功

确认 `paid` 后调用现有：

```text
completePayment()
```

该服务继续调用既有支付完成链路，更新支付会话、订单支付状态、支付记录，并触发现有交付流程。重复提交同一 TxHash 不会重复支付或重复交付。

## 前台展示

`/payment?order=<orderNo>` 展示：

- 订单原币种和原金额。
- 汇率和来源。
- 汇率有效期。
- 应付 USDT。
- 固定收款地址。
- 本地生成的 SVG 地址码。
- TxHash 输入和校验结果。

本地 SVG 不向第三方发送订单号、金额、邮箱或地址。若用户钱包无法扫码，应复制地址转账。

## 测试覆盖

源码回归测试覆盖：

- 69 CNY 固定汇率换算。
- 0 金额拒绝。
- 负汇率拒绝。
- Provider 未接入拒绝。
- 多位小数向上取整。
- 重复创建复用有效会话。
- 页面不再调用第三方 QR 图片服务。
- underpaid / overpaid / paid 状态判断使用最小单位整数。
