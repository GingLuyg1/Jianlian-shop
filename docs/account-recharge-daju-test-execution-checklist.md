# Account Recharge + Daju 测试库执行清单

状态：`READY_FOR_TEST_PRECHECK` 仅表示离线合同允许申请测试库只读预检授权，不表示任何 SQL 已执行。

## 固定文件与 SHA-256

1. `docs/audits/20260810-account-recharge-daju-test-precheck.sql`
2. `supabase/migrations/20260809120000_account_recharge_usdt_cny_v1.sql`
   SHA-256：`07C5770FAB480E56A198219BEA019B550B344A5D1FF625236B24F45DE09D5BBA`
3. `docs/audits/20260809-account-recharge-usdt-cny-v1-postcheck.sql`
4. `supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql`
   SHA-256：`6E1796C7D8360CC4CC141837C1584A882FC42CFCB87EB57421E2FBD65C162120`
5. `docs/audits/20260810-daju-supplier-fulfillment-v1-postcheck.sql`

## 精确顺序与 STOP 条件

每个文件必须获得独立明确授权，并在测试项目 `Jianlian-shop-test` / `czuoivbfxzachiobdohw` 中完整、单独执行。不得批量执行。

1. 核对项目名称和 Project ref；重新计算两个 Migration 的 SHA-256。
   **STOP：** 项目不匹配、SHA 不匹配、文件被修改、身份或结果可见性无法确认。
2. 完整执行联合只读 precheck。
   **成功：** 唯一 assessment 为 `READY_FOR_TEST_MIGRATIONS`。
   **STOP：** 报错、超时、断线、结果缺失、assessment 为 `BLOCKED` 或不明确。不得自动重试。
3. 完整执行充值 Migration。
   **STOP：** 任意错误或连接结果不明确。不要继续大橘 Migration；记录错误并准备 forward-fix 复核。
4. 立即完整执行充值只读 postcheck。
   **成功：** assessment=`PASS`，客户端写权限为 false，service_role RPC 权限为 true。
   **STOP：** 任一条件不满足。保持充值渠道 disabled，不创建充值或提交 TxHash。
5. 完整执行大橘 Migration。
   **STOP：** 任意错误、动态函数合同漂移或连接结果不明确。不得调用真实供应商 purchase。
6. 立即完整执行大橘只读 postcheck。
   **成功：** assessment=`PASS`，快照履约检查通过，request_count_after_migration=0。
   **STOP：** 任一条件不满足。保持供应商自动履约关闭，不进行供应商订单创建。
7. 保存所有结果集、执行时间、文件 SHA 和非敏感错误摘要，停止等待代码部署与行为验证的独立授权。

## 全程禁止

- 不使用 `supabase db push`、`supabase migration up`、`migration repair` 或 `db reset`。
- 不执行生产库，不修改支付渠道，不启用自动结算。
- 不创建充值、不提交 TxHash、不审核或入账。
- 不调用真实 `/purchase`，不创建供应商订单，不输出密钥或交付秘密。
- Migration 已成功但后续步骤失败时，不删除业务证据；使用独立授权的 forward-fix，不重复执行未知结果的写操作。
