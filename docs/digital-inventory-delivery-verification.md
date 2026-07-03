# 数字库存与交付联调验收

更新时间：2026-07-03

## 现有数字库存结构

实际链路使用的核心表：

| 模块 | 表 |
| --- | --- |
| 数字库存 | `digital_inventory` |
| 库存批次 | `digital_inventory_batches` |
| 订单 | `orders` |
| 订单项 | `order_items` |
| 交付记录 | `order_deliveries` |
| 私密交付内容 | `digital_delivery_secrets` |
| 交付日志 | `delivery_logs` |
| 订单项交付日志 | `order_item_delivery_logs` |

库存状态按服务端状态机处理：

`available` 可分配，`reserved` 已预留，`delivered` 已交付，`disabled` 禁用，`expired` 过期。历史 `invalid` 状态继续兼容，但不参与销售和交付。

## 库存导入检查结果

- 导入入口：`app/api/admin/inventory/route.ts`。
- 批量文件和文本导入统一复用 `lib/inventory/import-service.ts`。
- 导入时校验商品真实存在。
- 新增 `sku_id` 支持：传入 SKU 时必须属于当前商品。
- 单规格商品允许 `sku_id = null`。
- 导入预览和审计日志不记录库存明文。
- 文件大小、行数和内容长度由导入服务限制。

## 自动交付调用链路

可信支付完成后：

1. `lib/payments/complete-payment-service.ts` 调用 `complete_payment_session`。
2. 业务类型为订单时调用 `deliverDigitalOrder`。
3. `lib/delivery/delivery-service.ts` 调用 RPC `deliver_digital_order`。
4. RPC 校验订单已支付、未取消、未退款。
5. RPC 按订单项、商品和 SKU 分配库存。
6. 创建 `order_deliveries`。
7. 写入 `digital_delivery_secrets`。
8. 库存标记为 `delivered`。
9. 刷新订单项和订单总体交付状态。

## 交付事务结果

新增 migration：`supabase/migrations/20260703_digital_delivery_atomic_hardening.sql`。

该 migration 覆盖 `deliver_digital_order`，主要修复：

- 未支付订单不能交付。
- 已取消、退款或失败订单不能交付。
- 多数量订单项按数量循环分配库存。
- 多 SKU 严格匹配 `product_id + sku_id`。
- 创建交付记录后再写私密内容，再更新库存状态。
- 任一步失败由数据库事务回滚。
- 同一库存通过唯一索引防止重复交付。
- 同一订单项重复调用只返回幂等结果，不重复发货。

## 支付成功触发结果

- 余额支付、真实 Provider 验签成功和对账补偿都应通过 `completePayment` 进入交付服务。
- 未验签或未配置 Provider 不会触发该链路。
- 交付失败不会回滚支付成功状态，会返回 `deliveryError` 并等待人工处理。

## 权限与数据脱敏

- 普通用户不能读取 `digital_inventory.content`。
- 交付明文只保存在 `digital_delivery_secrets`。
- 用户查看交付内容通过 `get_order_delivery_for_user`，仅允许订单所属用户。
- 后台库存列表、审计日志和交付日志不输出库存明文。

## 实际测试结果

已执行本地静态验证：

- `tsc --noEmit`：通过。
- `npm run build`：通过。

未自动执行 Supabase SQL，以下业务场景需要在测试库执行 migration 后人工验证：

- 单规格数字商品交付。
- 多 SKU 数字商品交付。
- 购买数量为 2。
- 库存刚好充足。
- 库存不足。
- SKU 不匹配。
- 重复支付回调。
- 两个订单并发领取最后一条库存。
- 用户 A 读取用户 B 交付。
- 刷新订单详情和复制交付内容。

## 仍存在的问题

- 需要手动在 Supabase SQL Editor 执行 `20260703_digital_delivery_atomic_hardening.sql`。
- 前端后台库存导入页面是否提供 SKU 下拉入口需在浏览器中继续人工验收；服务端已支持 `sku_id`。
