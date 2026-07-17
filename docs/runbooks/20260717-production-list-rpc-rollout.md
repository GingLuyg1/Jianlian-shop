# 20260717 正式库列表 RPC 上线手册

本手册只覆盖正式库缺失的 `public.list_expirable_unpaid_orders(integer)`。它不授权执行任何步骤，也不包含 dry-run、真实订单过期或调度创建授权。

## 固定目标与文件

- 正式项目名：Jianlian-shop
- Project ref：`qvbovrvybirscaurwuov`
- 唯一待执行文件：`supabase/migrations/20260717_order_expiration_list_rpc_compatibility.sql`
- 批准时文件 SHA-256：`7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`
- 执行前检查：`docs/audits/production-list-rpc-preflight.sql`
- 执行后复核：`docs/audits/production-list-rpc-postcheck.sql`

## 已审查的 Migration 边界

该 Migration 只执行以下对象级变更：

- 创建或替换精确签名 `public.list_expirable_unpaid_orders(integer)`。
- 返回 `table(order_id uuid)`，语言为 `plpgsql`。
- 设置 `SECURITY DEFINER` 和 `search_path=public`。
- 撤销 `public`、`anon`、`authenticated` 的 EXECUTE，并只授予 `service_role` EXECUTE。

它不修改表结构、订单数据、库存数据、索引、触发器、RLS、其他 RPC、扩展、Secret、Cron 或任何调度。

## 执行前流程

1. 在 Supabase Dashboard 页面人工二次确认项目名严格为 Jianlian-shop，Project ref 严格为 `qvbovrvybirscaurwuov`。任一项不一致立即停止，不运行任何查询。
2. 对本地 Migration 文件重新计算 SHA-256，必须与本手册记录值完全一致；不一致立即停止并重新审查，禁止临时修改后继续。
3. 在目标项目 SQL Editor 中逐块、单独执行 `production-list-rpc-preflight.sql`，不要点击 Run all，也不要临时修改查询。
4. 保存每块结果。目标函数精确 integer 签名必须不存在；所有依赖表、字段、类型和状态约束必须兼容。任何 false、缺行、多余同名实现或无法解释的结果都必须停止。
5. 确认已有正式库审计结论仍有效，并取得“只执行这一份 Migration”的单独明确授权。

## Migration 人工执行

获得单独授权后，只把 `supabase/migrations/20260717_order_expiration_list_rpc_compatibility.sql` 的完整原文作为一个独立执行单元运行一次。

- 不拼接 `20260701`、`20260709`、`20260710` 或其他 Migration。
- 不追加索引、表变更、扩展安装、Secret、Cron、测试查询或临时修复。
- 不改写函数体、权限、签名或 `search_path`。
- 保存执行时间、执行人、项目标识、文件 SHA-256 和 SQL Editor 返回结果；不得记录密钥或环境变量值。

## 执行后只读复核

逐块、单独执行 `production-list-rpc-postcheck.sql` 并保存结果：

- 精确签名必须只有 `public.list_expirable_unpaid_orders(integer)` 一条目标记录。
- 返回类型必须为 `TABLE(order_id uuid)`。
- 必须为 `SECURITY DEFINER`，且 `proconfig` 包含 `search_path=public`。
- 完整定义必须与批准的 Migration 语义一致。
- `service_role` 必须拥有 EXECUTE；`anon`、`authenticated`、`PUBLIC` 必须没有 EXECUTE。

## 立即停止条件

出现以下任一情况立即停止，不尝试现场修复：

- 项目名或 Project ref 不一致。
- Migration SHA-256 不一致。
- preflight 显示目标函数已存在、出现未知重载、依赖缺失、类型漂移或约束不兼容。
- Migration 返回错误、结果不明确、连接中断或无法确认是否完整执行。
- postcheck 缺少目标函数、出现多条精确签名记录、定义/安全属性/权限不符。
- 发现任何超出本手册范围的数据库变更。

停止后保留原始结果，由 Codex 只读分析；不得继续 dry-run、`limit=1`、真实订单过期、扩展安装或 Cron 创建。

## 可逆性与独立回滚 SQL

在 preflight 已确认精确签名此前不存在的前提下，本次变更具备对象级可逆回滚：删除本次新增的精确 integer 签名即可恢复到“列表 RPC 缺失”的原状态。回滚会使应用的订单过期候选列表再次不可用，不会恢复或修改任何业务数据。

以下 SQL 仅作为独立回滚方案保存，不得与 Migration 同时执行，也不得在没有单独明确授权时执行：

```sql
begin;

revoke execute on function public.list_expirable_unpaid_orders(integer)
  from public, anon, authenticated, service_role;

drop function if exists public.list_expirable_unpaid_orders(integer);

commit;
```

回滚只指向精确签名 `public.list_expirable_unpaid_orders(integer)`，不影响其他函数或重载。若 preflight 未确认该签名原先不存在，`CREATE OR REPLACE` 可能覆盖未知旧定义，此时上述删除不是完整恢复方案，必须停止而不能执行 Migration。

## 本手册边界

Migration 和 postcheck 完成只代表列表 RPC 已部署并通过元数据复核。下一阶段的正式环境 dry-run 必须另行授权。本手册不授权或继续执行 `dry_run`、`limit=1`、真实过期处理、支付操作、扩展安装、`pg_cron + pg_net` 调度、环境变量变更或部署。
