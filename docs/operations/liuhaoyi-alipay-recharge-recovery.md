# 六号易支付宝账户充值查询兜底 V1

## 边界

该任务仅扫描仍在有效期内、创建超过 30 秒的 `liuhaoyi + recharge + alipay`
支付会话。微信、商城订单、USDT 和其他 Provider 不进入自动恢复。查询结果不是付款凭证的
唯一条件；应用还会核对本地状态、两层有效期、CNY 金额、Provider type、
`provider_order_no`、`provider_transaction_id`，以及 Provider 返回时的
`out_trade_no`。

通用 `/api/internal/payments/reconcile` 不会开启该恢复模式。只有专用内部入口
`POST /api/internal/payments/liuhaoyi-alipay-recharge-recovery` 可以显式启用。

## Production 启用前置条件

以下步骤不随代码部署自动执行：

1. 人工审计并执行
   `20260915210000_liuhaoyi_recharge_recovery_expiry_guards.sql`。
2. 部署已通过测试的不可变 release。
3. 使用已有 `PAYMENT_RECONCILIATION_SECRET`，不要创建第二份支付密钥。
4. 先手工执行默认 dry-run worker，并只检查聚合计数。
5. 单独审批后，使用显式 `--execute` 做一次真实 canary。
6. 单独审批后才能安装和启用 timer。

## Root-only worker 配置

配置文件 `/etc/jianlian/liuhaoyi-recovery.env` 必须为 root 所有、权限 `0600`：

```text
JIANLIAN_NODE_BINARY=/ABSOLUTE/PATH/TO/node
JIANLIAN_INTERNAL_BASE_URL=http://127.0.0.1:3001
PAYMENT_RECONCILIATION_SECRET=<EXISTING_SECRET>
```

不得将真实 Secret 写入仓库、unit 文件、命令参数或日志。

人工预检默认是 DRY RUN，不会完成支付或写入对账证据：

```bash
node scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs --batch-size=20
```

真实单次 canary 必须经过独立审批并显式增加 `--execute`：

```bash
node scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs --batch-size=20 --execute
```

不读取任何环境变量来隐式切换 execute 模式。systemd service 模板因用于正式定时恢复，`ExecStart` 明确包含 `--execute`。

从已经部署的不可变 release 安装稳定脚本副本：

```bash
RELEASE=/www/releases/jianlian-shop-<DEPLOYED_FULL_SHA>
install -d -m 755 -o root -g root /opt/jianlian/ops
install -m 755 -o root -g root \
  "$RELEASE/scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs" \
  /opt/jianlian/ops/liuhaoyi-alipay-recharge-recovery.mjs
```

仓库中的 unit 模板：

- `ops/systemd/jianlian-liuhaoyi-recovery.service`
- `ops/systemd/jianlian-liuhaoyi-recovery.timer`

本次提交不会复制 unit、执行 `daemon-reload`、启动 service 或启用 timer。

## 安全输出

worker 只输出一行聚合 JSON：处理数、成功恢复数、人工复核数、等待数、查询失败数、
跳过数、错误数、HTTP 状态和耗时。不会输出 Session、Provider URL、Merchant Key、
签名或 Provider 原始响应。

## 失败与竞态

定时器明确使用 `Persistent=false`，服务器恢复后不会补跑停机期间错过的资金任务；oneshot 服务设有 5 分钟启动超时，避免任务重叠堆积。

- 单笔查询/处理失败由 reconciliation batch 隔离，不中止其余候选。
- callback 先完成时，重新读取的 Session 或候选过滤会跳过已支付记录。
- worker 先完成时，callback 走已有 paid 幂等路径。
- 两者并发时，`complete_payment_session` 的行锁、充值完成幂等分支及充值 Ledger 唯一性
  保证本金最多入账一次。
- 任何一层已经过期都只记录 `provider_paid_local_unpaid/manual_review`，不自动入账。
