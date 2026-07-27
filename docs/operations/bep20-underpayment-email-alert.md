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

Phase 2A Cron 在整个验证期间保持原有的每小时第 17 分钟计划，不修改其命令。先在仓库
或 release 中运行本地 mock 测试：

```bash
npm test -- --test-name-pattern='BEP20 underpayment'
```

随后由服务器管理员使用短期、仅监听 `127.0.0.1` 的批准 mock 服务。mock 响应不得
包含真实订单、用户、Session、钱包地址或 TxHash。可在独立终端启动以下临时服务，
将端口占位符替换为一个空闲本机端口：

```bash
MOCK_PORT='REPLACE_WITH_MOCK_PORT'
MOCK_SCENARIO='REPLACE_WITH_NO_CANDIDATE_CANDIDATE_OR_FAILURE'

MOCK_PORT="$MOCK_PORT" MOCK_SCENARIO="$MOCK_SCENARIO" \
  /ABSOLUTE/PATH/TO/node --input-type=module <<'NODE'
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT);
const scenario = process.env.MOCK_SCENARIO;
const responses = {
  no_candidate: {
    status: 200,
    body: {
      success: true,
      preview: { candidate_count: 0, candidates: [], request_id: "mock-no-candidate" },
    },
  },
  candidate: {
    status: 200,
    body: {
      success: true,
      preview: { candidate_count: 1, candidates: [], request_id: "mock-candidate" },
    },
  },
  failure: {
    status: 503,
    body: { success: false },
  },
};
const selected = responses[scenario];
if (!selected || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("INVALID_LOCAL_MOCK_CONFIGURATION");
}

createServer((request, response) => {
  if (request.method !== "GET") {
    response.writeHead(405).end();
    return;
  }
  response.writeHead(selected.status, { "content-type": "application/json" });
  response.end(JSON.stringify(selected.body));
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock listening on 127.0.0.1:${port}\n`);
});
NODE
```

依次将 `MOCK_SCENARIO` 设为：

1. `no_candidate`：HTTP 200 且 `candidate_count=0`，不发送邮件，退出 `0`。
2. `candidate`：HTTP 200 且 `candidate_count>0`，发送候选告警，退出 `2`。
3. `failure`：HTTP 503，发送故障告警，退出 `3`。格式错误也应产生相同故障告警；
   如需验证格式错误，只把临时 mock 的 `body` 改成不符合巡检契约的无敏感 JSON。

每个场景均在另一个终端执行以下命令。必须先加载两个 root-only 文件，再显式覆盖
内部地址为本机 mock；不要打印、替换或重新生成真实
`BEP20_UNDERPAYMENT_JOB_SECRET`：

```bash
set -a
. /etc/jianlian/bep20-underpayment-monitor.env
. /etc/jianlian/resend-alert.env
set +a

JIANLIAN_INTERNAL_BASE_URL='http://127.0.0.1:REPLACE_WITH_MOCK_PORT'
BEP20_ALERT_STATE_FILE='/var/lib/jianlian/bep20-underpayment-email-alert-canary-state.json'
export JIANLIAN_INTERNAL_BASE_URL BEP20_ALERT_STATE_FILE

/ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-email-alert.mjs --limit=10
echo $?
```

命令只会输出一行安全 JSON，不打印密钥或完整业务标识。必须在 Gmail 中确认候选告警
和故障告警均成功收件，并核对正文只含安全摘要后，才允许替换现有 Cron 命令。

三类测试完成后停止临时 mock，并安全删除独立 canary 状态文件：

```bash
rm -f -- /var/lib/jianlian/bep20-underpayment-email-alert-canary-state.json
```

## Cron 切换模板

在 Gmail 收件验证完成前，不修改 Phase 2A Cron。通过验证后，先备份现有
`/etc/cron.d/jianlian-bep20-underpayment-monitor`，再将其命令替换为：

```cron
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

17 * * * * root /bin/sh -c 'set -a; . /etc/jianlian/bep20-underpayment-monitor.env; . /etc/jianlian/resend-alert.env; set +a; /ABSOLUTE/PATH/TO/node /opt/jianlian/ops/bep20-underpayment-email-alert.mjs --limit=10 >> /var/log/jianlian/bep20-underpayment-email-alert.log 2>&1'
```

将 `/ABSOLUTE/PATH/TO/node` 替换为 `command -v node` 返回值。Cron 保持每小时第 17
分钟执行，内部巡检仍为 GET-only，`--limit=10`，自动结算仍为 **Disabled**。

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
