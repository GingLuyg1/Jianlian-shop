# Jianlian Shop 当前项目状态

更新日期：2026-07-18
代码基线：`main` / `69d794a0325c2967e65b2ae19e577030a14c6b11`
状态口径：代码事实来自仓库只读核对；正式库事实来自用户在目标项目人工执行两轮只读审计后导出的 `docs/audits/results/*.csv` 与 `docs/audits/dependency-results/*.csv`。审计未覆盖的对象仍不得视为已确认。

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
- `public.list_expirable_unpaid_orders(integer)` 没有任何签名、定义或权限记录，正式库确认缺失。
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
- 正式库不存在 `list_expirable_unpaid_orders`，所以没有“实际候选筛选逻辑”可确认。当前应用批处理和 dry-run 依赖该 RPC，在补齐前无法正常列出候选。

### 第二轮依赖审计实际确认

- `public.chain_payment_sessions` 存在且为普通表；`order_id uuid not null`、`status text not null default 'waiting_payment'`、`failure_reason text null` 均存在。
- 外键 `chain_payment_sessions_order_id_fkey` 将 `order_id` 引用到 `public.orders(id)`，更新规则为 `NO ACTION`，删除规则为 `RESTRICT`。
- `status` 使用 `text + CHECK`，不是 enum。约束接受 `waiting_payment`、`submitted`、`confirming`、`verified`、`completing`、`payment_failed`、`paid`、`underpaid`、`overpaid`、`expired`、`manual_review`、`failed`，覆盖 `20260717` 列表 RPC 使用的全部链上状态。
- 已有以 `order_id` 开头的普通索引、以 `status` 开头的索引，以及 `(order_id, payment_method)` 活跃会话部分唯一索引；未发现精确的 `(order_id, status)` 复合索引。这不阻止函数创建，但执行计划和正式数据量下的性能仍需上线后观察。
- `orders_status_check` 接受 `expired`，`orders_payment_status_check` 接受 `failed`；因此正式 `expire_unpaid_order` 的 `expired/failed` 写入符合现有约束。
- 依赖汇总确认 `orders.id/payment_expires_at/reservation_released_at/status/payment_status` 与 `chain_payment_sessions.order_id/status/failure_reason` 八个依赖字段全部存在；`orders.created_at` 另由现有索引和已编译函数定义间接确认。
- 独立布尔存在性审计结果 `06-orders-extra-columns.csv` 返回 `reservation_release_reason_exists=false`，由正式库元数据查询确认 `public.orders.reservation_release_reason` 不存在。它不被 `20260717` 列表 RPC 引用，因此不构成此次最小修复的阻断条件。

### 仅根据仓库定义确认的候选行为

- `20260717` 候选逻辑要求 `pending_payment`、严格 `unpaid`、`reservation_released_at is null`，并且 `coalesce(payment_expires_at, created_at + 30 minutes) <= now()`。
- 该定义会阻止 `confirming`、`verified`、`completing`、`manual_review`、`underpaid`、`overpaid`、`paid`、`payment_failed` 自动过期；`submitted` 且 `failure_reason` 为空也阻止过期，`submitted` 且失败原因非空则允许继续候选。
- 第二轮审计只证明上述 SQL 的结构和约束依赖兼容，不读取业务数据，因此没有确认正式库实际候选数量或任一订单是否应被过期。

### 已识别的实现差异

- 早期 `20260701_order_expiration_inventory_release.sql` 中 `expire_unpaid_order` 将订单状态写为 `cancelled`。
- 后续 `20260710_order_lifecycle_compatibility_baseline.sql` 中兼容实现将状态写为 `expired`，付款状态从 `unpaid` 写为 `failed`。
- 用户提供的测试结果 `pending_payment/unpaid → expired/failed` 与 `20260710` 行为一致。
- 因多个 Migration 会替换同名 RPC，正式环境最终行为必须以正式库函数定义的只读审计结果为准，不能仅凭仓库文件顺序推断。

## 正式与测试 Supabase 项目

| 环境 | 项目名 | Project ref | 当前可确认状态 |
| --- | --- | --- | --- |
| 正式 | Jianlian-shop | `qvbovrvybirscaurwuov` | 已由用户人工完成两轮只读元数据审计：核心字段、索引、生命周期函数及 `20260717` 的链上会话依赖均兼容；候选列表 RPC 缺失；`pg_cron`/`pg_net` 未安装；尚无 Cron schema。 |
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
- `20260717_order_expiration_list_rpc_compatibility.sql`：正式库缺少该文件定义的 `list_expirable_unpaid_orders(integer)`；第二轮依赖审计确认其表、字段、外键及状态约束依赖满足，可原样作为当前最小兼容性修复，不需要附加表结构或索引变更。
- 测试库：用户确认已执行 `20260717_order_expiration_list_rpc_compatibility.sql`。
- 正式库真实 Migration 执行历史仍未审计；以上仅是对象级对比，不能反推哪些完整 Migration 曾经执行。

## 已验证结果

用户确认测试订单 `JL202607090931518235` 已完成以下验证：

- `pending_payment/unpaid → expired/failed`。
- `expired_at` 已写入。
- `reservation_released_at` 已写入。
- 对应商品库存从 234 恢复到 235。

该结果证明测试环境中的指定场景已通过，不自动证明正式环境结构一致，也不证明调度已配置。

## 当前生产上线缺口

当前目标为 C → G：Cron 调度、正式库最小 Migration、生产环境受限上线。上线前仍缺：

1. 人工逐块执行 `docs/audits/production-list-rpc-preflight.sql`，确认目标函数仍不存在且依赖未漂移。
2. 用户单独明确授权正式 Migration。
3. 人工只执行 `20260717_order_expiration_list_rpc_compatibility.sql`，并保存项目标识、文件哈希和执行结果。
4. 人工逐块执行 `docs/audits/production-list-rpc-postcheck.sql`，复核签名、定义、安全属性和权限。
5. postcheck 通过后，再由用户另行决定是否授权正式环境 dry-run；`limit=1` 与 Cron 不属于当前阶段。

## 20260717 正式执行准备

- 完整静态审查确认 Migration 只创建或替换 `public.list_expirable_unpaid_orders(integer)`，设置 `SECURITY DEFINER`、`search_path=public`，并调整该精确签名的 EXECUTE 权限。
- 文件不包含表结构、订单数据、库存数据、索引、触发器、RLS、其他 RPC、扩展或调度修改。
- 当前文件 SHA-256：`7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`。
- 已创建只读 preflight、只读 postcheck 和 `docs/runbooks/20260717-production-list-rpc-rollout.md`；这些文件只供后续人工执行与复核，本轮没有执行其中任何 SQL。
- 在 preflight 确认目标精确签名此前不存在的前提下，该变更可通过删除 `public.list_expirable_unpaid_orders(integer)` 回滚到原状态。回滚会重新造成列表 RPC 缺失，且必须取得独立明确授权。
