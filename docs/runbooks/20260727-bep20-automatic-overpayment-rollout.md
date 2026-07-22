# 20260727 BEP20 超额自动结算上线手册

> 本手册只用于人工执行准备。正式上线前必须由操作者再次确认项目、文件哈希、部署版本和测试订单。不得把密钥、完整 TxHash、钱包地址或交付正文粘贴到工单、聊天或日志。

## 目标与边界

- 正式 Supabase：`Jianlian-shop` / Project ref `qvbovrvybirscaurwuov`。
- Migration：`supabase/migrations/20260727_bep20_automatic_overpayment_settlement.sql`。
- 本轮发布前审计基准 SHA-256：`781E13D1FEDAE804107F4B59BC179F57B925269538BA0CE164A1E05069E130F2`。任何后续修改都会使该值失效，正式执行前必须重新计算并逐字核对。
- 功能：有效期内、单一匹配 Transfer、达到确认数的 BEP20 超额付款，原子完成订单并按订单冻结汇率把超额 CNY 记入既有余额账本。
- 不改变：少付、迟到账、错误网络/合约/地址、多 Transfer 的人工处理边界；过期订单不恢复用户自助 TxHash 提交。
- 不自动处理历史超额订单，不回填历史余额。

## 唯一推荐发布顺序

选择“先 Migration 和风险阈值配置，后应用部署”。新运行时代码会调用新 RPC；若先部署代码，合法超额付款会因 RPC 不存在进入可重试失败状态。Migration 会把旧三参数人工入账 RPC 收紧为新的四参数 service-role-only RPC，因此从 Migration 开始直到新应用 Ready 期间，必须保持管理员人工超额入账窗口冻结。

1. 冻结支付相关部署和管理员人工超额操作窗口。
2. 确认正式项目名与 Project ref。
3. 对 Migration 重新计算 SHA-256，并与本次待审查工作区确认值一致。
4. 人工逐段执行只读审计 SQL 的 preflight 查询。
5. 确认没有跨业务 TxHash 冲突、字段漂移、重复 disposition 或账本不一致。
6. 单独授权并只执行 `20260727_bep20_automatic_overpayment_settlement.sql`。
7. 人工执行 postcheck：函数定义/owner/search_path/权限、触发器、约束和安全汇总。
8. 由用户决定正式阈值，再通过受保护配置 RPC 设置两个值并执行 Query 11 复核；在此之前自动超额始终 fail closed 到人工审核。
9. 服务器拉取已批准 commit，执行依赖安装策略、typecheck、测试和 build，再按现有 PM2 手册重启一次。
10. 验证页面与只读 API，不创建真实付款前先确认旧订单状态不变。
11. 按“生产验收”依次完成精确付款、阈值内超额付款、超过阈值付款和重复 TxHash 验证。

## 部署前检查

```powershell
git status --short --branch
git rev-parse HEAD
git diff --check
Get-FileHash -Algorithm SHA256 supabase/migrations/20260727_bep20_automatic_overpayment_settlement.sql
npm run typecheck
npm test
npm run build
```

停止条件：工作区不干净、目标 commit 不一致、哈希变化、任一检查失败、正式项目无法同时确认名称与 ref、审计发现冲突或依赖缺失。

## Migration precheck

使用 `docs/audits/production-bep20-automatic-overpayment-readonly-audit.sql`，逐块执行：

- Query 01：全部依赖列存在，`profiles.balance` 精确为 `numeric(12,2)`。
- Query 02/03：状态约束、外键和 disposition / ledger / TxHash 唯一索引符合预期。
- Query 04—06：旧人工 RPC、付款完成 RPC、claim RPC 权限和定义可用。
- Query 07/08：RLS、ACL 与既有安全边界没有漂移。
- Query 10：跨订单/充值 TxHash 冲突数必须为 0；既有超额异常需先人工解释。
- Query 11：两项私有风险 key 存在、类型为 number、`is_public=false` 且保护触发器存在；Migration 前可返回 NO_ROWS，Migration 后不得缺失。

Migration 内置 precheck 还会在依赖对象、字段、余额精度或跨业务 TxHash 冲突不符合时抛错；整个事务回滚。

## Migration postcheck

- `settle_bep20_automatic_overpayment(uuid,text,integer,text)`：owner=`postgres`、`SECURITY DEFINER`、`search_path=public`。
- 自动 RPC：仅 `service_role` 有 EXECUTE；PUBLIC/anon/authenticated 均无。
- 人工 RPC 新签名 `credit_bep20_overpayment_to_wallet(uuid,text,text,uuid)`：仅 `service_role` 可执行；PUBLIC/anon/authenticated 均无。管理员 Route 必须先用 Cookie client 验证 active super-admin，再显式传入 service-role client 和已验证的 operator UUID。
- 风险配置沿用私有 `site_settings`，普通 authenticated 不能修改两个阈值；受保护配置 RPC 仅 service-role（或 SQL Editor 的 postgres 会话）可调用且再次校验 operator 为 active super-admin。
- 两项阈值缺失、JSON 类型错误、null 或非正数时返回 `auto_overpayment_limit_unavailable` 并转 `manual_review`；任一超限时返回 `auto_overpayment_limit_exceeded` 并转 `manual_review`。
- `settlement_source` 只能为 `manual_admin` / `automatic_service`。
- 两个跨业务 TxHash 触发器都存在。
- Query 09/10 的重复、账本不一致、已入账但订单未支付、跨业务冲突均为 0。

任何一项不符合都停止应用部署，不进行真实付款。

## 风险阈值配置

Migration 只创建 JSON null 占位，不写入业务阈值。用户需先决定数值，再由已验证的 active super-admin 在正式 SQL Editor 或受控服务端流程中调用：

```sql
select public.configure_bep20_automatic_overpayment_limits(
  p_max_auto_overpayment_usdt => <人工确认的 USDT 上限>,
  p_max_auto_overpayment_ratio => <人工确认的比例上限>,
  p_operator_user_id => '<active super-admin UUID>'::uuid,
  p_request_id => '<不含密钥的变更单号>'
);
```

建议讨论起点是 `20 USDT` 和 `2.0`，但它们不是默认值，不得未经经营者确认直接使用。不要在聊天、仓库或命令中粘贴 service-role key；SQL Editor 会保留查询历史，因此语句中不得包含任何密钥。配置后单独执行 Query 11，确认两个 value 都是正数、private 且保护触发器存在。

## 页面基础验证

- 未支付有效会话：仅显示倒计时；有 TxHash 的 confirming 才显示确认进度。
- manual_review / paid / delivered / expired：不显示 TxHash 输入和提交按钮。
- paid 未交付显示准备中；delivered 通过安全 delivery API 展示内容。
- 订单抽屉、独立详情和支付页复用 `SecureOrderDelivery`。
- 自动 disposition 在用户端显示服务端落库的超额 USDT、冻结汇率和入账 CNY；管理员端标记“自动原子结算”，不显示人工入账按钮。

## 生产验收

每种付款使用全新最低金额订单与全新 TxHash，且必须在付款期限内：

1. 精确付款：订单/payment/chain 均 paid；无 disposition 和超额 balance transaction；数字交付恰好一份。
2. 阈值内超额付款：绝对值和比例同时不超过配置；订单/payment/chain 均 paid；余额只增加一次；ledger 与 disposition 各一条且金额一致；来源为 `automatic_service`；数字交付恰好一份。
3. 超过任一阈值：chain session 进入 manual_review，原因码为 `auto_overpayment_limit_exceeded`；订单、余额、ledger、disposition、库存和交付均不变化。
4. 重复提交同一 TxHash：返回稳定已完成结果，余额、ledger、disposition、库存和交付数量均不增加。
5. 两个订单争抢同一 TxHash：只有原订单可继续，另一订单拒绝。
6. 订单/充值跨业务复用：数据库拒绝第二个完成动作，已有业务记录不被覆盖。
7. 模拟交付失败仅允许重试交付；付款和余额不重复。

每一步完成后执行只读财务、支付和交付核对；不得输出完整 TxHash、钱包地址或交付正文。

## 回滚与降级

### 尚无自动入账数据

可以在独立授权下回滚应用，然后删除自动 RPC、两个跨业务触发器及触发函数，重新应用 `20260715_bep20_overpayment_wallet_credit.sql` 的人工 RPC 定义，再删除 `settlement_source` 约束/列并恢复 `processed_by NOT NULL`。执行前必须证明没有 `automatic_service` disposition。

### 已存在自动入账数据

不得删除或改写 balance transaction、disposition、来源字段或 `processed_by`。安全降级方式是：

1. 先回滚/停用调用自动 RPC 的应用版本，使新超额付款回到人工处理。
2. 在独立数据库授权下撤销 `service_role` 对自动 RPC 的 EXECUTE。
3. 保留函数、来源字段、账本和 disposition 作为财务审计证据。
4. 修复后重新执行完整 preflight/postcheck，再恢复调用方。

交付失败不属于财务回滚条件；使用既有管理员安全重试交付，不重复付款或入账。

## 长期风险

- 两项风险阈值尚待经营者正式确认；Migration 不静默写入建议值，未配置期间所有超额付款转人工审核。
- 多标签页可能同时查询，但数据库 TxHash claim、disposition 和账变唯一键是最终幂等边界。
- 生产结构只能由正式项目只读审计确认，不能从仓库 Migration 文件存在推断已执行。
