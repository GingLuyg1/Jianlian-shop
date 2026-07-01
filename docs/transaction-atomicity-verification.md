# 事务原子性专项验收

## 事务风险矩阵

| 链路 | 关键表 | 当前事务边界 | 风险与处理 |
| --- | --- | --- | --- |
| 商品主信息保存 | `products` | 服务端 `updateProduct` 以数据库返回记录为准 | 单表更新失败必须返回错误；缓存失效失败只记录错误，不回滚已提交数据。 |
| 商品与 SKU 保存 | `products`, `product_skus`, SKU 规格表 | 仍依赖服务端保存链路；SKU migration 未执行时会中文提示 | SKU 子流程失败不能显示整体成功；后续建议把商品与 SKU 保存收敛到一个 RPC。 |
| 订单创建 | `orders`, `order_items`, `digital_inventory`, 协议确认表 | `create_order_with_item` RPC | 任一步失败由数据库事务回滚，避免空订单和永久占用库存。 |
| 库存预留 | `products`, `product_skus`, `digital_inventory` | 订单 RPC 内部锁定 | 最后一件库存并发由行锁/RPC 处理；数字库存必须按产品/SKU 过滤。 |
| 支付会话创建 | `payment_sessions` | `reserve_payment_session` RPC | 幂等键复用同一支付会话，Provider 未配置不得生成假支付。 |
| 支付成功处理 | `payment_sessions`, `orders`, `payment_events`, `order_status_logs` | `complete_payment_session` RPC | 重复回调返回已处理结果；金额、币种或签名异常不得提交成功。 |
| 充值入账 | `account_recharges`, `balance_transactions`, `profiles` | `credit_account_recharge_balance` / 支付核心 RPC | 充值、流水和余额必须同事务；重复 Provider 回调不能重复入账。 |
| 管理员余额调整 | `profiles`, `balance_transactions`, `balance_adjustment_requests`, `admin_audit_logs` | `admin_adjust_user_balance` RPC | 使用幂等键；审计失败时高风险操作不得静默成功。 |
| 退款批准 | `refund_requests`, `orders`, `balance_transactions`, `site_notifications` | `admin_process_refund_request` RPC | 可退金额在服务端计算；余额退款不得超额或重复入账。 |
| 数字交付 | `orders`, `order_items`, `digital_inventory`, `order_deliveries`, `delivery_logs` | `deliver_digital_order` RPC | 交付记录和库存 delivered 必须一致；通知失败进入重试，不回滚已交付。 |
| 订单过期关闭 | `orders`, `digital_inventory`, `order_status_logs` | `release_order_inventory` RPC | 未支付订单释放预留库存；已支付/已交付订单不能被错误释放。 |
| 游客订单绑定 | `orders`, `profiles` | 未见完整闭环 | 建议只允许服务端按订单所有权绑定，失败进入补偿或人工审核。 |

## 商品与 SKU 保存事务

- 商品主表更新必须命中当前商品 ID。
- `update` 影响 0 行视为失败。
- 保存成功后以数据库返回值刷新表单基准和列表缓存。
- SKU 保存仍需依赖现有服务端流程；如果 SKU 表缺失，应提示“SKU 表尚未初始化”，不能假装保存成功。
- 建议后续新增 `admin_save_product_with_skus` RPC，将主商品、规格组、规格值和 SKU 一次性提交。

## 订单创建事务

- 订单创建入口使用 `create_order_with_item` RPC。
- 价格和库存由服务端重新读取。
- 订单、订单项、库存预留和协议确认必须同事务完成。
- 失败时不得留下只有 `orders` 没有 `order_items` 的残缺订单。
- 重复请求应依赖 `client_request_id` 或等价幂等字段。

## 库存预留事务

- 普通商品库存与 SKU 库存分开校验。
- 数字库存使用 `available/reserved/delivered/disabled/invalid` 状态。
- 数字库存预留必须绑定订单和 SKU，不能跨 SKU 分配。
- 已交付库存不能恢复为 `available`。

## 支付事务

- Provider 回调先验签，再进入业务事务。
- `complete_payment_session` 负责锁定支付记录、校验金额币种、更新支付状态、同步订单状态和写事件。
- 订单已关闭时不得静默覆盖，应进入异常或补偿。
- 重复回调必须幂等。

## 充值和余额事务

- 充值成功入账必须同事务写入余额流水和用户余额。
- 所有资金操作必须有唯一业务幂等键。
- 余额更新不能使用前端先读后写。
- 管理员余额调整只能通过 RPC，不允许直接编辑余额字段。

## 退款事务

- 可退款金额由服务端统一计算：已支付金额减成功退款和处理中退款。
- 余额退款必须同事务增加余额、写流水、更新退款和订单状态。
- 外部渠道退款未接真实 Provider 时只能登记人工处理，不显示假成功。

## 数字交付事务

- `deliver_digital_order` 是数字交付核心事务。
- 同一订单项只能交付一次。
- 同一库存只能交付一次。
- 通知失败不回滚已完成交付，但需要进入通知重试或人工处理。

## 补偿记录结构

新增 migration：

```text
supabase/migrations/20260701_business_compensation_tasks.sql
```

新增表：

```text
business_compensation_tasks
```

字段包含：

```text
business_type
business_id
business_no
operation
failure_stage
status
retryable
attempts
next_retry_at
error_code
error_summary
request_id
metadata
resolved_by
resolution_note
```

状态：

```text
pending
retrying
manual_review
resolved
cancelled
```

## 后台补偿页面

新增页面：

```text
/admin/system/compensations
```

能力：

- 超级管理员查看补偿任务。
- 按业务类型、状态筛选。
- 缺表时显示中文初始化提示。
- 标记人工审核、已解决或已取消。
- 处理必须填写原因并写入管理员审计日志。
- 页面不提供任意修改余额、支付或库存状态的输入框。

## 需要执行的 Migration

```text
supabase/migrations/20260701_business_compensation_tasks.sql
supabase/migrations/20260701_request_tracing_enhancements.sql
supabase/migrations/20260701_email_notifications.sql
```

## 发现的问题

- 请求追踪入口页面存在中文乱码，已修复。
- 原补偿任务表不存在，已新增兼容 migration 和后台只读处理页面。
- 外部 Provider 已成功但站内事务失败的补偿记录此前没有统一承载结构，已补齐。

## 已修复的问题

- 新增补偿任务结构和只读后台。
- 新增补偿处理审计。
- 补偿任务缺表错误改为中文提示。

## 仍存在的问题

- 商品与多 SKU 保存如需严格全事务，需要后续新增数据库 RPC 收敛全部 SKU 子操作。
- 当前不自动执行 migration，因此线上必须手动执行后补偿页面才会读取真实数据。
- 本次不自动重试补偿任务，只提供人工处理和状态留痕。
