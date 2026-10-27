# Bitrefill 本地开发收尾 V3

2026-10-25。当前独立分支：`codex/bitrefill-final-connect-v1`；起点：`018b392bdcbbc56b970516e753a9fc2090ddc7a1`。

范围：V1 商品解析修复、V2 本机 Mock/Business 适配准备及后台只读页面的全部未提交成果。此次允许本地提交；不 Push、PR、Merge、部署、迁移或真实资金操作。

## 审查结果

本地开发交付范围内通过。没有发现未解决的 Production 采购开关绕过、生产付款/退款变更或真实客户资料提交。发现并修复下列五处明确问题；其中前四处已有修复前失败用例，不把 V2 历史 PASS 当作无缺陷证明。

| 问题 | 修复和证据 |
|---|---|
| Mock 退款核对只检查返回对象相互一致，没有固定到持久化 Invoice；也缺少部分面额/币种/数量/状态核对 | 返回 Invoice 必须等于 attempt 的 `external_invoice_id`，Invoice 和 Child 必须同为失败证据，商品/套餐/币种/面额/数量精确匹配。不满足则 409，余额和退款账本不变。回归覆盖“两个返回对象同时伪装为另一个 Invoice”及其余四类身份错误。仅修改 Mock HTTP 退款门禁。 |
| 延迟状态可使已完成 Mock Invoice 退回 pending | 先验证状态集合，再根据实际应用的 Child 状态计算 Invoice；终态 Child 不倒退，非法状态不产生部分修改。 |
| Mock 批次超过 20 单位后才拒绝，已写入的 Child 会成为孤立记录 | 在修改任何映射、Invoice 或合成扣费集合前计算总单位数并拒绝。22 单位请求不产生任何 Child、Invoice、debit。 |
| 后台 Mock 查询每次 `.order()` 都重新排序，第二字段覆盖第一字段优先级 | 保留 SQL 排序字段优先级，排序后再分页。不同创建时间、相同时间下 ID 排序和跨页无重复均验证。实际数据库查询及 UI 没有改动。 |
| 单页 GET 诊断工具先完整缓冲响应再检查 512KiB 上限 | 改为流式计数，超限即取消；测试验证仅读取三个 256KiB 块便拒绝，不继续读取整个流。另禁止 native debug，导入模块不触发 CLI/API 请求。V3 未执行真实商品 GET。 |

## 关键安全逻辑复核

- **296 套餐**：保留 512 项有限上限及声明类型；149、200、296、512 合法；513 和 296 项中非法价格仍拒绝。没有截断列表或把展示价格改作可信采购成本。
- **Invoice / Child**：正式候选仍限制一 item 一 Invoice；既有单项对账精确检查 Invoice、唯一 Child、商品及冻结面额。Mock 批量使用显式 `client_reference`，返回列表故意逆序，缺失关联拒绝；不声称该 Mock 字段已获真实供应商验证。没有启用真实批量采购。
- **Webhook**：仅唤醒，不能把请求体中的状态/卡密直接写入交付。事件收据防重、GET 对账、Poll 并发和私密交付防重均保留。UNCERTAIN 禁止盲目重发 POST；有 Invoice ID 的恢复走 GET。
- **部分失败**：已交付项目不能退款；未知/处理中/身份不明不能自动退款。Mock 失败退款核对真实的合成 GET 状态，再由合成事务检查 paid、原 debit、未交付、总额上限及唯一 credit。没有接入或修改真实退款流程。
- **事务**：Memory backend 克隆状态后一次提交；PG backend 在短事务 UPDATE 中使用 revision CAS，同时提交余额、账本、支付/退款状态。不在数据库提交边界内调用供应商 HTTP。新增测试在合成扣账/退款修改后、提交前注入异常，证明全部回滚；再次并发请求只产生一次 debit/credit。
- **权限**：新 Admin GET 先验证超级管理员，再建立 service client；普通用户、普通管理员及非法页码不能触发高权限读取。仅 SELECT 白名单字段，`no-store`，不返回私密交付内容、原始 Webhook 或供应商原始响应。缺少 DB9/权限时安全返回不可用，不造数据、不自行安装。
- **Mock 隔离**：运行器仅监听 127.0.0.1，不接受外部 Supplier URL、不读取真实凭据；未被 `app/` 或正式 Registry 导入。Mock 客户只允许预设合成身份，不能给真实订单声明付款。
- **真实 Business**：适配准备仅接受显式 Business ID/Secret；不回落到 Personal。工厂始终关闭购买，独立 HTTP Transport 的 create/pay 还受编译期 `REAL_BITREFILL_PURCHASE_ENABLED=false` 保护；GET-only Transport 保持原样。没有测试或使用真实 Business 凭据。
- **Daju**：正式 Registry 仍 Daju-only。Daju 实现、商品绑定/路由、真实支付/充值/订单核心和历史 migration 没有修改。

本结论仅针对代码及本地合成夹具；**不是 DB9 真实 RPC/RLS 再验收，也不是 Production 支付/退款或完整 Next 登录浏览器验收**。不修改既有 DB9/私密交付事务来迁就 Mock 测试。

## 本轮实际验收

- 新 V3 定向测试：5/5，通过；前四项已先复现原失败，再通过修复。
- Full Suite：**1517/1517 PASS，0 fail，0 skipped**。相对 V2 1512 项增加 5 项，不删除、不放宽基线断言。Daju、Local Inventory、Payment Failed Guard 等原回归均包含在完整测试集。
- PostgreSQL 17.11：**57 项断言 PASS**，两个独立 PostgreSQL 后端；新增扣款和退款提交失败回滚用例。独立 `mock_supplier_v2` 夹具、非超级用户 `mock_app`，未执行 DB9，完成后已停止。
- 浏览器：7 组验证通过，包括空状态、成本/Child/部分失败、1440/390 无横向溢出、错误重试、分页、既有客户交付组件的遮盖/显示/隐藏。仅本机夹具，外部网络阻断。
- 所有本轮 MJS 定向 ESLint、TSX/Route 定向 Next Lint、TypeScript 和正常 Next Build 通过。Build 保留已有可选 ws 依赖、Supabase 动态依赖及 CSR 警告，没有通过改字体或业务逻辑绕过。
- `git diff --check` 通过；DB9 SHA256 仍为 `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。

V3 外部证据：`D:/Jianlian/_bitrefill_local_final_review_v3_20261025/full-suite.log`、`build.log`、`pg-synthetic-826rHf/result.json`。浏览器本轮读回/更新的证据：`D:/Jianlian/_bitrefill_mock_supplier_v2_20261025/ui-result.json`。这些运行产物均不提交 Git。

## 完整提交文件摘要

### 商品解析及只读诊断

- `lib/providers/bitrefill/protocol.mjs`：套餐解析上限 512，保留其他校验。
- `lib/providers/bitrefill/protocol.d.mts`：同步上限声明。
- `scripts/probe-bitrefill-launch-readonly.mjs`：显式 opt-in、有限 GET 商品核验，安全证据投影，不访问余额/订单/Invoice。
- `scripts/diagnose-bitrefill-catalog-shape.mjs`：单页结构诊断及 V3 流式响应保护；本轮没有运行真实 GET。
- `tests/unit/bitrefill-readonly.test.mjs`：296/512/513 及非法价格回归。
- `tests/unit/bitrefill-hardening.test.mjs`：硬化超界测试同步常量，拒绝边界仍保留。
- `tests/unit/bitrefill-launch-readonly.test.mjs`：Applebee's 误匹配及部分查询失败证据保留测试。

### 默认关闭的 Business 适配准备

- `lib/providers/bitrefill/business-adapter.mjs`：Business-only 工厂、显式合同、余额付款请求构造；购买仍关闭。
- `lib/providers/bitrefill/purchase-http-transport.mjs`：可配置 auto-pay 及同一硬门禁保护的 payInvoice；默认关闭、GET-only 类未变。
- `tests/unit/bitrefill-p1-purchase.test.mjs`：payInvoice 默认拒绝且零网络调用的补充断言。

### 本机 Mock 与定向验收

- `scripts/support/bitrefill-mock-app.mjs`：合成商城 HTTP、实际付款/履约模块加载、所有者卡密与管理员操作；V3 退款身份修复。
- `scripts/support/bitrefill-mock-store.mjs`：既有 RPC adapter 的合成状态/账本实现；一次提交、去重、退款边界。
- `scripts/support/bitrefill-mock-supplier.mjs`：本机 Invoice/Child/付款/GET 模拟；V3 终态与超限写入修复。
- `scripts/support/bitrefill-mock-view.mjs`：白名单后台投影及 V3 查询排序修复。
- `scripts/support/bitrefill-mock-ui.mjs`：加载实际 UI 组件的本机浏览器夹具，不是生产认证旁路。
- `scripts/verify-bitrefill-mock-pg.mjs`：一次性 PG17.11 CAS 后端、低权限测试角色、独立进程/自动停止；不安装任何 migration。
- `scripts/verify-bitrefill-mock-ui.mjs`：浏览器自动验收，外部网络阻断。
- `tests/support/bitrefill-mock-http-cases.mjs`：共享 HTTP/PG 端到端用例，含 V3 扣款和退款失败回滚。
- `tests/unit/bitrefill-mock-http.test.mjs`：内存事务后端执行同一 HTTP 验收。
- `tests/unit/bitrefill-mock-contract.test.mjs`：Business 合同、重复付款、后台鉴权、成本/套餐门禁。
- `tests/unit/bitrefill-final-review-v3.test.mjs`：本轮五项确定缺陷的定向回归。

### 后台只读页面

- `app/admin/suppliers/bitrefill/page.tsx`：新采购记录页面入口。
- `app/api/admin/suppliers/bitrefill/fulfillment/route.ts`：超级管理员专用、无 mutation 的分页 GET。
- `components/admin/suppliers/AdminSuppliersWorkspace.tsx`：仅增加只读面板导航链接，不改变 Daju 行为。
- `components/admin/suppliers/BitrefillFulfillmentRows.tsx`：安全成本/Invoice/Child/事件展示和既有人工处理入口。
- `components/admin/suppliers/BitrefillFulfillmentWorkspace.tsx`：加载、空态、错误/重试、分页；不提供重发采购按钮。
- `lib/admin/bitrefill-fulfillment.mjs`：有界 SELECT 白名单投影，未验证成本标记、脱敏错误码和人工处理提示。
- `lib/admin/bitrefill-fulfillment.d.mts`：对应安全投影类型。

### 文档

- `docs/integrations/bitrefill-launch-final-connect-v1.md`：保留 V1 历史 GET/解析验收及真实商业阻塞，不把旧状态当作当前线上状态。
- `docs/integrations/bitrefill-mock-development-v2.md`：保留 V2 交付范围和历史验收结果。
- `docs/integrations/bitrefill-local-final-review-v3.md`：本报告、修复依据、真实测试及完整文件摘要。

## 提交安全与后续边界

只显式暂存上述 31 个源码/测试/文档文件。提交前对实际 Git index 再做敏感格式和二进制/备份扩展名检查：不含环境文件、凭据、PFX/KDBX、SQL 备份、运行日志、截图、生成的具体卡密或客户数据。测试源码仅包含显式 `MOCK-` / `TEST_` / `SYNTHETIC` 夹具与生成规则，不包含真实可兑换秘密；模式扫描不等于通用 DLP 证明。

本地提交 SHA 由最终回执给出。后续仅人工审阅本地提交；Business 商业许可、可信成本、真实 SKU/Child/付款/退款合同及 DB9/部署门禁仍未解除。任何真实迁移、部署或采购都需要独立授权。完成后 STOP。
