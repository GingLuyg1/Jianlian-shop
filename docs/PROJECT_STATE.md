# Jianlian Shop 当前项目状态

更新日期：2026-07-19
代码基线：`main` / `f43c841d087960b91a8cf6b25c386551b64bb992`
状态口径：代码事实来自仓库只读核对；正式库事实来自用户在目标项目人工执行只读审计、Migration 和 Postcheck 后提供的执行记录及 `docs/audits/postcheck-results/*.csv`。审计未覆盖的对象仍不得视为已确认。

## 项目架构

- 应用：Next.js 13 App Router、React 18、TypeScript。
- 数据：Supabase/PostgreSQL；服务端通过 Supabase client 和 RPC 处理订单、支付、库存等关键事务。
- UI：Tailwind CSS、Radix UI 等组件库。
- 验证：Node 脚本、单元/回归测试、Playwright E2E、TypeScript 类型检查与 Next.js 构建。
- 主要目录：`app/` 页面/API，`components/` UI，`lib/` 领域服务，`supabase/migrations/` 数据库变更，`scripts/` 就绪检查，`tests/` 测试，`docs/` 运维与验证文档。

## 支付系统已完成功能

以下状态由用户确认，且仓库中存在对应 API、服务、Migration 与测试/验证文档：

- BEP20 正常支付链路与 TxHash 校验。
- 通过链交易认领记录及 `(chain_id, tx_hash)` 唯一认领逻辑防止同一交易被不同订单重复认领。
- 人工审核流程。
- 晚到账处理。
- 已批准的超额付款完成处理，并将超额部分转入用户余额。

关键代码包括 `app/api/payments/bep20/verify/route.ts`、`lib/payments/bep20-chain-service.ts`，以及 `20260704`、`20260708`、`20260715` 系列 BEP20 Migration。这里的“已完成”不等于本轮重新执行了真实支付；本轮未触发支付、未读取或记录密钥及完整收款地址。

## 订单过期当前实现

- 内部接口：`GET/POST /api/internal/orders/expire`。
- 鉴权：支持 `Authorization: Bearer <secret>`，代码还兼容内部密钥请求头；不会在文档中记录密钥值。
- 参数：支持 `dry_run` 和 `limit`。dry-run 默认 10、上限 50；实际处理默认 50、上限 200。
- 服务层先调用 `list_expirable_unpaid_orders(p_limit)` 获取候选，再逐单调用 `expire_unpaid_order(p_order_id, p_reason)`。
- RPC 负责订单终态变更、付款状态更新、过期时间写入及库存预留释放；重复执行通过状态和 `reservation_released_at` 等条件防止重复释放。
- `20260717_order_expiration_list_rpc_compatibility.sql` 的候选规则要求 `pending_payment/unpaid`、预留未释放并已到期；如果存在链上支付会话，还会避开正在正常处理且没有失败原因的提交状态。
- 当前仓库没有 `pg_cron`、`pg_net` 或 `cron.schedule` 的调度 SQL，也没有指向该接口的 Vercel Cron 配置。当前决定是 Hobby 计划不使用 Vercel Cron，后续使用 Supabase `pg_cron + pg_net`，但尚未在正式环境创建。

## 正式库只读审计结论（2026-07-18）

证据来源：用户确认目标为 Jianlian-shop / `qvbovrvybirscaurwuov`，并人工执行 `docs/audits/production-order-expiration-readonly-audit.sql`；以下“已确认”均来自其 CSV 导出，不是根据仓库猜测。

### 数据库实际查询确认

- `orders.payment_expires_at`、`orders.reservation_released_at`、`orders.expired_at` 均存在，类型为 `timestamptz`，允许空值且无默认值。
- `orders.status` 与 `orders.payment_status` 均为非空 `text`；默认值分别为 `pending_payment` 与 `unpaid`。
- `orders_unpaid_expiration_idx` 存在，列顺序为 `(payment_expires_at, status, payment_status)`，条件为 `payment_expires_at is not null and status = 'pending_payment' and payment_status <> 'paid'`。
- 正式库共查到四个相关函数签名：
  - `public.cancel_unpaid_order(uuid, text) → jsonb`，OID 27132。
  - `public.expire_unpaid_order(uuid, text) → jsonb`，OID 27133。
  - `public.release_order_inventory(uuid) → integer`，OID 25932。
  - `public.release_order_inventory(uuid, text) → jsonb`，OID 27131。
- 四个函数均由 `postgres` 拥有，均为 `SECURITY DEFINER`、`VOLATILE`、`PARALLEL UNSAFE`，并固定 `search_path=public`。
- `cancel_unpaid_order(uuid,text)` 允许 `authenticated` 与 `service_role` 执行；拒绝 `anon` 与 `public`。
- `expire_unpaid_order(uuid,text)` 及两个 `release_order_inventory` 重载仅允许 `service_role` 执行；`anon`、`authenticated`、`public` 均无执行权。
- 首轮审计时 `public.list_expirable_unpaid_orders(integer)` 没有任何签名、定义或权限记录；该缺口已在后续人工 Migration 中补齐。
- `pg_cron` 与 `pg_net` 可用但未安装；`supabase_vault` 已安装，版本 `0.3.1`；名为 `vault` 的扩展不可用且未安装。
- `cron` schema 与 `cron.job` 表均不存在，因此当前没有可查询的 Cron 任务表。
- 元数据关键词搜索未返回 `set_order_payment_expiration` 或 `trg_orders_set_payment_expiration`；在本次查询覆盖范围内，这两个 `20260701` 对象没有出现在正式库。

### 正式库函数实际行为

- `expire_unpaid_order(uuid,text)` 最终写入 `orders.status='expired'`，不是 `cancelled`。
- 当原付款状态为 `unpaid` 时写为 `failed`；`expired_at` 使用 `coalesce(expired_at, now())`，不会覆盖已有值。
- 到期判断使用 `coalesce(payment_expires_at, created_at + interval '30 minutes')`。
- 已付款或已进入 `paid/processing/delivered/completed/refunded` 的订单会跳过；已 `expired` 或 `cancelled` 的订单幂等返回。
- 如果普通 `payment_sessions` 中存在已付款记录则跳过；否则将该订单的 `pending/processing` 会话写为 `expired`，并关闭 `pending/processing/failed` 会话。
- 正式函数调用两参数重载 `release_order_inventory(order_id, reason)`。该重载先检查 `reservation_released_at`，避免重复释放；恢复未交付且非自动交付的 SKU/普通商品库存；将未交付的已预留数字库存恢复为 `available`；最后写入 `reservation_released_at`。
- 当前两参数释放函数不会清空 `digital_inventory.reserved_user_id`，也不会写 `orders.reservation_release_reason`。这与仓库 `20260709` 版本不同，但与 `20260710` 兼容基线一致。
- 一参数 `release_order_inventory(uuid) → integer` 是旧重载，仅处理旧式数字库存并调用库存同步函数；过期 RPC 不会解析到该重载。
- 首轮审计时正式库不存在 `list_expirable_unpaid_orders`，当时没有实际候选筛选逻辑可确认；后续 Migration 与 Postcheck 已确认该 RPC 部署完成。

### 第二轮依赖审计实际确认

- `public.chain_payment_sessions` 存在且为普通表；`order_id uuid not null`、`status text not null default 'waiting_payment'`、`failure_reason text null` 均存在。
- 外键 `chain_payment_sessions_order_id_fkey` 将 `order_id` 引用到 `public.orders(id)`，更新规则为 `NO ACTION`，删除规则为 `RESTRICT`。
- `status` 使用 `text + CHECK`，不是 enum。约束接受 `waiting_payment`、`submitted`、`confirming`、`verified`、`completing`、`payment_failed`、`paid`、`underpaid`、`overpaid`、`expired`、`manual_review`、`failed`，覆盖 `20260717` 列表 RPC 使用的全部链上状态。
- 已有以 `order_id` 开头的普通索引、以 `status` 开头的索引，以及 `(order_id, payment_method)` 活跃会话部分唯一索引；未发现精确的 `(order_id, status)` 复合索引。这不阻止函数创建，但执行计划和正式数据量下的性能仍需上线后观察。
- `orders_status_check` 接受 `expired`，`orders_payment_status_check` 接受 `failed`；因此正式 `expire_unpaid_order` 的 `expired/failed` 写入符合现有约束。
- 依赖汇总确认 `orders.id/payment_expires_at/reservation_released_at/status/payment_status` 与 `chain_payment_sessions.order_id/status/failure_reason` 八个依赖字段全部存在；`orders.created_at` 另由现有索引和已编译函数定义间接确认。
- 独立布尔存在性审计结果 `06-orders-extra-columns.csv` 返回 `reservation_release_reason_exists=false`，由正式库元数据查询确认 `public.orders.reservation_release_reason` 不存在。它不被 `20260717` 列表 RPC 引用，因此不构成此次最小修复的阻断条件。

### Postcheck 确认的候选行为

- `20260717` 候选逻辑要求 `pending_payment`、严格 `unpaid`、`reservation_released_at is null`，并且 `coalesce(payment_expires_at, created_at + 30 minutes) <= now()`。
- 该定义会阻止 `confirming`、`verified`、`completing`、`manual_review`、`underpaid`、`overpaid`、`paid`、`payment_failed` 自动过期；`submitted` 且 `failure_reason` 为空也阻止过期，`submitted` 且失败原因非空则允许继续候选。
- Postcheck 函数定义已确认上述逻辑部署到正式库；后续正式 dry-run 返回 `candidate_count=0`，确认执行当时没有符合规则的正式候选订单。

### 已识别的实现差异

- 早期 `20260701_order_expiration_inventory_release.sql` 中 `expire_unpaid_order` 将订单状态写为 `cancelled`。
- 后续 `20260710_order_lifecycle_compatibility_baseline.sql` 中兼容实现将状态写为 `expired`，付款状态从 `unpaid` 写为 `failed`。
- 用户提供的测试结果 `pending_payment/unpaid → expired/failed` 与 `20260710` 行为一致。
- 因多个 Migration 会替换同名 RPC，正式环境最终行为必须以正式库函数定义的只读审计结果为准，不能仅凭仓库文件顺序推断。

## 正式与测试 Supabase 项目

| 环境 | 项目名 | Project ref | 当前可确认状态 |
| --- | --- | --- | --- |
| 正式 | Jianlian-shop | `qvbovrvybirscaurwuov` | 用户已人工执行 `20260717` 最小 Migration，SQL Editor 返回 Success；Postcheck 确认列表 RPC 已存在、定义匹配且仅 `service_role` 可执行。`pg_cron`/`pg_net` 仍未安装，尚无 Cron schema。 |
| 测试 | Jianlian-shop-test | `czuoivbfxzachiobdohw` | 用户确认已执行 `20260717_order_expiration_list_rpc_compatibility.sql`，并完成一笔测试订单的过期与库存释放验证。 |

任何正式库操作前必须同时核对项目名与 Project ref，避免连接到测试项目或其他项目。

## Migration 状态

仓库当前包含从 `20260619_products_categories_baseline.sql` 到 `20260717_order_expiration_list_rpc_compatibility.sql` 的 Migration 文件。文件存在只代表版本库内有定义，不代表数据库已执行。

与当前阶段直接相关的文件：

- `20260701_order_expiration_inventory_release.sql`：增加过期/释放字段、索引及早期订单过期 RPC。
- `20260709_order_lifecycle_non_payment_hardening.sql`：订单非支付生命周期加固。
- `20260710_order_lifecycle_compatibility_baseline.sql`：字段、索引和生命周期 RPC 的兼容基线。
- `20260717_order_expiration_list_rpc_compatibility.sql`：兼容版候选订单列表 RPC。

实际对象与仓库 Migration 对比：

- `20260701_order_expiration_inventory_release.sql`：三个时间字段和目标索引已存在；但正式 `expire_unpaid_order` 不再是该文件的 `cancelled` 版本；该文件的旧列表 RPC、付款过期设置函数和触发器未在审计结果中出现。
- `20260709_order_lifecycle_non_payment_hardening.sql`：字段、索引及生命周期能力大体存在；但正式两参数库存释放函数没有该版本的 `reservation_release_reason` 写入和 `reserved_user_id` 清理，函数定义不一致。
- `20260710_order_lifecycle_compatibility_baseline.sql`：正式库的两参数库存释放、取消、过期函数及权限与该兼容基线一致；旧的一参数 `integer` 重载被保留，符合该文件“不改变既有返回类型”的兼容策略。
- `20260717_order_expiration_list_rpc_compatibility.sql`：用户已按 SHA-256 `7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519` 在正式项目人工执行，SQL Editor 返回 Success；Postcheck 已通过。
- 测试库：用户确认已执行 `20260717_order_expiration_list_rpc_compatibility.sql`。
- 正式库真实 Migration 执行历史仍未审计；以上仅是对象级对比，不能反推哪些完整 Migration 曾经执行。

## 已验证结果

用户确认测试订单 `JL202607090931518235` 已完成以下验证：

- `pending_payment/unpaid → expired/failed`。
- `expired_at` 已写入。
- `reservation_released_at` 已写入。
- 对应商品库存从 234 恢复到 235。

该结果证明测试环境中的指定场景已通过，不自动证明正式环境结构一致，也不证明调度已配置。

## 20260717 正式执行与 Postcheck

- 执行主体：用户在正式项目 Jianlian-shop / `qvbovrvybirscaurwuov` 的 `main / PRODUCTION` 环境人工执行。
- 执行前文件 SHA-256：`7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`。
- SQL Editor 返回 Success；该 DDL 没有结果行属于正常执行结果。
- Postcheck 确认 `public.list_expirable_unpaid_orders(p_limit integer)` 已存在，OID 为 27525，返回 `TABLE(order_id uuid)`，owner 为 `postgres`，语言为 `plpgsql`，`SECURITY DEFINER=true`，`search_path=public`。
- 完整定义与批准的 Migration 一致：默认 limit 50，限制为 1—200；筛选到期的 `pending_payment/unpaid` 且预留未释放订单，并按既定链上会话状态排除规则保护处理中付款。
- 权限符合 service-role-only：`service_role` 有 EXECUTE；`anon`、`authenticated`、`PUBLIC` 均无 EXECUTE。
- Postcheck 已通过，最小 Migration 阶段完成。回滚 SQL 仍只作为紧急且单独授权的方案保留，不应因成功上线而执行。

## 正式环境 dry-run（已通过）

- 执行主体：用户人工执行。
- 正式项目：Jianlian-shop / `qvbovrvybirscaurwuov`。
- 正式站：`https://jianlian-shop.vercel.app`。
- 请求：`GET /api/internal/orders/expire?dry_run=true&limit=10`。
- 响应：HTTP 200，`success=true`、`dry_run=true`、`candidate_count=0`、`candidates=[]`。
- 已确认 `CRON_SECRET`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和 `public.list_expirable_unpaid_orders(integer)` 的正式链路正常。
- Dry-run 没有调用真实过期处理，未修改订单、库存或支付会话。
- 由于没有候选，本阶段明确不执行真实 `limit=1`。

## 正式库协议版本化只读审计（2026-07-18）

证据来源：用户在正式项目 Jianlian-shop / `qvbovrvybirscaurwuov` 人工执行 14 个只读查询。用户给出的结果目录名为 `docs/audits/legal-versioning-audit-results/`，但本地实际 CSV 位于 `docs/audits/legal-versioning-audit-queries/`；01—14 文件齐全，本节仅以这些 CSV 为数据库事实。

### 数据库实际查询确认

- `public.legal_documents`、`public.order_agreement_acceptances`、`public.order_evidence_events` 均存在且为普通表，owner 均为 `postgres`，RLS 均已启用但未强制。
- `orders`、`profiles`、`auth.users` 和 `extensions.gen_random_uuid()` 依赖均存在；UUID 函数由 `pgcrypto` 提供。
- 三张表的 36 个基线字段、类型、默认值和可空性与 `20260701_legal_documents_order_evidence.sql` 一致。
- 主键、`(document_type, version)`、`(order_id, document_type)` 唯一约束、6 个外键、3 个 CHECK、10 个索引均存在、有效且与仓库基线定义一致。
- 未发现非内部触发器，也未发现名称或依赖指向协议/证据表的额外函数。
- `anon`、`authenticated`、`service_role` 和 `postgres` 对三张表均有表级 CRUD 权限；因此创建草稿失败不是 relation grant 缺失，实际写入仍受 RLS 约束。
- `legal_documents` 的公开读取 policy 仅放行已发布且已生效记录；管理员读取和管理 policy 均只接受 `profiles.id=auth.uid()` 且 `profiles.role='admin'`。
- 当前正式库共有 5 条协议记录：`terms_of_service/refund_policy/digital_delivery_policy` 各 1 条 published，`privacy_policy/purchase_notice` 各 1 条 draft。CSV 没有 `refund_policy` draft；这与此前后台口头观察“退款政策另有 draft”不一致，应以正式审计聚合为准。
- 已发布记录共 3 条，草稿共 2 条；`purchase_notice` 没有 published，和 `/api/legal/current` 只缺该类型的 HTTP 503 结果一致。

### 根因判断与兼容性结论

- 当前后台接口使用带用户会话的 anon-key Supabase client。后台认证允许有效 `admin_users` 记录或旧 `profiles.role='admin'`，但 `legal_documents` 管理 policy 只接受后者。
- 后续 8 份正式 preflight 已确认：正式库只有 1 个 active `super_admin`，该管理员同时满足 `profiles.role='admin'`，且 `active_admin_users_without_profile_admin=0`。因此，虽然应用认证与旧 policy 的标准在设计上不完全一致，但“当前管理员不满足旧 policy 导致 RLS 拒绝”已被本次正式事实排除，暂不创建 policy Migration。
- 正式库已存在 `purchase_notice / 2026.0718-01 / draft`。`legal_documents` 有 `(document_type, version)` 唯一约束，当前页面的 `create_draft` 只做 insert；如果再次提交该精确组合，数据库必然返回 `23505`。这是当前创建草稿失败的最高可信原因。
- 当前 `/api/admin/legal` 的错误分类忽略 `error.code`，并把 message 中只要含 `legal_documents` 的普通错误一律映射成“协议版本表尚未初始化”。`23505` 的约束错误通常携带表/约束名，因而与页面现有误报完全吻合。
- 发布功能是否存在独立故障仍无法确认：当前没有发布请求的原始 code/message。代码确有非事务两步更新且未检查第一步归档错误的结构风险，但不能据此宣称正式发布已失败。
- `legal_documents.is_current`、`archived_at`、`archived_by` 三个增强 API 字段不存在。当前页面 `/api/admin/legal` 不依赖它们，所以它们不是本次失败原因；若未来启用 `/api/admin/settings/legal`，需另行设计字段、回填和约束 Migration。
- 不应原样重放 `20260701_legal_documents_order_evidence.sql`：基线对象已经完整存在，原文件会重建相同且仍不兼容 `admin_users` 的 policy，不能修复根因，也不会补齐三个增强字段。
- 绝对不得重放 `20260709_legal_documents_seed.sql`；它包含测试协议正文，会归档现有 published 并写入/覆盖测试版本。
- 本地代码已完成错误分类与重复提交体验修复，不涉及数据库 policy Migration：`23505` 返回 HTTP 409，`42501` 返回 HTTP 403，`42P01/PGRST205` 返回 HTTP 503；`42703/PGRST204` 返回结构不兼容提示。按 `legal_documents`、schema cache 或普通表名宽泛判断缺表的逻辑已移除，其他数据库/PostgREST 错误不会向客户端泄漏内部信息。
- `create_draft` 保持普通 insert；页面新增同步提交锁、重复 draft 刷新定位、draft 编辑和取消编辑。编辑调用现有 `update_draft`，服务端再次检查记录状态且不接受客户端修改记录 ID。
- 发布/归档已加固：读取错误与不存在分开；旧 published 归档错误会阻止后续发布；发布和归档 update 带状态约束；archive 服务端拒绝非 published。缓存刷新失败不会覆盖已成功的数据库结果，只记录脱敏上下文。
- 协议错误日志仅保留 action、数据库 code、约束摘要、脱敏文档 ID、document_type 和 version；不记录协议正文、完整请求 body、请求元数据、密钥或用户敏感信息。
- 本地验证通过：`npm test` 134/134、`npm run typecheck`、`npm run build`。修复尚未 commit、push、部署或在正式环境验证。

### 数据影响与回滚边界

- 本轮结论不要求修改 policy、表结构或协议数据；现有 5 条记录和 3 published / 2 draft 聚合保持不变。
- 错误码泄漏和快速重复提交已在本地修复；剩余主要风险是发布两步更新仍非事务，旧版本归档成功而新版本发布失败时可能出现部分成功。
- 代码错误映射修复可通过回滚对应代码提交恢复；它不需要数据库回滚。发布事务化若未来需要，应作为独立数据库方案审查。

## 当前生产上线缺口

1. 协议版本管理修复尚未 commit、push、部署或在正式环境验证；正式 `purchase_notice / 2026.0718-01` 测试草稿正文“1”不得发布。
2. 完整事务化发布仍是后续独立任务；当前两步发布流程必须保留部分成功风险提示。
3. 创建或等待一个明确的正式测试订单通过正常业务流程自然过期；不得通过 SQL 或直接数据库修改制造候选。
4. 在候选出现后完成只读前置核对，并重新执行一次 `dry_run=true&limit=1`，确认脱敏摘要稳定且对应指定测试订单。
5. 取得单独明确授权后，才执行一次真实 `limit=1` 受控验证。
6. 验证订单状态、付款状态、过期时间、预留释放和库存恢复全部正确后，才评估安装 `pg_cron`、`pg_net` 并创建调度。

真实 `limit=1` 是数据库写操作且不能依赖自动回滚；若候选身份、付款状态、链上会话或库存基线有任何不确定，必须停止。

## 2026-07-22 BEP20 支付发布前总审计（本地未提交、未部署）

- 当前 HEAD / `origin/main` 均为 `88b64e40b41e26a80218f9b993d1a6f8fc75896a`；本节功能仍只存在于未提交工作区。
- 精确付款与合法超额付款以可信链上区块时间比较 `orders.payment_expires_at`、`chain_payment_sessions.expires_at` 和基础支付会话截止时间的最早值；汇率 TTL 只限制创建新快照。
- 关键金额分类使用 JavaScript `BigInt` 和 PostgreSQL `numeric` 原始最小单位；多笔匹配 Transfer、错误网络/合约/地址、reverted、缺失区块时间不会自动完成。
- 未执行的 `20260727_bep20_automatic_overpayment_settlement.sql` 复用 `profiles.balance`、`balance_transactions` 与 `bep20_overpayment_dispositions`，在一个数据库事务中完成付款和超额余额入账；数字交付只在事务成功后触发。
- 发布前最后财务加固已复用现有私有 `site_settings`：`max_auto_overpayment_usdt` 与 `max_auto_overpayment_ratio` 必须同时为可信正数，绝对值和比例任一超限或配置不可用时均原子转 `manual_review`，不付款、不入账、不交付。Migration 不静默填入建议阈值。
- 人工超额入账已改为 Cookie super-admin 鉴权后显式使用 service-role client；新四参数财务 RPC 仅 `service_role` 可执行，PUBLIC/anon/authenticated 均无执行权，并继续在函数内复核 operator、状态、锁、幂等和审计。
- 审计补强：显式验证 `profiles.balance numeric(12,2)` 并在溢出前失败；自动和人工超额路径使用同一 chain-session advisory lock；订单链 claim 与已完成账户充值之间增加跨业务 TxHash 数据库保护。
- 响应丢失恢复：自动 disposition 或基础 payment session 已持久化成功时，应用读取数据库事实并继续安全交付，不把已付款结果降级为失败。
- 用户端：过期订单不再渲染自助 TxHash 入口；paid/delivered/manual_review/expired 隐藏无效倒计时和确认进度；支付页、订单详情和抽屉复用 `SecureOrderDelivery`。
- 管理员端：disposition 读取 `settlement_source`，自动结算显示为自动来源，已有 disposition 时不再提供人工余额入账。
- 新增正式只读审计 SQL与上线手册；20260727 Migration、生产部署、精确付款、超额付款和重复 TxHash 正式验收均尚未执行。
