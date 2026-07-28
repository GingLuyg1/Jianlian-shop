# Jianlian Shop 仓库协作规则

## BEP20 Phase 1 权限加固基线（2026-07-29）

- PR #14 已合并：原始提交为 `53b2b87333fd16c74c4e67fbfcd6c4f3a971ddf7`，merge commit 为 `0a76d1051057d2bac6524a9eb5018f226f198ad8`。
- `supabase/migrations/20260728230700_bep20_phase1_privilege_hardening.sql` 已由用户在测试项目 Jianlian-shop-test / `czuoivbfxzachiobdohw` 和正式项目 Jianlian-shop / `qvbovrvybirscaurwuov` 通过 SQL Editor 手动执行；两个环境均返回 `Success. No rows returned`，最终只读 postcheck 均通过。
- 本次权限加固未修改订单、余额、支付状态或链上交易业务数据，未部署，也未开启自动结算。
- 不应重复执行该 Migration。SQL Editor 手动执行不会写入 Supabase Migration History；禁止对已手动执行的 Migration 使用 `supabase db push`、`migration up`、`migration repair` 或 `db reset --linked`。
- 下一任务仅对后续 BEP20 自动结算相关 Migration 做只读代码和数据库依赖审计，暂不执行。

## BEP20 欠额确认状态 Hotfix（2026-07-23）

- `confirmed_at` 表示服务端在达到要求确认数后完成链上核验的首次时间；链上实际发生时间继续只使用 `chain_transactions.block_timestamp`。
- 金额分类必须晚于区块时间、支付截止时间和确认数检查；未达到确认数时不得提前进入 `underpaid` 或 `overpaid`。
- 历史补录只能由独立 Migration 对证据唯一、金额和归属精确匹配、确认数达标且未迟到账的记录补写 `confirmed_at`，不得顺带结算、入账、释放库存或改变订单/支付状态。

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
