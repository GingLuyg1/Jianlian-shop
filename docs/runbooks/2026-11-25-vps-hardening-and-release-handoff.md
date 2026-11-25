# 2026-11-25 简链商城（jianlian.shop）回家接续执行与服务器加固交接清单

> 本文件用于跨设备（公司 → 家里电脑）无缝接续。**不含任何密钥、密码或源站真实 IP**。

---

## 一、已完成并生效的事项

### 1. Cloudflare 控制台（线上已实测生效）
- **SSL/TLS 模式**：已设为 `Full (strict)`（完全严格）。
- **DNS 橙云代理**：`jianlian.shop`（A）与 `www.jianlian.shop`（CNAME）均已开启 **已代理（橙云）**；MX / SPF / DKIM / DMARC / Resend 邮件记录均原样保留。
- **WAF 安全规则（全部 Active 生效）**：
  1. `Block Sensitive Probes`：拦截 `.env` / `.git` / `.map` / `wp-admin` / `wp-login` / `phpmyadmin` / `xmlrpc.php` → `Block`（实测 `/.env` 已在 CF 边缘返回 403）。
  2. `Protect Admin Portal`：`/admin` 与 `/api/admin` → `Managed Challenge`（托管质询）。
  3. `Block Scanner UAs`：拦截 `sqlmap / nikto / nmap / dirsearch / masscan / zgrab / acunetix`，明确放行 `/api/payments/callback` 支付回调 → `Block`。
  4. `Rate Limit Sensitive APIs`：`/api/orders` `/api/coupons` `/api/recharges` `/login` `/register` 同 IP 每 10 秒超 15 次 → `Block` 10 秒。
- **Bot Fight Mode**：保持关闭（防止误杀第三方支付网关回调）。

### 2. 代码库已提交并推送到 GitHub `main`
- **提交 `3f6e0ca`**：
  - 全新优惠券系统（`supabase/migrations/20261125030000_coupons_system.sql` + 原子行锁 RPC + 严格 RLS 防脱库 + 限流防猜码 + 结算页实时立减 + 后台 `/admin/coupons` 管理面板与快捷批量发券按钮）。
  - 后台控制台 1–2 秒聚合缓存接口（`/api/admin/dashboard/summary`，30s 缓存）。
  - 代码层安全加固：`next.config.js` 关闭 `productionBrowserSourceMaps` 和 `poweredByHeader`，补齐安全头；`middleware.ts` 404 拦截 `.map/.env/.git/wp-admin` 等扫描。
  - 已批复的 UI 修复（UI-1 商品表、UI-2 数字库存表、UI-3 表头不折行、UI-5 数字账号标题 `shrink-0`、UI-6 手机端悬浮客服留白与教程顶栏渐变、决策 1A 隐藏推广中心、决策 2A 按钮文案「正在核对余额...」、决策 3A 控制台提速）。
  - 6 项后端隐性修复（`site_notifications` 表名修正、30+ 后台审计中文字典、结算页余额读取竞态、充值页记录预热、低库存查询去重优化、供应商发货失败日志）。
- **提交 `d962f9c`**：
  - 修复 Google Search Console 商家信息结构化数据 3 项警告（`lib/seo.ts` 补齐 `validFrom`、`shippingDetails`、`hasMerchantReturnPolicy`）。
  - 注：`aggregateRating` / `review` 属于非严重提示，站内暂无真实买家评价系统，严禁造假，保持不填。

---

## 二、回家后按顺序执行的 4 件事

### 步骤 1：VPS 防火墙 UFW 锁死 80/443 仅放行 Cloudflare IP（最重要！）
> 原因：之前曾短时间灰云解析，必须锁死防火墙防止攻击者绕过 Cloudflare 直打源站 IP，同时封死外网直连 `3001/3002`。

```bash
# 0. 先检查当前监听端口
ss -tulpn | grep -E ':(3001|3002|80|443|22)\b'

# 1. 初始化 UFW（务必先放行你的 SSH 端口！如果改过端口请把 22 替换为实际 SSH 端口）
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp

# 2. 仅允许 Cloudflare 官方 IPv4 / IPv6 段访问 80 和 443
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do
  ufw allow from "$ip" to any port 80,443 proto tcp
done
for ip in $(curl -s https://www.cloudflare.com/ips-v6); do
  ufw allow from "$ip" to any port 80,443 proto tcp
done

# 3. 明确禁止外网直连 Next.js 端口
ufw deny 3001/tcp
ufw deny 3002/tcp

# 4. 启用并核对规则
ufw --force enable
ufw status numbered
```

### 步骤 2：Nginx 隐藏版本号 + 还原 Cloudflare 真实 IP + 限流 + 锁 `.env.local` 权限
1. 在 `/etc/nginx/nginx.conf` 的 `http { ... }` 中加入：
```nginx
server_tokens off;

# 还原 Cloudflare 真实访客 IP，避免限流误封 Cloudflare 节点
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;

limit_req_zone $binary_remote_addr zone=api_general:20m rate=15r/s;
limit_req_zone $binary_remote_addr zone=api_sensitive:20m rate=3r/s;
limit_conn_zone $binary_remote_addr zone=conn_per_ip:20m;
limit_req_status 429;
```

2. 在站点 `server { ... }` 中加入（保留原有 SSL 与反向代理配置）：
```nginx
client_max_body_size 10m;
client_body_timeout 15s;
client_header_timeout 15s;
keepalive_timeout 30s;
limit_conn conn_per_ip 40;

location ~* (\.env|\.git|\.svn|\.htaccess|\.DS_Store|\.map$|wp-admin|wp-login|xmlrpc\.php|phpmyadmin) {
    return 444;
}

location ~* ^/api/(orders|coupons|recharges|payments/session|auth) {
    limit_req zone=api_sensitive burst=8 nodelay;
    proxy_pass http://127.0.0.1:3001;
    include proxy_params;
}
```

3. 验证并重载 Nginx + 锁死环境变量权限 + 启用 Fail2ban：
```bash
nginx -t && systemctl reload nginx
chmod 600 /www/jianlian-shop/.env.local
chown root:root /www/jianlian-shop/.env.local
apt-get update && apt-get install -y fail2ban && systemctl enable --now fail2ban
```

### 步骤 3：执行优惠券数据库迁移 + 部署最新代码到 VPS
1. 在 Supabase SQL Editor 执行仓库内的：`supabase/migrations/20261125030000_coupons_system.sql`。
2. 在 VPS 拉取最新 `main` 并使用 `scripts/production-release.sh` 完成构建与发布。
3. 上线后登录后台 **`https://www.jianlian.shop/admin/coupons`**（订单与交易 → 优惠券管理）：
   - 点快捷按钮 **`+ 5 张 ¥10 券`**（无门槛、实付最低 ¥0.01、永久有效、每张 1 次）→ 生成并导出 TXT；
   - 点快捷按钮 **`+ 100 张 ¥1 券`**（同上规则）→ 生成并导出 TXT / CSV。
4. 去 Google Search Console 对「商家信息结构化数据」点击 **验证修复**。

### 步骤 4：可选 — 接入 Cloudflare Turnstile 人机验证
- 在 Cloudflare Turnstile 创建好 `jianlian-shop` 小部件（域名 `www.jianlian.shop` + `jianlian.shop`，模式 `Managed`）后：
  - 将公开 `Site Key` 写入 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`；
  - 将 `Secret Key` 仅写入 VPS `/www/jianlian-shop/.env.local` 的 `TURNSTILE_SECRET_KEY`（绝不提交到 Git）；
  - 回家让电脑拉取最新仓库后，即可在登录 / 注册 / 下单 / 优惠券校验中按需接入前端小部件与服务端 `siteverify` 校验。
