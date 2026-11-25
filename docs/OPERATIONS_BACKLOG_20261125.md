# 运维与功能变更备忘（2026-11-25）

## 1. 生产环境变量变更记录（已获用户明确授权）
- **变更项**：`/www/jianlian-shop/.env.local` 中 `USDT_AMOUNT_SCALE` 由 `6` 调整为 `4`
- **影响范围**：新创建的商城 USDT-BEP20 / TRC20 链上支付单与账号充值单统一使用 4 位小数向上取整金额；历史已生成的支付单保留数据库内已锁定的快照金额，完全向后兼容。
- **回滚方式**：将 `/www/jianlian-shop/.env.local` 中 `USDT_AMOUNT_SCALE` 改回 `6` 并执行 `pm2 reload jianlian-shop` 即可。

## 2. Cloudflare 后台防护优化待办（计划次日实施）
- **现状问题**：管理员访问 `/admin` 时频繁触发 Cloudflare Managed Challenge（主因：代理出口 IP 轮换导致 `cf_clearance` 失效 + 后台多并发 `/api/admin/*` 请求及长内容 POST 触发 Bot Fight Mode / WAF 误报）。
- **推荐落地方案**：
  1. 在 Cloudflare Zero Trust → Access → Applications 为 `www.jianlian.shop/admin*` 启用邮箱 OTP / Google 登录策略（有效期 24h–7d），兼顾零弹窗体验与高强度边界防护。
  2. 在 Cloudflare Security → WAF → Custom Rules 为已通过 Access 的 `/admin*` 请求跳过 Bot Fight Mode 误杀。
  3. 管理员本地代理为 `www.jianlian.shop` 配置单节点固定出口规则，避免 IP 漂移。

## 3. TRON Network（TRC20）支付闭环开发与上线记录
- **收款地址（用户提供）**：`TL4aGps8PX8khNXZwm7wCx4YAbmdu6qgBU`（仅收款地址，非私钥，亦非 TronGrid API Key）
- **USDT-TRC20 合约地址**：`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`（6 位精度，19 块固化确认）
- **目标能力**：完整支持账号充值第 4 张卡（USDT-TRC20）与商城双链收银台（BEP20 / TRC20），通过离线单测 + 主网只读解析 + 小额实链充值闭环验证后再开放渠道。
