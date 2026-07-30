# Account Recharge Service Write Forward-fix Runbook

## 当前状态

- PR #17 已合并到 `main`，merge commit 为
  `76a12d7489fd0e2b186b2961364ab4c5b58a1d10`。
- PR #18 Vercel Preview 已连接
  `Jianlian-shop-test` / `czuoivbfxzachiobdohw`。
- `20260729135500_account_recharge_schema_compatibility.sql` 已在测试库执行，
  schema compatibility postcheck 已通过。
- 第一笔普通用户手工充值已成功创建，状态为 `waiting_payment`，到账金额为 `0`。
- `20260729140000_client_privilege_hardening_phase1.sql` 已在测试库执行，
  修正后的 Phase 1 postcheck 已通过。
- `20260729143000_account_recharge_service_write_hardening.sql` 已在测试库执行，
  service-write postcheck 的 `assessment = PASS`。
- 加固后第二笔普通用户手工充值已成功创建，状态为 `waiting_payment`，到账金额为 `0`。
- 测试账号余额保持为 `0`。
- 临时测试支付渠道已完成 Cleanup，Cleanup Postcheck 结果为 `PASS`，页面已恢复
  “支付渠道暂未开放”。
- GitHub Actions CI #108 为 `success`。
- Vercel Preview check 为 `success`。

## 唯一允许的首个目标环境

- 项目：`Jianlian-shop-test`
- Project ref：`czuoivbfxzachiobdohw`
- 每一步都必须先重新核对项目名和 Project ref。
- 未取得针对测试项目的明确人工授权时，不执行任何文件。

## 测试环境已完成记录

以下步骤已在取得相应授权后，按顺序在测试环境完成：

1. PR #18 Preview 代码已连接到
   `Jianlian-shop-test` / `czuoivbfxzachiobdohw` 并完成测试环境部署；部署前已确认
   service-role server helper 配置有效，且代码不回退到 authenticated INSERT。
2. 已在 Supabase SQL Editor 中完整执行
   `supabase/migrations/20260729135500_account_recharge_schema_compatibility.sql`。
3. 已完整执行只读检查
   `docs/audits/20260729-account-recharge-schema-compatibility-postcheck.sql`，结果通过。
4. 已刷新 PR #18 Preview 的账号充值页面。
5. 已由普通用户创建第一笔不付款的 manual 测试充值。
6. 已确认 API 返回 `waiting_payment`、到账金额为 `0`；未付款、未提交 TxHash、
   未审核，也未进行余额入账。
7. 已完整执行
   `supabase/migrations/20260729140000_client_privilege_hardening_phase1.sql`，并在修正
   optional profiles 字段判断后通过 Phase 1 postcheck。
8. 已完整执行
   `supabase/migrations/20260729143000_account_recharge_service_write_hardening.sql`。
9. 已完整执行只读检查
   `docs/audits/20260729-account-recharge-service-write-postcheck.sql`，结果为
   `assessment = PASS`。
10. 加固后已由普通用户创建第二笔不付款的 manual 测试充值；状态为
    `waiting_payment`、到账金额为 `0`，测试账号余额仍为 `0`。
11. 临时测试支付渠道已 Cleanup，Cleanup Postcheck 为 `PASS`。

先部署 service-role 写入代码，是为了避免撤销 authenticated INSERT 后出现充值创建中断。
以上记录仅代表测试环境已经完成并通过，不代表正式环境已执行、部署或获得操作授权。

## 生产环境状态

- 正式 Supabase 尚未执行上述 Migration。
- 正式数据库未发生本流程相关变更。
- `jianlian.shop` 尚未部署本 PR。
- 自建服务器尚未同步、构建或重启。
- 自动结算仍保持关闭。
- 生产上线前必须另行完成只读预检、取得独立明确授权，并准备经过核对的回滚方案。
- 任何生产操作都必须取得单独明确授权；测试环境的执行记录不得视为生产授权。

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
- 任何生产部署、Migration 或 postcheck 执行仍需单独明确授权。
- 应用健康检查失败时，不执行任何权限 Migration。
- 任一 Migration 或 postcheck 失败时立即停止。
- 不得批量执行 Migration；每次只能执行一个经核对的完整文件。

## 明确禁止

- 不使用 `supabase db push`。
- 不使用 `supabase migration up`。
- 不使用 `supabase migration repair`。
- 不使用 `supabase db reset` 或 `db reset --linked`。
- 未取得单独明确授权，不在生产环境执行 Migration、postcheck 或部署。
- 不得批量执行 Migration。
- 不修改现有 RLS Policy、service_role 权限或 default privileges。
- 不开启或配置自动结算。
- 不修改自动结算状态。
- 不进行付款、TxHash、审核或余额入账测试。
- 未取得单独明确授权，不执行任何生产操作或生产财务操作。
