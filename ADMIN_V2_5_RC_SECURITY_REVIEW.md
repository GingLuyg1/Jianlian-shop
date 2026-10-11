# Jianlian Shop V2.5 RC 安全审阅

审阅日期：2026-10-11（Asia/Shanghai）
工作分支：`codex/admin-ui-v2-5-release-candidate`
基线：PR #77 commit `24472cb780073efed16ed602bdf8204ad7965b90`；远端 `main` 为其祖先（`4575d802d653e4dca726427bce826aa68c93d9e2`）。

## 结论

RC 的 UI、只读 API、候选 SQL 与测试已完成逐类审阅。未发现支付、充值入账、订单履约、邮件、Worker 或业务写接口的改动；没有新增依赖。工作区不存在 `.env.local`、`.env.production` 或 `.env.test.local`，候选文件的密钥扫描只命中示例占位符、变量名和测试假值，没有真实密钥、Cookie、Token 或私有配置。

本轮发现并修复一项 RC 回归：商品趋势 SQL 将 `generate_series` 日期输出为带时区字符串，API 因严格日期完整性校验而拒绝结果。候选 SQL 改为 `d.day::date::text`，独立测试库与真实管理员 RC HTTP 重新对账为 28 天、8 个成交订单、8 件销量。

## 变更范围

### 正式运行代码

- `app/admin/page.tsx`
- `app/admin/dashboard-v21.css`
- `app/api/admin/dashboard/analytics/route.ts`
- `app/api/admin/dashboard/products/route.ts`
- `components/admin/AdminLayout.tsx`
- `components/admin/AdminSidebar.tsx`
- `components/admin/AdminTopBar.tsx`
- `components/admin/dashboard/AdminDashboardMetricCards.tsx`
- `components/admin/dashboard/DashboardDateRangeFilter.tsx`
- `components/admin/dashboard/DashboardProductData.tsx`
- `components/ui/dialog.tsx`
- `lib/admin/dashboard-analytics-query.d.mts`
- `lib/admin/dashboard-analytics-query.mjs`
- `lib/admin/dashboard-analytics-ui.ts`
- `lib/admin/product-dashboard-sort.d.mts`
- `lib/admin/product-dashboard-sort.mjs`
- `lib/admin/use-dashboard-analytics.ts`
- `lib/security/rate-limit.ts`

### 候选数据库文件（未在 Production 执行）

- `docs/sql-candidates/admin_dashboard_analytics_v23.sql`
- `docs/sql-candidates/admin_product_dashboard_v25_snapshot.sql`

### 测试与验收辅助

- 已修改的后台结构、指标与响应式回归测试。
- 新增 V2.3 日期/统计、V2.5 商品只读、排序、视觉收尾单元测试。
- `tests/browser/` 为合成浏览器验收工具；`scripts/uat/` 为本地测试项目门禁工具。
- `artifacts/` 是合成截图证据，不纳入 RC commit。

### 文档

- 本次四份 RC 报告纳入候选提交。
- 早期 V2.3/V2.4/V2.5 工作报告保留在本地作为审计上下文，不作为运行代码，也不强制纳入 RC commit。

## API 审阅

- 两个新增路由均为 `GET`，先执行既有 `requireApiAdmin()`，再创建服务端 service-role client。
- 浏览器端不接触 service-role；响应只含汇总、商品标识/名称及明确的未接入字段，不返回订单、用户或支付凭据。
- 日期最多 365 个上海自然日；页码、每页 10/15、搜索长度、UUID 与排序白名单均显式校验。
- 结果结构、日期连续性、每日合计与列表合计进行 fail-closed 校验；不完整结果返回错误，不伪装为零。
- 使用私有 no-store 缓存策略、每管理员限流和 8 秒请求中止。
- 管理员身份仍沿用既有后台授权语义；此次没有扩大角色范围。

## SQL 审阅

- 商品函数是 `STABLE SECURITY INVOKER`，无动态 SQL、DML、DDL 或业务写入。
- `search_path` 固定；表均使用 `public.` 全限定名；排序使用固定 `CASE` 白名单。
- 初次创建、REVOKE、GRANT 包在同一事务，避免创建后短暂继承 PUBLIC EXECUTE。
- 独立测试库实测：`anon=false`、`authenticated=false`、`service_role=true`；函数 ACL 只有 postgres 与 service_role。
- 函数级 `statement_timeout=8s`，同时拒绝空参数、未来结束日、超过 365 天、非法页码/页长/搜索/排序。
- `SECURITY DEFINER` 未使用，因此不存在函数所有者权限提升路径。

## 与 main 的关系及冲突

官方远端 main 是 PR #77 基线的祖先，当前 RC 在 PR #77 上叠加；没有包管理文件变化，也没有新依赖。未执行合并，因此只能确认静态 ancestry 与当前差异无冲突，未来 main 如继续变化仍需在创建 PR 前重新 rebase/merge 审查。

## 发布门禁

- 代码安全审阅：通过。
- Production SQL 执行：未授权、未执行。
- Production 兼容性与索引：仍需只读预检和单独迁移审批。
- 真机手机验收：按用户决定延期，不能记为通过。
