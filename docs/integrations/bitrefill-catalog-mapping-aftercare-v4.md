# Bitrefill 商品映射与人工售后 V4（本地）

日期：2026-10-25。工作树 `D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1`，分支 `codex/bitrefill-final-connect-v1`，起始提交 `a30595a2e4ad044c3e923ad6f01d7b58afd72f2d`。保留 V3、296 套餐解析及其全部回归。

## 本轮边界

没有 Production 数据库连接或写入，没有执行 DB9，没有真实采购、余额操作、退款或发货。没有改动 Daju、支付/退款/交付核心、客户页面或 migration。没有 Push、Merge、部署或新增环境变量。

本轮交付代码保留在当前分支工作树，未自动提交。不是“真实自动采购已接通”：真实 Registry 仍仅注册 Daju；`REAL_BITREFILL_PURCHASE_ENABLED=false`，Business Adapter 仍默认禁止 POST。

## 三个后台入口

- `/admin/suppliers/bitrefill`：既有采购记录，新增目录/异常入口；修复翻页瞬间旧数据被标作新页的显示问题。
- `/admin/suppliers/bitrefill/catalog`：超级管理员专用商品 GET。搜索名称/ID、国家、分类、库存、面值、Package ID、Range 和分页。
- `/admin/suppliers/bitrefill/aftercare`：超级管理员专用异常只读队列，显示供应商失败、供应商退款、部分失败、UNCERTAIN/验证失败的人工处理提示；链接原有后台订单/退款审核。不新增客户退款入口。

两个新正式 API 只导出 GET，鉴权先于服务客户端或供应商客户端获取；无数据库 mutation / 财务 RPC。缺少数据库连接、权限或 DB9 时返回明确失败，不构造记录。鉴权测试使用实际 Route Handler + 合成依赖，不等于正式 Next 登录验收。

### 目录的真实语义

Personal 凭据只在服务端读取；固定 `https://api.bitrefill.com/v2/products` 及商品详情 GET，禁止重定向及其他端点。响应流上限 512 KiB，不先无限缓冲；单次超时 8 秒、无重试。国家快照最长 45 秒、20 页/1000 项；最多缓存四个国家、五分钟，同国家并发复用，最多四个国家同时查询。

先取得有界国家快照，再按搜索、type 和布尔库存筛选及分页，避免只过滤当前上游页。上限触发会明确提示结果不完整。分类使用供应商实际提供的 `type`；未提供就显示 unknown，不推断品牌分类。库存数量未知，绝不从 `true` 编造库存数量。

套餐 `catalogPrice` 单独标作结算单位未核验，不用于采购成本。非货币套餐标签仅展示，不能当作面值绑定。Range 配置仅准备映射，未开启真实 Range 采购。

依据：[Bitrefill 产品说明](https://docs.bitrefill.com/docs/products)、[Supabase RLS 安全说明](https://supabase.com/docs/guides/database/postgres/row-level-security)。Personal GET 访问成功不代表商业转售许可。

## 本机隔离映射工作台

正式 Next 页面不提供映射/成本写接口。本机显式启动以下脚本后，实际 React 编辑组件连接独立 loopback HTTP 服务；无 Supabase 客户端，不写真实 supplier binding：

```powershell
node "D:\Jianlian\Jianlian-shop-bitrefill-final-connect-v1\scripts\run-bitrefill-catalog-workspace.mjs"
```

需要当前进程已有 `BITREFILL_API_KEY`，脚本不创建或写入环境变量，也不打印凭据。输出随机 `127.0.0.1` URL，打开该 URL 即可使用。Ctrl+C 停止；没有开机启动或部署。

本地配置存放在 `D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025/workspace/metadata.json`（不在 Git）。目录及祖先拒绝链接；独占锁防止多进程并行写，同步事务 + 临时文件原子重命名，状态上限 4 MiB。异常退出遗留锁须人工确认无进程后处理，不自动抢锁。仅持久化 SKU 参考、映射、审核与人工备注，不保存 API Key 或私密卡密。

本机服务校验精确 Host、Origin、SameSite/HttpOnly Cookie；POST 另需本地自定义头，拒绝跨站请求。它不是多用户生产管理员认证系统，不能暴露到公网。没有采购、支付或退款路由。

### 映射与成本

- 原十个 Apple US SKU 来自已有静态定义，明确标作 `legacy_static_unverified`，不是当前 Production SKU/售价的数据库快照。
- 允许手动录入 Amazon 或其他本地 SKU 参考（含售价/币种），不创建线上商品；售价未知可留空。
- 每个 SKU 只能选准确 Product ID + Package ID，或 Product ID + Range Value；互斥校验。国家、面值币种和数值必须精确一致；Range 按最小值、最大值、步长用八位定点整数验证。
- 人工审核需逐项确认商品身份、面额和本地边界；Apple/Amazon US 另需品牌/使用地区确认。名称匹配不会自动确认。审核基于商品 DTO SHA256，保存时重新 GET 复核；目录变更必须重新审核。乐观版本号防止并发覆盖，保存审核轨迹。
- 配置成本/费用可空，始终 `manual_unverified`；未提供费用不默认零。利润只在同币种且成本、费用、售价齐全时计算；没有可信汇率不换算。预估利润不成为采购放行依据。
- 独立实际采购成本结构包含 order item、Invoice、Child、金额、币种、来源、证据指纹和时间。目前仅允许合成 GET 证据测试写入，按 Child 去重并拒绝冲突；不是实际供应商结算成本。真实记录为零，不编造成本。
- 所有映射始终 `automaticPurchaseAllowed=false`、`realContractVerified=false`，输入不能改为 true。

### 异常与人工售后

按完整订单聚合后再分页，避免两个 order item 分页后漏掉部分失败。正式查询为有界只读快照：精确计数最多 1000 个 Bitrefill root，本页最多 500 unit/child；超限、后端截断或缺少精确计数会拒绝读取，不返回错误的“完整”结果。扩大规模前需要单独审查索引查询/分页设计，不能把此上限当作生产无限队列能力。

供应商 REFUNDED 仅表示供应商状态，不代表给顾客退款。队列完全没有财务变更；原管理员人工退款能力保留。仅本地工作台可记录人工处理中/人工记录完成，按请求 ID 去重，记录完成也不更改订单、发货或账本。生产未新增处理状态写入接口。

供应商 Child DELIVERED 不等于商城发货完成。既有采购模块继续要求精确身份及权威 GET、私密交付 RPC 返回成功和 delivery_id；Webhook 只是对账提醒，Invoice complete 不构成发货依据。本轮没有修改这一事务边界，保留重复采购/通知/交付保护。

## 本轮真实 GET 结果

使用现有 Personal API，仅 12 次商品 GET，取得 US 551 项，未截断，均 HTTP 200。没有余额/订单/Invoice 请求。当前响应没有 type，因此分类均为 unknown。

- “Apple”子串查询仅返回 **Applebee's USA**，不是 Apple 礼品卡，不写入任何映射。
- Amazon 查询 0 项，不猜 Product ID。
- Steam USD 在目录中可供货，有五个套餐；不代表商业许可、真实成本或生产绑定已通过。

证据：`D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025/live-catalog.json`。此结果是当天 Personal 目录上下文，不保证其他账户、地区或后续时刻仍相同。

## 验收证据及限制

- V4 定向单元/集成：12/12 PASS，含实际 Next GET 鉴权、目录筛选/分页、296 套餐、TTL、数据变更、金额/Range、人工审核、并发版本、成本未验证、无自动退款、持久化重启、重复写锁及事务回滚。
- 一次性 PostgreSQL 17.11：原采购 HTTP 闭环 57 项 + V4 映射 37 项 + 售后 9 项断言 PASS，两个独立后端连接。使用 `mock_supplier_v2.state` CAS、非超级用户 mock_app；不是 DB9 五张表/六个 RPC 的再验收，没有执行任何 migration，结束后已停止。
- 浏览器：新增 14 组 PASS，实际 React 组件、本机合成 HTTP，1440/390 无横向溢出，国家/分类/库存/分页、审核拒绝与保存、Amazon Range/成本利润、空态、失败重试、售后备注刷新持久显示；原采购/客户私密内容遮盖组件七组回归 PASS。
- 浏览器夹具外网被阻断；不是生产业务数据、完整 Next/Supabase 登录验收，也不是可兑换的真实卡密。
- Full Suite、TypeScript、Lint 和 Build 的最终结果见本报告下方最终验收节及外部日志。Build 使用现有正常配置，未修改字体或依赖；保留既有可选 ws/Supabase 动态导入/CSR 警告。项目既有 Build 跳过 Lint 设置未变，另行执行 Lint，不把 Build 当作 Lint。

全部证据在 `D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025/`：`full-suite.log`、`build.log`、`typecheck.log`、`lint.log`、`ui-result.json`、截图、最终 `pg-synthetic-6iURCv/result.json`，不提交运行产物。原七组浏览器回归记录在既有 `_bitrefill_mock_supplier_v2_20261025/ui-result.json`，同样仅合成数据。

### 最终验收（最终代码重测）

```makefile
TYPECHECK=PASS
TARGETED_LINT=PASS_27_FILES
BUILD=PASS_WITH_EXISTING_WARNINGS
FULL_SUITE=1529/1529_PASS_0_SKIPPED
NEW_FAILURES=0
POSTGRES_SYNTHETIC=PASS_57_PLUS_37_PLUS_9_ASSERTIONS
POSTGRES_INSTANCE_STOPPED=yes
V4_BROWSER=PASS_14_GROUPS
V3_BROWSER_REGRESSION=PASS_7_GROUPS
DAJU_REGRESSION=PASS_IN_FULL_SUITE_SOURCE_UNCHANGED
CUSTOMER_AUTOMATIC_REFUND=NOT_ADDED
REAL_PURCHASE_ENABLED=no
PRODUCTION_CHANGED=no
DB9_EXECUTED=no
PUSHED=no
MERGED=no
DEPLOYED=no
```

DB9 文件 SHA256 仍为 `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。最终 HEAD 仍为 V3 提交，没有暂存或创建 V4 提交。最终变更共 28 个代码/测试/文档文件，敏感格式扫描、现有 Personal Key 字面值检查和文件类型检查均未命中；这不等于通用 DLP 认证。运行证据和合成卡密均不进入 Git。

本轮 Supabase 安全检查落实为超级管理员先鉴权、无浏览器凭据和仅白名单读取；React 检查落实为请求取消、空态、错误重试、窄屏输入及分页与响应一致。不通过放宽数据库权限或跳过失败断言取得 PASS。

## 剩余正式上线阻塞

1. Business 凭据、商业许可、付款及真实 Child 精确关联契约未验证；不能用 Personal 商品访问替代。
2. 真实 Apple/Amazon US 商品及每个当前 SKU 的人工证据未具备。目录子串命中不是身份依据。
3. 可信采购成本、结算币种/费用/汇率/利润及真实供应商结算证据未验证。
4. 本地映射尚未设计成经过授权的生产绑定写入，不能直接把 metadata.json 导入 Production。生产异常处理状态写接口也未启用，仍用既有人工订单/退款流程。
5. DB9 Production 未安装，真实备份/恢复/迁移与应用发布门禁未解除；本任务不推进它们。
6. 真实采购硬门禁与单 item 单 invoice 约束继续保持；任何真实交易、部署或开启采购必须另行授权。

下一安全步骤：人工验收本地目录、SKU 映射草稿和异常提示；取得真实商品/商业/成本合同后，再单独设计生产绑定与受控发布。完成后 STOP，不自动提交、Push、部署或开启采购。
