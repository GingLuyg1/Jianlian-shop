# 退款流程联调与验收记录

## 当前退款结构

当前退款链路使用以下真实表和服务：

- `refund_requests`：退款主记录，包含退款单号、订单、支付记录、用户、申请金额、批准金额、状态、渠道处理状态和审核备注。
- `refund_status_logs`：退款状态变更记录。
- `orders`：保存订单退款状态、累计退款金额、订单状态和支付状态。
- `order_payments`：保存订单支付记录，外部或余额支付成功记录均从这里关联。
- `profiles.balance`：用户站内余额。
- `balance_transactions`：余额退款流水，`business_type='refund'`，`business_id=refund_no`。
- `digital_inventory`：数字库存；退款成功时只释放未交付的 `reserved` 库存，不恢复已交付库存。
- `site_notifications`：站内退款状态通知。
- `admin_audit_logs`：管理员审核、拒绝、取消、失败和人工登记退款操作审计。

## 退款状态机

当前兼容状态：

- `requested`：用户已提交申请。
- `reviewing`：审核中。
- `approved`：审核通过但未完成退款。
- `processing`：退款处理中。
- `succeeded`：退款已完成，终态。
- `failed`：退款失败，可按业务重新处理。
- `rejected`：审核拒绝，终态。
- `cancelled`：取消，终态。

终态 `succeeded`、`rejected`、`cancelled` 不允许被普通审核流程随意回退。重复处理终态退款时，RPC 返回幂等结果，不重复入账。

## 用户退款申请结果

用户入口通过 `POST /api/refunds` 调用 `create_refund_request` RPC：

1. 使用当前登录用户。
2. 按 `order_no + user_id` 锁定订单，用户不能申请他人订单退款。
3. 订单必须已支付。
4. 服务端计算当前可退款金额。
5. 同一订单存在 `requested/reviewing/approved/processing` 退款时拒绝重复申请。
6. `client_request_id` 写入 `refund_requests.client_request_id`，用于幂等保护。
7. 申请成功后订单 `refund_status` 进入 `processing`。

## 可退款金额计算结果

当前使用 `get_order_refundable_amount` / `get_order_refundable_amount_excluding`：

```text
订单实付金额
- succeeded 退款金额
- requested/reviewing/approved/processing 占用金额
= 当前可退款金额
```

`failed`、`rejected`、`cancelled` 不占用最终可退款额度。金额使用数据库 numeric 精度，前端传入金额不会作为最终依据。

## 管理员审核结果

管理员入口：

- 列表页：`/admin/refunds`
- 列表 API：`GET /api/admin/refunds`
- 详情/审核 API：`GET/PATCH /api/admin/refunds/[refundId]`

本次补强：

1. `approve_balance` 只允许 `orders.payment_method='balance'` 且 `refund_requests.refund_method='balance'` 的退款。
2. 外部支付订单不能通过余额退款自动完成。
3. `complete_external` 不能用于余额支付订单。
4. 外部退款登记完成必须填写真实退款参考号或交易摘要。
5. 前端审核抽屉按余额退款/外部退款展示不同动作，避免误点。
6. API 层再次校验，不依赖前端按钮隐藏。
7. 拒绝的操作写入管理员审计日志。

## 余额退款事务结果

余额退款由 `admin_process_refund_request(..., 'approve_balance', ...)` 在数据库函数中完成：

1. 锁定退款记录。
2. 锁定订单。
3. 校验余额支付方式。
4. 重新计算可退款金额。
5. 检查是否已有 `business_type='refund' and business_id=refund_no` 的完成流水。
6. 锁定用户 profile。
7. 增加余额。
8. 创建余额流水。
9. 更新退款状态为 `succeeded`。
10. 更新订单累计退款金额和退款状态。
11. 写入退款状态日志、订单日志和站内通知。

重复调用命中已存在完成流水时不会再次增加余额。

## 重复退款保护结果

保护点：

- 用户申请：同一订单有活动退款时拒绝新申请。
- 管理审核：终态退款返回幂等结果。
- 余额流水：以 `refund_no` 作为业务幂等键检查已完成流水。
- 外部退款：必须有人工真实参考号，不生成假 Provider 单号。
- 订单金额：每次审核前重新计算 `get_order_refundable_amount_excluding`，避免超额。

## 外部渠道退款处理结果

外部渠道包括支付宝、微信、币安、USDT-TRC20、USDT-BEP20。目前未接入真实退款 Provider，因此：

1. 不自动标记退款成功。
2. 不生成假退款单号。
3. 不生成假链上交易哈希。
4. 管理员可以 `mark_processing` 标记人工处理中。
5. 只有真实人工退款完成后，填写参考号并使用 `complete_external` 登记完成。
6. `complete_external` 不会增加站内余额。
7. TRC20 与 BEP20 仍由原订单支付方式区分，不能混用假数据。

## 数字商品退款处理结果

退款成功时，数据库函数只释放：

```sql
reserved_order_id = order.id
and delivered_order_id is null
and status = 'reserved'
```

因此：

- 已交付数字库存不会恢复为 `available`。
- 历史交付记录不会删除。
- 未交付且仍处于预留状态的库存可以释放。
- 已成功退款订单不会再次触发自动发货，本次未修改自动发货核心逻辑。

## 用户退款页面结果

用户退款页 `/account/refunds` 读取当前用户退款记录，展示退款单号、订单号、申请金额、批准金额、状态、申请时间和审核说明。RLS/API 均按当前用户隔离，用户不能查看他人退款。

## 后台退款页面结果

后台退款页 `/admin/refunds` 读取真实退款记录，支持状态、关键词和时间筛选。详情抽屉展示订单、用户、支付、交付快照、历史退款和审核操作。

本次 UI 未重做，仅修复动作可用性和风险提示：余额退款与外部人工退款的操作入口分开。

## 权限与审计结果

- 用户申请退款必须登录，且只能使用自己的订单。
- 后台退款 API 使用 `requireApiAdmin`，普通用户不可访问。
- 余额退款、拒绝、取消、失败、外部退款登记均写入管理员审计。
- API 层新增拒绝审计：外部订单误走余额退款时记录 `denied`。
- 不向前端返回 Supabase 原始 SQL、密钥、Token 或完整支付回调。

## 需要执行的 Migration

需要手动在 Supabase SQL Editor 执行：

```text
supabase/migrations/20260703_refund_flow_hardening.sql
```

该 migration 覆盖 `admin_process_refund_request`，加入数据库层余额/外部退款互斥校验，并在全额退款时同步 `order_payments.status='refunded'`。

## 实际测试结果

已完成静态链路检查和构建级验证。生产数据库未被自动修改，因此以下需要在执行 migration 后用真实订单手动验收：

- 余额支付订单全额退款。
- 余额支付订单部分退款。
- 外部渠道退款人工登记完成。
- 重复批准同一退款。
- 已交付数字商品退款。
- 普通用户访问后台退款接口。

## 仍存在的问题

- 外部 Provider 退款仍为人工登记占位，未接入真实 Provider API。
- migration 未自动执行，需要管理员手动执行。
- 需要真实订单数据进行最终资金流水核对。
