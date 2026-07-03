# 邮件 Provider 配置

## 服务端环境变量名称

```text
EMAIL_PROVIDER
EMAIL_FROM
EMAIL_WORKER_SECRET
RESEND_API_KEY
POSTMARK_SERVER_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_CUSTOM_ENDPOINT
SUPABASE_SERVICE_ROLE_KEY
```

只配置所选 Provider 需要的变量。所有变量仅放在服务器环境，禁止使用 `NEXT_PUBLIC_*`，禁止提交真实值。

## 当前状态

当前 Provider 模块只检查配置并返回真实不可用状态，尚未启用外部发送适配。配置环境变量本身不会让系统伪造发送成功。正式启用前必须人工完成：

1. 发信域名 SPF、DKIM、DMARC 验证。
2. Provider API 权限和发送限额确认。
3. 退信、投诉和退订处理方案。
4. 数据处理地域和隐私条款审核。
5. Provider 适配器代码安全评审和测试环境真实投递测试。

邮箱验证和密码重置继续使用 Supabase Auth 的 SMTP/邮件模板配置；在 Supabase Dashboard 中配置 Site URL、Redirect URLs、SMTP 和模板，不在应用日志记录 Token。

## Worker 调用

```bash
curl -X POST https://staging.example.com/api/internal/email/process \
  -H "Authorization: Bearer $EMAIL_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":20}'
```

建议测试环境每分钟执行一次。不得把密钥放进 URL、浏览器代码或普通日志。

