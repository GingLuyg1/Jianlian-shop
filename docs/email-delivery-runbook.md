# 邮件发送运维手册

## 队列状态

邮件任务状态：

```text
queued
sending
sent
failed
cancelled
skipped
```

失败重试由 `retry_count`、`max_retries`、`next_retry_at` 控制。非重试错误包括：

```text
INVALID_RECIPIENT
UNSUBSCRIBED
TEMPLATE_DISABLED
PROVIDER_NOT_CONFIGURED
EMAIL_PROVIDER_NOT_CONFIGURED
```

## 幂等控制

邮件任务使用 `idempotency_key` 唯一约束。相同业务事件重复触发时返回已有任务，不重复创建发送记录。

推荐幂等键格式：

```text
email:<template_code>:<business_type>:<business_id>:<recipient_hash>
```

## 处理流程

```text
业务事件
→ 校验用户偏好
→ 读取已发布模板
→ 渲染纯文本和 HTML
→ 创建 email_delivery_jobs
→ Worker 读取 queued / failed 且到达 next_retry_at 的任务
→ 调用 Provider
→ 写入 email_delivery_attempts
→ 更新任务状态
→ 写入 admin_audit_logs
```

## 后台查询

后台入口：

```text
/admin/notifications/email-deliveries
/admin/notifications/email-templates
```

可查询：

```text
模板状态
模板版本
发送状态
业务类型
业务编号
收件人摘要
重试次数
错误摘要
创建时间
更新时间
```

## 故障处理

- Provider 未配置：显示“邮件服务尚未配置”，不会假发送。
- 模板缺失：任务不创建，返回中文提示。
- 变量缺失：模板渲染失败，记录失败摘要。
- 重复提交：命中幂等键，返回已有任务。
- 失败重试：按指数退避，超过上限后保持 failed。

## 日志脱敏

日志中不得记录：

```text
密码
Token
验证码
邮件 Provider 密钥
完整支付回调
完整数字库存内容
完整卡密或账号密码
```

## Worker 建议

当前项目不自动修改 PM2、Nginx 或服务器定时任务。生产环境可独立增加定时 Worker，每分钟处理少量任务，并限制单批数量和重试频率。
