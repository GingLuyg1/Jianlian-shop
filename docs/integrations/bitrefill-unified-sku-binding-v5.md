# Bitrefill 复用现有供应商绑定 V5 — 本地验收

日期：2026-10-25。工作树 `D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1`；分支 `codex/bitrefill-final-connect-v1`；起始 HEAD `a30595a2e4ad044c3e923ad6f01d7b58afd72f2d`。开工时 V4 为既有未提交成果，本轮保留；没有自动提交、Push、Merge 或部署。

## 结论

Bitrefill 已进入原来的“商品管理 → 编辑商品 → 商品规格 → 供应商绑定”弹窗。新工作流使用 **现有 `product_skus.metadata`**，没有新建商品管理页或映射表，没有使用 V4 本地 metadata.json 作为正式绑定来源。

**当前只能保存 Bitrefill 候选，不激活真实采购来源。** 缺少商业许可、真实成本、产品类型或必需参数证据时，绝不标为已验证。保存候选不改变现有有效 Daju/本地履约、不改变 SKU 库存/售价/状态，也不更新已创建订单。不能将本轮验收解释为真实自动采购已启用。

## 现有功能定位及复用

1. 入口：`app/admin/products/page.tsx` 使用 `AdminProductSkuManager` 的 `onSupplierBinding` 打开 `AdminSupplierBindingSheet`。
2. Daju 搜索：原 `GET /api/admin/suppliers/daju?resource=products&q=...`；原搜索结果按钮列表仍在同一 Sheet 中。
3. Daju 详情：原 `resource=product&id=...`，原 `listDajuSkuStockOptions` 选择准确规格、成本上限和 requiredInputs 映射，原人工确认提示保留。
4. 原保存：`POST /api/admin/suppliers/daju/bindings/[productId]` + `website_sku_id`，写入已有商品/SKU metadata；其原管理员权限、详情验证、自动交付/规格/库存/成本上限规则保留。
5. Bitrefill：在同一 Sheet 增加供应商选项，`BitrefillSkuBindingFields` 仅是字段组，不是独立管理系统；复用 V4 的安全目录服务。
6. 解绑：原接口没有独立受审计解绑机制，本轮不添加 DELETE/一键解绑。

Daju API 原 URL 和原请求字段不变，仅在 SKU 保存路径增加可选 `expected_updated_at`、版本 CAS 与绑定审计。Daju 采购、发货、库存解析和 Registry 核心没有修改。

## 统一配置结构

有效采购来源仍为原有 flat metadata（例如 `supplier=daju`）。Bitrefill 选择保存在同一 SKU metadata 的 `supplier_binding_candidate`，只能有一个候选，不是第二张映射表；它不参与自动路由。

| 信息 | 统一字段 |
| --- | --- |
| 供应商 | `supplier` / `provider_key` |
| 商品/固定套餐 | `supplier_product_id` / `supplier_package_id`（兼容 `supplier_sku`） |
| 可变面值 | `range_value`，与 Package 互斥 |
| 面额/币种/地区 | `supplier_face_value` / `supplier_currency` / `supplier_country` |
| 配置成本/币种/费用 | `supplier_cost` / `supplier_cost_currency` / `supplier_configured_fees` |
| 价格及成本证据 | `supplier_price_verified=false` / `supplier_cost_verified=false` |
| 审核 | `supplier_binding_status=draft` 或 `manual_reviewed_unverified` |
| 版本 | SKU 外层及候选的 `supplier_binding_version` |
| 自动采购 | Bitrefill `supplier_auto_purchase_enabled=false` |
| 类型/必需参数 | `supplier_product_type` / `required_parameters_verified=false` |

真实成本未知时留空；目录 price 不填入采购成本，不虚构汇率。展示当前 SKU 的 CNY 售价；仅在配置成本、费用和售价同币种时，以与 V4 共用的八位定点方法计算未验证预估利润。USD 成本/CNY 售价没有可信汇率时利润未知。实际采购成本仍没有真实记录，本轮未产生采购。

### 保存与审计安全

- Bitrefill POST 使用现有超级管理员授权，先鉴权，再创建服务客户端；浏览器没有服务端或供应商凭据。Daju 原管理员权限不变。
- 同源校验支持反向代理保留的 Host，拒绝外站/缺少 Origin；请求体流式限 12000 字节。
- 精确验证 SKU 属于商品；校验管理员声明的 SKU 面额/币种/地区与最新供应商详情一致。声明保留 `admin_unverified` 来源，不从名称、SKU code 或文字相似度推断。
- Package 必须真实存在且为货币面值；非货币标签只展示。Range 校验上下限和步长，不启用真实 Range 采购。
- 保存前再次 GET 详情并对比目录 DTO SHA256。目录变动须重新核对；新版本使用 `updated_at` + JSON 绑定版本双重 CAS，拒绝并发/旧窗口覆盖。
- 候选、版本和 `supplier_binding_audit` 在同一次 SKU UPDATE 中提交，不把外部 HTTP 放进事务。审计保留前有效配置、前候选、后配置、操作者和时间；达到 50 条/32K 审计上限即拒绝，不静默删历史。
- 同时镜像到现有 `admin_audit_logs`；镜像失败不会抹掉已经原子保存的 SKU 内审计，返回 `auditMirrored=false`。未新增财务 RPC。
- 再选 Daju 仍走原权威详情和确认流程，保存时清除旧 Bitrefill 候选及混用字段，保留版本/历史。候选未验证时不会自动覆盖有效 Daju 来源。

## 搜索修正与实际 GET

依据 [Bitrefill 官方搜索接口](https://docs.bitrefill.com/reference/get_products-search)，名称搜索改为 `GET /products/search?q=...`，先遍历有界全目录搜索结果，再按地区过滤。另有“按精确 Product ID 读取”按钮，不依赖搜索索引猜 ID。

依据 [官方列表接口](https://docs.bitrefill.com/reference/get_products)，支持 `country=US,XI`；XI 表示国际商品，**不自动等于可用于 US**。分页同时依据 `_next` 和 total；不跟随任意上游 next URL，达到预算会标明截断，异常页不冒充完整结果。

V5 实测：US+XI **605 项、13 页、未截断**。官方 Apple/Amazon/Steam 搜索各两页，筛选 US/XI 后，Apple 仅命中 Applebee’s、Amazon 0 项、Steam USD 1 项。没有自动绑定，也没有据此断言账号具备转售许可或所有账号都无 Apple/Amazon。403/不可用上下文显示明确无权访问；200 无结果显示当前账户可见范围内没有结果。

实际响应存在 `categories`，但没有 `type`；现在保留经过校验的分类数组，仍将商品类型标为 unknown，不根据分类猜类型。因此真实未知类型商品只能保存草稿。

国际页暴露 `efootball-international` 与 `call-of-duty_-points-xbox-version` 的非货币 Unicode 标签。解析修复仅放行有界、无控制/双向字符、无 HTML 标记的显示标签，`value=null`，禁止当作货币面值。296 套餐和 512/513 边界均保留。

本轮只有商品 GET，没有余额、历史订单、Invoice、真实 POST 或付款请求。证据保留首次解析失败和修复后结果，不将失败隐藏：

- `D:/Jianlian/_bitrefill_unified_binding_v5_20261025/live-search.json`：首次 US/XI 异常。
- `live-search-1792910390377.json`：单页结构诊断及官方搜索。
- `live-search-1792910556996.json`：修复后 US/XI 605 项完整分页。

## 历史订单和采购/售后

保存端点只写当前产品/SKU 配置，**不更新 order_items 或历史订单**。已有履约继续按冻结的 `product_snapshot.supplier_binding` 取目标，而不是查询当前商品配置。合成测试中带版本的旧订单快照保持逐字一致。

本轮没有更改下单 RPC；旧订单没有版本字段的，不补写，也不声称 Production 已完整保存 V5 扩展字段。未来启用 Bitrefill 前，须单独验收候选晋升、真实下单时 Package/Range/绑定版本冻结及数据库契约，不能直接将候选视为生效来源。

真实付款门禁、Child 精确关联、私密卡密事务、重复采购/通知/交付和 UNCERTAIN 禁盲重试逻辑未变。异常继续走 V4 人工队列；供应商退款不等于客户退款。没有自动余额返还、支付退款或客户退款入口，原管理员人工退款能力保留。

## 验收范围

- V5 六组定向测试：实际 Daju/Bitrefill Route Handler、同一 SKU metadata、旧窗口/并发 CAS、地区/币种/面值/套餐/Range、未验证成本利润、权限/同源/限流式请求体及跨商品 SKU 拒绝。
- PostgreSQL 17.11 一次性合成环境：原采购 57 + V4 映射 37 + 售后 9 + V5 统一绑定 32，共 135 项断言；两个独立 PG 连接，非超级用户 mock_app。没有执行任何 migration，结束后停止。
- 浏览器：实际 `AdminSupplierBindingSheet` + Bitrefill 字段组，Daju 搜索/规格/保存、切换供应商、保存候选/重新编辑、多 SKU Range、1440/390 布局六组通过；V4 的 14 组和 V3 的七组回归通过。
- 浏览器只使用 loopback 合成 HTTP 和本地 React，外部网络阻断；视觉/Radix 原语有夹具替代。不是完整 Next/Supabase 登录验收，不使用真实用户、余额、卡密或 Daju 网络。
- PG 使用既有 `mock_supplier_v2.state` CAS 夹具及模拟 Data API 接口，不是 Production product_skus/RLS 或 DB9 安装验收。真实 Data API 权限及 SQL 下单快照仍属于发布前独立门禁。

测试证据、运行日志和截图位于 `D:/Jianlian/_bitrefill_unified_binding_v5_20261025/`，不提交 Git。最终 typecheck、Lint、Build、Full Suite 结果和最终 PG 目录在下方补充。

### 最终代码复测结果

```makefile
V4_PRESERVED=yes
EXISTING_SKU_BINDING_WORKFLOW_REUSED=yes
SECOND_MAPPING_TABLE_CREATED=no
DAJU_BINDING_REGRESSION=PASS
BITREFILL_SEARCH_SELECT_SAVE_REEDIT=PASS_SYNTHETIC
MULTI_SKU_ISOLATION=PASS
COST_CURRENCY_PROFIT=PASS_UNVERIFIED_DISPLAY_ONLY
FROZEN_ORDER_SNAPSHOT_UNCHANGED=PASS_SYNTHETIC_AND_SOURCE
ADMIN_AUTH_CAS_AUDIT=PASS_SCOPED_FIXTURES
TYPECHECK=PASS
TARGETED_LINT=PASS_41_FILES
BUILD=PASS_WITH_EXISTING_WARNINGS
FULL_SUITE=1535/1535_PASS_0_SKIPPED
NEW_FAILURES=0
POSTGRES_SYNTHETIC=135_ASSERTIONS_PASS
POSTGRES_TEST_INSTANCE_STOPPED=yes
V5_BROWSER=6_GROUPS_PASS
V4_BROWSER_REGRESSION=14_GROUPS_PASS
V3_BROWSER_REGRESSION=7_GROUPS_PASS
REAL_PURCHASE_ENABLED=no
AUTOMATIC_CUSTOMER_REFUND_ADDED=no
PRODUCTION_CHANGED=no
DB9_EXECUTED=no
PUSHED=no
MERGED=no
DEPLOYED=no
```

最终 PG 证据：`pg-synthetic-R8xMXw/result.json`。完整回归/Build/Typecheck/Lint 证据分别为 `full-suite.log`、`build.log`、`typecheck.log`、`lint.log`；V5 浏览器为 `ui-result.json`、`binding-1440.png`、`binding-390.png`。原 V4/V3 回归证据仍在其既有目录，本轮已重新执行。

Build 保留既有可选 ws、Supabase 动态依赖及 CSR 警告；没有修改字体、Next 配置或跳过必要步骤。最终期间发现并修正 TS 目标不支持 Set 展开的问题，改为 `Array.from`，不是修改编译目标。项目原 Build 跳过 Lint 配置未变，本轮独立执行 Lint。

DB9 Migration SHA256 仍为 `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。Daju 核心、订单/支付/充值/私密交付和 migrations 的 Git diff 为空。最终变更 43 个代码/测试/文档文件（包括既有 V4）；敏感格式、当前 Personal Key 字面值及文件类型检查未命中，不代表通用 DLP 认证。

HEAD 保持 `a30595a2e4ad044c3e923ad6f01d7b58afd72f2d`，没有暂存或创建新 Git commit；本轮交付是本地代码与报告，不是远端发布。

## 关键代码清单

- 修改：`AdminSupplierBindingSheet.tsx`、`AdminProductSkuManager.tsx`；新增字段组 `BitrefillSkuBindingFields.tsx`。
- 原 Daju SKU 保存接口增加安全版本/审计保护；新增 Bitrefill `bindings/[productId]/route.ts`（候选、超级管理员）。
- `lib/providers/core/admin-sku-binding.mjs`：统一 metadata 规划、审计及 CAS；不是采购 Transport。
- V4 `catalog-management.mjs`、`personal-catalog-client.mjs` 和既有只读 `client-core.mjs`：GET 搜索、US/XI 和分页保护。
- 既有 `protocol.mjs`：分类及非货币标签；`mapping-financials.mjs` 抽取纯显示算法，V4 原导出/测试兼容保留。
- 新测试/浏览器夹具/有界 GET probe；扩展既有一次性 PG harness 的可选 `--with-binding-v5`。没有删除 V4 文件。
- V4 独立 metadata 工作台保留作历史/合成测试，不作为 V5 商品绑定工作流；正式目录页面改为指向现有商品编辑入口。

安全检查结合 Supabase、Postgres 和 React 技能，落实为强鉴权、服务端凭据、短 CAS 更新、无新权限放宽、请求取消、错误/空态和响应式验证。参考 [Supabase UPDATE](https://supabase.com/docs/reference/javascript/update)、[JSON 查询](https://supabase.com/docs/guides/database/json)。

## 剩余正式上线阻塞 / 下一步

1. Business 凭据及商业转售授权、可信真实报价/费用/币种和真实 Child 关联合同未验证。
2. 当前 Personal 可见目录未提供可确认的 Apple/Amazon US 商品；未知类型及必需参数不得“验证通过”。
3. Bitrefill 候选晋升为有效采购来源尚未开放；未来需明确授权并验收真实 SKU 事实、下单快照扩展字段和采购门禁，不允许自动切换。
4. DB9 Production 未执行；真实备份恢复、迁移、Data API/RLS、应用部署和真实小额交易均需要独立授权，本轮不推进。

下一安全步骤：本地人工验收原商品编辑弹窗中的 Bitrefill 候选配置；不把合成测试结果当成真实采购合同通过。完成本地报告后 STOP。
