# 大橘AI Supplier Fulfillment V1 候选上线说明

状态：代码与候选数据库合同，仅供离线审查。**DO NOT EXECUTE / 不得执行 Migration、precheck 或 postcheck。**

## 现有结构复用

- 网站商品继续使用 `products` / `product_skus`，用户售价仍为 `products.price` 或 SKU 售价。
- 大橘绑定保存在现有 metadata：`fulfillment_source=supplier`、`supplier=daju`、`supplier_product_id`、可选 `supplier_sku`、`supplier_inputs_mapping` 和 `supplier_max_unit_cost`。
- `supplier_max_unit_cost` 缺失或当前供应商采购价超限时一律不采购，转人工处理；供应商价格绝不自动修改 Jianlian 用户售价。
- 交付内容继续进入现有 `order_deliveries` + `digital_delivery_secrets` 安全读取路径，不创建第二套明文卡密表。

## 服务端配置合同

只允许使用 `DAJU_API_BASE_URL` 和 `DAJU_API_KEY`。不得使用 `NEXT_PUBLIC_*`，不得把真实 Key 写入源码、测试、fixture、Migration、文档或日志。

## 付款后流程

1. 现有付款完成服务调用统一数字交付入口。
2. 服务端只选择 `payment_status=paid`、未取消/过期/退款/失败且 metadata 明确绑定大橘的自动交付订单项。
3. 下单 RPC 跳过该商品的本地数字库存预留，并将大橘绑定固化到 `order_items.product_snapshot.supplier_binding`；履约只信任订单快照，后续商品 metadata 变化不能改写旧订单。
4. 数据库 claim 为每个订单项保存唯一 `jianlian:<order-id>:<order-item-id>`，并产生 attempt token。
5. 读取供应商商品，核对商品、库存、数量范围、required_inputs 和成本上限。
6. `purchase` 始终使用已持久化的同一个 request_id；返回 order_code 但暂无 delivered 时，只查询该 order_code。
7. 成功内容由数据库 RPC 写入现有私密交付结构；普通日志只记录安全码、是否有 order_code 和数量，不记录卡密。

## 失败和不确定结果

- `INSUFFICIENT_BALANCE`、`OUT_OF_STOCK`、`PRODUCT_NOT_FOUND`：FAILED，后台人工处理。
- `RATE_LIMITED`：PENDING，可延后使用相同 request_id 重试。
- `REQUEST_PROCESSING`、`IDEMPOTENCY_UNAVAILABLE`、`UPSTREAM_UNAVAILABLE`、timeout、connection reset：UNCERTAIN/RECONCILIATION。
- UNCERTAIN 不得自动重试采购，不得生成新 request_id；只有已有 order_code 时允许只读查询原供应商订单。
- 若供应商已扣费且本站仍停留在 `PURCHASING`、并且 `provider_order_code` 未能持久化，必须先人工以时间、金额、数量和商品证据唯一关联已有供应商订单。管理员随后只能调用 `reconcile_daju_order`，由服务端 GET 该已有订单并复用原 request_id、原 attempt token 与 `record_daju_supplier_fulfillment_outcome` 私密交付路径；该操作不得调用 `/purchase`。
- `/purchase` 返回最小订单引用时，客户端使用返回的 `order_code` 执行一次 GET 获取完整详情。若 GET 失败，必须把已知 `order_code` 记录为不确定结果，禁止再次采购。

## 本地库存优先 V1

- 对订单快照中已冻结为 `supplier=daju` 的自动交付订单项，支付完成后先由 `reserve_local_inventory_for_daju_order` 尝试一次性锁定全部剩余本地数字库存，再调用现有 `deliver_digital_order`。
- 数量为 1 或大于 1 时都必须满足全部数量可用；库存不足时不预留、不部分交付，整个订单项进入既有大橘 fallback。
- 本地交付完成的订单项在 Daju candidate 分类阶段直接跳过，不创建 `supplier_fulfillment_requests`，也不调用 `/purchase`。
- 已存在 supplier request、未知的部分预留或部分交付状态必须 fail closed；供应商失败后不得回头再次消费本地库存。
- 路由只依据 `order_items.product_snapshot.supplier_binding`，不得读取后续变化的商品或 SKU metadata。
- 数据库 outcome 写入响应丢失也按不确定处理，不再次 purchase。

## 候选数据库文件

1. `docs/audits/20260810-daju-supplier-fulfillment-v1-precheck.sql`
2. `supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql`
3. `docs/audits/20260810-daju-supplier-fulfillment-v1-postcheck.sql`
4. `supabase/migrations/20260810200000_daju_local_inventory_priority_v1.sql`
5. `docs/audits/20260810-daju-local-inventory-priority-v1-postcheck.sql`

本地库存优先应用代码只能在第 4 项成功、且第 5 项返回 `PASS` 后部署；任一步失败均立即停止，不得进入应用部署或供应商采购测试。

必须逐文件、单独授权，禁止 `supabase db push`、`migration up`、`migration repair`、`db reset` 或批量执行。应用代码不得先于数据库合同部署。

回滚必须优先回滚应用代码并停止新的供应商采购，再根据已保存的 `supplier_fulfillment_requests` 人工核对所有 `PURCHASING`、`UNCERTAIN` 和 `RECONCILIATION`。已经采购或交付的供应商订单、`order_deliveries` 和私密交付内容不得删除、重开或重复采购。只有确认没有进行中或未协调请求后，才可在独立授权下撤销新增函数、表和本地库存 RPC 补丁；不得把数据库结构回滚当作业务采购回滚。

## 测试边界

所有测试使用 mock/fake HTTP；禁止真实 `purchase`，禁止使用真实 API Key。本分支没有连接数据库、没有执行 SQL、没有启用任何支付渠道，也没有执行充值、付款、审核、入账或结算。
