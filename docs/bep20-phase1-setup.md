# USDT-BEP20 链上收款第一阶段配置

更新时间：2026-07-04

## 实现范围

第一阶段只实现：

- 固定 USDT-BEP20 收款地址。
- 创建链上支付单。
- 前台展示 BNB Smart Chain / USDT / 收款地址 / 应付 USDT。
- 用户提交 TxHash。
- 服务端通过 BSC RPC 查询交易回执。
- 解析 USDT `Transfer(address,address,uint256)` 日志。
- 校验合约、收款地址、金额、确认数和重复 TxHash。
- 确认到账后调用现有 `completePayment()`，复用订单支付完成和交付流程。

本阶段不实现独立地址、私钥管理、助记词、钱包生成、自动监听、自动归集、自动转账、自动退款或链上签名服务。

## 必须手动执行的 Migration

```text
supabase/migrations/20260704_bep20_chain_payment_phase1.sql
```

该 migration 创建或补齐：

- `chain_payment_sessions`
- `chain_transactions`
- BEP20 定价快照字段
- TxHash + logIndex 唯一约束
- RLS 只读策略
- 阻止浏览器直接写入链上支付记录

Codex 不会自动执行该 SQL。

## 服务端环境变量名称

只能配置在服务端环境，不得使用 `NEXT_PUBLIC_*`：

```text
BSC_RPC_URL
BSC_CHAIN_ID
BSC_USDT_CONTRACT
BSC_USDT_DECIMALS
BSC_RECEIVE_ADDRESS
BSC_REQUIRED_CONFIRMATIONS
BSC_PAYMENT_EXPIRE_MINUTES
BSC_EXPLORER_BASE_URL
USDT_PRICING_MODE
CNY_USDT_FIXED_RATE
CNY_USDT_RATE_TTL_SECONDS
USDT_AMOUNT_SCALE
```

建议值：

- `BSC_CHAIN_ID=56`
- `BSC_USDT_DECIMALS=18`
- `BSC_REQUIRED_CONFIRMATIONS=12`
- `BSC_PAYMENT_EXPIRE_MINUTES=30`
- `USDT_PRICING_MODE=manual_fixed_rate`
- `CNY_USDT_RATE_TTL_SECONDS=300`
- `USDT_AMOUNT_SCALE=6`

`BSC_USDT_CONTRACT` 必须使用官方确认的 BNB Smart Chain USDT 合约地址。`BSC_RECEIVE_ADDRESS` 必须是专用固定收款地址。

## CNY 到 USDT 定价

如果订单币种是 `USDT`，系统直接冻结订单 USDT 金额，不重复换算。

如果订单币种是 `CNY`，系统使用服务端汇率换算：

```text
CNY 金额 / CNY_USDT_FIXED_RATE = USDT 应付金额
```

当前支持：

- `manual_fixed_rate`：读取服务端固定 CNY/USDT 汇率。
- `provider_rate`：预留真实汇率 Provider 接口；Provider 未接入时拒绝创建支付单。

支付单创建后会冻结：

- 订单原币种
- 订单原金额
- 支付币种 `USDT`
- 汇率
- 汇率来源
- 汇率获取时间
- 汇率有效期
- 应付 USDT 金额

页面刷新和重复创建请求不会重新换算已有有效支付单。

## 正式链上测试前人工步骤

1. 审核并执行 `20260704_bep20_chain_payment_phase1.sql`。
2. 配置 `BSC_RPC_URL`。
3. 配置 `BSC_CHAIN_ID=56`。
4. 配置官方确认过的 USDT BEP20 合约。
5. 配置专用固定收款地址。
6. 配置确认数。
7. 配置订单过期时间。
8. 配置 `USDT_PRICING_MODE=manual_fixed_rate` 和 `CNY_USDT_FIXED_RATE`，或接入真实汇率 Provider。
9. 重启应用。
10. 创建小额测试订单。
11. 使用另一钱包发送真实 USDT-BEP20。
12. 提交 TxHash。
13. 检查确认数。
14. 检查订单支付状态。
15. 检查 `chain_transactions` 唯一记录。
16. 检查是否只交付一次。

## 禁止操作

- 不自动执行 migration。
- 不自动写入真实环境变量。
- 不自动发起链上转账。
- 不自动部署生产服务器。
- 不把 RPC URL、私钥、助记词或环境变量值返回浏览器。
