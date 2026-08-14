# Jianlian Shop 人工生产部署流程

本文件是自建服务器 Production 应用发布的唯一权威 Runbook。它不授权 SQL、Migration、Nginx 修改、业务写操作或无人值守部署；服务器命令必须在单独的部署授权下由人工执行。

> 2026-08-12 起，本文后半部分保留的“原地 pull/build/restart”历史说明全部废止。禁止在持久仓库原地安装、构建或重启。实际操作只使用本节的 full-SHA worktree 流程。

## 固定发布结构

- 持久仓库：`/www/jianlian-shop`
- Releases：`/www/releases/jianlian-shop-<full_sha>`
- PM2 process：`jianlian-shop`
- Production port：`3001`
- 隔离 smoke port：`3002`
- 发布脚本：`/www/jianlian-shop/scripts/production-release.sh`
- PM2 配置：持久仓库 `/www/jianlian-shop/ecosystem.production.config.cjs`，通过受校验的 `JIANLIAN_RELEASE_DIR` 指向不可变 release

脚本不执行 SQL/Migration，不修改 Nginx，不运行 `npm audit fix` 或 `npm audit fix --force`。

## Production 环境 source of truth

`/www/jianlian-shop/.env.local` 是唯一长期 Production env source of truth。每个 release 获得权限为 `600` 的完整副本 `.env.production.local`，release 副本禁止反向覆盖持久源。

如果持久源首次缺失，脚本只允许从当前 PM2 cwd 的 `.env.production.local` 引导一次；之后只维护持久源。持久源已存在时，脚本会核对强制变量与当前 Production release，发现漂移立即阻断。脚本只打印 `PRESENT/MISSING/MATCH/DRIFT`，不打印变量值，也不通过 `source` 或 `eval` 解析 env。

强制存在：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `DAJU_API_BASE_URL`
- `DAJU_API_KEY`

脚本还检查并完整继承现有 Supabase 兼容变量、BEP20、任务 Secret、邮件、监控和 release metadata 变量。不得用只含上述五项的新文件覆盖持久源。

## 权威发布命令

先在持久仓库取得已授权目标 commit，并指定一个已存在的完整 rollback release：

```bash
cd /www/jianlian-shop
git fetch origin main
bash scripts/production-release.sh preflight <FULL_SHA> /www/releases/jianlian-shop-<ROLLBACK_FULL_SHA>
```

Preflight 检查 commit 存在、当前 PM2 cwd、目标 release 不存在、rollback 是不同于当前版本的完整可运行 release、`/www` 空间、inode 和 env。默认至少需要 3 GiB 和 150,000 inode，为约 1.1 GiB release 的安装与构建峰值留出余量；不足时禁止继续 `npm ci/build`。

仅当空间不足时先列出清理候选（第一次调用必定只列出并停止），人工核对后才确认：

```bash
bash scripts/production-release.sh cleanup <FULL_SHA> /www/releases/jianlian-shop-<ROLLBACK_FULL_SHA>
bash scripts/production-release.sh cleanup <FULL_SHA> /www/releases/jianlian-shop-<ROLLBACK_FULL_SHA> --confirm
```

清理始终保护当前 Production、目标 release、指定 rollback。只接受 full-SHA 精确目录，并使用 `git worktree remove --force <exact-path>` 与 `git worktree prune`；未注册 worktree 会阻断。禁止 `rm -rf /www/releases/*`。

创建、安装、构建和 3002 smoke：

```bash
bash scripts/production-release.sh prepare <FULL_SHA> /www/releases/jianlian-shop-<ROLLBACK_FULL_SHA>
```

顺序固定为：`git worktree add --detach`、完整 env 安全复制、`npm ci`、`npm run build`、`next start -p 3002`，检查 `/api/health`、`/`、`/login` 全部为 200。任一步失败都不改变 PM2，并停止 smoke process。

只有日志同时明确包含 `next/font/google`（或 Google Fonts）和 `ETIMEDOUT/timeout` 时，脚本才生成一次性重试许可。人工检查网络后只能运行：

```bash
bash /www/jianlian-shop/scripts/production-release.sh retry-build <FULL_SHA>
```

其他 build 错误或第二次失败均停止。

Prepare、build 和 Smoke PASS 后会生成绑定目标 SHA、env 摘要与 build identity 的 `600` marker，只有 marker 仍一致时才切换：

```bash
bash scripts/production-release.sh switch <FULL_SHA>
```

脚本重新检查 SHA、`.next`、env 与 marker，再检查 PM2 online、cwd、localhost `3001/api/health`、正式首页和 login。全部为 200 后才 `pm2 save`；任一切换后验证失败会恢复原 release 并验证其 health/site/login，绝不保存失败状态。自动恢复失败时停止并要求人工恢复。

## Release 保留策略

默认保留：

1. 当前 Production release；
2. 一个指定 rollback release；
3. 正在构建的新 release。

新版本完成全部线上验证前，不得删除原 Production release。单个完整 release 当前约 1.1 GiB，应在 preflight 前预留构建峰值空间和 inode。

## 直接回滚（不重新 build）

```bash
bash /www/jianlian-shop/scripts/production-release.sh rollback /www/releases/jianlian-shop-<ROLLBACK_FULL_SHA>
```

Rollback 拒绝当前 cwd，验证目标目录、Git SHA、`.next`、env 后直接切回且不重新安装或构建，检查 health/site/login，最后 `pm2 save`。失败时恢复并验证切换前 release，且不保存失败状态。应用 rollback 不等于数据库 rollback，禁止自动执行 SQL。

## 权威停止条件

- commit、PM2 cwd、release 路径或 rollback 无法精确确认；
- env 缺失、权限不是 `600` 或强制变量为 MISSING；
- 空间/inode 不足；
- 目标 release 已存在且人工尚未判断其状态；
- `npm ci`、build、smoke、PM2 cwd/online 或 HTTP 验证失败；
- 需要 Migration、Nginx、支付、订单、余额或 supplier 写操作。

## 以下为历史流程（已废止，禁止执行）

<!-- Historical content retained only for repository archaeology. It is intentionally hidden from the rendered runbook.

## 部署原则

- 只从 GitHub `main` 部署。
- 服务器使用 `git pull --ff-only`，禁止强制覆盖。
- 不覆盖生产 `.env.local`。
- PM2 重启前必须先构建成功。
- Migration 与代码部署顺序必须人工确认。
- 每次部署必须记录旧 commit SHA，便于回滚。

## 本地发布前检查

```powershell
cd D:\Jianlian-shop
git status --short --branch
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
npm run typecheck
npm run build
```

停止条件：

- 本地分支不是 `main`。
- 本地落后 `origin/main`。
- 存在未审查的未提交文件。
- `.env.local`、`.next`、日志或缓存被暂存。
- `typecheck` 或 `build` 失败。
- 有 Migration 需要执行但未备份数据库。

## 推送 GitHub

```powershell
git push origin main
```

推送失败时不要继续生产部署。先确认网络和 GitHub 状态。

## 生产部署前备份

在服务器记录当前版本：

```bash
cd /www/jianlian-shop
git status
git rev-parse HEAD
pm2 describe jianlian-shop
```

保存：

- 当前生产 commit SHA。
- PM2 `cwd`。
- PM2 启动命令。
- 当前环境变量摘要，不保存密钥值。
- 当前数据库备份时间。

## 数据库和 Migration

部署前：

1. 备份 Supabase 数据库。
2. 对比本地 `supabase/` 目录与生产已执行 Migration。
3. 如果需要执行 Migration，在 Supabase SQL Editor 中人工执行。
4. 不从应用服务器自动执行 SQL。
5. 不关闭 RLS。
6. 不在聊天或文档中记录密钥。

如果 Migration 不可逆，必须先确认回滚方案。

## 服务器只读核验

```bash
cd /www/jianlian-shop
git status
git branch --show-current
git remote -v
git log -1 --oneline
git rev-parse HEAD
pm2 describe jianlian-shop
pm2 logs jianlian-shop --lines 100
```

确认：

- 目录是 `/www/jianlian-shop`。
- 分支是 `main`。
- 远程是 `GingLuyg1/Jianlian-shop`。
- PM2 应用名是 `jianlian-shop`。
- 端口是 `3001`。
- 工作目录和启动命令正确。
- 进程运行时间和重启次数合理。

## 拉取和构建

```bash
cd /www/jianlian-shop
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git pull --ff-only origin main
npm ci
npm run build
```

`npm run build` 失败时立即停止，不重启 PM2。

## PM2 重启

构建成功后执行：

```bash
pm2 restart jianlian-shop --update-env
pm2 describe jianlian-shop
pm2 logs jianlian-shop --lines 100
```

确认进程在线、端口正确、日志无启动错误。

## 健康检查

```bash
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://www.jianlian.shop/api/health
```

后台管理员再检查：

```text
/api/admin/system/version
```

确认线上短 SHA 与计划部署 commit 一致。

## 部署后冒烟

执行 `docs/production-smoke-test.md` 中的清单。

## 停止条件

出现以下任一情况，停止部署并评估回滚：

- GitHub `main` 与服务器目标 SHA 不一致。
- `git pull --ff-only` 失败。
- `npm ci` 或 `npm run build` 失败。
- `/api/health` 不可用。
- 首页或商品详情白屏。
- 商品保存失败。
- 订单创建异常。
- 控制台出现 `Hydration error`、`ChunkLoadError` 或大量 500。
-->
