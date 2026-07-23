# 当前任务：BEP20 支付与超额自动结算发布前验收

## 2026-07-23：BEP20 欠额支付确认状态缺口 Hotfix

- 分支：`fix/bep20-underpayment-confirmation-state`
- 基线：`af2b77b862ec5466a88a6e0ada68adac79a42a58`
- 运行时目标：确认数检查必须早于欠额/超额分类；最终 `underpaid` 首次写入服务端核验时间 `confirmed_at`。
- 数据修复目标：新增严格、幂等、fail-closed 的 `20260730` Migration，仅补 `confirmed_at`，不调用结算 RPC、不改变订单/支付/余额/库存/处置记录。
- 状态：Migration 未执行，正式目标订单未处理，欠额自动 Cron 未配置，管理员前端入口未完成；正式发布与数据处理等待人工授权。

更新日期：2026-07-22
目标项目：Jianlian-shop / `qvbovrvybirscaurwuov`

## 当前结论

- 当前 HEAD 为 `88b64e40b41e26a80218f9b993d1a6f8fc75896a`，与 `origin/main` 一致；支付、交付、Migration、测试和文档改动仍全部未提交。
- 有效期内精确足额付款使用链上区块时间和最早付款截止时间判断；`exchange_rate_expires_at` 不再否定已冻结订单金额。
- 有效期内合法超额付款使用未执行的 `20260727_bep20_automatic_overpayment_settlement.sql` 原子完成付款和余额入账，随后才调用数字交付。
- 过期订单普通用户自助 TxHash 入口已关闭；少付、迟到账、错误网络/合约/地址和多笔匹配 Transfer 不自动完成。
- 支付页、订单详情和抽屉复用安全交付组件；终态隐藏倒计时与无效确认进度。
- 发布前总审计已补充余额溢出保护、自动/人工超额结算串行锁、订单/充值跨业务 TxHash 保护，以及数据库成功但 HTTP 响应丢失的恢复逻辑。

## 尚未执行

- `20260727_bep20_automatic_overpayment_settlement.sql` 尚未在任何正式环境执行。
- 当前运行时代码尚未 commit、push 或部署。
- 尚未进行新的精确付款、自动超额付款、重复 TxHash 和跨业务 TxHash 正式验收。
- 未修改正式数据库、环境变量、Vault、Cron、订单、付款或交付数据。

## 下一步（仅保留发布流程）

1. 人工审查当前全部未提交 diff、只读审计 SQL 和上线手册。
2. 在正式项目人工执行 `production-bep20-automatic-overpayment-readonly-audit.sql` 的 preflight 查询，确认所有阻断计数为 0。
3. 单独授权后先执行 20260727 Migration，并完成函数权限、触发器、约束和财务一致性 postcheck。
4. Migration 通过后，由经营者确认两项正式阈值，并通过受保护配置 RPC 写入；Query 11 必须确认两个 private number value 有效。
5. 再提交、推送、构建并部署当前应用代码。
6. 依次完成最低金额精确付款、阈值内超额付款、超限人工审核、重复 TxHash、跨订单/充值冲突、余额账变和数字交付只读验收。
7. 任一账本、disposition、订单、支付或交付数量不一致时立即停止，不继续下一笔测试。

## 当前发布风险

- 未执行 20260727 Migration 前禁止部署会调用自动结算 RPC 的代码。
- `20260727` 已复用私有 `site_settings` 增加绝对 USDT 与超额比例双阈值；阈值初始为 null，任何缺失、格式错误或非正数都 fail closed 到 `manual_review`。建议讨论值 `20 / 2.0` 尚未经经营者确认，正式配置前不得启用自动超额验收。
- 旧三参数人工超额 RPC 已在未执行 Migration 中替换为四参数 service-role-only 签名；管理员 Route 先验证 Cookie super-admin，再显式使用 service-role client。Migration 到新应用 Ready 期间必须冻结人工超额入账操作。
- 正式结构必须由目标项目只读审计确认，不能从仓库 Migration 文件存在推断已经执行。

## 当前禁止事项

- 不执行 SQL、RPC、Migration 或生产 API。
- 不创建订单、付款、人工审核或交付。
- 不修改正式数据库、环境变量、Vault 或 Cron。
- 不部署、不 commit、不 push，不丢弃当前工作区修改。
