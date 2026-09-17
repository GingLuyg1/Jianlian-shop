# 六号易支付运维手册

本手册覆盖 Jianlian Shop 的六号易支付宝/微信支付创建、展示、回调诊断和异常处置。它不构成任何 Production 写操作授权，不包含真实密钥、密码、令牌、Cookie 或完整签名 URL。

## 1. 渠道启用与关闭

- 启用前必须确认目标应用 release、数据库 migration、五个 `LIUHAOYI_*` 变量存在性、provider readiness 和 callback 路由。
- 一次 canary 只开放一个渠道。创建唯一测试单后立即关闭该渠道，再允许用户付款。
- 关闭渠道只禁止创建新 payment session；已创建且仍有效的 session 必须可以展示、查询状态并接收合法 callback。
- 回调验证以 provider identity、configured 配置、签名、session 渠道、币种和金额为准，不以当前 `enabled` 为准。
- 关闭渠道后要只读确认：支付宝、微信和 USDT-BEP20 的 `enabled/configured` 状态符合预期。

## 2. PC 支付行为

- `payurl`：用户创建成功后可直接跳转到 provider 收银台。
- `qrcode`：留在 Jianlian `/payment` 页面，本地生成二维码；不得把 payload 当作 `<img src>`，也不得调用第三方二维码服务。
- `urlscheme`：保持 deep-link 语义，只能由用户主动点击。
- 微信二维码文案为“请使用微信扫一扫完成支付”；支付宝对应支付宝扫码。

## 3. 手机支付行为

- 服务端只根据 User-Agent 派生有限枚举：普通手机 `mobile`、微信内 `wechat`、支付宝内 `alipay`、其他 `pc`。不接受客户端任意指定 provider device。
- `payurl` 可在本次用户支付动作后跳转。
- `qrcode` 仍是二维码 payload。移动端可以显示“打开微信支付/打开支付宝支付”主按钮，但必须由用户点击，并保留本地二维码 fallback。
- `urlscheme` 只由用户点击触发；页面 load 不自动反复拉起。
- `/payment?recharge=...` 和 `/payment?order=...` 是状态/返回/fallback 页面，不把 return URL 当支付证据，也不在加载时自动重新发起支付。
- 手机系统不保证支付完成后自动回到原浏览器；是否入账始终以异步 callback 或另行批准的恢复流程为准。

## 4. Callback 验证

逐项核对：

1. Nginx 是否收到 `/api/payments/callback/alipay` 或 `/api/payments/callback/wechat`。
2. 方法、HTTP 状态和响应正文；六号易成功确认应为 HTTP 200、纯文本 `success`。
3. `payment_callback_logs` 的 channel、received time、signature result、process result、HTTP result。
4. `out_trade_no` 必须匹配 session number，provider type 必须匹配渠道，金额与币种必须精确匹配。
5. session、业务单、ledger 和余额只读核对；重复 callback 允许记录多条日志，但不得重复完成或入账。

当前可观测性限制：callback log 没有独立 request ID，provider 也不是单独列，session number 只在解析摘要中出现；若初始日志写入失败，PM2 只有通用错误，不能稳定串联 Nginx、应用和数据库。后续可单独设计纯可观测性补丁，但不得混入资金行为变更。

## 5. Provider 查询诊断

- 只从 Production 进程环境读取商户配置，不在命令参数、URL 输出、日志或临时文件中显示 key。
- 查询结果只报告 found/status/type/amount、交易号是否存在以及脱敏时间。
- 必须核对 `out_trade_no=session_no`、type、金额、币种和 provider paid time。
- provider 未确认 paid 时禁止补偿；provider 已 paid 但本地 pending 时继续检查 callback ingress，并保存证据。

## 6. 重复 Callback

- 已 paid session 的 callback 返回 duplicate success。
- `complete_payment_session` 与订单/充值完成 RPC 依赖数据库行锁和 paid 幂等返回。
- 交付层按已交付数量、交付记录和库存状态计算剩余量；重复调用不得重复库存交付或供应商采购。
- 每次复核都要确认 ledger 数量、余额差值、订单支付日志与 fulfillment 数量。

## 7. 过期订单

- `expires_at <= now()` 后不显示扫码/移动打开按钮，不创建或重新打开旧 session。
- provider 在本地过期后才确认 paid：保持 session/recharge expired，记录 `provider_paid_local_unpaid` 与 manual review，不自动 credit、complete 或 fulfillment。
- 用户侧提示联系客服并提供业务单号。不得 backfill、force paid 或 refund。

## 8. Provider 已付、本地 Pending

1. 立即关闭对应渠道，阻止新单。
2. 保存 session/recharge、余额、ledger、callback log 与 Nginx/PM2 日志基线。
3. 只读查询 provider，核对 type、amount、out trade number 和 paid time。
4. 若 callback 未到 Nginx，归类为 provider 到 ingress 之前；若到达，再按 HTTP/TLS/Nginx/app/DB 分层诊断。
5. 未取得单独授权前，不执行官方重发、recovery、manual credit 或数据库更改。

## 9. Recovery 禁止事项与微信方案

现有恢复模式只适用于六号易支付宝账户充值，不能用于微信。

微信恢复若后续获批实现，必须是新的 `wechat recharge only` 模式，并满足：

- `provider=liuhaoyi`、`channel=wechat`、business type 为 recharge，session/recharge 用户与业务 ID 一致；
- provider query 明确 found + paid，type 为 `wxpay`，币种 CNY，金额精确匹配，out trade number 与 session number 匹配；
- provider trade number 存在且不与其他 session 冲突；
- provider paid time 必须不晚于 session 与 recharge 的本地 expiry；晚付只保存 reconciliation evidence/manual review；
- 默认 dry-run，真实模式必须显式 `execute === true`；支持单 session canary，并设置批次上限、最小 callback grace period 和并发锁；
- completion 只能调用现有原子 RPC，保持重复调用幂等；不得历史 backfill；每次执行保留脱敏审计摘要。

当前只完成设计，未实现或启用微信 recovery。

## 10. Production Canary 清单

1. 记录余额、recharge/session/ledger/reconciliation 数量和渠道状态。
2. 只开放目标渠道，创建一张 ¥1 新单后立即关闭。
3. PC qrcode 必须留在 Jianlian 并本地渲染；移动 qrcode 只能用户主动点击打开。
4. 支付后等待自然 callback，不主动请求 callback URL。
5. 核对 session/recharge paid、provider order/transaction ID 存在、paid/completed time 存在。
6. 余额仅增加 ¥1，ledger 恰好一条；provider 侧可能额外收取通道手续费，不得加入本站本金。
7. 再确认渠道关闭以及 USDT-BEP20 状态未改变。

## 11. Deployment

- 只部署已经 push、测试和 build 通过的明确 commit；Migration、环境变量与渠道状态分别设置 gate。
- 使用 `scripts/production-release.sh` 的 prepare/build/smoke/switch 流程及 marker、env mode 和临时端口检查，不另造发布命令。
- switch 后有界轮询 PM2 online、`/proc/<pid>/cwd`、`pm_cwd`、`pm_exec_path` 与 health；再检查首页、登录、充值、付款页和 payment channels API。
- 部署期间保持支付宝/微信关闭；应用健康、callback manifest 和环境变量 presence 核验完成后，渠道 canary 必须另行授权。
- 发布不自动执行 Migration、recovery、callback replay 或真实支付。

## 12. Rollback

- 应用发布失败时只使用 `scripts/production-release.sh` 的既有 release/rollback 流程。
- 切换前记录 current release；切换后有界轮询 PM2 PID、cwd、exec path 和 health。
- 只有超时或回归才回滚；不得临时发明 `pm2 delete/start` 流程。
- 数据库 migration 与应用 rollback 分开判断。forward-only migration 不得通过回滚应用来假装撤销。

## 13. Secret 脱敏

- 永不输出 merchant key、签名原文、`sign`、token、Cookie、session 或完整 callback/provider query URL。
- callback payload 摘要过滤 key/secret/sign/token/password/private/credential 等字段。
- Provider 请求错误只返回固定安全错误；不得把 request body、完整响应 payload 或含 key 的 URL写入日志/APM。
- 临时诊断文件必须最小权限并在结束后删除；报告只保留 presence、布尔结果和脱敏标识。
