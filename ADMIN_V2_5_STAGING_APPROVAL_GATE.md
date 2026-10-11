# Jianlian Shop V2.5 独立预发布审批门禁

日期：2026-10-11（Asia/Shanghai）

## 推荐承载方案

优先使用独立预发布主机或独立容器/VM；只有在完成现有服务器只读资源盘点且容量充足时，才考虑同机独立实例。同机方案必须使用独立 Unix/Windows 服务账户、目录、端口、PM2/服务名、日志、Nginx vhost 和测试 Supabase 配置，不能复用 Production 进程或环境文件。

当前会话没有现有服务器 SSH/控制台访问，因此 CPU、内存、磁盘、inode、Nginx、PM2 和端口占用尚未获得真实证据。现阶段不能宣称已有合适承载环境；这项只读盘点是部署批准前置条件。

## 建议拓扑

1. 独立域名，例如 `admin-staging.<domain>`，HTTPS。
2. 网络层 IP allowlist、VPN 或 Basic Access Gate，加应用内测试管理员双重控制。
3. 独立测试 Supabase `czuoivbfxzachiobdohw`；只使用该项目 publishable/anon 与服务端 secret，绝不复制 Production key。
4. 支付渠道全部 disabled；不配置真实 merchant/provider、回调、邮件、短信、Worker、Cron、自动发货或生产通知。
5. `X-Robots-Tag: noindex, nofollow, noarchive`，同时提供 robots 禁止抓取；网络访问控制仍是主防线。
6. 服务端 secret 仅注入服务器进程，不使用 `NEXT_PUBLIC_` 前缀，不进入构建产物、日志或仓库。
7. 独立日志与错误监控，日志字段脱敏，不记录 Cookie、Authorization、密钥、完整订单号或用户敏感信息。

## 部署前只读资源盘点

- CPU 核数及 1/5/15 分钟负载。
- 可用内存、swap、磁盘空间与 inode；构建和回滚包需预留空间。
- `ss/netstat` 端口占用及 PID 归属。
- PM2/systemd/Windows Service 进程名、工作目录和重启策略。
- `nginx -t` 及脱敏后的 vhost/证书规划；不直接输出可能含 secret 的完整配置。
- 当前 Production 峰值资源及至少一个 RC 实例的预算。

建议最低起点为 2 vCPU、4 GiB RAM、10 GiB 可用磁盘；这只是规划值，不替代真实盘点。若与 Production 同机，必须确认在生产峰值后仍保留足够余量，并为 Node/构建设置内存和进程限制。

## 可执行发布顺序（需另行授权后才执行）

1. 只读盘点服务器与 Production schema 兼容性。
2. 创建独立预发布运行账户、目录、端口和访问控制。
3. 注入测试项目环境变量，运行安全门禁脚本；确认项目 ID、Auth 和全部支付渠道关闭。
4. 在测试项目安装经批准的候选 SQL；核验 ACL、超时和函数签名。
5. 构建 RC commit，启动独立实例；检查静态资源、登录、401/403 和健康状态。
6. 真实测试管理员执行三日期控件、商品分页/排序/趋势、错误状态和三尺寸 smoke。
7. 观察查询时延、数据库负载、Node 内存、错误率及 8 秒超时。
8. 形成预发布验收签字；Production 迁移与部署仍需新的单独批准。

## 回滚与移除

- 应用：停止独立 staging 服务并切回/移除 staging vhost，不触碰 Production 进程。
- 数据库：候选函数仅位于测试项目；必要时在测试项目撤销 EXECUTE 或删除候选函数。Production 未安装，无 Production 回滚动作。
- 凭据：撤销 staging 专用测试 secret，清理仅 staging 的环境注入和日志；不得删除测试项目业务证据。
- 触发条件：越权访问、任何 Production 连接、外部支付/通知触发、统计不完整被显示为正常、持续超时/高负载、关键金额对账失败。

## 审批状态

| 门禁 | 状态 |
|---|---|
| RC 安全审阅、typecheck、build、专项测试 | 通过 |
| RC 真实管理员关键 HTTP | 通过 |
| 独立测试库函数 ACL 与口径 | 通过 |
| 现有服务器真实资源盘点 | 未验证 |
| 独立预发布域名/HTTPS/网络访问控制 | 待批准 |
| 预发布实例创建与环境注入 | 待批准 |
| Production SQL/migration | 未批准、未执行 |
| Production 规模性能 | 未验证 |
| 真实手机设备 | 延期、未验证 |

## 用户下一步需批准

1. 只读查看目标服务器的资源、端口、PM2/systemd 与 Nginx 健康信息。
2. 选择独立主机/容器，或在资源盘点通过后批准同机独立实例。
3. 批准创建 staging 域名、HTTPS、网络访问控制和独立服务。
4. 批准只向 staging 注入测试项目密钥并安装测试项目候选 SQL。
5. 预发布通过后，再单独批准 Production schema 兼容性检查、数据库迁移和应用部署；三项不能由本报告自动授权。
