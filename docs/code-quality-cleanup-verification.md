# Jianlian Shop 代码质量清理验收

生成时间：2026-06-30

## 项目代码结构

主要业务模块如下：

- `app`：Next.js App Router 页面、API Route、后台和前台路由入口。
- `components`：前台布局、商品组件、账户组件、后台表格/状态/支付/订单组件。
- `lib`：Supabase 客户端、认证、管理员权限、支付、订单、库存、报表、监控、国际化和系统检查服务。
- `hooks`：客户端复用 Hook。
- `scripts`：部署前检查和维护脚本。
- `supabase/migrations`：数据库结构兼容 migration，当前任务不自动执行。
- `middleware.ts`：公开资源、认证和路由中间件边界。

已标记的大文件和后续拆分候选：

- `app/checkout/page.tsx`：确认订单和商品说明逻辑仍较重，后续应拆分为商品说明、规格选择、订单提交模块。
- `app/admin/products/page.tsx`：商品列表、筛选、弹窗状态集中在单页，后续可拆表单与列表状态。
- `app/admin/categories/page.tsx`：三栏分类联动和商品编辑在同一文件，后续可拆分类栏、商品栏和弹窗。
- `components/admin/payments/AdminPaymentRecordsPage.tsx`：支付筛选、表格和详情抽屉职责较多，后续可拆。

## 重复逻辑清单

- 商品保存核心入口已集中在 `app/api/admin/catalog/_shared.ts`，后台商品页和分类页右侧商品保存通过 API 复用该逻辑。
- SKU 保存已经作为商品保存的子流程保留，未发现本次可以安全删除的第二套 SKU 持久化入口。
- 状态展示已有 `lib/i18n/status.ts`，但部分历史页面仍有局部状态文案和颜色映射，已列为后续低风险整理项。
- 金额和日期格式化已有 `lib/i18n/money.ts` 与 `lib/i18n/datetime.ts`，历史页面仍存在局部 `formatMoney`、`formatDate` 和 `toLocaleString`，本次未做跨页面大重构。

## 已取消功能残留

购物车检查结果：

- 未发现可访问的 `/cart` 页面、前台购物车导航、购物车角标或购物车结算入口。
- 未发现 `cart service` 或 `cart API` 参与当前订单创建链路。
- `cart_items` 仅作为历史结构/项目状态记录出现，未删除历史数据库表或 migration。

工单检查结果：

- 未发现 `/admin/support`、`/account/support`、工单中心导航或工单页面入口。
- 结算页合同文案中存在“提交工单”残留，已改为“联系在线客服”。
- `support_tickets`、`support_ticket_messages` 仅作为历史 schema 或项目状态记录保留，未删除数据库历史结构。

## 商品保存统一结果

- 商品新增和编辑继续走管理员 API，服务端统一校验商品名称、标识、分类、价格、库存、状态、图片和 SKU 相关输入。
- 分类管理右侧商品栏复用同一保存 API，不直接在页面组件中写 Supabase update。
- 保存成功后 API 返回数据库最新记录；保存失败返回中文安全错误，不暴露 Supabase 原始英文错误、SQL 或表名。
- 本次未改变商品保存、取消、列表刷新和分类商品栏同步的业务行为。

## 状态定义整理结果

现有集中状态文件：

- `lib/i18n/status.ts`：商品、订单、支付、充值、退款、交付、库存、账户、风险等中文展示映射。
- `lib/catalog/product-status.ts`：商品可售状态和库存文案。
- `lib/payments/payment-status.ts`：支付状态机/展示兼容。
- `lib/refunds/refund-utils.ts`：退款状态兼容。

本次结论：

- 数据库状态值未改动。
- 前端未知状态仍应统一显示“未知状态”。
- 为避免破坏页面视觉，本次未一次性替换所有局部映射，报告记录为后续整理项。

## TypeScript 类型治理

已检查范围包括 API Route、服务层、表单、SKU、订单、支付、库存、报表和系统检查模块。

发现的问题：

- 部分 Supabase 动态查询 helper 仍使用 `any` 或 `Record<string, any>`，主要用于兼容 PostgREST 链式 builder 和动态 JSON 字段。
- 个别路由使用类型断言处理查询参数或枚举 includes。
- 历史页面存在局部 `formatMoney` 和 `formatDate`，类型可工作但未完全统一。

处理策略：

- 本次不使用粗暴断言或关闭严格检查掩盖问题。
- 可确认会破坏类型安全的修改未做大范围替换，避免引入运行时回归。
- 后续建议按模块逐步给 Supabase 查询返回值补充显式 DTO 类型。

## 错误处理统一结果

当前已具备的统一能力：

- `lib/api/error.ts` 和相关 helper 用于 API 安全错误响应。
- `lib/monitoring/logger.ts` 用于 request_id、脱敏日志和系统错误记录。
- `lib/admin/audit-log-service.ts` 对管理员操作和敏感字段进行脱敏。

本次检查结论：

- 支付、库存、认证、隐私和管理员接口大多返回中文安全错误。
- 历史组件中仍有局部 `console.error`，但未发现直接打印密码、Token、service role 或完整数字库存内容的前台路径。
- 后续可把局部错误提示逐步迁移到统一错误结构。

## 死代码清理结果

本次未删除文件。

原因：

- 未发现可确认未被运行时代码引用的购物车页面或工单页面。
- `lib/system/project-status.ts` 用于项目状态矩阵和上线阻塞项记录，保留。
- 历史 schema 和 migration 不删除，避免破坏数据库审计和迁移链。

## 重复组件清理结果

- 后台空状态、错误状态和 Skeleton 已有公共组件。
- 前台订单、支付、账户、推广页面仍存在局部空状态和分页样式，未做大范围抽象。
- 本次未新增重复组件。

## 构建警告处理结果

已知构建警告：

- Supabase 依赖链中存在 webpack dynamic dependency warning，属于第三方包构建提示，不能在不升级依赖的前提下彻底消除。
- 多个客户端重页面存在 Next.js CSR deopt warning，主要来自 `useSearchParams` 和客户端状态页面；修复需要逐页拆分 Suspense/Server Component 边界，属于后续专项。

本次不通过禁用 ESLint、忽略 TypeScript 或升级依赖处理警告。

## 删除文件列表

无。

## 保留但待处理文件

- `app/checkout/page.tsx`：后续拆分。
- `app/admin/products/page.tsx`：后续拆分商品列表和弹窗。
- `app/admin/categories/page.tsx`：后续拆分三栏联动。
- `components/admin/payments/AdminPaymentRecordsPage.tsx`：后续拆分表格、筛选和详情抽屉。
- `lib/supabase/profiles.ts`：仍保留历史 `support`、`finance` 类型兼容，当前权限仍以 `profiles.role = admin` 为准。
- `supabase/schema.sql`、`supabase/profiles.sql`：历史角色和旧表结构记录保留，不直接删除。

## 发现的问题

- 结算页合同文案仍提到“提交工单”，与已取消工单功能不一致。
- 项目中仍存在若干局部金额、日期和状态映射，长期会增加维护成本。
- 部分 API 和服务 helper 为兼容动态 Supabase 查询仍使用 `any`。
- 构建存在第三方依赖 warning 和客户端页面 CSR deopt warning。

## 已修复的问题

- 移除结算页“提交工单”残留文案，改为联系在线客服。
- 保留并纳入结构检查补充：`lib/system/database-contract.ts` 已包含近期 i18n、media、backup、privacy 和 system error migration/关键表。
- 新增本报告，明确代码结构、残留功能、重复逻辑、类型治理和构建警告边界。

## 仍存在的问题

- 未完全替换所有局部状态映射。
- 未完全替换所有局部金额/日期格式化。
- 未完全移除所有兼容性 `any`。
- 未拆分大型页面组件。
- 未消除 Supabase 依赖 warning 和 Next.js 客户端 deopt warning。

## 验收关注点

- 商品保存：未改动核心保存服务，需通过现有商品新增/编辑流程验证。
- 商品取消：未改动弹窗关闭和取消逻辑。
- 多 SKU 保存：未改动 SKU 数据结构和保存流程。
- 分类页商品编辑：继续复用管理员商品 API。
- 立即购买、订单创建、支付状态查询、数字库存、后台权限和用户数据隔离未做业务逻辑变更。
