# Jianlian Shop 业务编号、全局搜索与业务时间线验收

## 现有业务编号清单

| 模块 | 当前真实编号字段 | 生成位置 | 说明 |
| --- | --- | --- | --- |
| 订单 | `orders.order_no` | 订单创建 SQL/RPC 与服务端订单流程 | 历史展示编号含 `JL` 前缀，新规范继续兼容，不重写历史编号。 |
| 支付会话 | `payment_sessions.session_no`、`provider_order_no`、`provider_transaction_id` | 支付会话创建流程/支付 Provider 返回 | Provider 单号只作为外部参考，不作为内部主键展示。 |
| 支付记录 | `order_payments.payment_no`、`provider_trade_no` | 订单支付记录创建流程 | 支付记录可通过后台全局搜索定位。 |
| 充值 | `account_recharges.recharge_no`、`provider_trade_no`、`client_request_id` | 充值创建流程 | `client_request_id` 用于幂等，不作为客服展示编号。 |
| 退款 | `refund_requests.refund_no` | 退款申请流程 | 缺表时全局搜索降级为中文读取失败。 |
| 余额流水 | `balance_transactions.transaction_no` | 余额流水创建流程 | 兼容历史 `BT` 前缀。 |
| 交付记录 | `order_deliveries.delivery_no`（可能未执行迁移） | 数字交付迁移/发货流程 | 查询失败不影响订单详情其他关联模块。 |
| 库存批次 | `digital_inventory_batches.batch_no`、`digital_inventory.batch_no` | 库存导入/批次创建 | 批次号用于库存追踪。 |
| SKU | `product_skus.sku_code` | SKU 保存流程 | 用于商品与 SKU 搜索。 |
| 用户 | `profiles.id`、`profiles.email` | Supabase Auth/Profile | 后台显示邮箱摘要，内部 UUID 不作为主要客服编号。 |
| 审计 | `admin_audit_logs.request_id` | 审计日志服务 | 用于追踪管理员操作。 |

## 编号冲突风险

- 历史订单继续使用 `JL` 规则，未来统一编号服务提供 `ORD/PAY/RCH/REF/DLV/TXN/BAT` 前缀，不会重写旧数据。
- 仅依赖时间戳的编号存在并发冲突风险，因此新增 `lib/business/business-ids.ts` 使用日期加随机字节后缀生成未来业务编号。
- 本次 migration 仅增加“非空编号唯一索引”和查询索引，历史空编号不被修改。
- 若线上存在重复非空编号，需要先人工排查后再执行唯一索引 migration。

## 统一编号规范

新业务编号建议统一使用：

- 订单：`ORD-YYYYMMDDHHmmss-随机序列`
- 支付：`PAY-YYYYMMDDHHmmss-随机序列`
- 充值：`RCH-YYYYMMDDHHmmss-随机序列`
- 退款：`REF-YYYYMMDDHHmmss-随机序列`
- 交付：`DLV-YYYYMMDDHHmmss-随机序列`
- 流水：`TXN-YYYYMMDDHHmmss-随机序列`
- 批次：`BAT-YYYYMMDDHHmmss-随机序列`

实现文件：`lib/business/business-ids.ts`。当前仅建立统一工具，未强制替换历史业务流程，避免破坏已上线编号兼容性。

## 全局搜索实现

- 后台顶部加入 `AdminGlobalSearch`。
- API：`GET /api/admin/global-search?q=...`。
- 服务端通过 `getServerAdminContext()` 校验管理员权限。
- 搜索只走白名单模块：订单、支付、充值、退款、余额流水、商品与 SKU、用户、库存批次。
- 搜索结果按业务类型分组，编号精确匹配优先。
- 单模块查询失败只显示该组“读取失败”，不会导致整页白屏。
- 搜索接口限制关键词 2～80 字符，并做 60 秒 40 次的内存限流。
- 搜索操作写入管理员审计，关键词只记录脱敏摘要。

## 搜索结果分组

已实现分组：订单、支付、充值、退款、余额流水、商品与 SKU、用户、库存批次。

每条结果包含：业务类型、业务编号、摘要、用户摘要、金额或状态、创建时间和跳转入口。搜索结果不返回密码、Token、Service Role、完整支付回调或数字库存原文。

## 订单关联视图

后台订单详情抽屉新增“关联业务”：

- 订单
- 订单项
- 支付会话
- 成功支付记录
- 退款申请
- 余额流水
- 数字库存预留
- 交付记录
- 站内通知
- 管理员审计记录

查询文件：`lib/admin/order-relations.ts`，API：`GET /api/admin/orders/[orderId]/relations`。

关联关系全部基于真实外键或业务 ID：订单 ID、订单号、业务类型、业务 ID、订单项 ID，不通过相近金额或相近时间猜测。

## 业务时间线

订单详情抽屉新增“业务时间线”，事件来源包括：订单、订单项、支付会话、支付记录、退款、余额流水、交付、数字库存、通知和管理员操作。

事件按真实时间排序，重复事件会通过事件 ID 去重。管理员操作只显示操作人摘要，不展示内部备注、密钥、完整交付内容或回调原文。

## 跨模块跳转

当前支持：

- 订单 → 支付列表筛选
- 订单 → 退款列表筛选
- 订单 → 用户/余额流水筛选
- 订单 → 商品列表筛选
- 订单 → 库存批次筛选
- 订单 → 审计日志筛选
- 搜索结果 → 对应后台列表筛选

所有跳转指向已有后台路由。列表页对筛选参数的深度响应能力取决于各模块现有实现，本次不创建不存在的假详情页。

## 权限与限流

- 全局搜索和订单关联 API 均仅允许管理员访问。
- 未登录或非管理员由 `getServerAdminContext()` 返回 401/403。
- 普通用户不能指定任意表名或字段名。
- 搜索结果数量按组限制，避免一次返回大量完整数据。
- 搜索接口写审计日志，限流命中也写失败审计。

## 新增索引或 Migration

新增 migration：`supabase/migrations/20260630_business_id_global_search_indexes.sql`。

该文件只添加兼容索引和非空编号唯一约束，不会自动执行。执行前建议先检查线上是否存在重复非空编号。

## 发现的问题

1. 后台订单页在本轮开始时被上一次失败写入破坏，文件顶部存在非法 `` `r`n`` 和 PowerShell 残留文本，已重写恢复。
2. 业务编号分散在多个模块，缺少统一生成工具，已新增统一工具用于后续流程收敛。
3. 后台缺少跨模块搜索入口，客服查询订单、支付、充值和退款需要人工切换页面，已新增全局搜索。
4. 订单详情缺少支付、退款、库存、交付、审计的统一追踪视图，已新增关联业务和时间线。

## 已修复的问题

- 修复后台订单页损坏导致无法编译的问题。
- 新增后台顶部全局搜索入口。
- 新增服务端全局搜索 API，支持权限、限流和审计。
- 新增订单关联业务 API 与订单详情抽屉展示。
- 新增统一业务编号工具和兼容索引 migration。

## 仍存在的问题

- `delivery_no`、部分通知业务字段和退款表依赖对应 migration 是否已在线上执行；未执行时对应关联分组会显示中文“读取失败”，不会白屏。
- 本次不自动替换现有订单/支付/充值创建逻辑的编号格式，避免影响历史兼容；后续新模块可逐步调用统一编号服务。
- 全局搜索的跨模块跳转目前以列表筛选为主，不创建新的支付/充值/退款独立详情页。

## 测试记录

待执行：项目现有 Node 测试、`tsc --noEmit`、`npm run build`。
