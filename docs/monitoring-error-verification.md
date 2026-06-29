# 生产监控与异常中心验收记录

## 本次实现

- 新增 `system_error_events` migration。
- 新增统一日志工具。
- 新增告警适配器占位。
- 新增 liveness/readiness 健康检查。
- 新增后台异常中心页面。
- 新增后台异常中心 API。
- 左侧后台导航增加“异常中心”入口。

## 验证范围

### 健康检查

接口：

```text
GET /api/health/liveness
GET /api/health/readiness
GET /api/health
```

预期：

- liveness 不依赖数据库，应用存活时返回 200。
- readiness 检查数据库和核心业务表。
- 核心依赖失败时返回 `unhealthy` 和 503。
- 非核心能力未配置时返回 `degraded`，不导致白屏。

### 异常中心

页面：

```text
/admin/system-errors
```

接口：

```text
GET /api/admin/system-errors
PATCH /api/admin/system-errors
```

预期：

- 仅管理员可访问。
- 支持按级别、分类、状态、请求编号、订单 ID、支付 ID、时间范围筛选。
- 表格内部滚动，分页固定底部。
- 支持查看详情抽屉。
- 支持标记处理中、已解决、已忽略、待处理。
- 表未初始化时显示中文初始化提示，不白屏。

### 安全脱敏

已处理：

- 日志 metadata 敏感字段脱敏。
- 路径、token、key、secret、signature 基础脱敏。
- 异常中心不展示密钥、Token、完整卡密或原始敏感载荷。

### 告警预留

当前行为：

- 不发送真实外部告警。
- 未配置 webhook 时写入 `alert_channel_not_configured` 日志。
- 配置 webhook 时也仅记录 `alert_ready_to_send`，等待后续真实传输层。

## 需要手动执行

```text
supabase/migrations/20260629_system_error_events.sql
```

## 手动服务器监控配置

本次没有自动修改 PM2、Nginx、Cron 或服务器配置。上线后建议人工配置：

- PM2 进程存活和重启次数。
- Nginx 5xx、502、504、静态资源 400/404。
- 磁盘、CPU、内存。
- `/api/health/liveness` 和 `/api/health/readiness`。

## 已知剩余问题

- 不是所有旧业务接口都已接入统一日志工具。
- 外部告警传输层尚未接入。
- 前端 React Error Boundary 未在本次范围内全站接入。

## 验收结论

监控基础设施、健康检查、异常聚合和后台异常中心已具备可用框架。执行 migration 后，生产异常可以进入后台聚合处理；真实外部告警仍需要后续配置传输层。
