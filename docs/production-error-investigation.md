# 生产异常排查手册

## 首要步骤

```bash
pm2 status
pm2 describe jianlian-shop
pm2 logs jianlian-shop --lines 200
curl -i https://www.jianlian.shop/api/health
curl -i https://www.jianlian.shop/api/health/ready
```

先记录发生时间、页面、HTTP 状态、`X-Request-ID` 和当前 commit SHA。不要复制密码、Cookie、Authorization、支付签名或交付内容。

## 按 Request ID 排查

1. 在后台“异常中心”搜索完整 Request ID。
2. 打开 `/admin/system/request-traces` 输入 Request ID。
3. 在 PM2 日志中搜索同一 ID。
4. 对照订单事件、支付事件和管理员审计日志的时间线。

## 判断故障层级

- 前端：静态资源、Hydration、ChunkLoad、浏览器网络错误。
- API：HTTP 状态、统一错误代码、Request ID。
- 数据库：`/api/health/ready` 数据库项异常，禁止向用户展示原始 Supabase 错误。
- Provider：配置状态为 `not_configured` 或安全失败摘要；不得用真实交易做探测。

## 禁止立即重启的场景

正在处理支付回调、余额入账、退款、库存预留、自动交付或 migration 时，不得直接重启。先保存日志、确认幂等状态和数据库事务结果，再决定是否重启。

## 重启前后

重启前保存 PM2 日志、当前 SHA、进程工作目录和待处理任务数量。重启后再次检查 SHA、`/api/health`、`/api/health/ready`、首页、后台登录、订单和支付状态查询。本文档不授权自动重启或删除日志。

