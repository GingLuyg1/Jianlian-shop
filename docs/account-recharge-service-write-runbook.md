# Account Recharge Service Write Forward-fix Runbook

## 当前状态

- PR #17 已合并到 `main`，merge commit 为
  `76a12d7489fd0e2b186b2961364ab4c5b58a1d10`。
- `20260729140000_client_privilege_hardening_phase1.sql` 尚未在数据库执行。
- `20260729143000_account_recharge_service_write_hardening.sql` 也尚未执行。
- 当前 `main` 的 manual 充值初始状态是 `waiting_payment`，与测试库现有只允许
  `status = 'pending'` 的 INSERT Policy 不兼容。
- 修复代码部署前，不可在当前 `main` 测试 manual 充值。

## 唯一允许的首个目标环境

- 项目：`Jianlian-shop-test`
- Project ref：`czuoivbfxzachiobdohw`
- 每一步都必须先重新核对项目名和 Project ref。
- 未取得针对测试项目的明确人工授权时，不执行任何文件。

## 测试环境变更顺序

取得各步骤所需的单独明确授权后，只能按以下顺序操作：

1. 将 PR #18 Preview 代码连接到
   `Jianlian-shop-test` / `czuoivbfxzachiobdohw` 并完成测试环境部署。
   部署前确认现有 service-role server helper 配置有效，且代码不回退到
   authenticated INSERT。
2. 在 Supabase SQL Editor 中完整执行
   `supabase/migrations/20260729135500_account_recharge_schema_compatibility.sql`。
3. 完整执行只读检查
   `docs/audits/20260729-account-recharge-schema-compatibility-postcheck.sql`。
4. 刷新 PR #18 Preview 的账号充值页面。
5. 创建一笔不付款的 manual 测试充值。
6. 必须确认 API 返回 `waiting_payment`；不付款、不提交 TxHash、不审核，也不进行余额入账。
7. 确认上述步骤全部成功后，完整执行
   `supabase/migrations/20260729140000_client_privilege_hardening_phase1.sql`。
8. 再完整执行
   `supabase/migrations/20260729143000_account_recharge_service_write_hardening.sql`。
9. 最后完整执行只读检查
   `docs/audits/20260729-account-recharge-service-write-postcheck.sql`。

先部署 service-role 写入代码，是为了避免撤销 authenticated INSERT 后出现充值创建中断。
部署和 SQL 执行仍需各自取得单独明确授权；本任务不授权实际部署、Migration 或
postcheck 执行。每次只执行一个完整文件，每一步失败或结果不明确时立即停止，不执行
下一步。

## Postcheck 通过条件

- `account_recharges_table_exists = true`
- `public_insert = false`
- `anon_insert = false`
- `authenticated_insert = false`
- `public_column_insert_acl_count = 0`
- `anon_column_insert_acl_count = 0`
- `authenticated_column_insert_acl_count = 0`
- `anon_effective_column_insert_count = 0`
- `authenticated_effective_column_insert_count = 0`
- `service_role_insert = true`
- `service_role_update = true`
- `rls_enabled = true`
- `users_create_policy_exists = true`
- `users_create_policy_status_check_is_pending_only = true`
- `direct_client_insert_path_status = BLOCKED_BY_ACL`
- `assessment = PASS`

现有 `Users can create own recharge records` Policy 暂时保留。authenticated 已无
INSERT ACL，因此该 Policy 不再形成客户端直接写入通路。Policy 删除或整理必须放在后续
单独 Migration 中处理。

## 部署与执行门禁

- 测试运行环境必须明确连接 `Jianlian-shop-test` / `czuoivbfxzachiobdohw`。
- 部署仍需单独明确授权；本 Runbook 和本任务均不授权实际部署。
- 应用健康检查失败时，不执行任何权限 Migration。
- 任一 Migration 或 postcheck 失败时立即停止。

## 明确禁止

- 不使用 `supabase db push`。
- 不使用 `supabase migration up`。
- 不使用 `supabase migration repair`。
- 不使用 `supabase db reset` 或 `db reset --linked`。
- 不在生产环境执行 Migration 或 postcheck。
- 不在生产环境部署或执行本流程。
- 不修改现有 RLS Policy、service_role 权限或 default privileges。
- 不开启或配置自动结算。
- 不进行付款、TxHash、审核、余额入账或任何生产财务操作。
