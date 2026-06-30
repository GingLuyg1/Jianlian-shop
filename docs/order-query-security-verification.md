# 订单查询安全验收报告

## 现有订单查询入口

- `/account/orders`：登录用户订单列表，当前通过 `/api/orders` 查询，服务端使用当前登录用户 ID。
- `/account/orders/[orderNo]`：登录用户订单详情，通过 `/api/orders/[orderNo]` 查询，服务端绑定当前用户。
- `/my-orders`：复用 `/account/orders`。
- `/order-success`：订单创建成功页，展示创建后的订单结果入口。
- `/order-tracking`：已调整为跳转 `/order-query`。
- `/order-query`：新增未登录安全订单查询页。
- `/api/orders`：登录用户订单列表和创建订单接口。
- `/api/orders/[orderNo]`：登录用户订单详情和取消接口。
- `/api/orders/[orderNo]/delivery`：登录用户交付内容接口。
- `/api/order-query`：新增游客安全查询接口。
- `/api/order-query/bind`：新增游客订单登录绑定预留接口。

## 当前订单查询安全问题

已发现并处理：

- 原 `/order-tracking` 会跳到 `/account/orders`，对未登录游客不友好，已改为 `/order-query`。
- 游客订单查询页缺失，已新增。
- 仅凭订单号查询订单的公开接口不存在；新增接口也要求订单号和查询凭证同时正确。
- 登录用户订单列表筛选能力不足，已扩展服务端筛选参数。

仍需注意：

- 历史订单如果没有 `order_query_token_hash`，游客不能查询，需由受控后台或后续订单创建流程生成凭证。
- 当前项目订单表历史定义可能要求 `user_id not null`，因此游客绑定接口只作为兼容预留，不制造假游客订单。

## 登录用户订单查询结果

`/api/orders` 仍强制调用 `supabase.auth.getUser()`，不信任前端传入 `user_id`。

新增或保留筛选：

- 订单号搜索：`search`
- 订单状态：`status`
- 支付状态：`paymentStatus`
- 交付状态：`deliveryStatus`
- 创建时间：`startDate`、`endDate`
- 商品名称：`productSearch`
- SKU 编码或规格：`skuSearch`
- 分页：`page`、`pageSize`

所有查询都基于当前登录用户 `user.id`。

## 未登录查询方式

新增 `/order-query` 页面和 `/api/order-query` 接口。

查询条件：

- 订单号
- 安全查询凭证

失败统一返回：

```text
订单信息或验证信息不正确
```

不会提示订单号是否真实存在。

## 查询凭证结构

新增 migration：`supabase/migrations/20260630_order_query_tokens.sql`

字段：

- `order_query_token_hash`
- `order_query_token_created_at`
- `order_query_token_expires_at`
- `order_query_token_revoked_at`

## 查询凭证哈希方式

服务端工具位于 `lib/orders/order-query-service.ts`：

- `generateOrderQueryToken()` 生成 24 字节随机 base64url token。
- `hashOrderQueryToken()` 使用 SHA-256 保存摘要。
- `verifyOrderQueryToken()` 使用 `timingSafeEqual` 比对摘要。

数据库不保存查询凭证明文。

## 未登录订单展示范围

未登录查询成功只返回：

- 订单号
- 商品名称
- SKU 标题和 SKU 编码
- 商品数量、单价、小计
- 订单金额
- 订单状态
- 支付状态
- 交付状态
- 创建时间
- 最近更新时间

不会返回：

- 完整邮箱
- 完整手机号
- 用户 ID
- Provider 回调数据
- 支付密钥或签名
- 余额流水
- 完整数字交付内容
- 管理员内部备注
- 用户其他订单

## 数字交付访问规则

- 登录用户继续通过 `/api/orders/[orderNo]/delivery` 获取自己的交付内容。
- 未登录 `/api/order-query` 不返回完整交付内容。
- 未登录查询页提示用户登录后查看完整订单和交付内容。
- 本次未新增短期交付访问令牌，采用更安全的“未登录不展示完整交付内容”。

## 游客订单绑定规则

新增 `/api/order-query/bind` 预留接口：

- 必须登录。
- 必须提供订单号、查询凭证和 `confirm=true`。
- 不能通过前端指定任意 `user_id`。
- 已绑定其他用户的订单拒绝绑定。
- 已绑定当前用户的订单幂等返回成功。
- 未绑定订单绑定到当前登录用户后吊销查询凭证。

如果当前生产表仍要求 `orders.user_id not null`，该接口作为未来游客订单兼容设计，不制造假数据。

## 限流和防枚举结果

新增 `order_lookup` 限流策略：

- 按匿名来源哈希限流。
- 按订单号摘要限流。
- 高频失败返回 429 和 `Retry-After`。
- 查询日志不记录完整查询凭证。
- 查询失败不暴露订单是否存在。

## 权限隔离结果

- 登录用户订单列表和详情均绑定当前用户。
- 游客查询必须提供查询凭证。
- 游客查询不返回敏感字段。
- 交付内容仍需要登录身份访问。
- 订单绑定使用服务端当前登录用户，不接受前端 user_id。

## 发现的问题

- 缺少游客安全订单查询页。
- 缺少订单查询凭证字段。
- `/order-tracking` 未指向安全查询流程。
- 登录用户订单筛选能力不完整。

## 已修复的问题

- 新增 `/order-query` 页面。
- 新增 `/api/order-query` 查询接口。
- 新增 `/api/order-query/bind` 绑定预留接口。
- 新增查询凭证 migration。
- 扩展登录用户订单筛选。
- 新增限流策略和静态回归测试。

## 仍存在的问题

- 需要人工执行 migration。
- 历史订单不会自动生成查询凭证。
- 当前未实现游客完整交付内容短期访问令牌，按安全优先默认不展示。
- `/account/orders` 页面仍有较多历史乱码文案，未在本任务中大幅重做 UI。

## 需要执行的 Migration

1. `supabase/migrations/20260630_order_query_tokens.sql`

执行后，新的查询凭证字段才可用。
