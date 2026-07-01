# Jianlian Shop 管理员审计日志验收报告

## 现有审计结构

当前基础表来自 `20260623_admin_audit_logs.sql`：

| 字段 | 用途 |
| --- | --- |
| `id` | 审计记录 UUID |
| `admin_user_id` / `admin_email` | 操作管理员摘要 |
| `action` | 稳定操作代码 |
| `module` | 业务模块 |
| `target_type` / `target_id` / `target_label` | 目标资源摘要 |
| `request_id` | 请求追踪 ID |
| `ip_address` / `user_agent` | 请求来源摘要 |
| `result` | `success` / `failed` / `denied`，本次扩展支持 `partial` |
| `error_code` / `error_message` | 失败摘要 |
| `before_summary` / `after_summary` | 变更前后摘要 |
| `metadata` | 脱敏元数据 |
| `created_at` | 创建时间 |

新增兼容 migration `20260630_admin_audit_integrity.sql` 扩展：

- `actor_type`
- `actor_user_id`
- `actor_admin_id`
- `resource_type`
- `resource_id`
- `business_no`
- `reason`
- `ip_hash`
- `user_agent_summary`
- `previous_hash`
- `record_hash`
- `integrity_status`

## 审计覆盖矩阵

| 操作类型 | 当前覆盖位置 | 结果 |
| --- | --- | --- |
| 商品新增/编辑/SKU 保存 | `app/api/admin/catalog/_shared.ts` | 已接入统一审计服务 |
| 分类新增/编辑/删除 | `app/api/admin/catalog/_shared.ts` | 已接入统一审计服务 |
| 库存导入/批次操作 | `app/api/admin/inventory/route.ts` | 已接入统一审计服务 |
| 订单状态修改 | `app/api/admin/orders/[orderId]/route.ts` | 已接入统一审计服务 |
| 人工交付 | `app/api/admin/orders/[orderId]/items/[itemId]/deliver/route.ts` | 已接入统一审计服务 |
| 自动发货重试 | 订单交付 API | 已记录成功/失败摘要 |
| 支付/对账查看和复核 | `app/api/admin/payments/**` | 已接入统一审计服务 |
| 退款查看/审核 | `app/api/admin/refunds/**` | 已接入统一审计服务 |
| 余额调整、账户状态、风险状态 | `app/api/admin/users/[userId]/actions/route.ts` | 高风险操作已检查审计写入结果 |
| 网站设置修改 | `app/api/admin/settings/route.ts` | 已接入统一审计服务 |
| 媒体资源删除 | `app/api/admin/media/route.ts` | 已接入统一审计服务 |
| 生产就绪、数据库检查、数据一致性 | `app/api/admin/system/**` | 已接入统一审计服务 |
| 后台全局搜索 | `app/api/admin/global-search/route.ts` | 已接入 denied/success/failed 审计 |
| 订单关联视图 | `app/api/admin/orders/[orderId]/relations/route.ts` | 已接入查看审计 |
| 隐私请求处理 | `app/api/admin/privacy-requests/route.ts` | 已接入 privacy 模块审计 |
| 普通用户访问后台接口 | 多个后台 API 的 `getServerAdminContext` 分支 | 关键接口已记录 denied |

## 统一写入服务

统一服务：`lib/admin/audit-log-service.ts`。

本次增强：

- `AdminAuditResult` 增加 `partial`。
- 增加 `HIGH_RISK_AUDIT_ACTIONS` 高风险 action 集合。
- 增加 `isHighRiskAuditAction(action)`。
- 增加 `writeRequiredAdminAuditLog(input)`，用于余额、退款、权限变更、人工交付等必须留痕的操作。
- `sanitizeAuditValue` 已按字段名脱敏密码、Token、密钥、支付回调、数字库存内容等敏感值。

## 高风险操作处理

高风险操作要求：

1. 服务端验证管理员权限。
2. 前端二次确认不能替代服务端权限检查。
3. 原因不能为空，并保存为摘要。
4. 使用幂等键避免重复执行。
5. 业务成功后必须写审计日志。
6. 审计写入失败时不得静默成功。

已发现：部分旧接口仍使用 `writeAdminAuditLog` 的非阻断模式。资金和账户相关动作已经有审计结果检查；后续新增高风险 API 应统一使用 `writeRequiredAdminAuditLog`。

## 后台审计页面结果

页面：`/admin/audit-logs`。

接口：`GET /api/admin/audit-logs`。

支持筛选：管理员邮箱、模块、操作、结果、目标 ID、请求 ID、时间范围、分页。

本次修复：

- 修复接口内乱码中文错误提示。
- `VALID_MODULES` 增加 `privacy`。
- `VALID_RESULTS` 增加 `partial`。

## RLS 与权限结果

现有基础 migration：

- `admin_audit_logs` 启用 RLS。
- `anon` 无权限。
- `authenticated` 仅超级管理员策略可读取。
- 写入依赖服务端 service role。

新增完整性 migration 进一步声明：

- 撤销 `authenticated` 的 insert/update/delete。
- 只授予 authenticated select，由 RLS 限制超级管理员读取。
- service_role 保留写入和维护权限。

## 日志完整性检查

新增模块：`lib/admin/audit-integrity.ts`。

新增接口：`GET /api/admin/audit-logs/integrity`。

能力：

- 检查最近 N 条审计记录的 `record_hash`。
- 缺少完整性字段时返回“审计完整性字段尚未初始化，请管理员执行 audit integrity migration。”。
- 仅超级管理员可访问。
- 检查动作本身写入审计日志。

说明：现有历史记录不会自动回填哈希。执行 migration 后，仍需要受控 backfill/job 按时间顺序写入 `previous_hash` 和 `record_hash`。

## 日志保留策略

详见 `docs/audit-log-retention.md`。

核心规则：资金、退款、权限、风控和人工交付日志长期保留；普通系统检查日志可按较短周期归档；生产环境不自动删除审计日志。

## 数据脱敏结果

审计写入服务会脱敏以下字段名：

- password
- token
- secret
- api key
- signature
- private
- credential
- content
- card
- code
- payload
- raw
- callback
- proof
- cookie
- authorization

接口返回和导出策略要求不展示密码、Token、密钥、完整支付回调、完整数字库存内容和完整用户隐私资料。

## 发现的问题

1. `app/api/admin/audit-logs/route.ts` 中存在乱码中文错误提示，且筛选白名单缺少 `privacy` 和 `partial`。
2. 审计表缺少完整性字段，无法检查日志是否被篡改。
3. 旧接口中仍存在非阻断审计写入模式，需按操作风险分级逐步替换。

## 已修复的问题

1. 审计日志 API 错误提示恢复为正常中文。
2. 审计日志查询支持 `privacy` 模块。
3. 审计日志查询支持 `partial` 结果状态。
4. 新增审计完整性校验工具和只读 API。
5. 新增兼容 migration，补齐完整性字段、索引和权限声明。
6. 新增审计日志保留策略文档。

## 仍存在的问题

1. 完整性字段 migration 尚未手动执行。
2. 历史审计日志哈希需要后续受控 backfill，不应在 Codex 自动执行。
3. 部分旧高风险接口仍可逐步改为 `writeRequiredAdminAuditLog`，本次未大规模重构避免影响业务。

## 需要执行的 Migration

- `supabase/migrations/20260630_admin_audit_integrity.sql`
- `supabase/migrations/20260630_business_id_global_search_indexes.sql`

本次未自动执行任何 Supabase SQL。
