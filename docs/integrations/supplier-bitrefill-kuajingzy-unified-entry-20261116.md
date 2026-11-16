# Bitrefill + 跨境资源网统一供应商接入（2026-11-16）

本变更只建立统一供应商管理与能力发现入口，不开启新的真实采购。

## Bitrefill

- 复用现有 Personal API / MCP、目录、采购持久化、私密交付和 Production runtime 代码。
- 统一 capability registry 标记为 `release_gated`，因此 `canSupplierAutoPurchase("bitrefill")` 仍为 false。
- 新增统一 super-admin 只读入口，用现有 Personal API 读取目录，用 MCP allowlist 读取余额。
- 不修改 `REAL_BITREFILL_PURCHASE_ENABLED`，不增加 env-only 绕过。

## 跨境资源网（KuajingZy）

- 从历史 Draft 分支选择性迁入已验证的只读目录、分页/限流、SKU 候选映射、金额/幂等合同与离线采购保护代码。
- server-only runtime 仅构造 `createKuajingZyReadonlyClient`。
- 新增统一 super-admin 只读余额、关键词目录与 itemId 查询入口。
- capability registry 的 purchase/orderLookup/delivery/reconciliation 均为 false。
- 未注册真实采购 handler，未执行 POST，下单持久化与私密交付仍属于后续独立阶段。

## 安全边界

- 无 Production DB migration。
- 无 Production 部署。
- 无真实供应商采购。
- 无 timer 变更。
- 不提交 API Key 或供应商私密响应。
- Daju 的 purchase-disabled Production 状态不变。
