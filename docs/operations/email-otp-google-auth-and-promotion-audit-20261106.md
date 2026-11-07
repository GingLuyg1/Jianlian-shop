# Jianlian Shop — 邮箱 6 位 OTP / Google OAuth 准备与推广系统核对（2026-11-06）

## 唯一上线目标与安全边界

将当前 Supabase Auth 邮箱密码体系扩展为「邮箱六位验证码登录/注册 + Google 登录」，但**不创建第二套用户数据库**，不删除或重置现有账号、余额、订单、优惠或推广记录。用户表示当前账号是测试账号，不要求旧用户兼容迁移；这**不构成**批准生产数据删除、余额清空或数据库重建。先测试环境验证，再单独上线。

原来的邮箱密码登录/注册保持不变。新入口通过环境变量 **显式关闭**，确保未经 Google/Supabase 配置不会影响当前线上流量：

- `NEXT_PUBLIC_EMAIL_OTP_ENABLED=true`：邮箱验证码入口（默认关闭）
- `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`：Google 入口（默认关闭）

上述开关进入生产前必须通过真实测试环境的邮件送达、认证回调、账号状态检查、推广关系和余额隔离验收。不得仅因 CI 绿色就直接发布或启用。

## 已复用的现有能力

- 现有 `components/auth/AuthScreen.tsx` 邮箱密码登录、注册与邀请注册；
- Supabase SSR browser/server clients 与 `app/auth/callback/route.ts`；
- `public.profiles` 的 `account_status` / `risk_status` 账户禁用/封禁；
- `bind_referrer_by_code` RPC 和 `invite_code` 既有注册邀请关系；
- `public.referrals`、`referral_commissions`、`site_settings`（不得改写这些旧数据）。

新增 `components/auth/AlternateLoginMethods.tsx`：邮箱验证码 `signInWithOtp`、`verifyOtp`，Google `signInWithOAuth`，注册勾选协议、六位数字、基本重发限制、验证后资料及封禁检查、推广邀请码传递。Google OAuth 在现有 `/auth/callback` 交换会话后检查封禁和邀请绑定，拒绝无 profile、受限账号或不可信回调目的地。

## 需人工或本地 Codex 在用户账号安全配置的部分

1. **Supabase Email OTP**：在 Supabase Authentication → Email Templates → Magic Link，把验证码邮件正文改为包含 `{{ .Token }}` 的六位数字模板，不是只有 `{{ .ConfirmationURL }}` 的 Magic Link。确认 OTP 过期时间、服务端限制及限流；不能声称改了模板即已发信成功。
2. **正式 SMTP**：Supabase 默认邮件服务不适合真实公开站点。核实已连接自定义 SMTP、发件域 SPF/DKIM/DMARC 及真实收件箱送达（收件箱/垃圾箱）。此 SMTP 属于 Supabase Auth 的出站邮件服务，不应无依据地将网站已有通知 worker 视为已配置。
3. **Google Cloud**：在 Google Auth Platform 为 Web 建立 OAuth 客户端/用户授权受众；最小 scopes 为 Google 提供的基础身份/email/profile，不请求邮箱内容或 Gmail API 权限。Google Cloud 设置回调为 **Supabase Auth 面板中 Google Provider 展示的 OAuth callback URL**，格式 `https://<PROJECT_REF>.supabase.co/auth/v1/callback`，不要错误地直接填网站 `/auth/callback`。Client ID + Secret 在 Supabase Auth Providers → Google 配置，绝不复制到 GitHub、聊天或 NEXT_PUBLIC 环境。
4. **Supabase Redirect URLs**：Canonical Site URL 及 redirect allow list 必须覆盖 `https://www.jianlian.shop/auth/callback` 及 callback 查询参数的安全限定模式。生产仅允许已审核的 `https://www.jianlian.shop`，`jianlian.shop` 统一 301 到 www；本地测试/测试 Supabase 使用独立 localhost 配置，不将开发通配符直接放到生产。
5. **测试与验收**：用独立测试邮箱/Google 账号，检查 OTP 发信及 6 位认证、正确绑定邀请、无邀请码注册、Google 登录/注册、重复登录、无自我邀请、禁用用户无法通过 OAuth 绕过、账户余额/订单与旧账号隔离。不得真正充值或购买。上线前应有发件配额与风控策略；Cloudflare Turnstile 可后续加，但应先利用 Supabase Auth 本身的 OTP 速率限制，必要时接入 Supabase CAPTCHA。

官方资料：
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-captcha

## 推广系统：截至 2026-11-06 只读生产核验

只读查询实际 Supabase Production 项目（本轮**没有写数据库或执行 Migration**）观察：
- `public.profiles` 有邀请码字段，`public.referrals` 表、`public.referral_commissions` 表及 `ensure_my_referral_code`、`bind_referrer_by_code`、`sync_referral_commission_for_order` 函数存在。
- 现有邀请码的 profiles 数量 **6**，转介绍关系 **1**，佣金记录 **0**；这是当前数据量，**不是**实际佣金已经自动发放的证明。
- `site_settings` 配置 `promotion_enabled=true`、`promotion_commission_rate=0.03`、`promotion_min_withdraw_amount=100`。
- `public.promotion_visits` **不存在**，但 `app/api/referrals/route.ts` 会查询该表计算“访问量”。因此访问统计**尚未完成真实闭环**，不可标记 Production PASS。
- 当前 `public.orders` 有 7 条 payment_status=paid，佣金记录 0；随后只读关联了 `orders.user_id = referrals.referred_user_id` 并排除 cancelled/refunded/failed 状态，核实**符合这组条件的被邀请用户已付款订单为 0 条**。因此目前不存在这组订单的漏发佣金证据，但不能据此声明佣金同步闭环通过。仅见到订单更新时间/支付到期的触发器，未看到订单表上自动触发佣金同步的触发器。需继续核实付款服务端是否有其他明确的 `sync_referral_commission_for_order` 调用；代码定义或函数存在不代表订单真实付款会产生佣金。
- `/promotion` 前台展示链接、邀请数、佣金及分页，`/r/[inviteCode]` 跳转注册，真实业务闭环中的「访问采集、佣金自动结算、防刷、提现管理和退款冲回」仍需逐项仅针对缺口验收。
- 既有默认 3% 和 ¥100 是已配置业务参数，不建议未经用户许可修改佣金比例/门槛或进行真实提现。

**推荐独立后续任务：** 登录主线验收后，开新的独立推广 Draft，先审查现有数据库迁移/结算调用并补 `promotion_visits` 记录和付款归因测试；绝不在 auth PR 里重写资金/佣金账本。推广测试先用隔离合成数据，禁止 Production 真实消费或提现试验。

## 与其他主线隔离

- 跨境资源网 `GD-20261106-103033-3A25` 已提交，待官方书面回复；不要重复查询/重复提单。其 Draft PR #103 独立。
- Bitrefill Business API 邮件已由用户发送、等待答复，PR #102 独立。
- Google/OTP 变更本身无数据库 Migration、付款/USDT/供应商采购逻辑，**未合并、未部署**；CF DNS/WAF 先不动。
- 现有 UI Production SHA `9bebcfc7b62d6bcd2211649af3774dc11ce73bee` 基于既有服务器回执。用户说「网站没有上线」可理解为尚未正式对外营业，不能误解为不存在已运行 Production。

## 唯一下一步和结束门禁

1. 首先让本 Draft PR 的 tests、Typecheck、Lint、Build/CI 通过。
2. 仅在 *Jianlian-shop-test* Supabase 实例和测试邮箱/Google OAuth 客户端上配置、验证完整真实登录流，保护生产密钥。
3. 测试通过后审查 Supabase Production provider/SMTP 配置并提出最小启用计划；**必须再核对账号封禁/邀请码/余额隔离的实际表现**。
4. 最终上线须分离代码部署与功能开关激活；无明确授权前不得改生产 Auth Provider、密钥、SMTP、账户数据、Cloudflare 或 Production 切换。

最终回执：`AUTH_PR_HEAD`、`CI`、`EMAIL_OTP_CODE`、`GOOGLE_OAUTH_CODE`、`TEST_SUPABASE_CONFIG`、`PROD_CONFIG`、`REFERRAL_DB_SCHEMA`、`REFERRAL_VISITS`、`REFERRAL_COMMISSION_LIVE`、`BLOCKERS`、`NEXT_ACTION=STOP`。
