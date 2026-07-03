# Jianlian Shop 系统设置联调验收

## 当前配置调用链路

- 后台页面：`/admin/settings`
- 后台接口：`GET/PATCH /api/admin/settings`
- 服务端设置服务：`lib/settings/server.ts`
- 设置定义和白名单：`lib/settings/types.ts`
- 前台公开接口：`GET /api/settings/public`
- 前台读取：`SettingsProvider` 和 `PublicLayout`
- 维护模式拦截：`middleware.ts`

## 当前真实表和字段

当前项目已有 `site_settings` 和 `site_setting_logs`，本次沿用现有表名，未引入 `system_settings` 的第二套来源。新增兼容 migration 会补充以下公开 key：

- `site_description`
- `support_email`
- `support_phone`
- `currency`
- `timezone`
- `default_language`
- `order_expire_minutes`
- `maintenance_enabled`
- `maintenance_message`
- `checkout_notice`

同时新增 `announcements` 表，字段包括 `title`、`content`、`announcement_type`、`is_enabled`、`starts_at`、`ends_at`、`sort_order`、`placement`、创建和更新人信息。

## 系统设置结构结果

- 设置 key 由 `SITE_SETTING_DEFINITIONS` 集中定义。
- 后台保存只接受白名单 key。
- 布尔、数字、JSON 和字符串分别规范化。
- `site_status` 与 `maintenance_enabled` 双向兼容。
- `order_expire_minutes` 与旧字段 `order_auto_cancel_minutes` 双向兼容。
- 公开配置只读取 `is_public = true` 的字段。

## 公开接口安全结果

`/api/settings/public` 只返回 `PublicSiteSettings` 白名单字段，不返回支付密钥、数据库信息、SMTP 密码、Service Role、管理员列表、内部备注或环境变量。

## 后台设置页面结果

后台系统设置分区：

- 基础信息
- 订单设置
- 联系方式
- 维护模式
- 公告设置
- 协议与政策
- 支付设置
- 安全设置

保存接口要求超级管理员上下文，所有修改写入 `site_setting_logs` 和管理员审计日志。

## 公告管理结果

当前前台顶部公告和 checkout 购买提醒已改为读取后台公开设置：

- `top_announcement`
- `checkout_notice`

结构化多公告能力由 migration 预留在 `announcements` 表，前台公告内容按纯文本渲染，不执行 HTML 或脚本。

## 缓存更新结果

后台设置保存后调用 `revalidateSiteSettingsCache()`，前台公开设置接口使用 `no-store`，不需要重新构建或重启服务即可读取新配置。

## 需要手动执行的 Migration

1. `20260620_site_settings.sql`，如果线上尚未执行。
2. `20260703_system_settings_announcements_maintenance.sql`。

本次未自动执行任何 SQL。

## 仍存在的问题

- 结构化 `announcements` 表已预留，但当前后台 UI 只管理顶部公告和 checkout 购买提醒两个高频公告位。
- 若线上未执行新 migration，新字段会使用安全默认值。