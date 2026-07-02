# Jianlian Shop 人工生产部署流程

本流程只描述人工部署步骤，不自动执行生产命令，不自动执行 Supabase SQL，不自动重启 PM2。

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
