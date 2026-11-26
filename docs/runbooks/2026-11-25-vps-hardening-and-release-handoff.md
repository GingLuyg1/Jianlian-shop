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

---

## 三、代码层安全防护待办任务（2026-11-26 前后端全量审计补充）

> 说明：以下为基于当前仓库源码核实后的纵深防护待办项（均不含任何攻击载荷或敏感密钥），后续按 P0 → P1 → P2 分批修复并回归测试。

### P0 — 优先修复（上线拉新前建议先补齐）
- [ ] **P0-1 修复 Cloudflare 场景下的真实 IP 识别与限流绕过**
  - 涉及文件：`lib/security/rate-limit.ts`（L63-81、L226-241）、`lib/payments/request-client-ip.ts`（L5-16）、`app/api/analytics/page-view/route.ts`（L89-93）
  - 加固方案：统一抽离 `getTrustedClientIp(request)` 优先读取经 `isIP()` 校验的 `cf-connecting-ip`（不再优先信任最左侧 `x-forwarded-for`）；限流桶 key 去掉 `User-Agent` 拼接防止换 UA 绕过；高频核心接口避免 5000 桶 FIFO 淘汰（改为最短 TTL/LRU 或持久存储）。
- [ ] **P0-2 加固或清理遗留 `/api/v1/**` 接口**
  - 涉及文件：`app/api/v1/orders/[orderNo]/route.ts`（L20-33、L49-53）、`app/api/v1/products/[identifier]/route.ts`（L18-24、L49-53）、`app/api/v1/products/route.ts`、`app/api/v1/user/assets/route.ts`
  - 加固方案：`/api/v1/orders/[orderNo]` 补齐未登录 `401` + `.eq("user_id", user.id)` + 限流（或确认无外部调用后直接下线，统一走 `/api/orders`）；`/api/v1/products/[identifier]` 禁止原样拼接 `.or(...)` 改为校验 UUID/slug 后分查询并限定 `status in ('active','sold_out')`；全量隐藏原始 `error.message`。
- [ ] **P0-3 工单接口防刷、防单行 JSONB 挤掉他人记录与图片白名单校验**
  - 涉及文件：`app/api/tickets/route.ts`（L44-95）、`lib/tickets/server.ts`（L20-44、L140-186）、`app/admin/tickets/page.tsx`（L677-726）
  - 加固方案：短期补齐 `POST /api/tickets` 按用户限流 + 请求体上限（如 3–4 MB）、`sanitizeImages` 严格限制 `^data:image/(png|jpeg|webp);base64,`（单张 <= 1 MB、最多 3 张）并复用 `toSafeTicketError` 屏蔽内部报错；中期将工单从 `site_settings` 单条 JSONB 迁移至独立关系表（行级 RLS + 对象存储传图）。

### P1 — 高优先级加固
- [ ] **P1-1 优惠券下单回滚 RPC 修正 + 取消/超时自动释放券码 + 防枚举**
  - 涉及文件：`app/api/orders/route.ts`（L521-554、L671-697）、`app/api/orders/[orderNo]/route.ts`（L219-245）、`lib/orders/order-expiration.ts`（L62-92）、`lib/coupons/coupon-service.ts`（L138-169）、`supabase/migrations/20261125030000_coupons_system.sql`（L32、L200-247）
  - 加固方案：将 `app/api/orders/route.ts:685` 不存在的 `cancel_my_unpaid_order` 改为 `cancel_unpaid_order` 并检查 `{ error }`，同时前置校验 `min_order_amount`；在取消订单与超时过期逻辑中调用 `release_order_coupon(order_id)` 防止用户取消未支付订单后券码永久作废，并将 `coupon_redemptions.order_id` 唯一约束改为局部唯一索引（`where status = 'applied'`）；`/api/orders` 传 `coupon_code` 时复用 `coupon_validate` 限流并统一失效错误码/文案。
- [ ] **P1-2 账号安全验证码接口限流与防邮箱轰炸**
  - 涉及文件：`app/api/account/security/send-code/route.ts`（L11-70）、`lib/security/email-code-service.ts`（L14、L43-58、L157）、`app/api/account/security/reset-password-by-code/route.ts`（L59-62）、`app/api/account/security/change-email/route.ts`（L72-75）
  - 加固方案：按 `user.id` + IP 双重限流并限制请求体大小；定时清理 `codeStore` 过期项（或落库并绑定 `user_id`）；验证码改用 `timingSafeEqual` 比对；隐藏 `new_email_verify` 精确枚举与原始 Supabase Auth 报错。
- [ ] **P1-3 后台 93 个写操作 API 统一补齐 CSRF / `Origin` 同源校验**
  - 涉及文件：`middleware.ts`、`lib/admin/api-auth.ts`（L72-136）、`lib/security/rate-limit.ts`（L207-219）
  - 加固方案：在 `middleware.ts` 对 `/api/admin/*` 非 GET 请求及 `enforceAdminWriteGuard` 中统一校验 `Origin` 白名单与 `Content-Type`。
- [ ] **P1-4 支付状态查询接口校验管理员启用状态**
  - 涉及文件：`app/api/payments/status/[sessionNo]/route.ts`（L27-36）
  - 加固方案：改用 `requireApiAdmin()` / `loadAdminAuthorization` 校验 `admin_users.status === 'active'`，避免已禁用管理员凭残留 `profiles.role` 越权查询他人会话状态。
- [ ] **P1-5 消除商品详情接口 50 倍回环请求放大与 Host 头信任风险**
  - 涉及文件：`app/api/catalog/products/[identifier]/route.ts`（L55-83、L137-146）、`app/api/auth/resend-verification/route.ts`（L8-11）
  - 加固方案：移除 `findVisibleProductSlugByCatalogApi`（避免不存在 UUID 触发最多 50 次内部回环 `fetch`）并加读限流；`resend-verification` 改用 `getAuthSiteOrigin()` 替代 `new URL(request.url).origin`。
- [ ] **P1-6 JSON-LD `<script>` 输出转义防存储型 XSS**
  - 涉及文件：`app/products/[id]/layout.tsx`（L105-113）、`app/layout.tsx`（L49-54）
  - 加固方案：抽离 `safeJsonLd()` 转义 `<` `>` `&` `\u2028` `\u2029` 后再写入 `dangerouslySetInnerHTML`。
- [ ] **P1-7 公开表单接入 Cloudflare Turnstile + 收紧 CSP 与 Middleware Matcher**
  - 涉及文件：`components/auth/AuthScreen.tsx`、`app/forgot-password/page.tsx`、`app/order-query/page.tsx`、`next.config.js`（L7-8）、`middleware.ts`（L7、L29、L187）
  - 加固方案：登录/注册/找回密码/查单接入 Turnstile；生产环境 CSP 移除 `cdn.tailwindcss.com` 与 `'unsafe-eval'`、收紧 `form-action` 白名单；修正 `middleware.ts:187` 排除 `map` 导致探测拦截死代码的问题，并限定 `isStaticAssetPath` 绝不匹配 `/api/*` 与 `/admin/*`。

### P2 — 中优先级纵深防御
- [ ] **P2-1 统一 7 个内部任务接口的密钥常量时间比对（`timingSafeEqual`）**
  - 涉及文件：`app/api/internal/data-consistency/route.ts`（L11、L21-23，另补限流并移除 `GET` 暴露 header 名）、`reconcile/route.ts`、`liuhaoyi-alipay-recharge-recovery/route.ts`、`liuhaoyi-wechat-recharge-recovery/route.ts`、`lib/orders/order-expiration.ts`（L177）、`lib/payments/bep20-underpayment-service.ts`（L274）、`lib/recharges/bep20-recharge-scanner.ts`（L92）。
- [ ] **P2-2 未鉴权写/导出接口补请求体上限、限流与文件魔数校验**
  - 涉及文件：`lib/payments/payment-callback-service.ts`（L55-77，验签前限制 64KB 与 IP 限流）、`app/api/analytics/page-view/route.ts`（补限流）、`app/api/account/privacy/route.ts`（按用户限流）、`app/api/recharges/[rechargeNo]/proof/route.ts`（补 JPEG/PNG/WEBP/PDF 魔数校验）、`lib/media/media-service.ts`（L90 移除 `declaredType` 回退）。
- [ ] **P2-3 收敛前端浏览器缓存中的用户敏感字段**
  - 涉及文件：`components/auth/AuthProfileProvider.tsx`（L32、L54-81）
  - 加固方案：移除 `localStorage` 持久化完整 `User`/`UserProfile`，改为仅在 `sessionStorage` 缓存脱敏邮箱与余额等最小 UI 字段。
- [ ] **P2-4 前端外跳支付与第三方授权 URL 协议白名单校验**
  - 涉及文件：`app/checkout/page.tsx`（L1151-1156）、`components/account/AccountRechargeContent.tsx`（L299）、`components/auth/AlternateLoginMethods.tsx`（L53）、`app/payment/page.tsx`（L903、L905、L1662、L1676）
  - 加固方案：封装 `sanitizeExternalUrl()`，仅允许 `https:`（唤起端内支付链接额外允许 `alipays:` / `weixin:`）。
- [ ] **P2-5 生产环境关闭 `?mobilePreview=390` 预览条 + 补全 `rel="noopener noreferrer"`**
  - 涉及文件：`hooks/use-mobile-storefront.ts`（L90-112）、`app/account/api/page.tsx`（L1188-1210）及各教程页外链。
