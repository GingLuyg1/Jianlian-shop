# 健康检查运行手册

## 接口

```text
GET /api/health
GET /api/health/liveness
GET /api/health/ready
GET /api/health/readiness
GET /api/admin/system/status
```

所有接口禁止缓存。公开接口不返回环境变量值、密钥、服务器路径或业务数据；管理员状态接口需要登录并具备管理员角色。

## 预期状态

- `/api/health`：进程可响应即为 `200 ok`。
- `/api/health/liveness`：进程存活返回 200。
- `/api/health/ready`：核心数据库连接失败返回 503；非核心模块未配置返回 degraded 和 200。
- `/api/admin/system/status`：返回最近异常计数、未解决 critical 数、Provider 配置摘要、后台邮件任务摘要和构建版本。

## 人工检查

```bash
curl -i https://www.jianlian.shop/api/health
curl -i https://www.jianlian.shop/api/health/ready
```

检查响应头 `X-Request-ID`、`Cache-Control: no-store`、状态码和短 SHA。维护模式下健康检查必须继续可访问。

## 超时与告警建议

Nginx 或外部监控建议 5 秒超时，每 30 至 60 秒检查 liveness，每 2 至 5 分钟检查 readiness。连续三次失败再告警，避免瞬时网络问题造成告警风暴。不要自动调用真实支付、邮件或交付操作作为健康探测。
