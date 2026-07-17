# Jianlian Shop 仓库协作规则

## 项目结构与技术栈

- `app/`：Next.js 13 App Router 页面与 Route Handlers。
- `components/`、`hooks/`：React 18 UI 与交互逻辑。
- `lib/`：订单、支付、Supabase、权限及其他服务端/共享逻辑。
- `supabase/migrations/`：PostgreSQL / Supabase Migration；文件存在不代表任何环境已经执行。
- `scripts/`：发布前与功能就绪检查脚本。
- `tests/`：Node 单元/回归测试与 Playwright E2E 测试。
- `docs/`：架构、验证、运维和项目交接文档。
- 主要技术：TypeScript、Next.js 13、React 18、Supabase/PostgreSQL、Tailwind CSS、Playwright。

## 常用只读检查与测试命令

```powershell
git status --short --branch
git log --oneline -15
npm run typecheck
npm run build
npm run test:e2e
npm run check:bep20-test-readiness
npm run check:order-expiration-readiness
```

- 修改任何文件前，必须先执行 `git status --short --branch`，确认分支、基线和已有未提交修改。
- 按改动范围选择检查；涉及关键支付或订单生命周期时，除类型检查外还应执行对应就绪检查和相关测试。
- 就绪脚本的通过只证明其检查范围，不等于数据库已迁移、调度已创建或生产环境已上线。

## 安全与操作边界

- 先检查现有实现、Migration、测试和文档，不重复开发已经完成的功能。
- 不自动执行 SQL 或 Migration；不得根据文件存在推断数据库已执行。
- 不自动部署，不自动 `commit` 或 `push`。
- 不创建、删除或修改环境变量及环境变量文件。
- 不执行真实支付，不提交真实 TxHash，不触发真实订单过期任务。
- 对正式数据库进行任何操作前，必须再次确认项目名和 Project ref；写操作还必须取得用户明确授权。
- 输出、日志和文档中不得暴露密钥、令牌、完整收款地址或环境变量值；必要时仅显示脱敏摘要。
- 数据库状态必须来自目标项目的只读审计或可信执行记录；无法核实时明确标注“待确认”。
