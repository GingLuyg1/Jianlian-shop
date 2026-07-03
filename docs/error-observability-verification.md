# 运行监控与异常追踪验收

## 当前异常处理链路

```text
API/服务异常 -> 获取或生成 Request ID -> 安全错误分类 -> 服务端脱敏日志
-> system_error_events 按 fingerprint 聚合 -> 后台异常中心处理 -> 管理员审计日志
```

现有入口包括 `recordSystemError`、`recordApiError`、管理员审计日志、订单事件、支付事件和请求链路查询。数据库日志写入失败时回退到结构化服务器日志，不阻断原业务响应。

## Request ID

- `lib/monitoring/request-id.ts` 校验可信格式并生成随机 UUID。
- 已接入商品公开 API、商品更新 API、健康检查、异常中心和请求链路查询。
- 响应使用 `X-Request-ID`；统一错误结构中的字段为 `error.request_id`。
- 后台可按 Request ID 搜索异常，并进入 `/admin/system/request-traces/[requestId]` 查看跨模块链路。
- 尚未逐一改造所有历史 API，未接入接口列为后续渐进治理项。

## 错误结构

新增 `AppError`、`ValidationError`、`AuthenticationError`、`AuthorizationError`、`NotFoundError`、`ConflictError`、`RateLimitError`、`ExternalServiceError` 和 `DatabaseError`。

安全响应格式：

```json
{"success":false,"error":{"code":"ORDER_CREATE_FAILED","message":"订单创建失败，请稍后重试。","request_id":"req_..."}}
```

## 分类与级别

级别：`debug / info / warn / error / critical`。

分类：商品、SKU、订单、库存、支付、充值、余额、退款、交付、对账、通知、邮件、认证、数据库、安全、部署、系统、性能。

参数错误不记录为 critical；数据库不可用、跨用户访问、重复扣款或重复交付风险应由调用方标记为 error/critical。

## 日志脱敏

metadata 只保留有限字段和长度，敏感键统一替换为 `[redacted]`。异常中心不展示请求体、密码、Token、签名、密钥、支付原始回调或数字库存明文。

## 健康检查

- `GET /api/health`：公开安全摘要，仅应用状态、环境、短 SHA、版本和构建时间。
- `GET /api/health/ready`：readiness 标准入口。
- `GET /api/health/readiness`：兼容入口。
- `GET /api/health/liveness`：进程存活。
- `GET /api/admin/system/status`：管理员状态聚合。

健康检查只读，不写异常表，不执行真实支付或邮件测试。

## 异常中心

`/admin/system-errors` 支持级别、分类、状态、Request ID、订单 ID 筛选、分页、详情和业务跳转。标记已解决或已忽略必须填写处理说明，状态修改写入管理员审计日志。

## Migration

需人工执行：`supabase/migrations/20260629_system_error_events.sql`。本次未自动执行远程 SQL。

