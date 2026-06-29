# Jianlian Admin 控制台真实数据联调与验收

## 核心指标数据来源

| 指标 | 数据来源 | 计算方式 |
| --- | --- | --- |
| 今日支付金额 | `orders` | 当日创建订单中 `payment_status = paid` 的 `total_amount` 汇总，CNY 两位展示 |
| 今日充值金额 | `account_recharges` | 当日充值中 `status = paid` 的 `credited_amount / amount / requested_amount` 汇总 |
| 今日订单数 | `orders` | 当日创建订单数量 |
| 今日支付成功率 | `orders` | 当日已支付订单数 / 当日订单数；无订单显示 `—` |
| 今日访客数 | `page_visit_events` | 当日 `visitor_key` 去重数量，排除 `/admin` |
| 今日访问量 | `page_visit_events` | 当日前台页面访问事件数量，排除 `/admin` |
| 待处理订单 | `orders` | `status in (paid, processing)` |
| 待人工交付 | `order_deliveries` | `delivery_status = pending` 且 `delivery_type != automatic` |
| 支付异常 | `payment_sessions` | `status in (failed, expired)` |
| 低库存商品 | `products` | `stock > 0 and stock <= 5` |
| 今日新增用户 | `profiles` | 当日 `created_at` 数量 |
| 商品总数 | `products` | 当前可读取商品总数 |

所有指标均来自真实表或真实 readiness 接口；查询失败显示“加载失败”，结构未接入显示“未接入”，没有数据显示 0 或空状态。

## 访客统计实现

- 已存在 migration：`supabase/migrations/20260624_admin_visit_analytics.sql`。
- 本次新增服务端上报接口：`POST /api/analytics/page-view`。
- 本次新增隐形前端组件：`components/analytics/PageViewTracker.tsx`，挂载在 `app/layout.tsx`。
- 写入表：`page_visit_events`。
- 统计字段：`visit_date`、`page_path`、`visitor_key`、`user_id`、`session_key`、`user_agent_hash`、`ip_hash`、`metadata`。
- 不保存完整 IP，不保存完整 UA，不保存 Token、密码、支付参数和敏感 query。
- 上报失败只静默失败，不影响前台页面加载。

## UV/PV 去重规则

- PV：每次前台路由访问写入一条 `page_visit_events`。
- UV：按统计周期内 `visitor_key` 去重。
- 匿名用户：浏览器生成稳定本地匿名 key，服务端 SHA-256 后保存为 `anon:<hash>`。
- 登录用户：服务端读取当前 Supabase session，按用户 ID hash 保存为 `user:<hash>`。
- 客户端 3 秒内同一路径重复上报会被 sessionStorage 去重，避免 React 重复渲染产生重复 PV。
- 页面刷新会产生新 PV，但同一 visitor_key 不重复增加 UV。
- `/admin`、`/api`、`/_next`、`/assets`、`/health`、favicon、robots、sitemap 不上报。

## 经营趋势统计口径

- 支持近 7 天和近 30 天。
- 每日边界使用当前浏览器/服务器运行时本地日边界；部署在中国时对应 Asia/Shanghai 业务日。
- 无数据日期补 0。
- 支付金额：只统计 `orders.payment_status = paid`，按 `paid_at` 聚合。
- 充值金额：只统计 `account_recharges.status = paid`，按 `paid_at` 或 `created_at` 聚合。
- 订单数量：按 `orders.created_at` 聚合全部创建订单。
- 成功支付数量：只统计 `payment_status = paid`，按 `paid_at` 聚合。
- 访客数：按天对 `page_visit_events.visitor_key` 去重。
- 访问量：按天统计 `page_visit_events` 记录数。

## 支付渠道统计口径

- 渠道定义：支付宝、微信支付、币安支付、USDT-TRC20、USDT-BEP20。
- 配置来源：`payment_channels`。
- 交易来源：`payment_sessions`。
- 发起笔数：对应 `channel_code` 的支付会话数量。
- 成功笔数：`status = paid`。
- 成功率：成功笔数 / 发起笔数；未配置或未接入不显示 0%。
- 成交金额：对应渠道成功支付会话 `payable_amount` 汇总。
- 异常数量：`status in (failed, expired, closed)`。
- 点击渠道跳转 `/admin/payments?channel=<channel_code>`。

## 待办中心统计口径

- 待处理订单：`orders.status in (paid, processing)`。
- 待人工交付：`order_deliveries.delivery_status = pending` 且非自动交付。
- 自动发货失败：`order_deliveries.delivery_status = failed`。
- 库存不足订单：`order_deliveries.failure_reason` 包含库存相关摘要。
- 支付回调失败：`payment_callback_logs.status` 包含 failed/mismatch。
- 对账异常：`payment_reconciliations` 结果包含 mismatch/failed。
- 待处理充值：`account_recharges.status in (pending, processing, submitted, under_review)`。
- 低库存商品：`products.stock` 1 到 5。

## 商品排行统计口径

- 销量排行和销售额排行来源：`order_items` + `orders`。
- 只统计 `orders.payment_status = paid` 的订单项。
- 销量：`order_items.quantity` 汇总。
- 销售额：`order_items.line_total` 汇总。
- 取消、失败、未支付订单不计入排行。
- 当前项目未在控制台单独拆 SKU 展示；若 SKU 表启用，需要后续把 SKU 库存汇总接入商品经营卡片。

## 订单充值用户统计结果

- 最近订单：`orders.created_at desc`。
- 最近充值：`account_recharges.created_at desc`。
- 总用户、今日新增、本周新增、管理员数量：`profiles`。
- 有消费用户：成功支付订单的 `customer_email` 去重。
- 零消费用户：`profiles` 总数减去有成功支付订单的用户邮箱数量。

## 系统状态结果

- 数据库连接：核心表查询是否至少部分成功。
- 支付 Provider、回调接口、充值 RPC、订单支付服务、对账服务：复用 `/api/admin/payments/readiness`。
- 自动发货服务：根据 `order_deliveries` 查询可用性判断。
- 审计日志：保留后台审计入口，不展示密钥。
- Provider 未配置显示“未接入”或“部分配置”，不展示商户号、密钥、签名或完整回调原文。

## 发现的问题

- 控制台读取了 `page_visit_events`，但前台没有页面访问上报入口，UV/PV 无法产生真实数据。
- 访问统计查询没有显式排除历史 `/admin` 记录。
- 商品销量/销售额排行直接汇总 `order_items`，未限定成功支付订单。
- 经营趋势中的支付/充值金额口径需要限定成功状态。

## 已修复的问题

- 新增前台访问上报接口和隐形追踪组件。
- 访问统计服务端排除后台、接口、静态资源、健康检查和敏感 query。
- 控制台访问统计查询排除 `/admin`。
- 商品销量/销售额排行改为只统计已支付订单项。
- 经营趋势支付金额、充值金额、成功支付数量改为只统计成功记录。

## 仍存在的问题

- 未启动 `npm run dev`，因此未做浏览器真实点击和多访客手工模拟。
- 未自动执行 Supabase SQL；如果线上尚未执行 `20260624_admin_visit_analytics.sql`，需要手动执行后才会写入访问统计。
- 当前控制台商品库存仍以 `products.stock` 为主；数字库存/SKU 可售库存深度汇总可作为后续专项。
- 访问统计按当前运行环境本地日边界聚合；生产服务器时区需保持与业务时区一致。

## 需要执行的 migration

- `supabase/migrations/20260624_admin_visit_analytics.sql`

如果该 migration 已执行，无需重复操作；它使用 `create table if not exists` 和 `drop policy if exists`，可安全重复执行。
