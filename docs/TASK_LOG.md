# Jianlian Shop 任务日志

## 2026-07-23 — clean-clone 回归测试与 CI Hotfix

- 发布构建发现源码契约测试读取两个未跟踪且被忽略的一次性 BEP20 生产修复 SQL，导致干净 checkout 出现两个 `ENOENT`；产品代码和相关安全契约测试本身未失败。
- 回归测试已移除对具体生产修复脚本、订单号和金额的依赖，继续验证被跟踪 Migration、服务、API 与管理员 UI 的支付关联和超额入账安全契约。
- 两类一次性脚本继续由 `.gitignore` 排除，不加入仓库；新增干净克隆契约防止其再次成为测试依赖。
- GitHub CI 从三个指定单元测试改为执行完整 `npm test`，并继续保留 `npm ci`、typecheck 和 build。
- 正式部署、SQL、Migration 和订单处理仍未执行。

## 2026-07-23 — BEP20 欠额确认状态 Hotfix

- 从 `af2b77b862ec5466a88a6e0ada68adac79a42a58` 创建 `fix/bep20-underpayment-confirmation-state`。
- 确认根因是金额不足判断早于确认数判断，以及 `underpaid` patch 遗漏 `confirmed_at`。
- 状态判断改为：时间无效/迟到账优先，其次确认数，再进行欠额、超额和精确金额分类。
- `underpaid` 仅在确认数达标后写入首次服务端核验时间，重复检查不覆盖；链上 `block_timestamp` 语义不变。
- 新增严格历史补录 Migration 和回滚型合成数据库验证场景；Migration 未执行，也未连接任何数据库。
- 正式目标订单未结算，未修改余额或库存；欠额自动 Cron 与管理员前端操作入口仍未完成，部署与正式处理需另行人工授权。

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

## 2026-07-22 — BEP20 支付与超额自动结算发布前总审计

- 保护现场：确认 `main` 与 `origin/main` 同为 `88b64e40b41e26a80218f9b993d1a6f8fc75896a`，无 stash，不 reset/restore/clean/stash；保留全部支付、UI、Migration 与测试未提交改动。
- 调用链：复核用户 verify、BSC Provider、Transfer 解析、TxHash claim、精确/少付/超额/迟到账分类、付款完成、余额入账、数字交付、用户安全读取与管理员审计。
- 时间与金额：付款判断改用可信 block timestamp 与最早付款截止时间；汇率 TTL 不参与已冻结订单付款否决；金额分类保持 BigInt/numeric 原始单位。
- 财务加固：完善未执行的 `20260727_bep20_automatic_overpayment_settlement.sql`，加入余额字段精度 precheck、`numeric(12,2)` 溢出前保护、自动/人工路径 advisory lock 和人工 RPC 兼容定义。
- 跨业务幂等：新增数据库触发保护，禁止同一 BEP20 TxHash 同时完成订单支付与账户充值；precheck 对既有冲突计数非零时整体失败。
- 恢复边界：RPC 成功但 HTTP 响应丢失时先读取持久化 disposition/payment session；已提交成功的付款不再被错误降级，交付可安全重试且不重复入账。
- 前端：终态不再渲染禁用的 TxHash 提交按钮；支付轮询与安全交付轮询增加单定时器清理及标签页恢复可见后的立即刷新。
- 新增：`docs/audits/production-bep20-automatic-overpayment-readonly-audit.sql` 与 `docs/runbooks/20260727-bep20-automatic-overpayment-rollout.md`。
- 更新：`docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md` 以及支付相关回归/单元测试。
- 未执行：任何 SQL、Migration、RPC、生产 API、订单、付款、审核、交付、环境变量/Vault/Cron 修改、commit、push 或部署。

## 2026-07-22 — 自动超额结算财务风险上限与人工 RPC 收权

- 复用既有私有 `site_settings`，新增两个 null 占位风险 key；没有静默写入建议阈值。数据库自动结算事务严格解析两项 number 配置，缺失/错误使用 `auto_overpayment_limit_unavailable`，任一超限使用 `auto_overpayment_limit_exceeded`，两者都持久化为 `manual_review` 且不触碰订单付款、余额、账变、disposition 或交付。
- 新增保护触发器和 service-role 配置 RPC；普通 authenticated 不能直接改动两个财务阈值，配置操作还需 active super-admin operator 并写设置日志及管理员审计。
- 人工超额入账从 Cookie authenticated RPC 改为：先验证 active super-admin，再创建 service-role client；旧三参数 RPC 被未执行的 `20260727` Migration 替换为四参数 service-role-only 签名，原有 chain-session lock、财务幂等、状态校验和审计保留。
- 未执行：任何 SQL、Migration、RPC、生产 API、阈值配置、订单、付款、审核、入账、交付、环境变量/Vault/Cron 修改、commit、push 或部署。

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

---

## 2026-07-18 — 正式列表 RPC Migration 与 Postcheck 完成

- 目标：根据用户人工执行记录和三份 Postcheck CSV，确认正式最小 Migration 完成，并把当前任务切换到正式 API dry-run 准备。
- 操作边界：只读取本地 CSV、交接文档和 API 实现并更新 Markdown；本轮不连接 Supabase，不执行 SQL/RPC/Migration/API，不修改数据库或环境变量，不安装扩展，不创建 Cron，不部署，不 commit、不 push。
- 开始基线：`main...origin/main [ahead 1]`；HEAD 为 `5a3eb2aa36b143b9c158a0f5f4b3135adc053027`；已有未跟踪目录 `docs/audits/preflight-results/`。
- 用户执行记录：正式项目 Jianlian-shop / `qvbovrvybirscaurwuov`，`main / PRODUCTION`；执行前 SHA-256 为 `7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`；SQL Editor 返回 Success，DDL 无结果行正常。
- Postcheck 元数据：`public.list_expirable_unpaid_orders(p_limit integer)` 已存在，OID 27525，返回 `TABLE(order_id uuid)`，owner 为 `postgres`，语言 `plpgsql`，`SECURITY DEFINER=true`，`search_path=public`。
- Postcheck 权限：`service_role` 有 EXECUTE；`anon`、`authenticated`、`PUBLIC` 无 EXECUTE，符合 service-role-only。
- Postcheck 定义：默认 limit 50、限制 1—200；订单状态、付款状态、释放状态、到期时间及链上支付会话排除逻辑与批准 Migration 一致。
- 路径整理：三份 Postcheck 文件最初误放在 `docs/audits/preflight-results/`；后续文档整理任务已将其移动到 `docs/audits/postcheck-results/`，内容未修改。
- Migration 结论：正式最小 Migration 已成功完成，Postcheck 通过，无需回滚；列表 RPC 缺失问题已关闭。
- Dry-run 准备：代码确认正式接口为 `GET/POST /api/internal/orders/expire`，支持 Bearer 或 `x-internal-job-secret`、`dry_run` 和 `limit`；成功响应只返回候选数量及脱敏订单 ID 摘要。
- 修改：更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`、`docs/runbooks/20260717-production-list-rpc-rollout.md`。
- 未执行：任何 SQL、RPC、Migration、API、数据库修改、环境变量修改、真实订单过期、扩展安装、Cron、部署、测试、commit 或 push。
- 下一步：准备正式环境 `CRON_SECRET`；另行授权 API dry-run；根据候选结果再决定 `limit=1`；验证成功后才设计 `pg_cron + pg_net`。

---

## 2026-07-18 — Postcheck 证据归档与 dry-run 接口核对

- 目标：把正式 Migration 后的三份 Postcheck CSV 归档到正确目录，并按当前代码固定人工 dry-run 契约。
- 操作边界：只移动审计 CSV、只读检查接口/认证/限流代码并更新文档；不修改业务代码或 Migration，不执行 SQL/RPC/API，不改环境变量，不部署，不安装扩展，不创建 Cron，不 push。
- 开始基线：`main...origin/main [ahead 1]`；四份上轮状态文档有未提交修改，`docs/audits/preflight-results/` 为未跟踪目录。
- 移动证据：将 `01-function-metadata.csv`、`02-function-definition.csv`、`03-function-permissions.csv` 从 `docs/audits/preflight-results/` 移至 `docs/audits/postcheck-results/`，文件长度与内容未改。
- GET 与参数：`GET /api/internal/orders/expire` 为正式导出处理器；`dry_run` 经 trim/lowercase 后接受 `1`、`true`、`yes`。其他值或缺失均为 false，可能进入真实处理分支，因此人工手册固定使用 `dry_run=true`。
- limit：dry-run 默认 10、范围 1—50；非 dry-run 默认 50、范围 1—200；有效数字向下取整，越界夹紧，无效值回退默认值。
- 认证：服务端期望值优先级为 `CRON_SECRET`、`ORDER_EXPIRATION_JOB_SECRET`、`INTERNAL_JOB_SECRET`；请求头优先读取 `x-internal-job-secret`，否则读取大小写不敏感的 `Authorization: Bearer <secret>`。不应同时发送两个认证头。
- dry-run 安全性：路由在 dry-run 分支调用 `listExpirableUnpaidOrdersDryRun()` 后立即返回；该 helper 只调用只读列表 RPC，不调用 `expire_unpaid_order`，Postcheck 定义中也无写语句，因此不会更新订单、库存或支付会话。唯一状态变化是应用进程内的限流计数。
- 响应：成功返回 `success/requestId/dry_run/candidate_count/candidates[].order_id_summary`；订单 UUID 以首 8 位、末 6 位摘要返回，不返回完整 UUID。
- 错误：401 返回 `error`；认证配置缺失的 503 返回 `error`；列表 RPC 不可用的 503 返回 `success/requestId/dry_run/readiness_code/error_code/error`；429 返回 `error/code/retryAfter` 及限流响应头。
- 创建或修改：新增 `docs/runbooks/production-order-expiration-dry-run.md`，更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md` 与正式列表 RPC 上线手册。
- 未执行：任何 SQL、RPC、Migration、API、数据库或环境变量修改、真实订单过期、部署、扩展安装、Cron 或 push。

---

## 2026-07-18 — 正式订单过期 dry-run 通过

- 目标：记录用户人工完成的正式 dry-run 结果，并准备下一阶段 `limit=1` 受控验证方案。
- 操作边界：只更新项目状态、当前任务、任务日志和 dry-run 手册；本轮不调用 API，不执行 SQL/RPC/Migration，不创建或修改订单，不改环境变量，不安装扩展，不创建 Cron，不部署、不 push。
- 开始基线：`main...origin/main [ahead 3]`；工作区干净，HEAD 为 `32b71313e72c0028df0d88db6257c0f1093d1d99`。
- 正式目标：Jianlian-shop / `qvbovrvybirscaurwuov`；正式站 `https://jianlian-shop.vercel.app`。
- 用户执行请求：`GET /api/internal/orders/expire?dry_run=true&limit=10`。
- 实际结果：HTTP 200、`success=true`、`dry_run=true`、`candidate_count=0`、`candidates=[]`。
- 配置结论：`CRON_SECRET`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和 `public.list_expirable_unpaid_orders(integer)` 的正式链路正常。
- 数据安全：dry-run 未修改订单、库存或支付会话；执行当时不存在正式候选订单。
- 决策：由于 `candidate_count=0`，不执行真实 `limit=1`。
- 下一阶段方案：创建或等待一个明确正式测试订单通过正常流程自然过期；完成状态、付款、链上会话和库存基线只读核对；重新 dry-run `limit=1`；再单独授权一次真实 `limit=1`；验证通过后才进入 `pg_cron + pg_net`。
- 修改：`docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`、`docs/runbooks/production-order-expiration-dry-run.md`。
- 未执行：任何 API、SQL、RPC、Migration、订单创建/修改、数据库修改、真实过期、扩展安装、Cron、环境变量修改、部署或 push。

---

## 2026-07-18 — 正式库协议版本化只读审计结果分析

- 目标：分析正式项目 Jianlian-shop / `qvbovrvybirscaurwuov` 的 14 份协议版本化只读审计 CSV，判断草稿/发布失败根因和最小修复范围。
- 证据路径：用户给出的 `docs/audits/legal-versioning-audit-results/` 在本地不存在；完整的 01—14 CSV 实际位于 `docs/audits/legal-versioning-audit-queries/`，本轮未移动或修改 CSV。
- 结构结论：三张目标表及外部依赖均存在；36 个基线字段、默认值、主外键、唯一约束、CHECK、10 个索引和 9 条 RLS policy 与 `20260701` 基线一致；未发现相关触发器或额外函数。
- 权限结论：三表对 anon/authenticated/service_role/postgres 有表级权限，RLS 均启用。`legal_documents` 管理 policy 只接受 `profiles.role='admin'`，而应用后台认证兼容 active `admin_users`，标准不一致。
- 根因判断：管理员 policy 与应用认证标准不一致是已确认兼容缺口，也是保存与发布共同失败的最可能原因；API 的宽泛错误归一化会将该类错误误报为未初始化。CSV 未包含当前账号授权归属或原始 PostgreSQL 错误，因此 RLS 直接拒绝仍需补充只读确认。
- 排除项：基线字段/默认值漂移、表级权限缺失、缺表和唯一约束不是保存与发布共同失败的原因。重复版本仍可能单独触发唯一约束，但不能解释发布失败。
- 数据汇总：正式库 5 条记录；published 为 terms/refund/digital delivery，draft 为 privacy/purchase notice。审计未发现 refund draft，与此前后台口头观察不一致。
- 契约缺口：`is_current`、`archived_at`、`archived_by` 不存在，但当前页面与 `/api/admin/legal` 不依赖这些字段，不是当前故障原因。
- Migration 决策：不重放 `20260701`；绝不重放 `20260709` seed。建议在补充只读核验正式 `public.is_admin()` 后，新建 policy-only 最小兼容性 Migration，使两条管理员 policy 与 canonical 管理员标准一致。
- 数据保护：建议修复不触碰表结构或协议数据，现有 published/draft 应保持 3/2；回滚仅恢复当前 policy 定义，不做数据回滚。
- 修改：更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 未执行：任何 SQL、RPC、Migration、API、数据库修改、协议创建/发布/归档、业务代码修改、环境变量修改、部署、测试、commit 或 push。

---

## 2026-07-18 — 协议管理员 Preflight 结论修正与错误映射代码审计

- 目标：根据用户提供的 8 份正式 preflight 结论，纠正此前 RLS 根因判断，并只读审计当前创建、发布、归档、前端请求和错误归一化实现。
- 正式事实：`public.is_admin()` / `public.is_admin(uuid)` 均存在，owner=`postgres`、`SECURITY DEFINER`、`search_path=public`；`authenticated/service_role` 有 EXECUTE，`anon/PUBLIC` 无 EXECUTE。
- 身份核验：正式库只有 1 个 active `super_admin`，该管理员同时满足 `profiles.role='admin'`，`active_admin_users_without_profile_admin=0`。旧 `legal_documents` 管理 policy 对当前管理员有效，故“当前管理员身份标准不一致导致 RLS 拒绝”已排除，暂不创建 policy Migration。
- 重复冲突：正式库已存在 `purchase_notice / 2026.0718-01 / draft`；创建接口只做 insert，`(document_type,version)` 唯一约束会对相同组合返回 `23505`。这是创建草稿失败的最高可信原因。
- 误报原因：`app/api/admin/legal/route.ts` 的 `legalError()` 忽略 `error.code`，只要 message 包含 `legal_documents` 等宽泛文本就返回未初始化提示；`lib/legal/legal-documents.ts` 的共享 normalizer 也把表名、`42703` 和所有 `PGRST*` 放在重复/权限判断之前。相关管理路由 catch 均固定返回 HTTP 500。
- 创建路径：当前页面 POST `/api/admin/legal`、action=`create_draft`；存在 `update_draft` 后端 action，但页面没有编辑入口。创建成功会清空表单并刷新；失败会保留输入。按钮依赖 React `saving` 状态禁用，没有同步锁，快速双击仍有并发窗口。
- 发布路径：当前页面 POST 同一路由、action=`publish`；先读取 draft，再归档同类型 published，最后发布目标 draft、写审计并刷新缓存。两次 update 非事务，第一步错误未检查；这是结构风险。没有原始发布错误时，不能认定正式发布功能已独立故障。
- 审计日志：协议路由调用的是不会抛出的 `writeAdminAuditLog()`，其失败只返回 `{ok:false}`；所以日志写入失败不会把已成功主操作误判为失败。现有摘要 sanitizer 会按 key 脱敏 `content` 等字段。
- 最小修复设计：代码按 `error.code` 优先分类；`23505`→409 和“该协议类型和版本号已存在，请编辑现有草稿或更换版本号”，`42501`→403，仅 `42P01/PGRST205`→503 未初始化/不可用；其他结构/PostgREST 错误使用独立安全提示。移除按表名宽泛判断，增加同步提交锁与已有草稿跳转/编辑入口，保留不含正文和敏感信息的安全日志。
- 发布风险后续：至少检查第一步归档错误；完整原子性需要单独设计数据库事务/RPC，仅在取得原始发布错误和新授权后评估，不混入当前错误提示修复。
- 修改：仅更新 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`、`docs/TASK_LOG.md`。
- 未执行：任何 SQL、RPC、Migration、API、数据库/协议修改、业务代码修改、环境变量修改、部署、测试、commit 或 push。

---

## 2026-07-19 — 协议错误分类、重复草稿与管理流程加固

- 目标：在不操作数据库或生产环境的前提下，修复重复版本 `23505` 被误报为缺表的问题，补齐 draft 编辑体验，并加固现有发布/归档流程。
- 正式证据沿用：三张协议/证据表完整；当前管理员同时满足 active `admin_users` 与 `profiles.role='admin'`；正式库已有 `purchase_notice / 2026.0718-01 / draft`。因此不创建 policy Migration，不重放 `20260701/20260709`。
- 错误分类：新增共享 code-first 分类器；`23505`→HTTP 409 和指定重复版本提示，`42501`→403，`42P01/PGRST205`→503，`42703/PGRST204`→结构不兼容，其他错误使用不泄漏内部信息的通用提示。删除按表名/schema-cache 文本宽泛判断缺表的逻辑。
- 原始错误：协议查询 helper 改为直接抛出 Supabase 原始错误对象，避免提前包装成仅含 message 的 `Error` 丢失 code。
- 创建体验：保留普通 insert，未使用 upsert；增加 `useRef` 同步锁和请求中禁用。`23505` 后自动查询对应类型的 draft、刷新筛选列表并选中精确版本。
- 编辑体验：draft 列表增加“编辑”和“取消编辑”；载入类型、版本、标题、正文、生效时间，保存调用现有 `update_draft`。类型/版本在编辑模式不可修改，ID 只来自选中记录，服务端读取并再次约束 `status=draft`。
- 发布加固：读取错误不再误当 404；旧 published 归档错误会立即抛出并停止目标发布；目标 update 再次约束 draft。两次写仍非事务，完整原子化需要后续独立 RPC/Migration。
- 归档加固：服务端先读取目标并只允许 published，最终 update 同样约束 published，不再只依赖前端按钮可见性。
- 缓存与日志：缓存刷新 helper 返回结果并吞吐异常；失败只安全记录 action、脱敏文档 ID、类型和版本，不改变成功响应。协议数据库错误日志只记录 action、code、约束摘要、脱敏 ID、类型和版本，不记录正文、完整请求、请求元数据、密钥或用户敏感信息。
- 测试：新增分类器单测和协议管理源契约回归测试；`npm test` 通过 134/134，`npm run typecheck` 通过。
- 构建：`npm run build` 通过；仅出现仓库既有 Supabase dynamic dependency 与若干页面 CSR deopt 警告。
- 修改范围：协议管理页面与三组相关管理 API、共享协议错误/查询工具、缓存刷新返回值、测试脚本与两份新测试，以及三份项目文档。
- 正式边界：修复尚未 commit、push、部署或正式验证；正文为“1”的 `purchase_notice` 草稿仍禁止发布。
- 未执行：任何 SQL、RPC、Migration、生产 API、数据库/协议修改、环境变量修改、部署、commit 或 push；未删除或修改审计证据。
