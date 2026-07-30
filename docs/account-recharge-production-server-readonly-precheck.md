# Account Recharge Production Server Read-only Precheck

本清单只定义正式服务器上线前的人工只读检查，不授权登录服务器、部署、构建、重启、
修改配置、调用写接口或执行数据库语句。每一项都必须由谷铭泽单独明确授权后才能在
正式环境核对。

## 正式环境固定信息

- 服务器目录：`/www/jianlian-shop`
- PM2 进程：`jianlian-shop`
- Next.js 端口：`3001`
- 目标 main commit：`60d05591a21ce9c309e9e440888c86bb6415f960`
- 正式 Supabase Project ref：`qvbovrvybirscaurwuov`

任何一项固定信息无法人工确认时，整体结果必须为 `BLOCKED`。

## 只读检查边界

- 只核对当前状态，不拉取代码、不写文件、不改变进程状态。
- Git 远端只允许记录 remote 名称和脱敏后的主机/仓库标识，不得输出 URL 中的凭证。
- 本机 HTTP 检查只访问 `127.0.0.1:3001` 的只读健康或页面 GET，不访问充值 POST。
- PM2 只允许读取进程描述，不允许改变进程、环境或保存当前进程列表。
- 环境变量只检查名称是否存在。输出只能为 `PRESENT` 或 `MISSING`。
- 不得打印完整 Supabase URL、任何 key、JWT、Cookie、Authorization 或进程环境快照。
- 不得将任何环境变量发送到外部接口验证。

## Git、运行时和发布目录

只读核对以下项目：

1. 当前服务器 Git 分支。
2. 当前服务器 commit，必须记录完整 SHA，并确认该版本可以作为部署前回滚基线。
3. 工作区是否干净，包括未跟踪文件。
4. 当前远端名称及仓库归属；不显示含凭证的完整远端地址。
5. `/www/jianlian-shop` 所在文件系统的可用空间和使用率。
6. Node.js 版本。
7. npm 版本。
8. 当前发布目录是否存在。
9. 旧版本备份目录是否存在，并记录其只读路径标识。
10. `.next` 目录是否存在、是否为目录、最后修改时间。

上述检查不得触发依赖安装、构建、Git 同步或文件时间更新。

### 当前服务器 commit 与目标 commit

- 当前服务器 commit 是部署前实际运行版本，必须记录完整 SHA。
- 本次目标 main commit 是
  `60d05591a21ce9c309e9e440888c86bb6415f960`，两者是不同的检查项。
- 正式部署前，当前服务器 commit 与目标 commit 不同是“尚未部署”的预期状态，
  不因版本不同单独判定 `BLOCKED`；版本关系记录为 `PENDING_DEPLOYMENT`。
- 如果当前服务器 commit 与目标 commit 相同，但正式状态仍声称“尚未部署”，版本关系
  必须记录为 `ALREADY_DEPLOYED_UNEXPECTEDLY` 并判定 `BLOCKED`，先核对是否发生了
  未记录部署。
- 当前服务器 SHA 无法确认、工作区不干净，或当前版本不能作为回滚基线时，必须判定
  `BLOCKED`。

## PM2、端口和本机健康

仅通过 PM2 的只读状态/描述能力核对：

- 进程名必须为 `jianlian-shop`。
- 状态必须为 `online`。
- cwd 必须对应 `/www/jianlian-shop` 的当前发布目录。
- 启动脚本必须是预期的 Next.js 生产启动入口。
- 端口必须为 `3001`。
- restart count 必须记录；异常增长时结果为 `BLOCKED`。
- 进程启动时间和最近一次重启时间必须记录。
- `3001` 必须由预期 Node.js/PM2 进程监听。
- `127.0.0.1:3001` 的只读 HTTP 请求必须返回预期健康响应。

不得输出 PM2 完整环境，不得从 PM2 描述中复制密钥、URL、Cookie 或 Authorization。

## 环境变量存在性检查

必须逐项检查以下变量，只输出 `PRESENT` 或 `MISSING`：

| 变量名 | 允许输出 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `PRESENT` / `MISSING` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `PRESENT` / `MISSING` |
| `SUPABASE_SERVICE_ROLE_KEY` | `PRESENT` / `MISSING` |
| `SUPABASE_SERVICE_ROLE` | `PRESENT` / `MISSING` |
| `SUPABASE_SECRET_KEY` | `PRESENT` / `MISSING` |
| `SUPABASE_SECRET` | `PRESENT` / `MISSING` |
| `SUPABASE_SERVICE_KEY` | `PRESENT` / `MISSING` |

通过条件：

- `NEXT_PUBLIC_SUPABASE_URL = PRESENT`。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY = PRESENT`。
- 五个受支持的 service-role 变量中至少一个为 `PRESENT`。
- 从 Supabase URL hostname 本地派生的唯一允许输出是 Project ref，且必须等于
  `qvbovrvybirscaurwuov`。
- 不解析、验证或显示 anon/service-role key 内容，不向 Supabase 或其他外部接口发送 key。
- 如果多个 service-role 变量同时存在，必须标记 `BLOCKED`，先由负责人确认优先级；
  本预检不修改或删除任何变量。

## 明确禁止

以下命令或操作不得在本预检中执行：

- `git pull`
- `git reset`
- `npm install`
- `npm run build`
- `pm2 restart`
- `pm2 reload`
- `pm2 delete`
- `systemctl restart`
- 修改环境变量
- 修改 Nginx
- 修改任何文件
- 执行数据库 SQL
- 调用充值 POST
- 创建测试充值
- 部署或切换发布目录

## 人工检查表

“实际值”只能记录非敏感状态。环境变量行只能填写 `PRESENT` 或 `MISSING`。

| 检查项 | 期望值 | 实际值 | PASS/BLOCKED | 备注 |
| --- | --- | --- | --- | --- |
| 当前 Git 分支 | `main` | 待填写 | 待填写 | 只读核对 |
| 当前服务器 commit | 记录完整 SHA，并确认可作为当前回滚基线 | 待填写 | 待填写 | 不要求部署前等于目标 |
| 目标 main commit | `60d05591a21ce9c309e9e440888c86bb6415f960` | 待填写 | 待填写 | 本次待部署版本 |
| 当前与目标版本关系 | 部署前允许不同；明确记录 `PENDING_DEPLOYMENT` 或 `ALREADY_DEPLOYED_UNEXPECTEDLY` | 待填写 | 待填写 | 意外相同必须核对 |
| Git 工作区 | 干净 | 待填写 | 待填写 | 包含未跟踪文件 |
| Git remote 名称 | 预期 remote 名称 | 待填写 | 待填写 | 不输出凭证 |
| 磁盘可用空间 | 满足独立构建和旧版本保留要求 | 待填写 | 待填写 | 记录容量，不改文件 |
| Node.js 版本 | 项目支持版本 | 待填写 | 待填写 | 只读版本输出 |
| npm 版本 | 与当前运行环境兼容 | 待填写 | 待填写 | 只读版本输出 |
| PM2 进程状态 | `jianlian-shop = online` | 待填写 | 待填写 | 不改变进程 |
| PM2 cwd | `/www/jianlian-shop` 当前发布目录 | 待填写 | 待填写 | 不输出环境 |
| PM2 启动脚本 | 预期生产入口 | 待填写 | 待填写 | 只记录脚本路径 |
| PM2 端口 | `3001` | 待填写 | 待填写 | 不修改端口 |
| PM2 restart count | 无异常增长 | 待填写 | 待填写 | 异常即 BLOCKED |
| 3001 监听 | 预期 Node.js/PM2 进程 | 待填写 | 待填写 | 只读监听检查 |
| 本机 HTTP 健康 | 只读 GET 成功 | 待填写 | 待填写 | 不调用写接口 |
| 当前发布目录 | 存在 | 待填写 | 待填写 | 只读 |
| 旧版本备份目录 | 存在且可识别 | 待填写 | 待填写 | 不切换 |
| `.next` 目录 | 存在并记录修改时间 | 待填写 | 待填写 | 不构建 |
| `NEXT_PUBLIC_SUPABASE_URL` | `PRESENT` | 待填写 | 待填写 | 不输出值 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `PRESENT` | 待填写 | 待填写 | 不输出值 |
| 支持的 service-role 变量 | 恰好一个 `PRESENT` | 待填写 | 待填写 | 不输出值 |
| Supabase Project ref | `qvbovrvybirscaurwuov` | 待填写 | 待填写 | 仅本地派生 ref |

任一项目为 `BLOCKED`、未填写或无法确认时，不得开始正式部署、数据库变更或充值测试。
