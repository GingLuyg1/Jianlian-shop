# 邮件通知系统验收报告

## 修改范围

本次建立邮件通知基础能力：模板、版本、发送队列、发送记录、失败重试、幂等控制、用户偏好、后台查询和审计写入。未接入真实邮件 Provider，未发送真实邮件。

## 新增 Migration

```text
supabase/migrations/20260701_email_notifications.sql
```

需要手动在 Supabase SQL Editor 执行。Codex 未自动执行线上 SQL。

## 数据结构

新增表：

```text
email_templates
email_delivery_jobs
email_delivery_attempts
user_email_preferences
```

关键约束：

- `email_templates(template_code, version)` 唯一。
- 同一模板只允许一个当前发布版本。
- `email_delivery_jobs(idempotency_key)` 唯一。
- `email_delivery_attempts(job_id, attempt_no)` 唯一。
- RLS 开启，普通用户只能读取和修改自己的邮件偏好。
- 超级管理员可查看模板和发送记录。

## 模板规则

支持模板代码：

```text
email_verification
password_reset
order_created
payment_success
payment_failed
order_delivered
refund_requested
refund_approved
refund_rejected
recharge_success
account_security_alert
admin_system_alert
```

变量使用 `{{ variable }}`，服务端渲染时做 HTML 转义。模板发布和归档要求管理员权限并写入审计日志。

## 幂等与重试

- 创建任务前检查用户偏好和模板状态。
- 使用 `idempotency_key` 防止同一业务事件重复创建邮件。
- 发送失败写入 `email_delivery_attempts`。
- 可重试错误按指数退避写入 `next_retry_at`。
- Provider 未配置时不伪造成功。

## 用户偏好

用户偏好保存在 `user_email_preferences`，支持 `marketing`、`security`、`orders`、`recharges`、`refunds`、`promotions`、`system` 等分组。

当前默认策略：安全、订单、充值、退款和系统通知允许发送；营销类需要用户明确开启。

## 后台能力

新增后台页面：

```text
/admin/notifications/email-templates
/admin/notifications/email-deliveries
```

新增后台接口：

```text
GET /api/admin/notifications/email-templates
POST /api/admin/notifications/email-templates
GET /api/admin/notifications/email-templates/[templateId]
PATCH /api/admin/notifications/email-templates/[templateId]
GET /api/admin/notifications/email-deliveries
POST /api/admin/notifications/email-deliveries/[jobId]/retry
```

## 安全验收

- 普通用户不能访问后台邮件接口。
- 浏览器端不使用 Service Role Key。
- 邮件 Provider 密钥不进入数据库和审计日志。
- 收件人只保存摘要和哈希，后台不展示完整邮箱。
- 发送失败不输出 Provider 原始敏感响应。
- 邮件重试通过服务端接口处理。
- 后台邮件操作写入管理员审计日志。

## 已验证

```text
tsc --noEmit：通过
npm run build：通过
```

## 需要继续完成

- 手动执行邮件通知 migration。
- 补充真实 Provider 适配器。
- 配置生产 Worker 或定时任务。
- 补充 Provider webhook 验签和状态回写。
- 如果要发送密码重置或邮箱验证邮件，应继续使用 Supabase Auth 原生流程或服务端一次性安全引用。
