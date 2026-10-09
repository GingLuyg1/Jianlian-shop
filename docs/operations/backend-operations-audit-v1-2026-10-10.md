# 后台运营功能审计与补齐 V1

审计日期：2026-10-10（Asia/Shanghai）。代码基线及 Production live：`305d8499213e6121f068b0cb1a5f4ac52866a898`。
开发 worktree：`D:/Jianlian/Jianlian-shop-backend-operations-v1`，分支 `codex/backend-operations-audit-v1`。

## 结论及证据边界

本轮完成 exact repo 的后台页面、API、权限入口、运营关联数据、关键 RPC 和测试审计，以及 Production SSH/SQL SELECT-only 检查。两处低风险缺口仅在本地修复：退款分页、库存批次全局搜索字段。

没有可控制的已认证管理员浏览器。本报告中的“实现完整”指代码/已有测试链完整，不代表真实管理员 UI 已逐项验收。匿名 307/401 是正确的鉴权行为，不能当作已登录页面加载 PASS。退款、人工履约、SKU 批量操作等生产写路径均未执行。

用户确认两笔真实支付 E2E 已完成，本任务接受该冻结前提；未重新查 Provider、重跑 completion 或复核历史 canary。支付核心、reconciliation、migration 不在改动范围。

## Production 只读取证

- Supabase 项目重新确认：Jianlian-shop / `qvbovrvybirscaurwuov`，ACTIVE_HEALTHY，Postgres 17.6。
- 主 PM2：`/root/.pm2`，`jianlian-shop` online，PID 4015018；cwd、script、`/proc/cwd` exact live。
- `/api/health`、`/`、`/login`：200。
- `/admin` 及 orders/payments/recharges/users/products/inventory/refunds/suppliers/audit-logs 页面：未登录 307。
- orders/users/products/refunds/audit-logs/callbacks/reconciliations GET API：未登录 401。
- Alipay=false、WeChat=false、USDT-BEP20=true；两个 SNPAY 渠道 configured=true，provider=snpay。
- App gate、worker master gate、execute gate=true；SNPAY timer enabled/active，heartbeat=finished，检查时 age=1s。
- SELECT 汇总：products=47、SKU=10、orders=17、sessions=37、recharges=27、balance_transactions=21、digital_inventory=23、order_deliveries=6、supplier requests=0、refunds=0、callback logs=25、reconciliations=9、admin audit logs=425、active super-admin=1。
- 20 个重点业务/运营表取证时均启用 RLS；supplier request 表无用户 policy，不等于应自动开放。
- inventory 查询 RPC、SKU bulk/workspace RPC、手工履约 RPC、用户兼容性 RPC、退款 RPC 已存在。部分 inventory 查询 RPC 有 anon EXECUTE，但定义包含管理员检查；仅“有 execute grant”不代表可越权，尚需隔离角色行为测试。
- SKU bulk/workspace/manual-delivery RPC 的 anon/authenticated EXECUTE=false；API 使用鉴权后的 service-role 调用。

没有请求可能写入访问审计的 inventory/global-search/user-detail/order-relations GET，也没有打开会查询 supplier 网络的供应商页面。没有读取卡密、私钥、付款 URL 或用户身份详情。

## 18 项能力矩阵

| 项目 | 代码状态 | 已有证据 / 限制 | 优先级 |
|---|---|---|---|
| 1 首页/运营总览 | PARTIAL | `app/admin/page.tsx`：趋势、渠道、待办、低库存、订单/充值；多数据源失败显示降级。日期边界仍依赖浏览器本地时区，30 天加载未证明超过 Data API 行数上限后的统计正确性 | P1 |
| 2 订单管理 | COMPLETE（常规链） | orders 页面/API + `order-queries.ts`：服务端筛选/排序/分页、详情、关系时间线、关闭未付订单、人工交付入口；管理员 UI 未认证验收 | P1 验收 |
| 3 支付/充值记录 | COMPLETE（现有范围） | 共用 `AdminPaymentRecordsPage`；详情、金额、状态、异常、分页、人工审核保护已有测试；本轮仅审计不改逻辑 | 保持冻结 |
| 4 支付异常/回调/对账可见性 | PARTIAL | callback/reconciliation 面板已有分页/搜索/失败显示；无 SNPAY timer/heartbeat 的完整 Admin 只读观测；对账搜索的 UUID `business_id.ilike` 需单独修复 review | P1 |
| 5 用户管理 | PARTIAL（有意只读） | users 列表/详情、账户/风险/role 筛选，super-admin gate；用户修改动作未全部开放，不能假装完整 | P1 业务决策 |
| 6 余额/余额流水 | PARTIAL | 当前余额真实字段；详情最近 50 条流水，无完整流水查询工作台。**页面已标注最近记录/非历史总数，账户摘要也已限定最近记录，不需重复修文案** | P1 |
| 7 商品管理 | COMPLETE（代码） | 目录/分类、CRUD、筛选、分页、状态、库存诊断、关联供应商诊断；实际管理员保存未测试 | P1 验收 |
| 8 SKU/库存 | COMPLETE（安全框架） | workspace、单 SKU、批量 preview/事务 bulk RPC、激活 readiness、optimistic concurrency；生产表/函数已存在，不执行测试写入 | P1 验收 |
| 9 数字库存/卡密 | PARTIAL | summary/batches/items RPC，导入 preview、事务状态动作；详情仍限定前 50 条，batch deep-link 参数未完整消费；全局搜索字段 BROKEN，本地已修 | P1/P2 |
| 10 自动/人工履约 | PARTIAL | `OrderFulfillmentPanel`、按订单项手工 RPC，自动交付状态/失败原因；安全 retry 部分 UI 有意不开放，需 operator runbook | P1 |
| 11 supplier fulfillment | PARTIAL/MISSING 队列 | supplier 商品/绑定/成本/库存功能与部分既有订单协调动作存在；后台没有完整 supplier request queue、attempt/retryable/error 详情和筛选；不得盲目 expose retry | P1 |
| 12 退款/取消/失败订单 | PARTIAL | super-admin 退款 RPC、外部退款人工参考号/说明、确认、失败状态；未接入自动 Provider refund。退款列表没有分页，本地已修 | P1 |
| 13 搜索/筛选/排序/分页 | PARTIAL | 核心六列表有服务端分页/筛选；退款前 50 条缺陷已修；库存全局搜索 schema 缺陷已修；非核心详情/批次 deep-link 仍需补齐 | P1/P2 |
| 14 批量操作 | COMPLETE（SKU 限定范围） | 事务型 Draft/Sold Out/Activate 和 workspace 已有；不提供批量支付/余额/退款/履约 mutation，避免扩大危险操作 | 保持边界 |
| 15 管理员审计 | PARTIAL | super-admin 日志筛选/分页、integrity 检查、脱敏、required audit helper 已有；并非所有历史动作统一 audit-failure fail-closed，需要逐动作确认 | P1 |
| 16 客服信息 | PARTIAL | 订单关联 session/payment/退款/ledger/inventory/delivery/通知/协议/审计及用户摘要；supplier attempts/worker 状态缺失，跨页面链接和全集查询待完善 | P1 |
| 17 空/错/权限状态 | COMPLETE（主要组件） | AdminEmptyState/AdminErrorState/skeleton、401/403/503、部分数据失败提示；退款总数未知提示与 stale-response 防护本地补齐；角色 UI 仍需人工验收 | P1 验收 |
| 18 Production 边界 | PARTIAL（待安全决策） | exact live 不变、无业务写入、渠道关闭；敏感 profile INSERT 授权存在潜在完整性缺口，详见下方 gate；本轮未变 ACL | P0 安全评估 gate |

订单关系 API 已在鉴权后使用 service client，且仅选择库存标识/状态，不读卡密正文。不能根据 digital_inventory 的 deny-direct-read policy 误报订单关系不可读。

## 分类摘要

- EXISTING_COMPLETE：常规订单管理、支付/充值列表详情、Catalog/SKU 事务型安全框架、主要空/错/权限组件。
- EXISTING_PARTIAL：总览统计、用户/余额全历史、履约处理、退款、审计一致性、客服全链路、非核心列表导航。
- MISSING：Admin worker heartbeat/timer 观测、supplier fulfillment request 专用队列、全量可分页余额流水工作台。
- BROKEN：库存批次搜索 `status` 列不存在；退款 UI 没有下一页（超过 50 条不可达）。两者本地已修、Production 尚未部署。
- HIGH_PRIORITY：权限预防性评估、上述两项修复 review/验收、worker/supplier/全历史流水可见性。
- MEDIUM_PRIORITY：总览统计完整性/时区、详情截断提示与分页、审计覆盖、错误/客服链接。
- LOW_PRIORITY：高级 URL 状态、批次 deep-link、访客统计接入、非危险批量运营 UX。

## P0：权限预防性 gate（不是已证明可利用的漏洞）

Production 只读取证：authenticated 对 profiles 的 role/balance/account_status/risk_status/email UPDATE=false；敏感 UPDATE trigger 也存在。authenticated 对上述字段 INSERT=true；own-profile INSERT policy 仅校验 `auth.uid()=id`，profiles 没有 INSERT guard trigger。

当前 auth.users_without_profile=0，auth.users 有一个 INSERT trigger，authenticated 无 profiles DELETE 权限。正常已存在 profile 的 PK 会阻止重复插入；因此不能据此声称现有账号已能提权或资金已受影响，也未执行 exploit。

下一阶段应在隔离数据库验证“缺失 profile / 新用户创建 / trigger failure”条件是否能插入非默认 role/balance，再决定收敛 INSERT ACL、增加 INSERT invariant guard、或停止直接客户端 INSERT。任何 ACL/trigger/migration 变更都必须独立授权，且不得顺手改变现有用户资料或支付账务。

P0_COMPLETE=no：此预防性安全评估 gate 未关闭；本轮没有确证需修改冻结支付核心的 P0 bug。

## P1：本轮已完成的低风险代码补齐

1. `app/admin/refunds/page.tsx`：server-backed page/total、已有 AdminListPagination、筛选重置页码、统计注明“本页”、错误时总数未知、requestVersion 拒绝旧响应覆盖新页。
2. `app/api/admin/refunds/route.ts`：只读分页参数处理 null/空值/非有限数/小数/过大输入；保留 super-admin gate、搜索限制、JOIN、count、原有写操作完全不动。
3. `lib/admin/global-search.ts`：库存批次 select/状态映射改为已部署的 `import_status`；Production SELECT LIMIT 0 已确认字段可读。保留认证、范围、限流和审计。
4. 7 个新增 unit/source tests + 更新旧退款第一屏固定契约。

初轮未 commit/push。续任务已明确授权本分支 commit/push/PR，并在 CI 全绿时尝试 merge；不包含 Production rollout 授权。

## P1/P2 待办与 gate

续任务已补齐前三项：只读 Worker 状态、supplier fulfillment queue、全历史余额流水。实现边界和 rollout 顺序见 `backend-operations-v1-production-gate.md`；其余下列项目仍为独立 backlog，不声称全部 P1 完成。

- P1 Admin worker 状态只读 endpoint：认证、最少字段、heartbeat stale/失败区分、不可暴露 env/secret，不附带 recheck/execute 操作。只读实现可以下一阶段继续，部署仍需授权。
- P1 supplier request 只读队列：只列状态、attempt、retryable、安全错误码，不能输出交付正文/供应商凭据；是否普通 admin 可见需先确认权限合同。
- P1 用户全历史流水：独立分页列表/明确日期与 business identity 筛选，不加 adjust balance。
- P1 总览按 Asia/Shanghai 计算边界，排除静默截断、明确聚合口径；不允许通过直接金额修复来消除统计差异。
- P1 后台所有高风险动作逐条验证 audit write-failure contract；不要统一改为可写/重试来“补全功能”。
- P2 库存详情页、批次 deep-link、日期/排序/分页 URL 同步。
- P2 访客报表目前明确“未接入”，不能把其零值当经营事实。

## 验证结果

- Admin/Catalog/SKU/Supplier/Inventory 相关测试：290/290 PASS。
- typecheck：PASS。
- 最终本地 production build：PASS。首轮 sandbox 无法读取 Google Fonts，允许本地联网字体后重跑成功；未改字体或业务代码规避错误。
- full suite：1347 total / 1340 PASS / 7 FAIL。
- 7 个失败（6 个 Windows migration-runner fixture + 1 个 Daju snapshot source contract）在未修改、与 exact 基线内容相同的 worktree 重现：23 tests / 16 PASS / 同 7 FAIL。
- NEW_REGRESSION_COUNT=0。未声称 full suite 全绿，也未改无关 fixture/Daju 合同。
- 管理员真实 UI 点击/视觉验收：NOT_VERIFIED；没有获取或要求用户提交 cookie/token。

## 最终 gates

BACKEND_OPERATIONS_AUDIT_PASS=yes（repo + Production read-only 审计完成；不是全部运营能力可上线的承诺）
ADMIN_AUTHENTICATED_UI_ACCEPTANCE=not_verified
P0_COMPLETE=yes（代码/isolated DB；Production 尚未应用权限 migration）
P1_COMPLETE=no（本轮指定的五项补齐；剩余总览/高风险操作合同等独立 backlog 未完成）
REMAINING_DECISIONS=独立 Production rollout 授权；host-only Worker snapshot 发布方式；已登录 Admin 人工 UI 验收；其他高风险操作开放范围
READY_FOR_NEXT_PHASE=yes（仅代码 review、隔离安全评估和已登录只读 UI 验收；不是 Production mutation 授权）

PRODUCTION_CHANGED=no
PAYMENT_CORE_CHANGED=no
RECONCILIATION_CHANGED=no
DATABASE_CHANGED=no
MIGRATION_EXECUTED=no
DEPLOY_EXECUTED=no
HISTORICAL_CANARY_REPROCESSED=no

## 参考

权限审计遵循 [Supabase RLS 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)：表/列 grant、policy、privileged RPC 各层必须分别验证，不能把单一层的存在当作完整授权证明。已读取当前 changelog；本轮无 Supabase SDK、扩展或 schema 实现变更。

## 续任务：防御性 profile INSERT 加固与运营工作台

### 依赖审计

- Browser `getOrCreateProfile`：原来是 SELECT 后直接 authenticated INSERT 的 missing-profile fallback，注册/登录/currentProfile 会调用。已改成现有同源 POST、无请求 body，服务端验证 auth.getUser；响应必须与当前 user.id 一致。
- `app/api/account/profile` POST：原来 server SSR 客户端仍以 authenticated 身份 INSERT，并不是 service_role。已改为仅在 verified user + profile 不存在时，用 server-only service_role、固定 user/零余额默认值 INSERT；不接收 id/role/balance/referral 等 body 参数。PK 冲突只重读，不做 upsert 覆盖。
- Normal signup：auth.users AFTER INSERT -> SECURITY DEFINER handle_new_user，role_for_email 固定 user，资金默认零。推荐码由 trigger 生成，邀请关系由 trigger/server canonical 维护。用户 metadata 不作为管理员或财务授权来源。
- Login/account settings：身份读取、safe self UPDATE 的五字段白名单保留；后台用户管理为现有授权查询/canonical 操作，未找到独立浏览器 createUser/profile REST POST writer；repo 未实现 signInWithOAuth，自带 Auth 创建用户仍走 signup trigger。
- Migration/test/CI 中 INSERT 是数据库初始化/合成 fixture 或受信后端函数，不需要放开 authenticated table INSERT。
- Production ensure_my_referral_code 的实际定义仅维护邀请码，不创建缺失 profile；没有把它误用作 bootstrap。
- AUTHENTICATED_DIRECT_PROFILE_INSERT_REQUIRED=no **在两处既有 fallback 被替换之后**。旧 App 确实有依赖，故必须 code-first / ACL-second。
- is_admin legacy fallback 保留；只读聚合发现一个 admin profile，admin_users 覆盖一个。是否删除 fallback 单独评估，不混入本次授权变化。

### 真实隔离 PostgreSQL

PostgreSQL 17 原生临时实例，127.0.0.1 独占端口；合成 auth.users、JWT GUC/SET ROLE authenticated、真实 GRANT/column ACL/RLS。fixture 使用 SELECT-only 取得的 Production profile types/defaults/checks/关键函数与 policy 定义，不复制真实用户数据。

修复前：正常 signup 安全默认值；重复 INSERT 唯一键拒绝；missing-profile synthetic 用户能 INSERT admin/999999 balances，is_admin fallback 成立。只是隔离条件下验证，不表示正常注册用户可绕过现有 PK。

修复后：table + column INSERT 被撤销，敏感/普通 INSERT 均拒绝；trigger signup、referral signup、safe self UPDATE、server bootstrap、service_role 操作和 superadmin SELECT 通过。重复应用 migration 通过，migration 前后 profiles 行快照完全相同。

`20261009170042_profiles_insert_privilege_hardening.sql` 为 Supabase CLI 新建 forward-only transaction，only GRANT/REVOKE scope；Production 未执行。CI 新增 disposable PostgreSQL job，不使用 Production credentials。

### 工作台与回归

- `/admin/system/workers`：最小 heartbeat allowlist、stale/error 与观测时间；timer 状态仅来自新鲜可选 host snapshot，无 snapshot 显示 unknown。Web 无 shell；host-only publisher 未在 Production 安装或调度。
- `/admin/supplier-fulfillment`：实际 uppercase supplier status/重试属性/订单关联/尝试次数/安全错误码/时间，分页和筛选；不暴露 attempt_token、交付正文、费用，也没有重试/强制完成按钮。
- `/admin/balance-ledger`：superadmin-only 全历史服务端精确计数、稳定二级排序分页；用户/邮箱/流水号搜索、业务/方向/状态/UTC日期/金额/币种/reference，无调账或删除。过宽用户搜索拒绝，不静默截断。
- Refund race test 执行实际 loader source：旧慢 error 不能覆盖新筛选第二页；empty/error 清空结果与计数。Inventory search 执行实际 search service，import_status 映射通过。
- 最终补充测试：新针对性 22/22；相关 suite 812/812；typecheck/build PASS。完整 suite 1362 total /1355 PASS /同 7 baseline FAIL。另补齐 Production 第三个 updated_at trigger 的真实顺序，并验证并发 bootstrap 唯一键冲突只重读、不覆盖。支付核心、callback/reconciliation/RPC 与历史 migration 未修改。
- Production 只读复查：live exact305d849、PM2 online、health/home/login200、匿名 Admin307/API401、timer enabled/active、heartbeat finished；渠道 false/false/true。未调用 Provider，未改 Production 行或文件。

真实管理员 desktop/small-screen UI 未验收，因无可用已认证浏览器工具；唯一人工 UI checklist 在 rollout gate 文档。不得把静态/unit 验证写成真实页面点击证据。
