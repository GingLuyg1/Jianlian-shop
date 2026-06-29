# Jianlian Shop 生产监控与异常中心

## 已接入内容

- 统一服务端日志：`lib/monitoring/logger.ts`
- 告警适配器占位：`lib/monitoring/alerts.ts`
- 异常事件聚合表：`system_error_events`
- 健康检查接口：
  - `/api/health/liveness`
  - `/api/health/readiness`
  - `/api/health`
- 后台异常中心：
  - `/admin/system-errors`
  - `/api/admin/system-errors`

## 手动执行 SQL

请在 Supabase SQL Editor 手动执行：

```text
supabase/migrations/20260629_system_error_events.sql
```

该 migration 只创建异常事件聚合表、索引、RLS 和 `upsert_system_error_event` RPC，不会修改现有业务表。

## 统一日志格式

服务端日志统一输出 JSON 行，字段包含：

```text
timestamp
level
category
event
message
request_id
user_id
admin_id
order_id
payment_id
product_id
sku_id
route
method
status_code
duration_ms
error_code
metadata
environment
release
```

敏感字段会脱敏。默认脱敏关键字包括：

```text
password
token
secret
key
signature
authorization
cookie
credential
private
card
delivery_content
content
code
```

## 异常事件结构

`system_error_events` 会按 `fingerprint` 聚合相同问题，避免后台被重复日志刷屏。

主要字段：

```text
level
category
error_code
title
message
route
request_id
业务关联 ID
occurrences
first_seen_at
last_seen_at
status
resolution_note
metadata
```

状态：

```text
open
investigating
resolved
ignored
```

## 健康检查

`/api/health/liveness` 只检查应用进程是否存活，适合负载均衡存活探针。

`/api/health/readiness` 会检查：

```text
应用进程
数据库连接
支付核心表
订单表
数字库存表
发货表
对账表
告警通道配置
```

返回状态：

```text
healthy
degraded
unhealthy
```

## 告警预留

当前只提供告警适配器占位，不发送真实外部告警。

预留环境变量：

```text
MONITORING_WEBHOOK_URL
ALERT_WEBHOOK_URL
```

即使配置了 webhook，本阶段也只记录 `alert_ready_to_send`，不会真正发出外部请求。接入企业微信、飞书、Telegram 或邮件时，只需要替换 `lib/monitoring/alerts.ts` 的传输层。

## 建议的服务器监控配置

本项目不自动修改服务器配置。生产环境建议人工配置：

- PM2：
  - 监控 `pm2 list`
  - 采集 `~/.pm2/logs/*`
  - 关注重启次数和内存增长
- Nginx：
  - 监控 4xx/5xx 比例
  - 监控 upstream 502/504
  - 静态资源 400/404 单独告警
- 系统：
  - CPU 持续高于 85%
  - 内存持续高于 85%
  - 磁盘使用高于 80%
  - Node 进程退出或端口不可用
- 应用：
  - `/api/health/liveness`
  - `/api/health/readiness`

## 日志保留建议

- 应用 stdout/stderr：保留 7 至 14 天
- Nginx access/error：保留 14 至 30 天
- `system_error_events`：保留 90 天以上
- 审计日志：按业务合规要求长期保留

## 排障流程

1. 访问 `/api/health/readiness` 判断基础依赖。
2. 查看 `/admin/system-errors` 是否有新增严重异常。
3. 根据 `request_id` 关联 PM2/Nginx 日志。
4. 对支付、订单、发货问题，优先检查业务关联 ID。
5. 修复后在异常中心将事件标记为 `resolved` 并填写处理备注。

## 当前限制

- 未接真实外部告警传输。
- 现有历史 `console.*` 尚未全部替换为统一日志。
- 仅新增关键 API 和健康检查的异常聚合，后续可逐步把支付、订单、库存、发货的 catch 分支接入 `recordApiError`。
