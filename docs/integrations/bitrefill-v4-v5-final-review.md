# Bitrefill V4/V5 最终本地收尾审查

日期：2026-10-25。工作树 `D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1`，分支 `codex/bitrefill-final-connect-v1`，起始 HEAD `a30595a2e4ad044c3e923ad6f01d7b58afd72f2d`。

本报告是 V4/V5 既有报告的最终补充：保存本地开发成果，不是上线批准。此前报告中的“未提交”为当时状态；本轮用户明确授权本地提交。没有 Push、PR 操作、部署、Production 访问、真实采购或 DB9 执行。

## 变更范围及实际修复

开工时有 43 个 V4/V5 既有变更文件，未暂存；基线与用户给定提交一致，没有混入其它任务的修改。全部保留。涉及目录浏览、人工候选绑定、原 Daju 弹窗接线、只读异常队列、本机隔离工作台及相应夹具/验收资料。没有引入第二套正式映射表。

本轮仅增加一处实际安全修复及测试：

- 原 `normalizePublicProduct` / `normalizePublicSku` 原样转发 `metadata`，公开详情 Route Handler 使用这两个函数，包括其 service-role 回退路径。因此内部供应商成本、费用、候选、审计及任意未知字段可能经公开详情 JSON 返回。
- 商品 metadata 改为只允许导航所需的 `category`、`category_slug`、`subcategory_slug`、`category_path` 有界字符串；SKU metadata 返回 `null`。不按敏感字段黑名单递归猜测公开边界。
- 浏览器端旧商品直读查询不再请求原始 metadata 列；卡片转换函数也应用同一白名单。保留公开售价、库存、SKU、图片、配送方式及派生价格字段，不更改数据库原 metadata。
- 新增三项测试，覆盖 DTO、真实详情 Route Handler 普通/服务角色回退、浏览器端查询列。测试仅使用明确标注的合成数据，没有真实密钥或卡密。

本轮新增/修改文件为 `lib/supabase/public-catalog.ts`、`tests/unit/bitrefill-public-metadata-boundary.test.mjs` 及本报告。总计 46 个待提交文件，均属上述范围。

## 公开数据安全：必须区分两个边界

**应用公开商品 API：已修复并通过定向回归。** 商品列表原本使用显式列投影，不查询 metadata；详情及浏览器旧查询路径现已加固。管理员接口继续鉴权后返回管理员所需配置，不向客户端提供供应商凭据。

**Supabase Data API 直接读取：仍为发布阻塞，不能宣称已安全。** 本地仓库的 `20260629_multi_sku_core.sql`、`20260710_product_skus_compatibility_baseline.sql` 对 `anon, authenticated` 授予整表 SELECT，SKU 公开 SELECT 策略仅限制 active/sold_out 行。商品基线也授予公开整表读取。若目标环境沿用该合同，攻击者自行选择 metadata 列不会经过上述 Next.js 白名单。V5 将成本/候选/审计写入 SKU metadata，不能仅用应用 DTO 修复来保证这些数据在 Data API 下保密。

本轮未连接 Production，未验证或修改其真实 grants/RLS，也没有改写任何历史 migration。**在完成数据库列级/私有投影访问边界设计、管理员兼容性验证及单独授权的部署前，不得把 V5 内部配置写入公开可读的正式 SKU 行。** 可后续审核列权限与受控公开投影方案，或现有统一架构中的私有配置存储方案；必须保持既有商品/管理员读取兼容，不能直接套用未审查的 REVOKE。

参考：[Supabase Data API 安全](https://supabase.com/docs/guides/api/securing-your-api)：grants 控制对象访问，RLS 控制行，不会自动隐藏 JSON 字段。技能要求的 changelog 请求返回不支持的 markdown 内容类型；未据此推断平台权限状态。

## 采购、绑定及历史订单

- Bitrefill 目录 GET 仍仅允许商品端点、固定官方 Host、禁止重定向、有响应/时间/分页上限；Personal 查询成功不代表商业转售许可。
- 296 套餐修复、512/513 边界及 Unicode 非货币标签展示保留；不能将标签当面值，将目录 price 当可信采购成本，或将 unknown 类型推断成 gift card。
- Bitrefill 保存仅超级管理员、同源、请求体有界、SKU 所属校验、目录指纹及时间检查、版本/updated_at CAS；候选及审计同一次 SKU UPDATE 保存。
- 未验证候选不替换有效 Daju flat binding，不改变当前 SKU 售价、库存、交付方式或商品状态。Daju 核心采购/发货模块没有改动，原弹窗与权威详情保存流程保留。
- 绑定变更不写 order_items。现有 Router 读取冻结 `product_snapshot.supplier_binding`，不读取新候选代替旧订单来源；本轮复用带版本冻结快照的合成证据。未来正式候选晋升及下单时新增 Package/Range/版本冻结仍须独立验收，不声称旧生产订单已具备这些新字段。
- `REAL_BITREFILL_PURCHASE_ENABLED=false` 常量、Business 默认禁用、真实 Registry 的 Daju-only、Mock 显式本地隔离均保留。没有因目录或候选保存而开启购买。
- 私密交付、Child 精确关联、UNCERTAIN 禁盲重试、通知/采购/交付幂等保护没有修改。Invoice complete、供应商 Child delivered、商城私密交付完成仍是不同状态。

## 人工售后与既有客户退款入口的差异

V4/V5 没有自动客户余额退款、支付退款或重发货动作；异常队列只读并链接现有管理员处理页，本地备注不动账。没有新增客户退款按钮或申请页。

但不能报告“整个商城不存在客户自助申请入口”：**起始提交已经包含** `components/refunds/OrderRefundPanel.tsx` 的“申请退款”按钮，`app/account/orders/[orderNo]/page.tsx` 使用该组件，`app/api/refunds/route.ts` 的 POST 调用现有 `create_refund_request`。这是提交人工审核申请，不等于自动执行退款，但仍与“没有客户退款入口”的字面验收条件不同。

这些文件本轮及 V4/V5 diff 均为空，未擅自移除或改写既有客户/退款功能。若业务要求所有客户只能联系人工客服、不能自行提交申请，需要单独确认全站/Bitrefill 专用限制范围，并同时审查 UI、申请 API/RPC 与管理员手工处理兼容性。**因此 MANUAL_REFUND_ONLY 仅能确认 Bitrefill 无自动退款；全站无客户入口条件尚未满足。**

## 本轮实际验收

| 检查 | 结果 |
| --- | --- |
| V4/V5 + 新公开边界定向测试 | 21/21 PASS |
| Full Suite | 1538/1538 PASS，0 失败，0 跳过 |
| TypeScript | PASS，独立 `tsc --noEmit` |
| Lint | PASS，43 个代码/测试文件，0 警告/错误 |
| Build | PASS，未修改字体/Next 配置或跳过新增步骤 |
| MJS 语法检查 | 25/25 PASS |
| diff whitespace | PASS |
| 秘密模式/当前 Personal Key 字面值扫描 | 未命中；不代表通用 DLP 或云端数据审计 |

Build 保留既有 ws 可选模块 bufferutil/utf-8-validate、Supabase 动态依赖和 CSR 警告。项目原有 Build 跳过 Lint 设置没有更改，本轮已独立执行上述 Lint。

日志位于 `D:/Jianlian/_bitrefill_v4_v5_final_review_20261025/` 的 `typecheck.log`、`lint.log`、`build.log`、`full-suite.log`；不加入 Git。

依用户要求，复用、不冒充本轮重跑的既有证据：

- V5 PG：`D:/Jianlian/_bitrefill_unified_binding_v5_20261025/pg-synthetic-R8xMXw/result.json`，57 原采购 +37 映射 +9 售后 +32 统一绑定 =135 断言通过，两个独立 PG 连接，测试实例已停止。使用 JSONB CAS 模拟 Data API，不是正式 SKU RLS 或 DB9 安装验收。
- V5 浏览器六组、V4 十四组、V3 七组回归及 1440/390 布局证据保留在既有报告目录；使用真实 React 组件和 loopback 合成 HTTP，视觉原语有夹具替代，不冒充完整 Next/Supabase 登录验收。
- 既有真实商品 GET 目录结果仍以 V5 报告为准；本轮不重复访问供应商或云端。

## 完整性与提交边界

冻结 DB9 migration SHA256：`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`，本轮核验未变。支付、充值、订单/私密交付、Daju 核心和 migrations 无 diff。

仅显式暂存以上 V4/V5 文件及本轮安全修复/报告，提交到当前本地分支。不暂存环境配置、原始响应、日志、截图、缓存、运行状态或本机密钥资料。最终 commit SHA 和工作树状态以交付回执为准，不把提交本身当作发布许可。

## 剩余阻塞及下一步

1. 发布前必须解决公开 Data API metadata 列访问边界；本轮只修复应用公开 API，不得将两者混同。
2. 既有客户申请退款入口仍存在；需单独确定关闭/限制范围，不能报告全站无入口。
3. Business 凭据/商业授权、可信真实成本、真实 Child 身份、Apple/Amazon US 可核验商品、候选晋升与真实下单快照仍未完成。真实采购保持关闭。
4. DB9 Production 未执行，真实备份恢复、数据库部署及应用部署均不在本次授权内。

下一安全步骤：用户审阅本地提交及上述两项审查例外，分别授权必要的公开数据边界加固和退款入口范围调整。本次停止，不 Push、Merge、部署、执行 SQL 或采购。
