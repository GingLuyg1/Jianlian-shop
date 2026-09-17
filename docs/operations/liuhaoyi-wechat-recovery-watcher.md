# 六号易微信账户充值 watcher V1（未启用）

本实现只复用已有的单会话微信 recovery API；不自行修改 `profiles`、`balance_transactions`、充值单或支付会话。截止本文更新，未在 Production 安装 timer/cron，未运行 watcher，未开启渠道。

## 默认禁用与运行模式

`scripts/ops/liuhaoyi-wechat-recharge-watcher.mjs` 是一次性运行的编排器，不会自行常驻或调度。没有精确的 `LIUHAOYI_WECHAT_WATCHER_ENABLED=true` 时不查询数据库或 provider；启用后仍默认 dry-run。真实执行同时需要单独的 `LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED=true` 和命令行 `--execute`。这些开关本轮不写入任何 Production env。上线必须经过单独审批和观察窗口，不得因文件存在而自动启动。

一次运行最多读取 20 个候选，限定 `provider=liuhaoyi`、`channel_code=wechat`、`business_type∈{recharge,account_recharge}`、`currency=CNY`、状态 pending/processing/expired。仅检查创建至少 3 分钟的会话；到期后最多 60 分钟可继续**只读诊断**。距本地到期不足 5 秒或已过期时，即使全局执行已启用，也只发送 dry-run。达到 20 个候选时以非零状态明确告警；候选过多需要分页设计和单独上线评审，不得静默认为全量已覆盖。

建议未来由受控、非重叠的 timer 每 3 分钟运行一次，从 `created_at + 3 分钟` 开始给自然 callback 留时间。此 cadence 是建议，不代表本轮安装/启用。每个候选经已有单会话服务再次读取关联充值、唯一 ledger 和六号易订单，并严格核对 owner/business/session、金额、`wxpay`、商户订单号、provider trade no、provider 付款时间与两处到期时间。provider unpaid、时间不明、付款晚于到期、已完成或任何不一致均不得自动入账。真正完成只通过 `completePayment` → 数据库原子 RPC。数据库到期 guard 是最终防线；接近到期的调用可能在 RPC 处失败，必须保留错误并进入人工复核，不得绕开 guard。

## 审计与保密

每次运行输出 JSON 记录：`run_id`、开始时间、运行模式、完成/禁用状态；每个候选输出 session no、时间、dry-run/execute、provider found/paid、type/amount/付款时间匹配布尔值、eligibility、固定 skip reason、completion 和幂等布尔值。它们是运维审计，不是支付凭证或资金决定。当前成功 recovery 不创建 `payment_reconciliations`；V1 复用结构化 stdout/journal，不需要新 DB schema。若需要不可篡改或长期查询的独立审计表，应另行设计 migration 并审批，不能在此任务执行。

不得在 stdout/journal/PM2/数据库错误字段记录 Merchant Key、完整六号易查询 URL、`sign`、内部认证 secret 或完整 provider transaction ID。脚本吞掉原始网络错误，仅输出固定错误类别。日志留存、访问权限、脱敏和容量仍需上线前运维验收。

## 并发与验收

自然 callback、两个 watcher 或 watcher 后的 callback 都走相同 `completePayment` 数据库 RPC。RPC 对支付会话和充值单行加锁，优先对 paid 返回幂等结果；balance 与 ledger 由同一原子函数处理。此保证有本地行为测试和 SQL source-contract 测试，但本轮没有在 Production 制造并发真实支付。启用前仍应做隔离环境并发实测，以及健康、时钟、超时、日志和手动停用演练。

## Callback request ID 与 Nginx

应用 callback 已能从 `X-Request-ID` 读取安全格式 ID，或自行生成 ID 并输出结构化日志和响应头。当前 Production Nginx 未观察到显式 `X-Request-ID` 传递，access log 使用会包含 signed query 的 `$request`。另行评审的配置应给 Nginx 生成 `$request_id`、传入 app、在安全 access log 中只记 `$uri`、状态、耗时与 request ID。不要在本轮修改线上 Nginx。

## 长期开放门槛

微信已有两次 provider paid / 本站 callback 未见的事故，因此 watcher 即便部署也不等于可以长期开放。至少还需解决或明确隔离 callback ingress 故障；证明新 request ID 链路及安全日志；完成 watcher dry-run 观察、并发/幂等与超时演练、受控自动执行和告警。支付宝同样需先完成自身 callback 送达与 recovery 运维验收，不可沿用微信结论。
