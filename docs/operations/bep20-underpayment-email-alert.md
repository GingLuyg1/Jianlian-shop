# BEP20 欠额候选邮件告警

## 阶段与安全边界

- BEP20 Phase 2A 的现有 GET-only 巡检 Cron 保持不变。
- Phase 2B 仅在相同只读巡检结果上增加邮件告警，不调用结算 POST。
- 自动结算：**Disabled**。发现候选后必须进入管理员后台人工复核。
- 本文档不包含真实 API Key、内部任务密钥或真实收件邮箱。

只有 PR 合并、对应新 release 通过 Canary 并投入生产后，才允许在服务器安装告警脚本。
不得从未合并分支、源码工作区或尚未投入生产的 release 安装。

## 环境文件

巡检认证继续来自现有 root-only 文件：

```text
/etc/jianlian/bep20-underpayment-monitor.env
```

Resend 配置从现有 root-only 文件读取：

```text
/etc/jianlian/resend-alert.env
```

`/etc/jianlian/resend-alert.env` 的格式示例：

```bash
RESEND_API_KEY='REPLACE_WITH_EXISTING_RESEND_API_KEY'
EMAIL_FROM='Jianlian Alert <alerts@notify.jianlian.shop>'
BEP20_ALERT_RECIPIENT='REPLACE_WITH_ALERT_RECIPIENT'
BEP20_ALERT_STATE_FILE='/var/lib/jianlian/bep20-underpayment-email-alert-state.json'
BEP20_ALERT_COOLDOWN_MINUTES='360'
```

不得将真实密钥或真实收件邮箱写入仓库、Cron、命令行参数或日志。沿用已验证的生产
Resend 配置，不要随意重新生成或替换密钥。确认两个环境文件均为 `root:root`、权限
`0600`。

## 安装稳定副本

`RELEASE` 必须指向已合并、已通过 Canary 且已投入生产的不可变 release：

```bash
RELEASE='/www/releases/jianlian-shop-REPLACE_WITH_DEPLOYED_COMMIT'

install -d -m 755 -o root -g root /opt/jianlian/ops
install -d -m 700 -o root -g root /var/lib/jianlian
install -d -m 700 -o root -g root /var/log/jianlian

install -m 755 -o root -g root \
  "$RELEASE/scripts/ops/bep20-underpayment-email-alert.mjs" \
  /opt/jianlian/ops/bep20-underpayment-email-alert.mjs

install -m 755 -o root -g root \
  "$RELEASE/scripts/ops/bep20-underpayment-dry-run-monitor.mjs" \
  /opt/jianlian/ops/bep20-underpayment-dry-run-monitor.mjs

touch /var/log/jianlian/bep20-underpayment-email-alert.log
chown root:root /var/log/jianlian/bep20-underpayment-email-alert.log
chmod 600 /var/log/jianlian/bep20-underpayment-email-alert.log
```

后续更新只能从新的已部署 release 重新安装两个稳定副本。

## Node 20

```bash
command -v node
node --version
```

必须确认 Node 主版本为 20。记录 `command -v node` 返回的绝对路径；不要依赖 Cron
加载 NVM，也不要在 Cron 中使用模糊的 `node` 命令。

## 上线前手动验证

Phase 2A Cron 在整个验证期间保持不变。先在仓库或 release 中运行本地 mock 测试：

```bash
npm test -- --test-name-pattern='BEP20 underpayment'
```

随后由服务器管理员使用短期、仅监听 `127.0.0.1` 的批准 mock 服务，依次模拟：

1. HTTP 200 且无候选：不发送邮件，退出 `0`。
2. HTTP 200 且有候选：发送候选告警，退出 `2`。
3. 401、403、429、5xx、超时或格式错误：发送故障告警，退出 `3`。

模拟期间不得调用真实结算 POST，不得在 mock 响应中使用真实订单、用户、Session、
钱包地址或 TxHash。手动执行方式：

```bash
/bin/sh -c '
  set -a
  . /etc/jianlian/bep20-underpayment-monitor.env
  . /etc/jianlian/resend-alert.env
  set +a
  /ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-email-alert.mjs --limit=10
'
echo $?
```

命令只会输出一行安全 JSON，不打印密钥或完整业务标识。必须在 Gmail 中确认候选告警
和故障告警均成功收件，并核对正文只含安全摘要后，才允许替换现有 Cron 命令。

## Cron 切换模板

在 Gmail 收件验证完成前，不修改 Phase 2A Cron。通过验证后，先备份现有
`/etc/cron.d/jianlian-bep20-underpayment-monitor`，再将其命令替换为：

```cron
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 * * * * root /bin/sh -c 'set -a; . /etc/jianlian/bep20-underpayment-monitor.env; . /etc/jianlian/resend-alert.env; set +a; /ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-email-alert.mjs --limit=10 >> /var/log/jianlian/bep20-underpayment-email-alert.log 2>&1'
```

将 `/ABSOLUTE/PATH/TO/node` 替换为 `command -v node` 返回值。Cron 仍为每小时一次，
内部巡检仍为 GET-only，`--limit=10`，自动结算仍为 **Disabled**。

```bash
chown root:root /etc/cron.d/jianlian-bep20-underpayment-monitor
chmod 600 /etc/cron.d/jianlian-bep20-underpayment-monitor
```

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 巡检健康且无候选，无需告警 |
| `2` | 发现候选，告警已发送或在 cooldown 内被安全抑制 |
| `3` | 巡检故障，故障告警已发送或在 cooldown 内被安全抑制 |
| `1` | 配置、巡检契约、状态文件或邮件发送失败 |

## 禁用与回滚

1. 将 Cron 文件恢复为切换前备份的 Phase 2A GET-only 巡检命令。
2. 确认后续小时日志重新写入 Phase 2A 日志文件。
3. 保留告警状态文件用于故障分析；其中只含 fingerprint 和时间，不含密钥或业务标识。
4. 如需完全停用巡检，移走 Cron 文件并确认不再产生新日志。
5. 回滚不修改数据库、订单、支付、余额或库存；自动结算始终保持 **Disabled**。
