# 客户端表权限加固 Phase 1 Runbook

## 当前状态

- 本阶段仅处理客户端表 ACL；不是最终权限状态。
- 本 Migration 尚未在任何数据库执行：
  `20260729140000_client_privilege_hardening_phase1.sql`。
- 不在生产项目执行本 Migration。
- 不修改任何 RLS Policy、service-role 权限或 default privileges。
- 不开启或配置自动结算，不修改任何风险阈值。

## 唯一允许的首个目标环境

- 项目：`Jianlian-shop-test`
- Project ref：`czuoivbfxzachiobdohw`
- 必须在取得针对测试项目的明确人工授权后，才可通过 Supabase SQL Editor 手工执行。
- 执行前必须再次核对项目名和 Project ref；不匹配时立即停止。

## 执行前只读门禁

1. 在测试项目 SQL Editor 中打开
   `docs/audits/20260729-client-privilege-hardening-phase1-postcheck.sql`。
2. 将同一份只读脚本作为 precheck 运行并保存完整结果。
3. 确认结果只包含 ACL/系统目录信息，不包含业务数据。
4. 确认现状与源码审计一致，再单独申请 Migration 手工执行授权。
5. 未获得明确授权时，不执行 Migration。

遇到下列任一情况必须停止：

- 项目不是 `Jianlian-shop-test`；
- Project ref 不是 `czuoivbfxzachiobdohw`；
- 目标表或字段结构与预期不一致；
- service-role 权限会被改变；
- 需要修改 RLS Policy、default privileges 或业务数据；
- 需要调用支付、verify、settle 或余额入账接口。

## 手工执行边界

- 只能在获得明确授权后，将
  `supabase/migrations/20260729140000_client_privilege_hardening_phase1.sql`
  复制到测试项目 SQL Editor 手工执行一次。
- 不使用 `supabase db push`。
- 不使用 `supabase migration up`。
- 不使用 `supabase migration repair`。
- 不使用 `supabase db reset` 或 `db reset --linked`。
- 不在生产执行。
- 不部署应用。
- 不调用任何支付、verify、settle、余额入账或生产财务接口。

## 执行后只读验证

1. 再次运行
   `docs/audits/20260729-client-privilege-hardening-phase1-postcheck.sql`。
2. 保存 postcheck 结果，并与 precheck 对照。
3. 确认：
   - `unexpected_client_ddl_like_privilege_count = 0`；
   - `unexpected_anon_write_privilege_count = 0`；
   - `unexpected_authenticated_write_privilege_count = 0`；
   - `orders_authenticated_update_retained = true`；
   - `account_recharges_authenticated_insert_retained = true`；
   - `account_recharges_authenticated_update_revoked = true`；
   - `account_recharges_authenticated_delete_revoked = true`；
   - `profiles` 仅五个白名单资料字段允许 authenticated UPDATE；
   - 可选的 `site_settings` / `site_setting_logs` 缺失时仅返回
     `OPTIONAL_TABLE_MISSING`。
4. `default_acl_hardening_status` 必须仍为
   `DEFERRED_TO_PHASE_2`。

## 明确保留的后续阻断项

- `orders` authenticated UPDATE 暂时保留，等待订单绑定专用 RPC 改造。
- `profiles` authenticated INSERT 暂时保留，等待安全创建 RPC 或 auth trigger 改造。
- `site_settings` authenticated INSERT/UPDATE 暂时保留。
- `site_setting_logs` authenticated INSERT 暂时保留。
- default ACL 加固推迟到 Phase 2；在确认 `postgres` /
  `supabase_admin` 角色成员关系前不执行 `ALTER DEFAULT PRIVILEGES`。

以上任一阻断项未完成前，本阶段不得被描述为最终最小权限状态，也不得据此开启自动结算。
