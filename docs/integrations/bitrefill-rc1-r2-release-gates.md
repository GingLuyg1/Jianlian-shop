# Bitrefill RC1-R2 — Build、基线与 PR 审查包

日期：2026-10-16（Asia/Shanghai）。LOCAL ONLY。
这是本地验收和发布依赖报告，不是 Push、PR、合并、Production 迁移/部署或真实采购授权。

## 1. 冻结对象与本轮改动

- Worktree：`D:/Jianlian/Jianlian-shop-bitrefill-rc1-integration`。
- Branch：`codex/bitrefill-rc1-local-integration`。
- 进入 R2 的 HEAD：`211666281e5177f30da4f8bb607c5fe18abc3f78`；工作树 clean。
- RC1 业务合并：`51ee8501a3cd62b4756aaf369fb779de278c507c`。
- R2 局部测试修复：`b159180cb3a4d066763f8638c5a5d642422f7ed1`。
- 本轮只改 `tests/unit/migration-runner.test.mjs`，并新增本报告。
  测试修复和报告分开本地提交；报告提交后的最终 HEAD 由交付回执和 Git log 给出。
- 没有修改迁移 runner、应用代码、UI、字体、Next 配置、依赖或环境文件。
- 唯一 V1.3 候选：`supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql`。
- 原始字节 SHA256：`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。
  初始、本地 PG replay、测试修复提交后均相同；不能用 Git 换行归一化后的 blob hash 代替。

本轮没有读取 Production、业务 Test 数据库、Bitrefill API、真实账户余额/订单/卡密。
本地数据库使用 FakeTransport、合成订单、合成报价和专用一次性数据库。
GitHub 仅只读查询 main、PR76/77/78 元数据和文件清单，没有远端修改。

## 2. Build 取证与真实闭环

### 环境与两次尝试

实际运行版本：Windows、Node.js 24.21.0、npm 11.19.0、Next.js 13.5.1、React 18.2.0、
TypeScript 5.2.2、ESLint 8.49.0、已安装 supabase-js 2.108.1。未安装或升级依赖。
Windows PowerShell 子进程为 5.1.26100.8521；测试由现有 PowerShell Core 上下文启动。

| 尝试 | 命令和隔离方式 | 实测结果 |
| --- | --- | --- |
| 1 | 原工作树正常 `npm run build`，受限沙箱 | exit 1，Inter CSS 请求 `connect EACCES`；next/font 随后令 Webpack 失败 |
| 2 | 获准网络上下文，原 `node node_modules/next/dist/bin/next build`；只改变子进程构建环境 | exit 0，完整编译、类型检查、页面数据、77/77 静态页面和最终优化通过 |

第二次命令就是 package.json 的原始 `next build`，没有改构建步骤或源码。
原 next.config.js 本就配置 ignoreDuringBuilds；本轮另行执行定向 ESLint，未新增 lint 豁免。
构建成功仅代表这个本地 artifact，不能证明 CI、真实登录页面或 Production 配置已验收。

### 网络根因与安全隔离

- 沙箱内 DNS 可解析 fonts.googleapis.com；Node 连接 443 返回 EACCES，curl 也在连接阶段失败。
  因而不是本轮已证明的 TypeScript 缺陷或 Google 字体服务宕机。
- 同机获准上下文中，公开 CSS 的无凭证 HEAD 返回 HTTP 200。第二次 Build 实际通过原
  Next font loader 下载字体并完成构建，进一步证明该上下文的 DNS/TLS/Google Fonts 路径可用。
  不将其中一个 DNS 地址当作固定源站地址，不修改 DNS/hosts 或降低 TLS 校验。
- 初始 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY、字体 mocked-response 和额外 CA 变量均未设置。
  未设置代理、TLS 绕过、mock 响应、伪造字体或开发模式 fallback。
- 第二次 Build 的子进程只继承 OS/路径/临时目录相关变量；不继承 Supabase、Bitrefill、
  数据库、支付或其他应用凭证。工作树仅有 env example 文件，没有实际 env 文件。
  子进程设置 NEXT_TELEMETRY_DISABLED=1 和本地网络守卫 NODE_OPTIONS，均未持久化。
- 守卫预加载到构建及其 Node 子进程：只允许 fonts.googleapis.com/fonts.gstatic.com 的
  正常 HTTPS；拒绝其他 HTTP(S)、普通 TCP 和未授权 TLS，保留本地命名管道 IPC。
  已先验证 HTTPS、HTTP、本地 TCP、fetch 四种拒绝路径；不是给整个应用开放网络。
  守卫未请求 Production/Test/供应商，也未让原 GET-only transport 具备采购能力。
- 守卫是 Git 外的本地构建诊断文件：
  `D:/Jianlian/_bitrefill_v13_local_pg/rc1-r2-build-network-guard.cjs`，SHA256
  `63b1b2c0519b59c21955b282ba31e00a390ebc707ca711b7e8e2aab4a6d6d592`。
  对应外部日志保留了隔离说明、原始编译输出及完整路由汇总。

初始 .next/cache 只有 swc/webpack 目录，未发现可用的 Inter 文件；Next 的字体 fetch cache
是进程内 Map，不能把旧失败构建的 cache 目录存在当作字体证据。成功构建后由原 loader
生成七个真实 woff2 artifact，未手工创建或替换字体文件。这些是忽略的构建产物，不提交。

第二次 Build 没有 TypeScript/Next/Webpack 致命错误。仍有原有非致命警告：ws 可选
bufferutil/utf-8-validate 缺失、Supabase dynamic dependency、若干页面 client rendering
deopt。PR77 既有构建说明也记录这些类别；本轮不安装可选依赖、不改 UI 来消除警告。

结论：BUILD_PASS=yes；已验证的隔离构建没有外部字体阻塞。原沙箱网络限制仍存在，
不能承诺不带获准网络上下文的后续普通构建会自动通过。

## 3. 六项历史失败：逐项分类、根因与修复

六项均属于 `tests/unit/migration-runner.test.mjs` / `scripts/db/run-migration.ps1`。
进入 R2 时两文件与当前远端 main 的内容相同（仅比较时规范化 LF/CRLF），RC1 业务未修改它们。
R2 首次定向复测真实得到 0/6；不是直接复用旧日志。

### 最早可见证据的范围

- 较早的汇总证据：[PR77](https://github.com/GingLuyg1/Jianlian-shop/pull/77)，2026-10-10，
  明确记载原始基线七项失败中的 Windows migration-runner 六项；该说明没有逐项原始输出。
- 本轮检查到的最早逐名称原始日志：
  `D:/Jianlian/_bitrefill_v13_local_pg/db9-full-suite.log`，本地修改时间 2026-10-16 16:09:01，
  第1154–1159行包含全部六个名称，整体1455/1448/7。文件时间不是测试首次出现时间。
- 之后 db9-full-suite-final.log、rc1-full-suite-final2.log、rc1-r1-full-suite.log 继续记录同一六项；
  R1 为1501/1495/6。测试文件 Git 历史可追溯到7月23日，但代码存在不等于当时已经失败。
- 下表 E1 指上述逐项原始日志，E2 指 R2 的 rc1-r2-migration-runner-before.log。
  不声称发现了全仓库历史中“第一次失败”的日期。

下表位置为进入 R2 时的文件/断言行，不复用 R1 报告误标的第一项声明行。

| 编号、原测试名称 | 原断言与实际失败 | 最早逐项证据 | 相关性、风险分类及本轮结果 |
| --- | --- | --- | --- |
| MR1 `migration runner validates immutable inputs and exact environment refs`（:54） | :63，合法 ValidateOnly 预期 exit0，实际1/MIGRATION_RUNNER_FAILED | E1、E2 | 运维入口的 SHA/环境保护；无支付/采购/交付运行时调用。原来在 SHA 命令前失败关闭；修复后合法输入通过、错项目/冲突模式/事务边界仍拒绝 |
| MR2 `migration runner only accepts exact official direct and pooler targets`（:92） | :107，合法目标预期0，实际1 | E1、E2 | 迁移目标/权限安全，不能仅以历史问题忽略。修复后精确官方目标通过，恶意主机、项目用户名、端口、数据库名、fragment/query 等全部原断言仍拒绝；仅 fake psql |
| MR3 `migration runner dry-run only checks identity and execute alone uses --file`（:131） | :149，dry-run 预期0，实际1 | E1、E2 | 运维写操作边界，不是应用支付 API。修复后真实检查 fake psql 参数，dry-run 无 --file，只有显式 Execute 有 --file；没有实际迁移 |
| MR4 `migration runner clears inherited libpq overrides and applies safe connection settings`（:163） | :182，预期0，实际1 | E1、E2 | 运维连接隔离/SSL，有安全意义。修复后验证 PGHOSTADDR/PGSERVICE/PGSERVICEFILE 被清除，SSL require、15秒超时及 appname 保留，父环境不变 |
| MR5 `production execution requires the exact confirmation text`（:198） | :217，期望 PRODUCTION_CONFIRMATION_TEXT_INVALID，实际通用 MIGRATION_RUNNER_FAILED | E1、E2 | 高权限运维授权边界。修复后缺确认文本仍拒绝，精确文本只执行合成 SQL + fake psql；没有 Production 访问 |
| MR6 `migration runner preserves psql failure status and never prints credentials`（:227） | :242，fake psql 预期 exit7，实际1 | E1、E2 | 运维错误传播/凭证脱敏，有安全意义。修复后保持 exit7，原有密码和 URI 不得出现在 stdout/stderr 的断言通过；仅合成凭证 |

### 独立根因证据

只对受控合成 SQL 做内存诊断（不修改 runner、也不传任何 DB URL）：底层异常是
`System.Management.Automation.CommandNotFoundException`，runner 第142行 Get-FileHash 不可用。
Node spawn 的 Windows PowerShell 5.1 继承了父 PowerShell Core 的 PSModulePath。
对照实验保持 runner/SQL/命令完全相同：

| 子进程环境 | Get-FileHash | 原六项测试 |
| --- | --- | --- |
| 继承父 PSModulePath | 不可用 | 0/6 |
| 只移除继承的 PSModulePath，由 Windows PowerShell 初始化自己的标准模块路径 | 可用 | 6/6 |

这是测试子进程的模块发现问题，不是已证明的支付重复扣款、应用权限越权或卡密泄露。
不过它遮蔽了迁移安全测试覆盖，原状态不应作为真实迁移执行的豁免。原 runner 在异常时
确实在任何 psql 调用前失败关闭，不是跳过 SHA/确认文本后继续写数据库。

### 最小修复与最终状态

提交 b159180…仅在测试 harness 为 Windows 子进程克隆环境、删除大小写不敏感的
PSModulePath；非 Windows 原样保留、父环境不变，其他 libpq/URL 测试输入仍保留。
不修改 runner、不自动 Import 未信任模块、不更改执行权限/目标检查/错误脱敏。

- 所有原六项断言不变；新增一项跨平台环境隔离单测。
- 原 ValidateOnly 测试额外注入不可用的父模块路径，再验证 Windows 子进程仍能完成真实 SHA 验证。
- 完整套件最终1502/1502，0 fail/skip/cancel，新增失败0；增加的1项是回归，不是删掉六项。
- Closed baseline register：MR1–MR6 全部 RESOLVED；本轮不需要 Known Baseline Exception。
  历史失败清单保留供审计，但不能将其用作其他环境失败或 Production 迁移的永久豁免。
- 没有发现这六项对应的运行时资金/卡密漏洞；结论仅限本次根因与复测，不是全站安全保证。
  将来操作员运行 migration runner 仍须先核实其 PowerShell/模块环境和精确目标、SHA、授权。

## 4. Git 依赖、交叉文件与 PR 顺序

本轮 GitHub 只读核对：远端 main 仍为4575d802d653e4dca726427bce826aa68c93d9e2。
本地 main 是旧48a7a3aad0ee7412a772eff79dde10701474fd0c，不能混用。
[PR78](https://github.com/GingLuyg1/Jianlian-shop/pull/78) 仍open/unmerged，四提交、31文件，
tip7f9a25b1bfe1fadf553179074f8f4c8869568ed4；接口 merge_commit_sha 不是已合并证据。

| 层次 | 权威提交 / 关系 |
| --- | --- |
| Provider / PR78 | ad35a77 → 7f1c084 → f642eb0 → 7f9a25b1bfe1fadf553179074f8f4c8869568ed4 |
| V1.2A | 159f49b8b740dd3c33f58ecfeb63f2f0b185f28b，直接继承 PR78 的修正 |
| V1.3至DB7B | ed8a9c492d755461e09441b324f3e317f4c64321，继承 V1.2A |
| DB9 | 7442df060846413fc618048851c83b8c93206810 → d31d445d81ef598450c6fd525d0a8f129787fca5 → 6c53783ccffc5137b523e4f62a0a81b2a2c6489a |
| P1 | 761947367f66ddfc5c8493219fe614d684ed775a，基于 DB7B |
| P2 | da8eb3c7da382534778cb2c570129dea2ab2002d，继承 P1 |
| P3 | fcc2d7c73118120e8952f95dad0d1b9b2d553b19，继承 P2 |
| RC1 | 51ee850…，两父为 DB9 的6c53783…和 P3 的fcc2d7c…；共同祖先 DB7B |
| 审查与 R2 | 51ee850… → 2116662… → b159180… → 本报告提交 |

所有层次 tip 都通过 is-ancestor 到 R2 HEAD 的检查。进入 R2 时33个非merge提交（包含R1
报告）的 stable patch-id 均唯一；一次诊断因默认输出 buffer 不足中止，扩大内存 buffer 后
完整重算成功，未把中途结果当通过。RC1 的 lib 与 P3 一致，迁移/fixture 与 DB9 一致。

PR78 的31路径全部在 RC1 中，9个后续修改路径仍为 R1 报告列出的 parser/provider/router/
测试/文档修正。它们是同一祖先链的演进，不是需要再次导入的独立实现。
R2 新增的通用 migration-runner 测试修复不在 PR78 文件清单中。
没有未解决 index conflict，未做 merge/rebase/cherry-pick 或自动冲突选择。

PR76/77仍Draft/open、HEAD分别22c69619…和24472cb7…；文件清单与包含 R2 测试修复的
候选集合交集0。还重新只读检查 R1 列出的12个 UI 工作区的已提交、未提交和untracked
路径，交集均0（rc1-r2-ui-overlap*.log）。保留它们的 dirty 状态，没有修改 UI 工作区。
这仅是本次文件级快照，不保证未来无语义冲突；PR76/77彼此已有部分重叠，不应盲目同时合并。

### 建议审查/合并顺序（未创建 PR 或暂存远端分支）

1. PR78：原始 Provider 四提交，独立审查31路径。
2. PR-A：V1.2A /159f49b…的净修正，基于已整合 PR78 的新 main。
3. PR-B：V1.3 + DB7B fixture/evidence + DB9 三提交，取 V1.2A→6c53783…最终净差异。
   tip 必须只有同一路径的最终 SHA90f165ae…迁移；不得把历史旧候选依次安装。
4. PR-C：P1/P2/P3连续继承链 + RC1 解决结果 + 两轮审查文档；依赖 PR-B 六 RPC 合同。
   不独立重复 cherry-pick P1/P2/P3 共同祖先。
5. R2 测试修复 b159180…没有供应商业务依赖，可单独作为小型 test-only PR-T 先审查，
   或随 PR-C 带入；两者择一，不重复应用。报告随最终 RC1 审查包。

中间 PR tip 尚未实际重建、构建和全测；当前 PASS 针对最终 RC1业务树+R2测试修复。
将来每个 PR 的 CI 环境都需正确初始化 PowerShell 模块，并各自验收。PR78 若 squash，
新 main 不一定包含原 SHA；必须重新计算祖先/净差异，不能机械重复 cherry-pick。
本轮的 OVERLAP_RESOLVED 指去重策略可审计，不代表已修改/合并 PR78。

## 5. 本轮完整离线验收与安全边界

全部本地日志在 `D:/Jianlian/_bitrefill_v13_local_pg/`，以下均为 R2 新执行结果。

| Gate | 真实结果 | 外部日志 |
| --- | --- | --- |
| DB9真实角色、五表写拒绝、六RPC、独立session与失败原子性 | PASS / 最终 launcher exit0 | rc1-r2-postgres-acceptance.log |
| P1/P2/P3/RC1付款到私密交付完整闭环 | PASS，同一合成订单连续路径 | 同上 |
| P1/P2/P3/RC1及迁移关键单测 | 54/54 PASS | rc1-r2-focused.log |
| Daju与共用供应商契约 | 56/56 PASS | rc1-r2-daju.log |
| Local Inventory/Payment Failed Guard/余额/激活隔离 | 83/83 PASS | rc1-r2-isolation.log |
| 最终Typecheck | PASS / exit0 | rc1-r2-typecheck-final.log |
| 定向ESLint含新增测试 | PASS / exit0 | rc1-r2-lint.log、rc1-r2-lint-final.log |
| Full Suite（最终修复后再次执行） | 1502 total /1502 pass /0 fail，exit0 | rc1-r2-full-suite-final.log |
| 原样隔离Build | PASS / exit0 | rc1-r2-build-isolated.log |
| 原正常Build失败证据 | Inter EACCES / exit1 | rc1-r2-build-normal.log |
| 六项失败与模块路径 A/B | 继承路径失败；移除后原6/6 | rc1-r2-migration-runner-before.log、rc1-r2-module-path-ab.log |
| 一次性PG清理与身份复核 | 随机库0、其他client0，正常停止专用实例 | rc1-r2-postgres-cleanup.log |

PostgreSQL17.11固定127.0.0.1:55433、核对专用 data_directory；只使用本地密码文件给子进程，
未输出值。launcher清除继承的数据库/供应商变量，并在 finally 删除自身创建的随机数据库。
60秒稳定性窗口6 cycles，max sampled sessions1、max RSS102031360 bytes；不宣称30分钟认证。

重新验证：重复付款2/10/100、两个真实 PG session 争抢、十次客户余额付款RPC只有一次扣款、
未知提交不重发、已知 invoice GET 恢复、21/21合成子订单、complete但部分child未交付、
Webhook/Poll竞态、私密事务回滚/提交丢ACK/重启、100合成订单混合批次及性能数据集。
两次全新库重放均通过，冻结manifest未改。原始观察指纹5d5eae30…与冻结e036759c…仍
分别保留；只接受已独立重建证明的既有 outcome 函数正文LF/CRLF MD5差异，不改hash算法，
不把它描述成新的Production parity。细节仍见 R1/RC1 frozen-evidence 说明。

| 安全项 | 静态审查 + 本地真实PG/Fake证据 |
| --- | --- |
| 真实POST默认关闭 | prelaunch-policy 常量false；constructor opt-in与false相与；缺变量/有凭证均不能开启；默认registry仍Daju-only |
| 成本/数量/利润 | 无可信成本、币种不符无FX、成本超限、利润越界、错quantity/过期证据均阻断；合成quote不是实际成本，面值不当采购成本 |
| Child身份 | 首期quantity1/item→1invoice→明确sole child；匹配ID/产品/面额和已有可选证据；未知/多个/错误child停止，不能按数组位置猜测 |
| 事务与最小权限 | 五张新表应用访问仅select；变更走六个RPC；实际service_role的I/U/D等直接写尝试拒绝，浏览器/PUBLIC无内部EXECUTE；RLS本身不能替代GRANT控制 |
| UNCERTAIN与扣款 | durable submit boundary、CAS/唯一键；SUBMITTING/UNCERTAIN不盲目POST；已知外部ID只GET恢复；客户余额十次通知仅一次扣款，与供应商余额隔离 |
| 私密交付 | DB5既有private outcome与child绑定同事务；所有者RPC查询测试；非本人/匿名不能取卡密；两个worker仅交付一次，不能用invoice complete替代delivered child |
| 脱敏/Webhook | Webhook仅唤醒，不直接交付；14张非私密表及普通日志的合成secret标记命中0；普通采购表无卡密列/载荷 |
| 其他模块 | Daju/Local Inventory/Payment Failed Guard通过；相对main无Daju实现、支付/充值核心、Apple页面或依赖文件修改；本轮仅测试+报告 |

只有合成报价/资金/Child测试数据。真正成本凭据、真实Child字段语义、商业权限、供应商资金
限额及生产接线仍需独立完成；有一个 source 标签不等于已经获得可信live报价。
客户所有者交付API仍使用getUser/账户限制/get_order_delivery_for_user、no-store/no-cache/nosniff。
P2/P3 UI合同已复读；付款成功与处理中/部分/全交付分离，前端不能获得供应商key或直接采购。
没有真实登录浏览器或Production运行时验收。

## 6. DB10历史结果与未来Production顺序

本轮仅读取既有本地 DB10 报告：
`D:/Jianlian/_bitrefill-db10-readonly-evidence-20261016/report.md`。
其2026-10-16历史只读观察为：同SHA候选、36条相关default ACL、既有postgres executor可用、
13函数/33约束/21索引/7trigger相关合同未漂移、目标历史版本及冲突0、五项允许聚合检查0。
新五表/RPC当时不存在；权限是迁移后预测，不是已安装后的Production实测。

因此沿用 V13_DB_GATE_COMPLETE=yes（迁移前技术Gate），但
POST_MIGRATION_PRODUCTION_ACL_VERIFIED=no、V13_FULL_RELEASE_ACCEPTANCE=no。
本轮没有刷新任何Production状态，不能把历史快照当作未来不变事实。

| 阶段 | 必须单独完成/授权 |
| --- | --- |
| Git | 人工审查、每个实际tip CI/Build/测试、去重及合并授权；当前未Push/未建PR/未合并 |
| 迁移审核 | 精确最终SHA、备份/故障预案、现有postgres操作者、届时history/冲突/脏数据/owner/default ACL再核对；独立迁移授权 |
| 安装 | 仅最终V1.3单文件、完整事务；不重跑历史已手工部署SQL，不db push/reset/repair |
| 安装后ACL | 独立只读授权后核对五表RLS/无policy/owner、有效表和列ACL含MAINTAIN、所有USAGE/SET继承路径、六RPC精确overload/path/EXECUTE及三个guard、索引约束/版本；与artifact SHA执行回执关联 |
| 核验脚本 | `docs/integrations/sql/bitrefill-rc1-postmigration-readonly.sql`，本地64项及10个回滚反例已重跑；不等于Production执行或真实RPC写入E2E |
| 服务端部署 | ACL通过后仍需独立部署授权；真实采购常量保持false，验证关闭状态运行/Daju/库存/用户权限和日志 |
| 真实资金与关联 | 核实成本源、币种/费用/有效期、资金限额与利润，验证实际Child身份字段；缺任一证据禁止自动采购/交付 |
| 小额真实交易 | 商用权限、商品/金额/数量/操作人/监控明确，单独授权invoice/余额扣款/付款及真实私密卡密处理 |
| 灰度 | 小额验证后另行审查allowlist/worker/对账和人工监控，再授权启用；未验证Apple SKU及真实批量继续关闭 |

service_role仍是可信后端身份，不可交给浏览器。DBA保留正常管理权限；“应用RPC-only”不
意味着管理员无法写表。Supabase技能用于区分有效ACL、BYPASSRLS与owner/继承路径，未以
放宽权限解决问题。参考[官方RLS说明](https://supabase.com/docs/guides/database/postgres/row-level-security)
和[函数执行权撤销说明](https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A)。
公共changelog markdown读取被工具content-type拒绝，使用官方search_docs核对上述安全合同；
本轮无Supabase特性/SQL实现变更。

## 7. 回滚、止损与最后Gate

- 本轮未启用任何采购。将来异常先关闭新采购/worker，回到已审查的关闭状态artifact；
  不靠删除attempt、清除唯一键、重置UNCERTAIN或再次向客户扣款来“恢复”。
- 迁移COMMIT前任何异常整体回滚；COMMIT后保留采购/外部ID/私密交付证据，单独审查前向修复。
  不使用DROP新表或回滚历史SQL作为运行后恢复方案。
- 已知invoice仅做单独授权的有限GET对账；建议1/2/5/10/30分钟、最多5次并尊重配额，之后人工。
  未知已提交结果停留UNCERTAIN人工核对，不盲目重发POST。不创建定时任务。
- 交付提交后ACK丢失复用durable绑定/唯一约束；Webhook仍仅唤醒。关闭开关不撤销供应商扣款，
  也不授权自动退款、替代采购或新售后承诺。

PR_REVIEW_PACKAGE_READY=yes：本地证据、Git顺序、安全Gate与完整Build/测试可交给人工代码审查。
六项历史失败已真实修复，无须带失败豁免进入审查。报告完成不等于已创建PR或授权Push。

PR_MERGE_READY=no：尚无实际拆分tip的CI/Build/测试、人工批准和合并授权；
不能凭本地最终树PASS直接宣布远端中间PR可合并。Production和真实采购有额外独立Gate。

BASELINE_FAILURE_COUNT=6 historical / 0 remaining
BASELINE_FAILURES_CLASSIFIED=yes
BASELINE_EXCEPTION_ELIGIBLE=not_required_all_six_resolved
NEW_FAILURES=0
BUILD_PASS=yes
REAL_PURCHASE_ENABLED=no
READY_FOR_PRODUCTION_DEPLOYMENT=no
PRODUCTION_READ_EXECUTED=no
PRODUCTION_CHANGED=no
PRODUCTION_MIGRATION_EXECUTED=no
BITREFILL_REAL_PURCHASE_EXECUTED=no
PR78_CHANGED=no
REMOTE_PUSHED=no
PR_CREATED=no
PR_MERGED=no
V14_CREATED=no

STOP：等待用户审查和下一阶段明确授权，不自动进入PR、Production、部署或真实交易。
