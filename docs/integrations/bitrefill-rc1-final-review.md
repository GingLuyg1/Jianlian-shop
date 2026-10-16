# Bitrefill RC1-R1 发布候选最终审查

日期：2026-10-16（Asia/Shanghai）。LOCAL ONLY。
本报告是候选版本的审查回执，不是合并、迁移、部署或花费真实资金的授权。

## 1. 冻结对象与审查边界

- 工作区：`D:/Jianlian/Jianlian-shop-bitrefill-rc1-integration`。
- 分支：`codex/bitrefill-rc1-local-integration`。
- 已审查代码 HEAD：`51ee8501a3cd62b4756aaf369fb779de278c507c`。
- 进入本任务时工作树 clean，HEAD、分支和原始文件 SHA 均与授权值一致。
- 本轮仅新增本报告；未修复/修改应用、UI、测试、依赖、环境文件或 SQL。
- 报告本地提交后的 Git HEAD 由交付回执给出；应用代码冻结点仍是上面的51ee850。
- 迁移：`supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql`。
- 原始文件 SHA256：`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。

本轮数据库操作仅针对专用127.0.0.1:55433、PostgreSQL17.11和受校验的数据目录，
使用合成订单/卡密、FakeTransport及随机命名的一次性数据库。没有访问 Production
或业务 Test 数据库，没有读取真实余额/订单/卡密，没有 Bitrefill API 请求。
GitHub 仅用于读取 main 和 PR76/77/78 元数据及文件清单；未修改任何远端对象。

## 2. Git 集成链与重复改动审查

远端 main 通过 GitHub 只读接口重新核实为
`4575d802d653e4dca726427bce826aa68c93d9e2`。
本地 main 仍是旧的48a7a3a…，不能将其当作当前远端基线。

| 层次 | 提交/范围 | 本层文件数 | 结论 |
| --- | --- | --- | --- |
| PR78 / V1.1与只读初版 | ad35a77 → 7f1c084 → f642eb0 → 7f9a25b |31| 已在RC1祖先链中，不重复导入 |
| V1.2A |159f49b8b740dd3c33f58ecfeb63f2f0b185f28b|6| 解析契约和回归是对初版的后续修正 |
| V1.3至DB7B |159f49b → ed8a9c492d755461e09441b324f3e317f4c64321|42| 持久化、私密交付、fixture及证据演进 |
| DB9 |7442df060846413fc618048851c83b8c93206810；d31d445d81ef598450c6fd525d0a8f129787fca5；6c53783ccffc5137b523e4f62a0a81b2a2c6489a|20| 权限加固已完整保留 |
| P1 |d9caf25 → 761947367f66ddfc5c8493219fe614d684ed775a|7| 基于DB7B的关闭采购适配 |
| P2 |8708ce8 → d426258 → da8eb3c7da382534778cb2c570129dea2ab2002d|12| 继承P1，增加已付款订单闭环 |
| P3 |36cfc3f → 8241932 → 03b9155 → fcc2d7c73118120e8952f95dad0d1b9b2d553b19|16| 继承P2，增加资金、Child及恢复保护 |
| RC1 |51ee8501a3cd62b4756aaf369fb779de278c507c|相对DB9为33| 双父提交合并并解决测试合同冲突 |

RC1第一父提交为6c53783…（DB9），第二父提交为fcc2d7c…（P3）。
完整P1/P2/P3/DB9逐提交全SHA同时列于既有`bitrefill-rc1-release-review.md`第一节。
P1是P2祖先，P2是P3祖先；DB9与P3共同祖先为ed8a9c4…。
PR78、V1.2A、DB7B、DB9、P1、P2、P3均通过`merge-base --is-ancestor`检查。
32个非merge提交的stable patch-id未发现重复。文件多次修改并不等于重复应用：
provider解析、purchase-persistence和测试辅助代码是沿继承链逐步加强的同一实现。

迁移历史中的旧候选曾被修订，不是多张需要依次安装的V1.3迁移。
最终仅有一个V1.3迁移路径，必须审查/部署DB9最终字节，不能按中间提交逐版执行。
RC1相对DB9的迁移目录、fixture、app/components/hooks、订单/支付核心及依赖文件无差异。
RC1应用库与P3一致；没有在本轮审查中新建履约系统或恢复旧写权限。

### PR78 当前状态与交叉范围

[PR78](https://github.com/GingLuyg1/Jianlian-shop/pull/78) 仍open、未合并，HEAD为
`7f9a25b1bfe1fadf553179074f8f4c8869568ed4`，base为4575d802…，31个文件。
RC1冻结代码相对远端main为100个文件，相对PR78为78个文件；PR78的31个路径均在RC1中。
其中9个路径在后续层再次修改：

- docs/integrations/bitrefill-production-checklist.md
- docs/integrations/bitrefill-purchase-schema-plan.md
- lib/providers/bitrefill/client-core.mjs
- lib/providers/bitrefill/protocol.d.mts
- lib/providers/bitrefill/protocol.mjs
- lib/providers/bitrefill/provider-core.mjs
- lib/providers/core/supplier-router.ts
- tests/unit/bitrefill-hardening.test.mjs
- tests/unit/bitrefill-readonly.test.mjs

这些是继承后修正，不应把PR78与整个RC1作为互不相关补丁重复cherry-pick。
原RC1唯一文本冲突位于DB5测试SQL执行helper，解决依据是同时保留DB9 owner/defaults
与P3 UTF-8 stdin/超时；本轮未进行merge、rebase、reset、stash或冲突重解。

## 3. UI 文件级冲突检查

当前[PR76](https://github.com/GingLuyg1/Jianlian-shop/pull/76) 与
[PR77](https://github.com/GingLuyg1/Jianlian-shop/pull/77) 均仍Draft/open、未合并。
PR76为22c69619…、8文件；PR77为24472cb7…、12文件。其文件清单与RC1的100路径交集均为0。
PR76与PR77彼此有7个共用路径，且PR77说明已吸收PR76部分内容；不要建议把两个UI PR都盲目合并。

本地只读抽查以下12个明确相关工作区，比较各自相对共同main祖先的提交差异，以及当前
未提交tracked/untracked路径；与RC1路径交集均为0。未修改这些工作区。

| UI工作区后缀 | 当前HEAD | 本分支提交差异文件数 | 当前有未提交改动 |
| --- | --- | --- | --- |
| account-recharge-v36-isolated-20261015 |3bb60ceffe3ef37c6d1b27a126554072d77f3714|184|no|
| admin-orders-ui-v1-20261015 |da560adbaa7f909de601e584095871f53a19960a|53|no|
| admin-ui-v2-2-data-layout |24472cb780073efed16ed602bdf8204ad7965b90|12|yes|
| admin-ui-v2-3-readonly-analytics |24472cb780073efed16ed602bdf8204ad7965b90|12|yes|
| admin-ui-v2-5-release-candidate |da560adbaa7f909de601e584095871f53a19960a|53|yes|
| admin-ui-v2-dashboard-integration |24472cb780073efed16ed602bdf8204ad7965b90|12|yes|
| admin-ui-v2-dashboard-prototype |24472cb780073efed16ed602bdf8204ad7965b90|12|yes|
| admin-v25-home-restored-20261015 |da560adbaa7f909de601e584095871f53a19960a|53|no|
| storefront-category-transition-v1 |66a31016b3f0343a9a6ab9e66cb7298539b744d5|173|yes|
| v2-5-final-integration-20261012 |5a444ec916c3c314d672a07ca5bf39b160588674|160|yes|
| v2-5-security-upgrade |da560adbaa7f909de601e584095871f53a19960a|53|yes|
| v2-5-security-upgrade-clean-20261012 |da560adbaa7f909de601e584095871f53a19960a|53|yes|

完整目录均为`D:/Jianlian/Jianlian-shop-<后缀>`。结论仅为本次快照的文件级无重叠，
不是全站视觉/浏览器回归通过，也不代表UI工作区应当clean；其现有用户改动全部保留。
未来其他分支更新后仍须重新比较，不能把本报告当作永久无冲突保证。

## 4. 默认关闭、成本和事务安全

本轮静态审查与真实本地PG角色测试的结论：

| 保护项 | 代码/实测证据与边界 |
| --- | --- |
| 真实采购关闭 |prelaunch-policy.mjs代码常量false；HTTP transport必须constructor opt-in AND该常量；缺环境变量、传入凭证或purchaseEnabled:true均不能开启POST |
| 活动路由 |默认Supplier Registry只注册Daju；Bitrefill仅显式注入本地FakeTransport handler；没有上线worker/scheduler |
| 可信成本 |本地handler只接受synthetic_fixture；缺失/不可信来源、币种/数量不符、过期、成本超限和利润越界均阻断；面值不是成本，不调用FX |
| 唯一采购 |已支付服务端订单和冻结root/item绑定校验；逻辑键、semantic hash、单位唯一约束、事务Claim和CAS边界；重复付款/并发只有一次fake submit |
| UNCERTAIN |已进入SUBMITTING/UNCERTAIN不盲目重发；有durable invoice ID时GET恢复，无ID人工处理；CLAIMED只凭原始一致未过期证据恢复 |
| 五表写边界 |service_role仅SELECT；应用代码五表访问为select，变更只走六个事务RPC；真实SET ROLE的I/U/D等尝试均被拒绝 |
| 六RPC |精确签名、DEFINER、固定pg_catalog、受验证owner、业务对象schema qualification；PUBLIC/anon/authenticated无EXECUTE；service_role执行成功 |
| RLS/继承 |五表RLS开启且无policy；检查USAGE及SET路径、column grants和PG17 MAINTAIN；owner/继承/默认授权异常使迁移整体回滚 |
| Child与私密交付 |初期quantity1/item→1invoice→明确sole child；无身份/多child/错商品面值/不可用卡密均fail closed；complete invoice不等于所有child delivered |
| 卡密保密 |复用既有private outcome+绑定事务；Webhook仅唤醒，普通表只存allowlist ID/状态/fingerprint；14张非私密表和普通日志合成标记命中0 |

五表为supplier_purchase_attempts、supplier_purchase_attempt_items、supplier_external_orders、
supplier_webhook_receipts、supplier_reconciliation_evidence。六RPC包括claim、transition、
record_child、record_evidence、record_webhook、deliver_child；另有三个INVOKER guard helpers。
本地真实service角色可调用受控RPC但不能绕过写表，两个独立session的Claim/交付/对账竞态通过。
现有owner/DBA仍有正常管理权限；不能把最小应用权限表述为管理员也无法写表。

以上是离线/本地权限结论，不是Production新表运行验收。DB10先前迁移前Gate仍只是历史
只读证据，本轮不刷新Production状态。真实报价来源、资金限额、atomic spend ceiling、
真实Child字段和商用权限仍缺失；本地quote标签或FakeTransport字段不能替代这些证据。
没有凭证读取/真实采购/供应商资金扣款。现有GET-only catalog transport没有被改成可采购。

## 5. 本轮真实复测结果

日志目录：`D:/Jianlian/_bitrefill_v13_local_pg/`，均为本轮rc1-r1-*日志，非复制旧验收。

| 检查 | 本轮结果 | 日志 |
| --- | --- | --- |
| V1.3/DB9真实PG角色、故障原子性、RPC |PASS|rc1-r1-postgres-acceptance.log|
| 付款至私密交付及客户所有者查询 |PASS，同一个合成订单连续服务/SQL路径|同上|
| P1/P2/P3/RC1关键测试 |54/54 PASS|rc1-r1-focused.log|
| Daju/共用供应商合同 |56/56 PASS|rc1-r1-daju.log|
| Local Inventory/Payment Failed Guard/余额/激活隔离 |83/83 PASS|rc1-r1-isolation.log|
| TypeScript |PASS|rc1-r1-typecheck.log|
| 定向Lint |PASS，退出0|rc1-r1-lint.log；终端退出回执|
| Full Suite |1501 total /1495 pass /6 fail，退出1；NEW_FAILURES=0|rc1-r1-full-suite.log|
| 一次正常Build |FAIL：Inter字体fetch connect EACCES|rc1-r1-build.log|
| RC1完整PG launcher最终收尾/双新库证据 |PASS，全部阶段完成，退出0|rc1-r1-postgres-acceptance.log|

本轮稳定性窗口60秒、7 cycles，max sampled sessions1，max RSS113700864 bytes。
100合成订单批次35 fake submits、26私密交付、9明确待处理child，无跨订单或余额漂移。
60秒不是30分钟新认证。重复通知2/10/100、10次客户付款RPC单次扣款、独立PG session、
21/21 synthetic子订单、已知ID GET恢复、未知ID不重发、Webhook/Poll、ACK丢失、私密
事务回滚/重启等均重跑。真实Daju网络和真实库存/Production架构克隆不在这些合成数据测试内。
数据库测试必须完整结束并清理自身随机数据库才算最终完成，不以中途PASS标记代替退出0。
本轮最终确已完整结束：两个全新disposable DB均通过fixture、迁移及ACL/RLS检查，
其观察到的原始v1指纹均为5d5eae30d3cca15c98f83e38019823eb0cd4d9feebc82ded4d93e4ea3737fcea。
冻结manifest的e036759cd8baa297a4de29c3bf3dc1460bd7959fdc00ebb26a6b7807849193fb保持不变；
逐行比较只接受了上一轮已经独立证明的outcome函数正文LF/CRLF MD5差异，其他合同一致。
这不是将两个原始指纹宣称相等，也不是新Production parity；没有改hash算法、manifest或SQL。

### 六项失败逐项核实

与此前`rc1-full-suite-final2.log`比较，失败名称集合完全一致，未知/新增名称为0。
同时核对tests/unit/migration-runner.test.mjs及scripts/db/run-migration.ps1与远端main
源码（仅换行表示规范化用于文件比较，不改源码），内容均未改动。

| 测试位置 | 精确失败名称 | 本轮与旧基线的失败表现 |
| --- | --- | --- |
| migration-runner.test.mjs:62 |migration runner validates immutable inputs and exact environment refs|实际exit1，预期0|
| :92 |migration runner only accepts exact official direct and pooler targets|实际exit1，预期0|
| :131 |migration runner dry-run only checks identity and execute alone uses --file|实际exit1，预期0|
| :163 |migration runner clears inherited libpq overrides and applies safe connection settings|实际exit1，预期0|
| :198 |production execution requires the exact confirmation text|得到MIGRATION_RUNNER_FAILED，不匹配预期PRODUCTION_CONFIRMATION_TEXT_INVALID|
| :227 |migration runner preserves psql failure status and never prints credentials|实际exit1，预期7|

测试使用fake psql和合成URL；名称中的production并不表示本轮连接或执行Production。
没有跳过测试、改断言或把其他失败并入此集合。包装器隐藏了底层异常，不能仅凭这些结果
宣称已确定六项失败的完整根因；修复runner需要独立审查，不在此修改历史运维脚本。
Full Suite非全绿，六项问题仍待修复或被授权评审明确接受，而不是自动豁免。

### Build网络/缓存诊断

当前app/layout.tsx仍使用原Inter({subsets:['latin'],display:'swap'})，未改字体/页面。
本地DNS可解析fonts.googleapis.com；受限执行的curl HTTPS连接失败，正常next build在
请求Inter CSS时返回connect EACCES，编译退出1。单独获准的公开CSS HEAD诊断在沙箱外
返回HTTP200。因此已定位到执行上下文的网络访问差异，不能断言Google Fonts服务宕机。

只读检查现有Next13.5.1 loader：CSS/font使用进程内Map去重缓存，失败的生产构建不会
按开发模式回退字体。.next/cache有swc/webpack目录，其存在不证明具备可用Inter缓存。
未清缓存、下载/伪造字体缓存、设置mock-response环境变量、改SSL/代理、安装依赖，
也未为整个应用放开网络。没有在可能触达应用数据源的非隔离网络环境中贸然运行Build。
本任务只完成诊断，BUILD=BLOCKED_SANDBOX_FONT_EACCES，不是构建成功。

## 6. 建议独立PR拆分（仅计划，未建分支/PR/合并）

建议依赖顺序为：

1. 既有PR78（V1.1初始四提交）。先审查该PR已有范围，不重复把31路径拷贝成另一套系统。
2. PR-A：V1.2A解析/可用性schema修正，159f49b8…及6文件，基于已整合PR78的新main。
3. PR-B：V1.3持久化+DB4/5/7B证据+DB9最终权限硬化，使用V1.2A→6c53783…的最终净差异。
   迁移在PR tip必须是90f165ae…，不能把旧2b316731…候选作为单独部署步骤。
   DB9三个fix/test/doc提交不能遗漏，fixture/harness/checksum与SQL一起审查。
4. PR-C：P1/P2/P3关闭状态应用适配+RC1冲突解决/验收/发布计划+本报告，最终树以RC1为准，
   依赖PR-B的六RPC合同。P1/P2/P3是连续链，不拆成三个独立重复导入分支。

这种拆分尚未实际重建或测试每一个中间PR tip；当前完整测试针对冻结RC1最终树。
只有获得后续明确Git授权后，才能从当时main准备依赖PR并逐个复测。PR78若squash，
其原SHA不会天然成为main祖先，需重新计算base/净差异，不能机械cherry-pick再重复导入。
也可以人工选择以一个统一后继PR替代旧PR78，但须另行协调和授权，本轮没有关闭/更新它。
UI PR76/77与此顺序独立；不得两者都盲目合并，也不借本任务合并任何UI成果。

## 7. 迁移与部署的准确依赖和授权顺序

V1.3新feature运行前需要既有orders/order_items/order_deliveries/private secrets/
supplier root合同、既有私密outcome及辅助函数、P2.3 activation evaluator和正确角色/owner。
这些是依赖，不是要求重跑历史migration。尤其禁止重执行已手工部署的历史BEP20权限迁移，
禁止整库db push/reset/repair、修改受保护充值审计SQL。DB10历史证据不能代替届时状态检查。

| 顺序 | 前置核验与具体动作规划 | 授权/当前状态 |
| --- | --- | --- |
| 1. Git审查/合并 |处理Build和六项基线失败的修复/明确评审；审查上述依赖PR与最终SHA，当前main上重新验收|未授权、未执行|
| 2. Production迁移审核 |明确项目/操作者/可信postgres executor；核对目标不存在、历史版本、owner/default ACL/继承、五COUNT、备份恢复计划和精确SQL字节|需独立迁移授权；未执行|
| 3. 迁移及只读postcheck |另行授权后仅执行冻结V1.3单文件；再独立核对五表、六RPC/三个guard、RLS、有效ACL、索引约束和版本|本轮未授权/未执行|
| 4. 服务端部署审核 |前述检查通过；审核服务端凭证边界、应用artifact、采购硬关闭、Daju/本地库存兼容性|需独立部署授权；未执行|
| 5. 关闭状态运行检查 |保持false代码门、Daju-only默认路由；审核运行日志/错误、用户权限和客户支付正常性，不调用采购/余额接口|未来单独限定授权|
| 6. 成本/币种 |供应商授权成本源、有效期、实际支付分摊/费用、同币种或可信FX、限额/利润、供应商原子最大支出或付款设计|TRUSTED_LIVE_COST_AVAILABLE=no|
| 7. 实际订单关联 |核实实际invoice/child ID/商品/package/面值/数量/状态/redemption合同；单item单invoice，不按位置猜测|LIVE_CHILD_IDENTITY_VERIFIED=no|
| 8. 小额真实交易 |商业/Business权限、资金/数量/商品上限、操作人、监控和异常手册；单独授权invoice/扣余额/付款及真实私密卡密处理|未授权、未执行|
| 9. 限定商品灰度 |前述全部验收后另行评审enablement、allowlist、对账/人工监控和关闭开关；未验证Apple与live批量仍禁用|未授权、未执行|

Code PR合并不等于数据库安装，也不等于允许部署/启用采购；必须在任何依赖新RPC的
应用worker启用前完成V1.3迁移及权限核验。当前代码仍是关闭候选，并非上线自动worker。
如果未来要使其上线，还需要经过真实数据源/HTTP写路径隔离测试等单独实现与审查，
不能把这份九步计划当作已经具备所有Production接线。

未来只读SQL：`docs/integrations/sql/bitrefill-rc1-postmigration-readonly.sql`。
本地重跑64项和10个回滚反例验证其作用，但本轮未在Production执行。版本存在本身不
能证明文件SHA；应将独立计算的发布artifact SHA、执行回执与版本关联保存，不虚构
Supabase原生checksum列。SELECT-only核验不是生产运行时RPC写入E2E；写入测试只可
在另外授权的隔离环境进行。

## 8. UI交接确认

现有P2 UI合同和P3 handoff已完整复读，并对照真实delivery Route源码。可直接交接：

| UI语义 | 现有合同 / 注意事项 |
| --- | --- |
| 待支付 |payment_status=unpaid；前端不声明paid，不触发供应商采购|
| 支付成功/处理中 |paid与fulfillment/item delivery独立，不能把付款成功显示为卡密已交付|
| 部分交付 |delivery接口顶层delivered仅意味着有任意delivered行；整单须结合item状态/fulfillment_status|
| 已交付 |使用真实delivery行的时间/内容；不拿invoice创建或complete状态代替|
| 所有者查看 |GET /api/orders/{orderNo}/delivery经过getUser、账户限制和get_order_delivery_for_user；owner-only，no-store/no-cache/nosniff|
| 失败/人工处理 |使用既有失败/处理中/联系客服表达；UNCERTAIN等采购内部枚举未作为新客户API字段暴露，不显示“再买一次”|

401未登录、403未支付/禁止状态、404不存在/非本人、500临时错误+request ID的合同保持。
content可能是含code/pin/url/instructions的JSON字符串，只按数据安全渲染，不写analytics/
日志/浏览器持久缓存。不得把Bitrefill Key、成本、余额、invoice ID或semantic hash交给UI。
没有新的客户采购状态接口或Bitrefill后台手工购买按钮，不能要求UI实现不存在的数据标签。
P2/P3旧文档中“DB8待核验”是冻结历史描述；RC1应同时阅读DB10/RC1报告，仍不得声称
Production安装及运行时验收已完成。UI合同可交接，不等于真实浏览器/UI验收通过。

## 9. 回退、止损和禁止重复采购

迁移前：任何冲突、脏数据、owner/ACL漂移或SHA不符即停止，不自动repair。
迁移COMMIT前失败由既有整体事务回滚。COMMIT后不得用DROP五表/删除attempt/重置状态
当作回退，必须保留幂等、外部ID和私密交付证据，单独审查前向修复。

应用失败先关闭新采购，回退到已审查的Daju-only/关闭artifact；数据库证据保留，不因
应用回退重新提交。关闭开关不撤销供应商扣款，也不授权退款、替代购买或第二次客户扣款。
已知invoice只做单独授权的GET对账；未知已提交结果保留UNCERTAIN并人工核对。
交付已提交但ACK丢失须复用durable delivery/唯一约束，不重写卡密。Webhook仅唤醒。
未来有限GET退避建议1/2/5/10/30分钟、最多5次并尊重quota/jitter，之后人工处理；
这里只规划，未创建定时任务或worker。业务退款/争议仍走现有权限与售后流程，无新承诺。

## 10. 审查结论与保留Gate

Git祖先链、去重、权限合同、UI文件级交集、UI接口交接及发布依赖已审查。
本轮不需要修改代码/测试；仅报告本地提交。Supabase/PostgreSQL安全规范用于区分
GRANT、RLS、BYPASSRLS、owner与USAGE/SET继承，不以放宽写权限解决问题；参见
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)。

本报告的PR_STAGING_READY严格指“可作为已完成构建验证的候选进入下一步PR暂存准备”，
不是仅有一个可读diff。由于Build仍失败，且六项基线失败尚无本轮豁免，保守记录no。
报告完成不代表这些阻塞已消除；未来需要用户明确决定Build重验环境及基线处理。

FINAL_RELEASE_REVIEW_COMPLETE=yes
PR_STAGING_READY=no
KNOWN_BASELINE_FAILURES=6
NEW_FAILURES=0
TRUSTED_LIVE_COST_AVAILABLE=no
LIVE_CHILD_IDENTITY_VERIFIED=no
POST_MIGRATION_PRODUCTION_ACL_VERIFIED=no
REAL_PURCHASE_ENABLED=no
PRODUCTION_READ_EXECUTED=no
PRODUCTION_CHANGED=no
PRODUCTION_MIGRATION_EXECUTED=no
BITREFILL_API_CALLED=no
BITREFILL_REAL_PURCHASE_EXECUTED=no
REMOTE_PUSHED=no
PR_CREATED=no
PR_MERGED=no
V14_CREATED=no

STOP：等待用户授权，不自动进入任何后续PR、Production、迁移、部署或真实交易。
