# 数字交付失败处理 Runbook

更新时间：2026-07-03

## 停止条件

发现以下任一情况时，不要继续自动重试，应转人工处理：

- 订单未支付。
- 订单已取消、退款或失败。
- 库存不足。
- SKU 不匹配。
- 同一库存疑似被重复分配。
- `order_deliveries` 已存在已交付记录，但库存状态不一致。

## 常见失败类型

| 类型 | 处理方式 |
| --- | --- |
| 库存不足 | 补充对应商品或 SKU 的 `available` 库存后，在后台订单详情重新尝试自动交付。 |
| SKU 不匹配 | 检查 `order_items.sku_id` 与 `digital_inventory.sku_id`，不要手动把其他 SKU 库存交付给该订单项。 |
| 订单状态无效 | 确认订单是否已支付、取消、退款或失败；无可信支付成功前不得交付。 |
| 重复交付 | 检查 `order_deliveries` 和 `digital_inventory.delivered_order_item_id`，不要再次人工提交。 |
| 事务失败 | 记录 request_id 和订单号，检查最新 migration 是否已执行。 |
| 通知失败 | 不回滚已成功交付，单独重试通知任务。 |

## 后台人工交付原则

1. 只允许超级管理员操作。
2. 只能对 `manual_delivery` 类型订单项提交人工交付。
3. 必须填写交付内容和操作原因。
4. 已交付订单项不得重复提交。
5. 人工交付内容只写入当前订单项。
6. 审计日志只记录摘要，不记录交付明文。

## 核查 SQL

只读检查订单项交付状态：

```sql
select
  oi.id,
  oi.order_id,
  oi.product_id,
  oi.sku_id,
  oi.quantity,
  oi.delivery_type,
  oi.delivery_status,
  oi.delivered_quantity,
  oi.delivery_failure_reason
from public.order_items oi
where oi.order_id = '<order_uuid>'
order by oi.created_at;
```

只读检查交付记录：

```sql
select
  od.id,
  od.order_id,
  od.order_item_id,
  od.product_id,
  od.sku_id,
  od.inventory_id,
  od.delivery_type,
  od.delivery_status,
  od.delivered_at,
  od.failure_reason
from public.order_deliveries od
where od.order_id = '<order_uuid>'
order by od.created_at;
```

只读检查库存状态，不读取 `content`：

```sql
select
  di.id,
  di.product_id,
  di.sku_id,
  di.status,
  di.reserved_order_id,
  di.reserved_order_item_id,
  di.delivered_order_id,
  di.delivered_order_item_id,
  di.delivered_at
from public.digital_inventory di
where di.product_id = '<product_uuid>'
order by di.updated_at desc
limit 50;
```

## 需要执行的 Migration

```text
supabase/migrations/20260703_digital_delivery_atomic_hardening.sql
```

执行前必须备份数据库。执行后先在测试订单上验证，再处理真实订单。
