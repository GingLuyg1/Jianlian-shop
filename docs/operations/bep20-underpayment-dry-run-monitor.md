# BEP20 欠额候选只读巡检

## 目的与边界

该脚本每次只执行一次内部 GET dry-run：

```text
GET /api/internal/payments/bep20/underpayments/settle?limit=10
```

它只汇总候选数量，不提交结算请求、不处理订单、不修改余额、不释放库存。退出码 `2`
表示发现候选，需要管理员进入后台人工复核，不表示巡检程序故障。

自动结算：**Disabled**。本阶段仅部署 GET-only 巡检。

## 文件

- Release 内脚本：`scripts/ops/bep20-underpayment-dry-run-monitor.mjs`
- 稳定安装副本：`/opt/jianlian/ops/bep20-underpayment-dry-run-monitor.mjs`
- 建议密钥文件：`/etc/jianlian/bep20-underpayment-monitor.env`
- 建议日志：`/var/log/jianlian/bep20-underpayment-monitor.log`
- 建议 cron：`/etc/cron.d/jianlian-bep20-underpayment-monitor`

## 目录和权限初始化

以下命令由 root 执行：

```bash
install -d -m 700 -o root -g root /etc/jianlian
install -d -m 700 -o root -g root /var/log/jianlian

touch /var/log/jianlian/bep20-underpayment-monitor.log
chown root:root /var/log/jianlian/bep20-underpayment-monitor.log
chmod 600 /var/log/jianlian/bep20-underpayment-monitor.log
```

## Root-only 环境文件

由服务器管理员创建文件。Secret 必须取自现有生产配置，禁止重新随意生成，否则会造成
内部接口鉴权失效。以下示例不包含真实 Secret：

```bash
JIANLIAN_INTERNAL_BASE_URL='http://127.0.0.1:3001'
BEP20_UNDERPAYMENT_JOB_SECRET='REPLACE_WITH_EXISTING_SECRET'
```

设置 root 所有权和只读权限：

```bash
chown root:root /etc/jianlian/bep20-underpayment-monitor.env
chmod 600 /etc/jianlian/bep20-underpayment-monitor.env
```

不要把密钥直接写入 crontab、命令参数、仓库或日志。脚本使用接口既有的
`x-internal-job-secret` Header，日志不会输出该 Header 或密钥。推荐通过
`127.0.0.1:3001` 调用本机应用，避免内部 Secret 经过公网。

## 安装稳定脚本副本

只允许从已经通过 Canary 并正式投入生产的不可变 release 安装。不得从未合并分支、
源码工作区或当前仓库目录直接安装：

```bash
RELEASE='/www/releases/jianlian-shop-REPLACE_WITH_DEPLOYED_COMMIT'

install -d -m 755 -o root -g root /opt/jianlian/ops

install -m 755 -o root -g root \
  "$RELEASE/scripts/ops/bep20-underpayment-dry-run-monitor.mjs" \
  /opt/jianlian/ops/bep20-underpayment-dry-run-monitor.mjs
```

Cron 只能调用 `/opt/jianlian/ops` 下的稳定副本。后续脚本更新必须在新 release 通过
Canary 并投入生产后，重新执行上述 `install` 命令更新稳定副本。

## 确认 Node 路径

部署时先执行：

```bash
command -v node
node --version
```

必须确认 Node 主版本为 20，并记录 `command -v node` 返回的绝对路径。Cron 不加载
NVM shell 初始化，也不得使用模糊的 `node` 命令；下方
`/ABSOLUTE/PATH/TO/node` 必须由管理员替换为该绝对路径。

## 手动运行

```bash
/bin/sh -c '
  set -a
  . /etc/jianlian/bep20-underpayment-monitor.env
  set +a
  /ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-dry-run-monitor.mjs --limit=10
'
echo $?
```

`--limit` 默认是 `10`，输入会被限制在 `1–200`。

## 每小时 Cron 模板

在 `/etc/cron.d/jianlian-bep20-underpayment-monitor` 中使用：

```cron
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 * * * * root /bin/sh -c 'set -a; . /etc/jianlian/bep20-underpayment-monitor.env; set +a; /ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-dry-run-monitor.mjs --limit=10 >> /var/log/jianlian/bep20-underpayment-monitor.log 2>&1'
```

将 `/ABSOLUTE/PATH/TO/node` 替换为 `command -v node` 返回值。该模板不包含真实密钥，
只执行 GET-only 巡检，不执行自动结算。安装前应先手动运行并核对输出。

创建 Cron 文件后设置：

```bash
chown root:root /etc/cron.d/jianlian-bep20-underpayment-monitor
chmod 600 /etc/cron.d/jianlian-bep20-underpayment-monitor
```

## 安全输出

每次运行只输出一行 JSON，字段为：

- `timestamp`
- `success`
- `eligible`
- `candidate_count`
- `request_id`（缩略）
- `http_status`
- `duration_ms`

不会输出候选 UUID、邮箱、完整钱包地址、完整 TxHash、数据库连接信息或 Job Secret。

## 退出码

| 退出码 | 含义 | 处理 |
| --- | --- | --- |
| `0` | HTTP 200，且无候选 | 无需操作 |
| `2` | HTTP 200，发现一个或多个候选 | 登录管理员后台人工复核；不要自动结算 |
| `1` | 鉴权、限流、服务端、超时或响应契约错误 | 检查应用健康状态、环境文件权限和日志 |

## 日志轮转建议

可创建 `/etc/logrotate.d/jianlian-bep20-underpayment-monitor`：

```text
/var/log/jianlian/bep20-underpayment-monitor.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
}
```

## 验证

1. 手动运行一次并确认只有一行安全 JSON。
2. 无候选时确认退出码为 `0`。
3. 查看 cron 文件权限和 `/var/log/jianlian/bep20-underpayment-monitor.log`。
4. 等待一个调度周期，确认日志时间、HTTP 200 和运行时长合理。
5. 若返回 `2`，只进入后台人工复核；自动结算仍保持禁用。

## 停用

删除或移走 `/etc/cron.d/jianlian-bep20-underpayment-monitor`，然后确认后续小时不再产生新日志。
停用巡检不需要删除 root-only 环境文件；如不再使用，应由服务器管理员按密钥轮换流程安全销毁。
