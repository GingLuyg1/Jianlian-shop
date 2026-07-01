# 邮件 Provider 接入说明

## 当前状态

Jianlian Shop 已建立邮件通知的模板、队列、发送记录、失败重试、幂等键和用户偏好数据结构，但当前不接入真实邮件 Provider，也不伪造发送成功。

当 Provider 未配置时，邮件任务会保持 `failed` 或 `pending` 状态，并返回中文初始化提示；系统不会向外部服务发送邮件。

## 支持的配置名称

仅允许在服务器环境中配置以下变量名称，禁止写入前端环境变量，禁止提交真实值到 Git：

```text
EMAIL_PROVIDER=none|resend|postmark|smtp|custom
EMAIL_FROM=no-reply@example.com
RESEND_API_KEY=占位符
POSTMARK_SERVER_TOKEN=占位符
SMTP_HOST=占位符
SMTP_PORT=587
SMTP_USER=占位符
SMTP_PASS=占位符
EMAIL_CUSTOM_ENDPOINT=占位符
```

## 接入步骤

1. 选择 Provider，并在服务器环境变量中配置对应密钥。
2. 执行 `supabase/migrations/20260701_email_notifications.sql`。
3. 在后台创建或发布邮件模板。
4. 使用服务端队列函数创建邮件任务。
5. 配置独立 Worker 或定时任务处理待发送任务。
6. 验证发送记录、失败重试和审计日志。

## 安全要求

- 不在浏览器端使用 Provider 密钥。
- 不在邮件日志中保存密码、Token、验证码、支付密钥和完整卡密。
- 邮件收件人使用摘要和哈希保存，真实地址应由服务端安全解析。
- 密码重置、邮箱验证等敏感链接建议继续使用 Supabase Auth 原生邮件或一次性安全引用。
- Provider 回调必须在服务端验签后再更新发送状态。

## 当前限制

当前 `sendEmail` 只做 Provider 配置检测和安全失败返回，不调用真实 Provider。上线真实发送前需要补充 Provider 适配器：

```text
sendEmail
queryEmailStatus
parseEmailWebhook
verifyEmailWebhook
```
