# 当前任务：等待正式候选并准备 limit=1 受控验证

更新日期：2026-07-18
目标：正式 dry-run 已通过但没有候选；暂不执行真实过期，等待一个明确的正式测试订单自然过期后，再单独授权 `limit=1`。

## 已完成基线

- 正式项目：Jianlian-shop / `qvbovrvybirscaurwuov`。
- 正式站：`https://jianlian-shop.vercel.app`。
- `20260717_order_expiration_list_rpc_compatibility.sql` 已人工执行，Postcheck 已通过。
- `CRON_SECRET`、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和列表 RPC 的正式运行链路已验证正常。
- 用户已人工执行 `GET /api/internal/orders/expire?dry_run=true&limit=10`：HTTP 200、`success=true`、`dry_run=true`、`candidate_count=0`、`candidates=[]`。
- Dry-run 未修改订单、库存或支付会话。

## 下一阶段

1. 暂不执行真实 `limit=1`。
2. 创建或等待一个明确的正式测试订单自然过期。
3. 候选通过前置核对后，再单独授权一次真实 `limit=1`。
4. `limit=1` 验证通过后，才安装 `pg_cron` / `pg_net` 并创建调度。

## 正式 limit=1 受控验证方案

### 1. 准备指定测试订单

- 订单只能通过正式站正常业务流程创建；本方案不授权创建订单，也不允许通过 SQL、RPC 或直接数据库写入制造候选。
- 明确标记该订单用于受控验证，保存脱敏订单标识和商品/库存基线，不记录用户隐私、完整地址、TxHash 或密钥。
- 不进行真实付款，不提交 TxHash，不触发人工审核、晚到账或其他支付处理。
- 等待 `payment_expires_at` 自然到期，不人工改时间或状态。

### 2. 到期后只读前置核对

必须确认：

- 订单仍为 `status=pending_payment`、`payment_status=unpaid`。
- `reservation_released_at is null`，且到期时间已小于等于当前时间。
- 不存在应阻止自动过期的链上支付会话状态。
- 如果存在 `submitted` 会话，只有 `failure_reason` 非空时才允许继续。
- 订单没有付款、交付、退款、人工审核或其他并发处理迹象。
- 已保存可核对的库存基线，能够判断释放是否准确且只发生一次。

任一条件不明确即停止。

### 3. 紧邻真实验证的 dry-run

- 在新的明确授权下执行 `dry_run=true&limit=1`。
- 必须返回 HTTP 200、`success=true`、`dry_run=true`、`candidate_count=1`。
- 返回的 `order_id_summary` 必须与指定测试订单的脱敏摘要一致。
- 如果候选为 0、摘要不一致、候选发生变化或响应异常，停止，不执行真实请求。

### 4. 单独授权真实 limit=1

- 真实请求是写操作，必须在 dry-run 结果确认后再次取得单独明确授权。
- 只允许执行一次，参数固定为 `limit=1`；不得扩大批次、重复调用或创建调度。
- API 会在调用时重新选择最早候选，不能按订单 ID 定向处理，因此 dry-run 与真实调用之间的时间窗口应尽可能短。

### 5. 成功判定与只读复核

预期批处理响应：

- `processed=1`
- `skipped=0`
- `failed=0`
- 唯一结果 `ok=true`、`code=EXPIRED`

随后只读核对：

- 订单变为 `expired/failed`。
- `expired_at` 已写入。
- `reservation_released_at` 已写入。
- 普通、SKU 或数字库存按订单实际类型准确恢复。
- 不存在重复释放、负库存、额外订单变化或异常支付会话更新。

### 6. 停止与后续边界

- 任何认证、HTTP、候选、状态、支付会话、库存或响应异常都立即停止，不重试、不扩大批次。
- 真实过期没有自动安全回滚；异常时保留证据并进入人工事件处理，不直接反向修改数据库。
- `limit=1` 成功只证明单次受控场景；扩展安装和调度设计仍需新的独立方案与授权。
- 只有上述验证全部通过，才进入 `pg_cron + pg_net` 的安装、Secret 保存、频率、告警、停用和回滚设计。

## 当前禁止事项

- 当前没有候选，不执行真实 `limit=1`。
- 不调用 API，不创建或修改订单，不执行 SQL/RPC/Migration。
- 不安装扩展、不创建 Cron、不修改环境变量、不部署、不 push。
