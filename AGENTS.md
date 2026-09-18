# Jianlian Shop 仓库协作规则

本文件适用于整个仓库。目标是让开发、审计和上线工作可重复、可验证，并优先保护订单、支付、余额和生产数据安全。

## 技术栈

- Next.js 13 App Router、React 18、TypeScript、Tailwind CSS。
- Supabase 提供 PostgreSQL、Auth、RLS 和服务端数据访问能力。
- 支付系统使用统一支付方式、支付渠道、Provider、`payment_sessions`、callback、reconciliation 和 canonical completion 架构。
- 自动化测试以 Node 测试为主，浏览器流程使用 Playwright；发布与就绪检查位于 `scripts/`。

## 开发规范

- 修改前必须执行 `git status --short --branch`，确认分支、HEAD 和已有修改。
- 先阅读相关实现、测试、Migration 和文档，不重复开发已有能力。
- 保留并绕开无关改动；不得擅自删除、覆盖、回滚或批量格式化用户修改。
- 优先做范围清晰、向后兼容的最小改动。支付、订单和权限代码不得借机大规模重构。
- TypeScript 保持严格类型边界；不得用 `any`、不安全断言或静默容错掩盖资金错误。
- 金额遵循项目既有精确 decimal/numeric 约定。公共 API 使用规范十进制字符串，服务端做最终校验；不得依赖 JavaScript 浮点数决定资金结果。
- 客户端只负责交互和提前提示；权限、金额、状态、库存和支付资格必须由服务端验证。
- 服务端模块、Service Role、Provider credential 和签名逻辑不得进入浏览器 bundle。
- 错误信息应可诊断，但不得泄露密钥、签名原文、完整敏感请求、Cookie、Token 或个人数据。
- 未经明确授权，不自动 commit、push、部署、执行 Migration 或操作 Production。

## 目录结构

- `app/`：App Router 页面、布局和 Route Handlers；`app/api/` 的认证、授权和输入校验必须在服务端完成。
- `components/`、`hooks/`：React UI、交互状态和共享前端逻辑。
- `lib/`：订单、支付、Supabase、权限、配置和共享领域逻辑。
- `lib/payments/`：支付方式、渠道、Session、callback、reconciliation 和 completion。
- `lib/payments/providers/`：各 Provider 的协议、签名、创建支付和查询实现。
- `supabase/migrations/`：PostgreSQL/Supabase forward-only Migration。
- `scripts/`：发布、运维、就绪检查、recovery/watcher 等受控脚本。
- `tests/`：单元、集成、source-contract、回归和 Playwright E2E 测试。
- `docs/`：长期有效的架构、运维、验证和交接文档。
- `public/`：公开静态资源；credential 和私有配置禁止进入此目录。

## 数据库与 Supabase

- 数据库是订单、支付状态、余额和 ledger 的最终事实来源。资金状态转换必须在事务或受控 RPC 中原子完成。
- 余额变化必须有对应 ledger，completion 必须幂等；不得用应用层“先查再写”替代数据库约束、行锁或原子函数。
- 金额使用精确数值类型；时间使用带时区字段，并区分创建、付款、完成、过期和链上时间语义。
- Provider 已付款但本地不能自动完成时，保留 callback/query/reconciliation 证据并进入人工复核。
- 禁止直接修改余额、伪造 paid、手工插入资金 ledger 或绕过 canonical completion。
- 浏览器只使用受 RLS 保护的公开客户端；Service Role 仅限可信服务端代码和受控脚本。
- 用户 API 必须先认证，再用 `userId` 与业务编号限定所有权。Service Role 不能替代所有权检查。
- 管理员 API 必须使用项目既有的服务端管理员授权机制，不能依赖页面隐藏或客户端角色。
- RLS、函数 ACL、`SECURITY DEFINER` 和固定 `search_path` 属于安全边界；修改函数时必须逐项核对。
- 操作 Supabase 前核对项目名称和 Project ref。数据库状态只来自只读审计或可信执行记录，无法确认时标注“待确认”。
- 禁止对 Production 使用 `db reset`；不得因仓库有 Migration 文件就推断远程已执行。

## Migration 规则

- Migration 使用带时间戳的新文件并保持 forward-only；进入共享历史或已在任一环境执行的 Migration 不得改写。
- 尽量事务化，并按风险设置 `lock_timeout`、`statement_timeout` 和 fail-closed preflight。
- 保持现有数据和旧应用兼容；函数替换不得无意改变 signature、ACL、`SECURITY DEFINER` 或 `search_path`。
- 唯一索引、约束和数据转换必须先检测冲突；不得静默删除、合并或修复历史记录。
- Schema 变更与历史数据修复分离。除非任务明确要求并独立审计，不得顺带 backfill。
- SQL Editor 手工执行不代表 Migration History 已记录；不得未经审计使用 `migration repair` 或重复运行脚本。
- 默认只生成和审计 Migration。Production 执行必须获得针对具体文件和项目的授权，并做执行前后只读验证。
- Migration、测试和文档不得包含真实 credential。

## 支付模块规则

- 保持统一支付架构，不为单一渠道复制订单、充值或入账系统。
- `balance`、USDT/BEP20 和法币 Provider 各自遵守既有安全约束；修改一种方式不得改变其他方式。
- `payment_channels` 表示当前渠道配置；`payment_sessions` 保存一次支付的金额、固定 Provider 和持久化 `expires_at`。
- 新支付使用创建时选定的 Provider；callback、query、recovery 和 reconciliation 必须使用 session 固定的 Provider，不能随渠道配置漂移。
- disabled 阻止新支付，但已有 session 的读取和合法 callback 不应仅因渠道后来关闭而失败。
- 过期以数据库已持久化的 `expires_at` 为准，读取旧 session 时不得重新计算或延长。
- Provider 在本地有效期后才确认付款时不得自动 credit 或履约；必须保存证据并人工复核。
- 本金、本站手续费和 Provider 侧费用必须分开；UI 文案不得改变发送给 Provider 或入账的本金。
- 商城付款复用 canonical `completePayment`/数据库 completion；充值复用 canonical recharge completion，保证余额与 ledger 原子且 exactly-once。
- `return_url` 只用于返回和状态展示，不是支付成功依据，也不得触发自动跳转循环。
- QR payload、二维码图片 URL、普通跳转 URL和 deep link 必须区分；Provider QR payload 不得直接作为 `<img src>` 或普通重定向地址。
- Recovery/watcher 默认 fail closed。Provider、渠道、币种、金额、交易号、有效期和本地未入账必须全部匹配，才能调用 canonical completion。

## Provider 与 Callback

- Provider 在 `lib/payments/providers/` 独立封装；页面和订单 Route Handler 不得包含协议签名细节。
- Credential 只能从服务端环境或既有安全配置读取，不得进入前端、`public_config`、URL 日志、错误详情或 APM。
- 外部请求设置 timeout，限制响应字段长度，并安全处理网络失败、非 JSON、错误状态和缺失字段。
- 签名只在服务端生成和验证；测试覆盖字段集合、排序、规范化、正确验签和错误签名拒绝。
- Callback endpoint 可公网访问且不依赖登录、Cookie 或浏览器 session，但必须严格验签。
- Callback 先识别已有 session，再验证固定 Provider、渠道、币种、金额和商户身份；未知 session 或证据不一致必须拒绝。
- Callback、重复 callback、query recovery 和 watcher 汇入同一原子幂等 completion 路径。
- Callback log 与 reconciliation 保留脱敏证据；日志不得记录 secret、完整签名查询或完整敏感 Provider payload。
- Provider query 默认只读取证据；只有经过明确设计、审计和授权的 recovery/watcher 才能改变状态。
- 退款、强制入账和强制 paid 不得顺带实现，必须作为独立需求完成协议、权限、审计和测试。

## 后台管理规则

- 后台页面和 API 必须同时做服务端管理员鉴权。
- 列表、筛选、分页和导出应限制范围，避免暴露 credential、完整 Provider payload 或不必要的用户数据。
- 渠道 enabled、configured、Provider 切换和运维动作应分离；Migration 不得顺带开启渠道。
- 高风险操作必须有明确确认、最小权限和审计，不提供绕过 canonical completion 的资金快捷入口。
- 客服入口复用站点统一能力，不在业务组件复制联系方式配置。
- 后台 UI 修改不得改变资金语义；新增资金动作前必须先设计服务端权限、幂等和审计。

## 测试要求

- 按范围先运行 targeted tests，再运行类型检查和必要的完整回归。支付、订单生命周期、权限和数据库函数变更必须有自动化测试。

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check:bep20-test-readiness
npm run check:order-expiration-readiness
git diff --check
```

- 只运行 `package.json` 实际存在的脚本；平台或外部依赖失败时，区分新增失败与已知环境失败。
- Provider 测试覆盖签名、金额/渠道不一致、超时、错误响应、脱敏和 Provider pinning。
- Completion 测试覆盖正常完成、重复 callback、callback/recovery 竞争、双 recovery、过期付款、ledger 和余额 exactly-once。
- UI/source-contract 测试覆盖 artifact 语义、redirect 条件、QR 本地渲染、return 页面无循环和 TxHash 渠道边界。
- 资金并发安全不能只靠 mock；结构性变更应在隔离 PostgreSQL/Supabase-compatible 环境验证真实并发。
- 测试、build 或 readiness 通过只证明对应范围，不代表数据库已迁移、Production 已部署或渠道已开放。

## Production 操作禁令

- 默认禁止部署、重启、切换 release、修改环境变量、执行 SQL/Migration、启用渠道、真实支付、callback replay、recovery execute、补单、退款和手工资金修改。
- 只有用户针对明确目标、范围和回滚边界作出当前授权后才能执行；一次授权不得扩展到其他 session、渠道、Migration 或 release。
- 写操作前先做只读基线，核对 release、数据库项目、渠道状态、资金计数和回滚目标。
- 使用仓库既有 immutable release/rollback 流程，不现场发明部署方式；build、smoke 或 readiness 失败不得切换。
- Production secret 不得出现在对话、终端日志或命令历史；环境检查只报告 present/missing。
- 不得删除来源不明的目录、release、日志或数据。清理前必须审计精确路径、进程引用、worktree 和回滚价值，并取得授权。
- Production 变更后必须只读复核，明确报告已执行、未执行、异常和回滚状态。
