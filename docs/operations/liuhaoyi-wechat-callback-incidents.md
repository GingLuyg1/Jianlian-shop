# 六号易微信 callback 未到达：两笔 Production 事故

记录日期：2026-09-17。本文只记录脱敏、已核实的事实；不包含商户密钥、签名、完整交易号或完整回调 URL。

| 项目 | 第一笔 | 第二笔 |
| --- | --- | --- |
| Session | `PS20260916164240NS38KH` | `PS20260917025943GVBASP` |
| 六号易订单查询 | 已付款，`wxpay`，¥1.00，与本地金额一致 | 已付款，`wxpay`，¥1.00，与本地金额一致 |
| Provider 付款时间 | 在本地有效期内 | 2026-09-17 11:00:44 +08:00，在本地 11:29:43.339 +08:00 截止前 |
| 自然 callback | Nginx 0 次，应用 0 次，本地 initially pending | Nginx 0 次，应用 0 次，本地 initially pending |
| 单会话 dry-run | eligible / would_complete | eligible / would_complete |
| 受控单会话 recovery | 用户单独授权后执行一次 canonical `--execute`，成功 | 用户单独授权后执行一次 canonical `--execute`，成功 |
| 最终账务 | ledger 恰好 1 条，余额 24.00 → 25.00 | ledger 恰好 1 条，余额 25.00 → 26.00 |

已知：六号易订单查询确认两笔收款；本站在自然 callback 等待窗口内未见 Nginx 或应用入口请求；两笔经现有单会话 recovery 完成并仅入账一次。

未知：六号易为何未成功向本站投递这两次 server-to-server 通知。`Nginx 0 次` 只能说明没有在被检查的本站 access log 中看到请求，不能证明 provider 未尝试发送，也不能单独定位 provider 出口、网络、CDN、TLS 或服务器入口故障。不得将浏览器打开 callback URL 的成功视作 server-to-server 链路成功。

## 下一次故障的安全证据顺序

1. 保留 session、recharge、ledger 和 callback log 的只读基线；不要先触发重通知。
2. 对已知 session 使用服务端六号易订单查询，仅输出 found/paid/type/amount/付款时间与交易号存在性。严禁记录完整带 key 的查询 URL。
3. 对同一时间窗分别看 Nginx access/error log、应用结构化 callback 日志、数据库 callback log。只输出路径、状态和 request ID，不输出完整 query 或 `sign`。
4. 只有再次取得用户授权后才执行单会话 recovery；自动 watcher 上线需要单独审批、试运行、审计和启用流程。

## 待修的运维可观测性

当前 Production Nginx `main` access log 使用 `$request`，会包含 GET callback 的 query；配置中未观察到显式传递 `X-Request-ID`。应用会生成或接受安全格式的 request ID，并在结构化日志和响应头中输出，但 Nginx 与应用日志尚不能可靠以同一个 ID 关联。另行审批的 Nginx 变更应使用不含 query 的 `$uri` 记录 callback 路径、记录 `$request_id`，并设置 `proxy_set_header X-Request-ID $request_id`。本轮不修改 Nginx。
