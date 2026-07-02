# Jianlian Shop 版本一致性核验

更新日期：2026-07-03

本文件用于核验本地代码、GitHub `main`、生产服务器代码、PM2 进程和线上页面是否一致。本次只做只读核验和流程建设，不自动部署、不重启 PM2、不执行 Supabase SQL。

## 本地核验结果

| 项目 | 结果 |
| --- | --- |
| 本地目录 | `D:\Jianlian-shop` |
| 当前分支 | `main` |
| 远程仓库 | `https://github.com/GingLuyg1/Jianlian-shop.git` |
| 本地 HEAD | `a3b58b4a9a77460f1f50cf91eeca91520134d821` |
| 本地最新提交 | `a3b58b4 Fix checkout product UUID lookup` |
| 缓存的 `origin/main` | `a3b58b4a9a77460f1f50cf91eeca91520134d821` |
| 本地领先/落后 | 领先 0，落后 0（基于本地缓存的 `origin/main`） |
| GitHub 实时 fetch | 失败：GitHub 连接被重置 |
| 未提交文件 | 当前任务产生的版本/文档改动；另有未跟踪日志 `.codex-dev.log` |
| 未跟踪 Migration | 未发现 |

> 注意：由于 `git fetch origin` 返回 `Recv failure: Connection was reset`，本文件中的 GitHub 状态以本地缓存的 `origin/main` 为准。网络恢复后必须重新执行 `git fetch origin` 再确认。

## 必查命令

本地执行：

```powershell
cd D:\Jianlian-shop
git status
git branch --show-current
git remote -v
git log -1 --oneline
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git log --oneline origin/main..HEAD
git log --oneline HEAD..origin/main
```

要求：

- 不自动 `merge`、`rebase` 或 `pull`。
- 不使用 `git reset --hard`。
- 不提交 `.env.local`、`.next`、日志、缓存或 `node_modules`。
- 未提交 Migration 必须先人工确认是否需要上线执行。

## 已修复项进入 GitHub 的核验口径

| 修复项 | 本地状态 | GitHub 状态判断方式 |
| --- | --- | --- |
| 三级商品读取修复 | 需通过文件和提交确认 | `git show origin/main -- app/products/[id]/page.tsx` |
| 商品编辑保存修复 | 需通过文件和提交确认 | `git show origin/main -- app/api/admin/products/[id]/route.ts` |
| 原版 checkout 页面恢复 | 需通过文件和提交确认 | `git show origin/main -- app/checkout/page.tsx` |
| 支付方式下拉 | 需通过文件和提交确认 | `git show origin/main -- app/products/[id]/page.tsx` |
| 多 SKU 与订单链路 | 需通过文件和提交确认 | `git show origin/main -- lib/orders` |
| Migration 与 RLS 检查 | 需通过文件和提交确认 | `git ls-tree -r origin/main supabase` |

不能以“本地文件存在”判断已经推送。必须以 `origin/main` 的提交和文件内容为准。

## 版本标识

应用版本信息统一由 `lib/system/release-info.ts` 读取：

- `commit_sha`
- `short_commit_sha`
- `branch`
- `build_time`
- `environment`
- `application_version`

优先读取构建环境变量，例如 `GITHUB_SHA`、`GITHUB_REF_NAME`、`GIT_COMMIT`、`GIT_BRANCH`、`BUILD_TIME`。缺失时返回 `unknown`，不会暴露服务器路径、密钥或 Git 凭据。

## 健康检查

公开接口：

```text
GET /api/health
```

返回短版本、环境、构建时间和数据库可达状态，不返回敏感配置。

管理员接口：

```text
GET /api/admin/system/version
```

仅超级管理员可访问，返回完整 commit、分支、构建时间和数据库摘要。

## 生产服务器只读核验

请在服务器人工执行：

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

核验要点：

- `git rev-parse HEAD` 是否等于本次计划部署的 GitHub `main` SHA。
- PM2 `cwd` 是否为 `/www/jianlian-shop`。
- PM2 应用名是否为 `jianlian-shop`。
- 生产端口是否为 `3001`。
- 进程启动命令是否指向正确 Next.js 应用。
- 运行时间、重启次数、最近 100 行日志是否正常。
- 生产工作区不干净时，先备份再处理。

## 线上页面版本确认

部署后访问：

```bash
curl -fsS https://www.jianlian.shop/api/health
```

确认返回的 `version` 与部署 commit 的短 SHA 一致。后台再访问：

```text
https://www.jianlian.shop/api/admin/system/version
```

确认完整 SHA、分支和环境信息。

## 风险与结论

- 本任务未连接生产服务器，服务器实际 SHA 需要用户按文档人工核验。
- 本任务未执行 Supabase SQL，数据库结构需要按 Migration 文档人工核验。
- GitHub 实时 fetch 当前失败，网络恢复后需重新确认 `origin/main`。
- `.codex-dev.log` 是未跟踪日志文件，不应提交。
