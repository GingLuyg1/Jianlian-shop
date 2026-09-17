# 六号易微信账户充值 watcher V2（仅本地模板，未启用）

本轮只修改代码、测试、文档和 systemd 模板。没有安装服务、启用 timer、修改 Production 环境或运行自动入账。Watcher 仅编排现有单会话微信 recovery；资金完成仍是 `completePayment` 和数据库原子 RPC，不直接改余额或 ledger。默认 dry-run；真实模式同时要求 `LIUHAOYI_WECHAT_WATCHER_ENABLED=true`、`LIUHAOYI_WECHAT_WATCHER_EXECUTE_ENABLED=true` 和命令行 `--execute`。这些开关不得因部署自动开启。

## 范围、节奏与容量

只读候选查询精确限定 `provider=liuhaoyi`、`channel_code=wechat`、`business_type=recharge`、`currency=CNY`、`status=pending`、`created_at <= now-60s`、`expires_at > now`。不扫描 processing、expired、paid、Alipay、USDT 或商城订单。自然 callback 有至少 60 秒优先机会。建议 timer 每分钟一次，但本轮不安装。

每批最多 4 单：3 个最新 eligible 会话 + 1 个按分钟轮转的旧 backlog 会话。正常负载下，新会话在满 60 秒后的 1–2 个调度周期内进入最新优先位；当每分钟持续超过 3 个新 eligible 会话时，不能保证该时延，应以 `backlog_present` 和 `remaining_count` 告警并暂停扩容上线。PostgREST `Prefer: count=exact` 必须返回总数；缺失计数时 fail closed。两次读取之间候选数量变化时，仅放弃不稳定的旧单轮转位、记录 `scan_changed`，仍检查已读取的 3 个最新候选。本轮不新增 next_check_at 或 migration。

候选读取各 4 秒超时、六号易单笔查询 6 秒超时、单会话内部 API 8 秒超时；每批最多 4 单，且有 45 秒 systemd 硬上限。单会话超时/网络错误只记录固定安全原因，下一轮再查，不推断支付成功。内部 API timeout 只限制 watcher 调用；服务端数据库事务可能比 HTTP 客户端超时晚结束，最终仍由数据库锁、到期 guard 和幂等约束保证一次入账。因此不能把客户端 timeout 当作事务回滚凭据。

结构化 stdout/journal 输出 `run_id`、`session_no`、安全原因、耗时，以及 `eligible_count`、`processed_count`、`paid_found_count`、`completed_count`、`skipped_count`、`timeout_count`、`remaining_count` 和 `backlog_present`。不输出 MerchantKey、带 key 的查询 URL、签名或完整 provider 交易号。此服务不经 PM2；若启用，日志进入 systemd journal。上线前仍应核查实际 journald 保留/权限及任何外部 APM/HTTP 客户端采集器，不得记录请求 URL/query。

## 入账安全门禁

单会话 recovery 重新读取 session、recharge、已完成 ledger，并按 session pinned provider 查询六号易。必须同时满足 provider/微信充值/CNY、订单与用户归属、1:1 session-business 匹配、金额、wxpay、provider trade no、out_trade_no、本地 pending、ledger=0、provider paid time 在两处 expiry 内，才调用 canonical completion。provider unpaid、金额/渠道不符、交易号缺失、超时、5xx、错误 JSON、晚到账都不自动 credit。已 callback 入账的会话在候选读取或 recovery 复查时跳过。过期时数据库最终 guard 拒绝 completion；异常走原有人工核对，不绕过。

Callback 与 watcher、两个 watcher、以及任意先后顺序的重复完成都共享带行锁的原子 RPC 和唯一 ledger 约束。本地有行为模拟和 SQL source-contract 测试；**尚无隔离 PostgreSQL 真并发实测**，它是自动执行上线前的验收门槛。

## systemd 模板与互斥锁

独立文件：`ops/systemd/jianlian-liuhaoyi-wechat-recovery.service`、`ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer`。不复用支付宝单元。oneshot `TimeoutStartSec=45s`，timer `OnUnitActiveSec=1min`、`Persistent=false`。service 通过 `flock -n -E 0 /run/lock/jianlian-liuhaoyi-wechat-recovery.lock` 获取专用进程锁；`ReadWritePaths` 只开放锁目录。手工直接执行 Node 脚本时，入口会通过同一把 flock 锁重新启动自身；拿不到锁正常退出，不扫描订单。内部路由的进程级 `running` 只是附加保护，不代替 OS 锁。内部 `--watcher-lock-held` 标记只供锁包装后的子进程使用，不是人工运行参数，也不是恶意本机操作者的权限边界。

上线前需单独审核并配置仅 root 可读的 `/etc/jianlian/liuhaoyi-wechat-recovery.env`，包括 `JIANLIAN_NODE_BINARY` 的真实绝对路径、`JIANLIAN_RELEASE_DIR` 的 active immutable release、现有 Supabase/internal API 凭据及两个 watcher 开关；不能把 env 内容加入 Git。确认 `/usr/bin/flock`、Node 路径、release 路径、loopback API 地址、权限和健康后，才可由用户另行授权安装/启用。模板本身不会启动。手动运行时应复用 service 的 `ExecStart` 所示锁路径及环境，避免错用未锁命令。

立即停用命令（仅以后获得授权上线时使用）：

```sh
systemctl disable --now jianlian-liuhaoyi-wechat-recovery.timer
systemctl stop jianlian-liuhaoyi-wechat-recovery.service
```

停 watcher 不影响自然 callback、USDT 或网站。没有 schema rollback。长期开放前需要先完成 dry-run 观测、锁竞争演练、隔离数据库真并发/到期测试、provider 超时测试、日志保密检查和一笔受控 ¥1 canary；不能把“模板就绪”解释为 Production 自动执行已安全开启。
