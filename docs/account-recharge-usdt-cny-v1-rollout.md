# 账号充值 USDT → CNY V1 上线说明

## 状态

- 本变更只生成候选 Migration，尚未在测试库或正式库执行。
- `profiles.balance` 的业务币种继续固定为 CNY；不创建 USDT wallet 或 `wallet_accounts`。
- 本变更不修改订单 BEP20 支付、推广余额、自动结算或支付渠道启用状态。
- 所有 SQL、部署、每日汇率写入、测试充值与审核入账都需要分别取得明确授权。

## 金额合同

- 管理员每天写入一条市场参考价；数据库以日期主键保证一天一条。
- 结算价为市场参考价向下截取到 1 位，例如 `6.74 → 6.7`。
- 创建充值单时锁定市场价、结算价、来源、日期和时间，之后不可重新换算。
- `expected_usdt_amount` 使用锁定结算价计算并向上保留 6 位，避免预计付款不足。
- 最终入账只使用链上 `actual_received_usdt × locked_settlement_rate`，CNY 在分位向下截取。
- 少付和多付都不是失败；人民币余额按实际到账 USDT 结算。

## 建议执行顺序

1. 单独授权后，在目标环境完整执行只读 precheck。
2. 备份当前应用发布目录并记录数据库恢复点。
3. 单独授权后，完整执行 `20260809120000_account_recharge_usdt_cny_v1.sql`。
4. 立即完整执行只读 postcheck；不是 PASS 时停止部署。
5. 部署本提交代码，但保持 `usdt_bep20` 渠道 disabled。
6. 管理员通过后台为当天写入一次参考价；不得覆盖同日已有值。
7. 分别授权渠道启用、测试充值创建、TxHash 核验、管理员审核和余额核对。

禁止 `supabase db push`、`migration up`、`migration repair`、`db reset` 或批量 Migration。

## 回滚与 forward-fix

- Migration 执行前失败：事务整体回滚，停止部署。
- Migration 成功但代码部署失败：保持 USDT-BEP20 渠道 disabled，回滚应用发布目录；不要删除新增表或字段。
- 代码部署成功但链上核验异常：立即禁用渠道，保留充值单、TxHash 占用和审计证据，使用 forward-fix，不得重复入账。
- 已产生余额流水后不得通过应用回滚撤销。任何余额更正必须走单独授权的财务审计流程。
