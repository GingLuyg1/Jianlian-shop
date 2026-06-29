# 支付自动对账定时任务配置

## 执行接口

`POST /api/internal/payments/reconcile`

该接口只用于服务器内部定时任务或受控运维调用，不应从浏览器直接调用。

## 认证方式

请求头二选一：

```http
x-payment-reconciliation-secret: <PAYMENT_RECONCILIATION_SECRET>
x-internal-secret: <INTERNAL_API_SECRET>
```

优先使用 `PAYMENT_RECONCILIATION_SECRET`。缺少密钥或密钥不匹配时接口返回 `403`。

## 请求体

```json
{
  "batchSize": 50,
  "dryRun": false
}
```

单笔重查：

```json
{
  "paymentSessionId": "支付会话 UUID",
  "dryRun": true
}
```

## 推荐频率

- 常规生产：每 5 分钟执行一次。
- 交易高峰：每 2 分钟执行一次，`batchSize` 控制在 50 以内。
- Provider 限流严格时：每 10 分钟执行一次，避免高频查询。

## curl 示例

```bash
curl -X POST "https://www.jianlian.shop/api/internal/payments/reconcile" \
  -H "content-type: application/json" \
  -H "x-payment-reconciliation-secret: ${PAYMENT_RECONCILIATION_SECRET}" \
  -d '{"batchSize":50,"dryRun":false}'
```

## Crontab 示例

不要把真实密钥写进命令。建议使用服务器环境变量文件或受限脚本读取。

```cron
*/5 * * * * /usr/bin/curl -fsS -X POST "https://www.jianlian.shop/api/internal/payments/reconcile" -H "content-type: application/json" -H "x-payment-reconciliation-secret: ${PAYMENT_RECONCILIATION_SECRET}" -d '{"batchSize":50,"dryRun":false}' >> /var/log/jianlian-payment-reconcile.log 2>&1
```

## PM2 示例

```js
module.exports = {
  apps: [
    {
      name: "jianlian-payment-reconcile",
      script: "curl",
      args: "-fsS -X POST https://www.jianlian.shop/api/internal/payments/reconcile -H content-type:application/json -H x-payment-reconciliation-secret:${PAYMENT_RECONCILIATION_SECRET} -d {\"batchSize\":50,\"dryRun\":false}",
      cron_restart: "*/5 * * * *",
      autorestart: false
    }
  ]
}
```

## systemd timer 示例

`jianlian-payment-reconcile.service`：

```ini
[Unit]
Description=Jianlian payment reconciliation

[Service]
Type=oneshot
EnvironmentFile=/etc/jianlian-shop.env
ExecStart=/usr/bin/curl -fsS -X POST https://www.jianlian.shop/api/internal/payments/reconcile -H content-type:application/json -H x-payment-reconciliation-secret:${PAYMENT_RECONCILIATION_SECRET} -d {"batchSize":50,"dryRun":false}
```

`jianlian-payment-reconcile.timer`：

```ini
[Unit]
Description=Run Jianlian payment reconciliation every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

## 日志位置

- 接口响应：只返回处理数量、分类统计和脱敏错误摘要。
- 数据库运行记录：`payment_reconciliation_runs`
- 单次运行错误摘要：`payment_reconciliation_logs`
- 服务器日志：建议写入 `/var/log/jianlian-payment-reconcile.log`

## 失败排查

1. 返回 `403`：检查 `PAYMENT_RECONCILIATION_SECRET` 或 `INTERNAL_API_SECRET`。
2. 返回 `429`：已有对账任务正在执行，等待下一轮。
3. Provider 未配置：不会伪造结果，对应记录进入 `query_failed` 或跳过。
4. 金额或币种不一致：不会自动补偿，进入人工复核。
5. migration 未执行：接口仍可执行，但运行记录表不可写，请先执行 `20260629_payment_reconciliation_runs_logs.sql`。

## 安全注意事项

- 不要把密钥写入前端代码、Git、Nginx 配置注释或公开日志。
- 不要从浏览器直接调用内部对账接口。
- 不要把 Provider 原始响应完整写入日志。
- 不要在 Provider 未接入时伪造支付成功。
- 不要通过该接口实现人工强制改为已支付。
