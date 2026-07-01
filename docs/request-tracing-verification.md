# Request ID 与故障定位验收

## 当前日志体系

项目已有：

```text
system_error_events
admin_audit_logs
payment_events
order_events
inventory_events
lib/monitoring/logger.ts
/admin/system-errors
```

本次补充：

```text
lib/monitoring/request-id.ts
lib/monitoring/error-codes.ts
lib/monitoring/trace-service.ts
/api/admin/system/request-traces/[requestId]
/admin/system/request-traces/[requestId]
supabase/migrations/20260701_request_tracing_enhancements.sql
```

## Request ID 规范

- 响应头使用 `X-Request-ID`。
- 合法字符为大小写字母、数字、`_`、`-`。
- 最大长度 120。
- 非法或过长 ID 重新生成或拒绝。
- 外部请求、后台操作、系统任务应沿用同一 Request ID。
- 子步骤可使用安全子编号，但主链路仍保留原 Request ID。

## 结构化日志

`lib/monitoring/logger.ts` 已提供结构化日志和 `system_error_events` 写入能力。日志字段包括：

```text
timestamp
level
request_id
category
event
route
status_code
duration_ms
error_code
metadata
```

metadata 经过脱敏，不记录密码、Token、密钥、完整支付回调和完整数字库存内容。

## 后台追踪页

后台可通过：

```text
/admin/system/request-traces/<requestId>
```

查看同一 Request ID 下的：

```text
system_error_events
admin_audit_logs
payment_events
order_events
inventory_events
```

单个模块查询失败不会导致页面白屏，会显示模块读取状态。

## 商品保存链路

商品保存链路已有审计日志和错误事件能力。本次提供统一 Request ID 工具后，后续商品保存 API 应统一使用：

```text
getRequestIdFromRequest
recordApiError
writeAdminAuditLog
```

保存失败时前端应显示安全错误和 Request ID，不显示数据库原文。

## 订单、支付、余额、库存链路

现有订单、支付、充值、退款、余额和库存相关服务已存在 `requestId` 或 `client_request_id` 字段。本次追踪页可以基于同一 `request_id` 聚合审计和异常事件。

## 需要执行的 Migration

```text
supabase/migrations/20260701_request_tracing_enhancements.sql
```

Codex 未自动执行 SQL。

## 已验证

- `tsc --noEmit` 已在修改前通过，后续仍需重新执行。
- `npm run build` 曾暴露订单页字面量换行问题，已修复。

## 仍存在的问题

- 并非所有历史 API 都已统一返回 `X-Request-ID`。
- 部分旧 `console.error` 仍存在，但多数使用安全摘要。
- 生产 Worker、PM2、Nginx 日志关联需要服务器侧后续配置，本次未修改服务器配置。
