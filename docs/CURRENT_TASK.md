# 当前任务：正式列表 RPC 最小上线

更新日期：2026-07-18
目标：只为正式库补齐 `public.list_expirable_unpaid_orders(integer)`，完成执行前与执行后的只读核验；本阶段不进入 dry-run、真实过期或调度。

## 固定目标

- 正式项目名：Jianlian-shop
- Project ref：`qvbovrvybirscaurwuov`
- Migration：`supabase/migrations/20260717_order_expiration_list_rpc_compatibility.sql`
- SHA-256：`7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`
- 执行手册：`docs/runbooks/20260717-production-list-rpc-rollout.md`

## 已确认基线

- 正式库缺失 `public.list_expirable_unpaid_orders(integer)`。
- 两轮只读审计确认 Migration 依赖的表、字段、类型、外键和状态约束兼容。
- `public.orders.reservation_release_reason` 由独立布尔存在性查询确认不存在，但不是本 Migration 的依赖。
- 完整静态审查确认 Migration 只涉及目标精确函数签名、函数安全属性、`search_path` 和 EXECUTE 权限。
- Migration 不包含表结构、订单/库存数据、索引、触发器、RLS、其他 RPC、扩展或调度修改，可原样使用。
- 已准备 `docs/audits/production-list-rpc-preflight.sql` 与 `docs/audits/production-list-rpc-postcheck.sql`；本轮未执行任何 SQL。

## 下一步

1. 人工执行 preflight。
2. 单独授权正式 Migration。
3. 人工执行 Migration。
4. 人工执行 postcheck。
5. 后续另行授权 dry-run。

## 停止边界

- preflight 任一依赖缺失、类型漂移、约束不兼容，或目标函数已存在/出现未知重载时立即停止。
- 文件 SHA-256 与固定值不一致时立即停止并重新审查。
- Migration 或 postcheck 结果不明确时立即停止，不现场扩展修复范围。
- 本阶段不执行 dry-run、`limit=1`、真实订单过期、扩展安装、Cron、环境变量变更或部署。
- 不自动执行 SQL/Migration，不连接或操作 Supabase，不 commit、不 push，不输出密钥、完整收款地址或环境变量值。
