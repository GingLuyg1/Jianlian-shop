# BEP20 欠额候选只读巡检

## 目的与边界

该脚本每次只执行一次内部 GET dry-run：

```text
GET /api/internal/payments/bep20/underpayments/settle?limit=10
```

它只汇总候选数量，不提交结算请求、不处理订单、不修改余额、不释放库存。退出码 `2`
表示发现候选，需要管理员进入后台人工复核，不表示巡检程序故障。

## 文件

- 脚本：`scripts/ops/bep20-underpayment-dry-run-monitor.mjs`
- 建议密钥文件：`/etc/jianlian/bep20-underpayment-monitor.env`
- 建议日志：`/var/log/jianlian/bep20-underpayment-monitor.log`
- 建议 cron：`/etc/cron.d/jianlian-bep20-underpayment-monitor`

## Root-only 环境文件

由服务器管理员创建文件，示例只包含占位符：

```bash
JIANLIAN_INTERNAL_BASE_URL=<https-base-url>
BEP20_UNDERPAYMENT_JOB_SECRET=<internal-job-secret>
```

设置 root 所有权和只读权限：

```bash
sudo chown root:root /etc/jianlian/bep20-underpayment-monitor.env
sudo chmod 600 /etc/jianlian/bep20-underpayment-monitor.env
```

不要把密钥直接写入 crontab、命令参数、仓库或日志。脚本使用接口既有的
`x-internal-job-secret` Header，日志不会输出该 Header 或密钥。

## 手动运行

```bash
sudo /bin/sh -c '
  set -a
  . /etc/jianlian/bep20-underpayment-monitor.env
  set +a
  /usr/bin/node /www/jianlian-shop/scripts/ops/bep20-underpayment-dry-run-monitor.mjs --limit=10
'
echo $?
```

`--limit` 默认是 `10`，输入会被限制在 `1–200`。

## 每小时 Cron 模板

在 `/etc/cron.d/jianlian-bep20-underpayment-monitor` 中使用：

```cron
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 * * * * root /bin/sh -c 'set -a; . /etc/jianlian/bep20-underpayment-monitor.env; set +a; /usr/bin/node /www/jianlian-shop/scripts/ops/bep20-underpayment-dry-run-monitor.mjs --limit=10 >> /var/log/jianlian/bep20-underpayment-monitor.log 2>&1'
```

该模板不包含真实密钥，也不执行自动结算。安装前应先手动运行并核对输出。

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
