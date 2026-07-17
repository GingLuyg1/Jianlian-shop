# 当前任务：正式订单过期 API dry-run 准备

更新日期：2026-07-18
目标：在正式列表 RPC 已部署并通过 Postcheck 的基础上，准备受控 dry-run；本轮不修改环境变量、不调用 API，也不进入真实过期或调度。

## 已完成基线

- 正式项目：Jianlian-shop / `qvbovrvybirscaurwuov`，`main / PRODUCTION`。
- 用户已人工执行 `20260717_order_expiration_list_rpc_compatibility.sql`；执行前 SHA-256 为 `7A3BBF6397F6A51DA56C8C9158077CCEE120AA9F152AEBE0E1D3766866041519`，SQL Editor 返回 Success。
- Postcheck 已确认 `public.list_expirable_unpaid_orders(integer)` 存在，返回 `TABLE(order_id uuid)`，owner 为 `postgres`，使用 `plpgsql`、`SECURITY DEFINER` 与 `search_path=public`。
- 完整函数定义与批准的 Migration 一致；`service_role` 有 EXECUTE，`anon`、`authenticated`、`PUBLIC` 无 EXECUTE。
- 三份 Postcheck 证据已整理到 `docs/audits/postcheck-results/`。
- 人工执行规范：`docs/runbooks/production-order-expiration-dry-run.md`。

## 下一阶段

1. 正式环境 `CRON_SECRET` 准备。
2. 正式 API dry-run。
3. 根据候选结果选择 `limit=1` 验证。
4. 验证成功后再设计 `pg_cron + pg_net` 调度。

## Dry-run 执行准备方案

### 前置条件

- 人工确认正式站点基准 URL，不使用 Preview、测试或本地地址。
- 在正式运行环境准备独立、高强度的 `CRON_SECRET`，仅配置于服务端；本轮不创建、读取或修改其值。
- 确认正式部署已加载该配置，并具备现有 Supabase service-role 服务端配置；不得把任何值复制到文档或执行记录。
- dry-run 需要新的明确授权，并应避开短时间重复请求。当前 `internal_task` 限流为每 5 分钟最多 3 次。

### 推荐请求

```text
GET https://<正式站点域名>/api/internal/orders/expire?dry_run=true&limit=10
Authorization: Bearer <CRON_SECRET>
Accept: application/json
```

- URL 路径固定为 `/api/internal/orders/expire`；正式站点域名仍需人工确认。
- `dry_run=true` 必须显式提供。
- 建议首次显式使用 `limit=10`；dry-run 默认 10、最小 1、最大 50。
- 也支持 POST JSON `{"dry_run":true,"limit":10}`，但首次人工验证优先使用参数更直观的 GET。
- 代码也接受 `x-internal-job-secret: <CRON_SECRET>`，但正式方案优先统一采用 Bearer。

### 预期响应

成功时应为 HTTP 200，结构如下：

```json
{
  "success": true,
  "requestId": "<request-id>",
  "dry_run": true,
  "candidate_count": 1,
  "candidates": [
    { "order_id_summary": "<脱敏订单 UUID 摘要>" }
  ]
}
```

- `candidate_count` 应与 `candidates` 数量一致且不超过请求 limit。
- 响应不得包含完整订单 UUID、密钥、地址或环境变量值。
- dry-run 只读取列表 RPC，不调用 `expire_unpaid_order`，订单、支付会话和库存都不应变化。

### 后续判断

- `candidate_count=0`：记录 dry-run 成功但无候选，停止，不执行 `limit=1`。
- `candidate_count>0`：只记录脱敏摘要；先对候选规则和正式环境状态做独立复核，再申请真实 `limit=1` 授权。
- 非 dry-run 的 `limit=1` 不能指定 dry-run 中某个摘要，而是重新选择调用时最早的候选。候选集合可能在两次请求之间变化，因此真实调用前应再次 dry-run `limit=1` 并比较摘要；任何变化都应暂停复核。

## 风险与停止条件

- 正式域名、项目或运行环境无法明确确认时停止。
- `CRON_SECRET` 尚未配置、来源不明、疑似泄露，或部署尚未加载时停止。
- HTTP 401 表示认证失败；HTTP 503 可能表示任务密钥未配置或列表 RPC 调用不可用；其他 HTTP 5xx 可能表示服务端数据库配置或运行错误；HTTP 429 表示触发限流。任何非 200 都停止，不通过重复请求绕过。
- HTTP 200 但 `success` 或 `dry_run` 不为 true、缺少 `requestId`、响应结构不符、出现完整敏感标识或候选数异常时停止。
- 发现订单、支付会话或库存发生任何变化时立即停止并保留证据。
- dry-run 成功不授权 `limit=1`、Cron、扩展安装、环境变量变更或部署；这些步骤必须分别获得明确授权。
