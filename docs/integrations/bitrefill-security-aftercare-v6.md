# BITREFILL_SECURITY_AFTERCARE_V6 — 本地验收

日期：2026-10-25。工作树 `D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1`，分支 `codex/bitrefill-final-connect-v1`，起始 HEAD `e82a7d2bf555071e69bf495e3efa5c841f37c1ed`，开工工作树干净。

只修复两项：商品/SKU 私有 metadata 的 Data API 列权限，以及客户自助退款申请关闭。V4/V5 商品目录、统一绑定、成本预览、Daju、历史订单快照、Mock、真实采购默认关闭均保留。没有访问 Production 数据库、执行 DB9、真实采购、Push、Merge 或部署。

## 1. 数据库强制隔离 metadata

事务补丁：`scripts/security/bitrefill-security-aftercare-v6.sql`。

SHA256：`deb805a6a216e195f27dcf4a6d4700f87bf199c316eba893dac5a43bc18826cc`。

- 撤销 `PUBLIC`、`anon`、`authenticated` 对 `products` / `product_skus` 的整表 SELECT 及遗留列 SELECT，再仅授予明确的公开列。未知/未来字段不默认公开。
- 不移动、不删除、不重新编码 metadata，不创建第二张绑定表，也不改变供应商/订单/采购来源。
- 不修改原有 RLS 策略；公开商品/SKU 可见性仍由原有 RLS 控制。
- 先检查表类型、JSONB 列、RLS、角色及原退款合同。直接或嵌套的公开可读 metadata 视图、异常退款 RPC 重载、继承来的越权权限会令整个补丁失败并回滚；不擅自修改未知对象或角色成员关系。
- 原 `service_role` 必须已经具有 metadata 读取权限，补丁不补授高权限。管理员浏览器 JWT 仍是 authenticated，也不能直接 SELECT 私有列；现有管理员 Next API 在身份鉴权后使用已有服务端客户端，继续读取私有配置。
- 公开商品详情查询移除 metadata 列，避免列权限收紧后整个详情读取失败。保留 V5 最终提交中的公开 DTO 白名单保护；公开售价、库存和 SKU 正常读取。

预期权限矩阵：

| 访问方式 | 公开列及 RLS | metadata / JSON 提取 / 过滤 / 整行序列化 |
| --- | --- | --- |
| anon 直接查询 | 允许可见商品/SKU | 拒绝 |
| authenticated 普通用户直接查询 | 允许可见商品/SKU | 拒绝 |
| 管理员 authenticated JWT 直接查询 | 保留原管理员行可见性 | 仍拒绝 |
| 经过现有管理员鉴权的服务端商品 API | 保留 | 允许管理员读取，普通用户不能进入 |

### SQL 包装与部署状态

**该文件是经过本地验收的独立前向安全补丁，不是 DB9，也未注册或执行 Production Migration。** 本机没有现成 Supabase CLI；从官方发布页取得便携 CLI v2.122.0 并通过官方 checksums.txt 校验，归档 SHA256 为 `f891d9bb641f7fa28fd9c61ea0f31be4964254bc84be9ff66f2376b6aaa7a9ed`。`migration new` 尝试写入授权范围外的用户遥测文件而被沙箱拒绝；没有为此放宽权限或修改系统/环境配置。故本轮使用独立 SQL 文件，不虚构 CLI 已创建迁移。

未来发布前必须在单独授权的流程中审核目标实际 schema、grant、视图、角色继承、函数及 Data API 暴露面，并将同一补丁纳入正式迁移/记账方案。不能因为本地提交或 Build 成功就报告 Production 的 metadata 已安全。

## 2. 关闭客户自助退款，保留人工处理

- `OrderRefundPanel` 移除申请按钮、申请表单、提交状态和 POST 调用；历史记录仍显示。新增的“联系人工客服”只是调用既有 `openPublicSupport` 事件，不新建客服渠道。
- `/account/refunds` 仍为历史只读页，移除引导客户提交申请的文案。
- `POST /api/refunds` 对所有调用者固定返回 HTTP 410、`CUSTOMER_REFUND_REQUEST_DISABLED`、`Allow: GET` 及 no-store。既不解析请求体，也不获取数据库客户端或执行风险/财务流程；旧客户端不能继续提交。
- `GET /api/refunds` 保留当前用户归属过滤、历史列表和分页。
- SQL 同时撤销客户角色对 `create_refund_request(text,text,text,numeric,text,text)` 的 EXECUTE，以及退款表的整表/列 INSERT 权限，阻止绕过 Next.js 直接调用 RPC 或 REST INSERT。函数本体和历史记录保留。
- 原超级管理员人工处理接口及 RPC 本体未改动；普通管理员不能执行超级管理员资金动作。人工余额退款、外部退款登记、幂等入账、已交付卡密不回库存均通过合成数据库回归。
- **本轮保留的是原有管理员对既有退款单的人工处理能力，没有新增“管理员主动新建退款工单”的功能或入口。** 客服收到全新退款诉求后如需该入口，应另行确认操作流程；不借此次安全修复另建退款系统。

## 3. 实际验收及证据边界

证据根目录：`D:/Jianlian/_bitrefill_security_aftercare_v6_20261025/`，不提交 Git。

### 一次性 PostgreSQL 17.11：88/88 PASS

最终证据：`pg-security-4yfVhF/result.json`；`pg-final.log`。补丁先在真实低权限角色下复现旧 metadata 可读取，再验收阻断。测试使用全新 localhost 数据目录、受限内存/并发、子进程环境白名单，不继承真实 libpq 配置或供应商密钥。结束后 PostgreSQL 已停止，postmaster.pid 不存在。

实际测试包括：

1. anon / authenticated / 管理员 JWT 的非超级用户权限；原始 JSON、`*`、JSON 子字段、metadata 条件过滤、整行 JSON 序列化均拒绝，公开列及原有 RLS 可用。
2. 私有未来列默认拒绝、服务端 metadata 保留、直接/嵌套视图绕过检查、继承越权导致整体回滚，以及补丁重复执行不更改业务行。
3. 真正的 Next Route Handler 和原管理员授权代码读取隔离数据库：公开详情 200 且无 metadata；普通用户/匿名用户在获取服务客户端前被拒绝；管理员/超级管理员仍可获取私有商品配置。
4. 原退款历史按用户隔离；客户及管理员 JWT 都不能走客户自助 RPC/INSERT；Next 自助 POST 固定关闭且无新退款单。
5. 加载**原始历史退款 schema、原人工处理函数和现有超级管理员包装函数**作为合成基线。真实管理员 PATCH 可标记人工处理中；两个独立会话并发人工余额退款只产生一次 credit；外部支付不能误入余额退款；人工登记外部完成可用，已交付合成库存不被重新上架。
6. 补丁前后商品、SKU、退款及账户数据快照相同；人工退款函数定义 SHA 摘要相同。测试中后续退款动作只处理本机合成数据。

**这里的数据库列权限是真实 PostgreSQL 验收；Next Handler 使用的是 SQL-backed 测试适配器，不是运行中的 Supabase/PostgREST 服务，也不是 Production JWT/完整登录验收。** Data API 的底层角色/列权限合同已经验证，目标环境实际 REST、关联查询和暴露对象仍需发布后只读复核。

首轮 86 项证据保留在 `pg-security-FbhjlS/result.json` / `pg-test.log`；最终增加嵌套视图和异常重载后为 88 项。不把旧结果冒充最终补丁结果。

### 浏览器：8/8 PASS

`ui-result.json`、`ui.log` 及 `customer-panel-1440.png` / `customer-panel-390.png`。实际客户组件在 loopback 合成 HTTP 下确认：没有申请表单/按钮，旧历史显示正常，现有客服事件发出，历史空态不引导自助申请，无 POST、JS 错误或两种宽度溢出。PublicLayout/Next 原语使用夹具替代，不冒充正式完整商城页面或客服弹窗端到端验收。

### 代码验收

```makefile
TYPECHECK=PASS
LINT=PASS_10_CODE_TEST_FILES
BUILD=PASS_WITH_EXISTING_WARNINGS
FULL_SUITE=1543/1543_PASS_0_SKIPPED
NEW_FAILURES=0
POSTGRES_PERMISSION_AND_AFTERCARE=88/88_PASS
BROWSER=8/8_PASS
```

日志：`typecheck.log`、`lint.log`、`build.log`、`full-suite-final.log`。Build 保留既有 ws 可选依赖、Supabase 动态依赖及 CSR 警告；没有修改字体、Next 配置或原有 Build 跳过 Lint 设置，本轮独立执行 Lint。

首次 Full Suite 的 `full-suite.log` 保留一个真实失败：旧 `high-risk APIs use shared rate limit and request size guards` 仍要求客户退款写接口存在限流调用。回归合同已随本次授权的接口关闭改为**固定 410、只允许 GET、不得调用数据库或解析请求体**，另有实际 Handler 动态测试；其它所有高风险接口的限流/体积检查不变。不是跳过测试、保留无用导入或降低退款安全要求。

## 4. 完整性与后续应用门禁

V4/V5、Daju 核心、采购/成本门禁、Mock 隔离、真实采购关闭、支付/充值/订单/私密交付、管理员退款接口及历史 migrations 均无修改。DB9 冻结 SHA256 仍为 `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。

只显式暂存本轮 13 个源码、测试、SQL 及报告文件，创建当前独立分支的本地提交。没有暂存工具、归档、日志、截图、测试数据库、环境文件或真实资料。最终 Commit SHA 及工作树状态以交付回执为准。

后续应用必须单独授权，并配套安排：

1. 核对真实目标/备份回退及对象漂移，审阅/注册 V6 补丁的唯一执行与记账方式；不要批量重放历史迁移，不执行 DB9 来代替此补丁。
2. 配对部署公开字段查询兼容代码与事务补丁。在 SQL 权限验收完成前，保持管理员私有映射/成本写入暂停；不得以应用 DTO 脱敏代替列权限。若需要受控维护窗口，另行授权。
3. 事务失败自动回滚，排查具体视图/继承/权限合同，不自行放宽权限。提交结果未知时先读回 ACL/RPC 权限，不盲目重放或伪造 migration history。
4. 应用回退必须保持客户 POST 关闭及 metadata 不公开；不能为兼容旧 `.select('*')` 或旧详情代码恢复公开 metadata / 客户 RPC 权限。管理员人工处理和历史读取必须保留；生产回退/恢复另行授权。
5. 验收目标真实 anon/authenticated REST 读取、管理员服务端读取、客户 POST/RPC 拒绝、历史列表和人工退款权限后，才允许恢复相应管理操作。本轮没有执行上述 Production 动作。

本地任务完成后 STOP。真实采购、DB9、远端提交、迁移或部署均不自动继续。
