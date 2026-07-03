# 邮件通知系统验收报告

## 当前调用链路

- 邮箱验证：`POST /api/auth/resend-verification` -> Supabase Auth `auth.resend`。
- 密码重置：`/forgot-password` -> Supabase Auth `resetPasswordForEmail`。
- 业务邮件：真实业务成功 -> `queueBusinessEmail` -> 当前发布模板 -> `email_delivery_jobs` -> 内部 Worker -> Provider。
- 管理入口：`/admin/notifications/email-templates`、`/admin/notifications/email-deliveries`。

Supabase Auth 邮件不进入业务邮件表，验证/重置 Token 不写入普通日志。业务邮件失败不回滚订单、支付、交付或退款事务。

## 数据结构与权限

需手动执行 `supabase/migrations/20260701_email_notifications.sql`。它创建：

- `email_templates`
- `email_delivery_jobs`
- `email_delivery_attempts`
- `user_email_preferences`

表均启用 RLS。模板和发送日志只允许超级管理员读取；写入通过服务端 Service Role；普通用户只能维护自己的邮件偏好。任务使用 `idempotency_key` 唯一约束，尝试记录使用 `(job_id, attempt_no)` 唯一约束。

## 本次修复

1. 修复任务把脱敏邮箱当作真实收件地址的问题。发送前通过 `user_id` 在服务端重新解析 Auth 邮箱，并校验 `recipient_hash`；数据库仍不保存邮箱明文。
2. 领取任务时使用状态条件更新，两个 Worker 并发时只有一个能成功领取。
3. `processing` 锁 15 分钟内不可重复处理，超时后允许恢复。
4. 新增内部入口 `POST /api/internal/email/process`，使用 `EMAIL_WORKER_SECRET`，单批最多 25 条。
5. 新增取消未发送任务接口和后台重试/取消操作，均需超级管理员权限并写审计日志。
6. 模板创建、编辑和渲染均拒绝脚本标签、危险事件属性和危险 URL 协议。
7. 补齐注册成功、外部支付待处理、交付失败、退款成功和账户状态变更模板代码。

## 重试与隐私

- 状态：`pending / processing / sent / retrying / failed / cancelled`。
- 临时网络、超时、限流和 5xx 错误才进入指数退避重试，最多 5 次。
- 配置缺失、地址错误、模板缺失和权限错误不自动重试。
- 后台只展示 `recipient_summary`，不返回模板正文、完整邮箱、Token、密码、支付密钥或数字交付内容。

## 验收结论

- TypeScript 静态检查通过。
- 未执行远程 migration，未发送真实邮件。
- Provider 适配器仍保持安全失败状态，不会伪造成功。
- 订单、支付、交付和退款成功服务尚未全面调用 `queueBusinessEmail`，因此业务邮件接入状态为 **partial**；接入时必须放在业务事务成功之后，并使用稳定幂等键。

