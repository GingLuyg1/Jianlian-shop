# 维护模式运行手册

## 控制方式

维护模式由后台系统设置控制：

- `maintenance_enabled`
- `maintenance_message`
- 兼容旧字段 `site_status = maintenance`

后台入口：`/admin/settings` -> `维护模式`。

## 服务端拦截规则

拦截位置：`middleware.ts`

维护模式开启后，普通前台页面会重定向到 `/maintenance`。

以下路径保持可用：

- 静态资源和 Next.js 构建资源
- `/maintenance`
- `/login`
- `/register`
- `/auth/*`
- `/admin` 和 `/admin/*`
- `/api/*`，包括 `/api/health`、支付回调和内部任务接口

后台权限仍按原有登录和超级管理员校验执行。

## 前台展示

维护页读取公开设置中的 `maintenance_message`。读取失败时使用安全默认文案。

## 关闭维护模式

在后台关闭 `maintenance_enabled` 后，普通前台页面立即恢复访问。公开设置接口使用 `no-store`，不需要重新部署。

## 注意事项

- 维护模式不是支付回调和内部任务认证机制，不会替代接口级鉴权。
- 支付回调、健康检查和系统任务必须继续依赖各自的服务端认证。
- 本次未自动配置 PM2、Nginx、Crontab 或服务器任务。