# Jianlian Shop 任务日志

本文件只记录任务事实、验证结果、差异、风险与下一步。不写入密钥、令牌、完整收款地址或环境变量值；数据库状态必须注明证据来源。

## 记录模板

### YYYY-MM-DD — 任务名称

- 目标：
- 操作边界：
- 开始基线：分支 / HEAD / 工作区状态
- 只读核对：
- 创建或修改：
- 执行的检查：
- 未执行：
- 发现的差异或风险：
- 结果：
- 待用户确认：
- 下一步：

---

## 2026-07-18 — 交接文档初始化

- 目标：在不修改业务代码的前提下，建立长期协作规则、项目实际状态、当前生产阶段任务和任务日志。
- 操作边界：只读检查仓库并写 Markdown 文档；不执行 SQL/Migration，不连接或修改数据库，不部署，不改环境变量，不执行真实支付或真实过期任务，不 commit、不 push。
- 开始基线：`main`；HEAD 与 `origin/main` 均为 `69d794a0325c2967e65b2ae19e577030a14c6b11`；开始时工作区干净。
- 只读核对：`git status --short --branch`、`git log --oneline -15`、`package.json`、`supabase/migrations/`、订单过期 API/服务/Migration/BEP20 相关实现、已有项目状态文档及根目录 `AGENTS.md`。
- 创建或修改：创建根目录 `AGENTS.md`、`docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 执行的检查：核对 Git refs；搜索 `pg_cron`、`pg_net`、内部过期接口、过期字段/RPC、BEP20 TxHash 认领、人工审核和超额入余额实现。
- 未执行：类型检查、构建和自动化测试（本轮无业务代码改动）；数据库审计；SQL/Migration；部署；环境变量操作；真实支付；真实过期任务；commit；push。
- 发现的差异或风险：`20260701` 的过期 RPC 写 `cancelled`，`20260710` 兼容版本写 `expired`；测试结果与后者一致。多个 Migration 替换同名函数，正式库的最终定义不能从文件存在或文件名顺序推断。仓库未发现订单过期的 `pg_cron + pg_net` 调度定义。
- 结果：代码基线与用户给出的预期一致；支付与过期实现的代码证据存在；测试环境结果按用户交接记录；正式数据库状态保持“待只读审计”。
- 待用户确认：正式库只读审计的执行时机和授权方式；审计后拟定的最小 Migration；正式 dry-run、`limit=1` 真实验证及最终调度分别需要单独明确授权。
- 下一步：按 `docs/CURRENT_TASK.md` 从正式项目只读审计开始。

---

## 2026-07-18 — 正式库订单过期只读审计结果分析

- 目标：分析用户人工执行并导出的正式库只读审计 CSV，与仓库 Migration 对比，确定最小兼容范围。
- 操作边界：只读取本地 CSV、审计 SQL、Migration 和文档；不连接 Supabase Dashboard，不执行 SQL/RPC/Migration，不调用订单过期 API，不创建 Cron，不改环境变量，不部署，不 commit、不 push。
- 开始基线：`main...origin/main`；已有 `AGENTS.md`、三份状态文档和 `docs/audits/` 为未跟踪文件，无业务代码修改。
- 数据库证据：`docs/audits/results/01` 至 `08` 共八份 CSV，目标项目由用户确认为 Jianlian-shop / `qvbovrvybirscaurwuov`。
- 已确认：订单过期三个时间字段和目标索引存在；正式 `expire_unpaid_order(uuid,text)` 写 `expired/failed`、写 `expired_at` 并调用两参数库存释放；库存释放写 `reservation_released_at`；当前四个相关函数和权限已记录；`pg_cron`/`pg_net` 可用但未安装；Cron schema/table 不存在。
- 明确缺口：`public.list_expirable_unpaid_orders(integer)` 完全缺失，因此正式环境当前无法通过应用服务列出过期候选。
- 重载结论：`release_order_inventory(uuid) → integer` 与 `release_order_inventory(uuid,text) → jsonb` 同时存在；前者是旧兼容重载，过期函数明确调用后者，不构成当前解析歧义。
- 定义差异：正式生命周期核心函数匹配仓库 `20260710` 兼容基线；不匹配 `20260701` 的 `cancelled` 版本；两参数库存释放不包含 `20260709` 的 `reserved_user_id` 清理和 `reservation_release_reason` 写入；`20260717` 列表 RPC 未部署。
- 本次第一轮审计当时仍无法确认：真实 Migration 执行历史；`chain_payment_sessions` 及其关键字段；`reservation_release_reason` 字段；订单状态约束；业务数据实际候选数量。后续依赖审计及独立布尔存在性审计已补充其中的结构结论。
- 最小方案：补充只读预检后，仅新增 `20260717` 的列表 RPC 定义及 service-role-only 权限，不替换已有生命周期函数，不安装扩展，不创建调度。
- 创建或修改：更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 未执行：任何 SQL、RPC、Migration、API、数据库修改、真实过期、扩展安装、Cron、环境变量修改、部署、测试、commit 或 push。
- 下一步：先完成链上支付会话表的补充只读预检，再由用户决定是否授权创建最小 Migration 文件。

---

## 2026-07-18 — 正式库订单过期依赖只读审计结果分析

- 目标：分析用户人工执行的第二轮正式库依赖审计结果，判断仓库 `20260717_order_expiration_list_rpc_compatibility.sql` 是否可原样用于正式库。
- 操作边界：仅读取本地审计 SQL、CSV、Migration 和状态文档；不连接或操作 Supabase，不执行 SQL/RPC/Migration/API，不修改数据库或环境变量，不安装扩展，不创建 Cron，不部署，不 commit、不 push。
- 数据库证据：`docs/audits/dependency-results/` 中七份 CSV；目标项目由用户确认为 Jianlian-shop / `qvbovrvybirscaurwuov`。
- 已确认：`public.chain_payment_sessions` 及 `order_id uuid not null`、`status text not null`、`failure_reason text null` 存在；`order_id` 外键引用 `public.orders(id)`，更新 `NO ACTION`、删除 `RESTRICT`。
- 状态与约束：链上会话使用 `text + CHECK`，允许 `20260717` 引用的全部状态；`orders_status_check` 接受 `expired`，`orders_payment_status_check` 接受 `failed`。
- 索引：存在以 `order_id` 开头、以 `status` 开头的索引以及活跃会话部分唯一索引；未发现精确 `(order_id,status)` 索引，但这不阻止函数创建或构成最小修复的必要变更。
- 字段差异：独立布尔存在性审计文件 `06-orders-extra-columns.csv` 返回 `reservation_release_reason_exists=false`，确认正式库不存在 `public.orders.reservation_release_reason`；该字段不被 `20260717` 引用。
- 兼容性结论：八个直接依赖字段全部存在，类型、可空性、外键和状态约束兼容；`20260717_order_expiration_list_rpc_compatibility.sql` 可原样作为正式库最小兼容性 Migration，无需修改，也不需要附加索引或表结构变更。
- 风险边界：本轮只验证元数据兼容性，没有读取业务数据，无法确认候选数量或单笔订单是否应过期；正式数据量下的查询计划仍需后续观察；执行前需复核列表 RPC 未在审计后被创建。
- 创建或修改：更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 未执行：任何 SQL、RPC、Migration、数据库/API 操作、扩展安装、Cron、环境变量修改、部署、测试、commit 或 push。
- 下一步：用户另行明确授权后，按执行前检查清单人工执行原始 `20260717` Migration；执行后只读复核，再分别授权 dry-run、`limit=1` 与最终调度。

---

## 2026-07-18 — 20260717 正式列表 RPC 执行准备

- 目标：完整审查正式最小 Migration，固定文件哈希，并准备执行前、执行后只读元数据检查和人工上线手册。
- 操作边界：只读检查仓库和审计结果并创建文档/审计 SQL；不连接 Supabase，不执行 SQL/RPC/Migration/API，不修改 Migration 或业务代码，不改环境变量，不部署，不 commit、不 push。
- 开始基线：`main...origin/main`；HEAD 为 `69d794a`；既有 `AGENTS.md`、三份状态文档及 `docs/audits/` 为未跟踪文件。
- Migration 审查：`20260717_order_expiration_list_rpc_compatibility.sql` 只创建或替换 `public.list_expirable_unpaid_orders(integer)`，设置 `SECURITY DEFINER`、`search_path=public` 和该签名的 EXECUTE 权限；不修改表、业务数据、库存、索引、触发器、RLS、其他 RPC、扩展或调度。
- 文件指纹：SHA-256 为 `7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`。
- 创建：`docs/audits/production-list-rpc-preflight.sql`、`docs/audits/production-list-rpc-postcheck.sql`、`docs/runbooks/20260717-production-list-rpc-rollout.md`。
- preflight：只读检查目标精确签名仍不存在、依赖表/字段/类型未漂移，以及链上会话和订单状态约束仍兼容。
- postcheck：只读检查精确签名、返回类型、owner、`SECURITY DEFINER`、`search_path`、完整定义及四类角色的 EXECUTE 权限。
- 回滚结论：若 preflight 证明精确签名原先不存在，可通过单独授权删除 `public.list_expirable_unpaid_orders(integer)` 回到原状态；该回滚不触碰其他函数或业务数据，但会重新中断列表 RPC 能力。
- 修改：更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 未执行：任何 SQL、RPC、Migration、Supabase/API 操作、数据库修改、真实订单过期、扩展安装、Cron、环境变量修改、部署、测试、commit 或 push。
- 下一步：人工执行 preflight；通过后由用户单独授权正式 Migration；人工执行 Migration 与 postcheck；postcheck 通过后再另行授权 dry-run。
