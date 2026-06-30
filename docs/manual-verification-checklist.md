# Jianlian Shop Manual Verification Checklist

Date: 2026-06-30

Rules:

- Do not mark untested items as passed.
- Do not create fake successful payment records.
- Use clearly named test products such as `[TEST] SKU delivery product`.
- Do not delete real historical orders.
- Record reproduction steps when a test fails.
- Browser automation is not required by this checklist.

| ID | Area | Priority | Requires migration? | Test steps | Expected result | Actual result | Status | Error message | request_id | Screenshot path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MV-01 | Product create | P0 | No | Create a `[TEST]` product in `/admin/products`; save; reopen product list. | Product is returned by API, appears in list, and persists after refresh. | 代码静态验证通过；浏览器未测试 | 未测试 |  |  |  | API 返回持久化记录；仍需真实管理员账号浏览器验证。 |
| MV-02 | Product edit | P0 | No | Edit name, price, status and category; save. | API returns persisted row; updated values are shown immediately. | 代码静态验证通过；浏览器未测试 | 未测试 |  |  |  | PATCH 后 select 最新行，0 行或验证不一致会失败。 |
| MV-03 | Close after product save | P0 | No | Save product, then close edit drawer/modal without clicking cancel. | Dialog closes without stale unsaved-change prompt. | 代码静态验证通过；浏览器未测试 | 未测试 |  |  |  | 保存成功后重建初始表单并调用关闭逻辑；仍需真实 UI 验证。 |
| MV-04 | Product refresh persistence | P0 | No | Save product, refresh browser, reopen product. | Latest values remain visible. | 代码静态验证通过；浏览器未测试 | 未测试 |  |  |  | API 已以数据库最新值为准；刷新持久性需真实 DB 验证。 |
| MV-05 | Category three-column linkage | P1 | No | Open category admin; create/edit parent, child and leaf category selections. | Columns update without losing selected branch. | 未测试 | 未测试 |  |  |  |  |
| MV-06 | Multi-SKU creation | P0 | Yes | Execute required SKU migration in test DB; create option groups/values/SKUs from admin UI if available. | SKU combinations are created with stable IDs and prices. | 本地组合逻辑测试通过；UI 未完成 | 被 Migration 阻塞 |  |  |  | `node --test tests/unit/*.test.mjs` 覆盖组合去重和保留已有 SKU；admin UI 仍不完整。 |
| MV-07 | Multi-SKU save | P0 | Yes | Edit SKU price/stock/status; save and reopen. | SKU row persists; partial SKU child save failure is reported as failure. | 本地组合逻辑测试通过；UI 未完成 | 被 Migration 阻塞 |  |  |  | 已验证重新生成组合不覆盖已有价格/库存；真实保存需 migration/UI。 |
| MV-08 | Frontend SKU selection | P0 | Yes | Open SKU product detail; select valid/invalid/sold-out combinations. | Valid SKU can be selected; invalid and sold-out SKUs are disabled; order sends real `sku_id`. | 服务端校验存在；前端完整 SKU selector 未测试 | 被 Migration 阻塞 |  |  |  | `/api/orders` active SKU 存在时要求 `sku_id`。 |
| MV-09 | Direct purchase | P0 | Yes | Open a single-SKU product; click buy now; submit checkout. | Order is created once with correct amount and `client_request_id`. | 本地金额/幂等逻辑测试通过；浏览器未测试 | 被 Migration 阻塞 |  |  |  | 服务端不接收前端金额；真实创建依赖 `create_order_with_item` RPC。 |
| MV-10 | Duplicate order prevention | P0 | Yes | Submit same checkout request twice with the same `client_request_id`. | Duplicate order is not created. | 本地幂等逻辑测试通过；真实 RPC 未测试 | 被 Migration 阻塞 |  |  |  | 需要执行 idempotency migration 后用真实 DB 复测。 |
| MV-11 | Payment provider unconfigured state | P0 | No | Create payment session for test order with current provider config. | UI/API clearly reports provider not configured; no fake paid state is produced. | 未测试 | 未测试 |  |  |  | Real collection is not allowed. |
| MV-12 | Digital inventory import | P1 | Yes | Import `[TEST]` digital inventory lines for one product. | Batch is recorded, inventory count increases, raw content is not exposed in list APIs. | 本地权限/库存逻辑测试通过；真实导入未测试 | 被 Migration 阻塞 |  |  |  | SKU-specific import UI remains incomplete. |
| MV-13 | SKU digital inventory isolation | P0 | Yes | Import inventory for SKU A; create order for SKU B. | SKU B order does not receive SKU A inventory. | 本地 SKU 隔离逻辑测试通过；真实导入未测试 | 被 Migration 阻塞 |  |  |  | Unit test confirms SKU A stock is not used for SKU B. |
| MV-14 | Automatic delivery | P1 | Yes | Pay/mark a test digital order through allowed test path; trigger delivery. | One delivery is created and visible to the buyer only. | 未测试 | 未测试 |  |  |  | Do not fake provider success. |
| MV-15 | Duplicate delivery callback | P1 | Yes | Replay the same paid callback/delivery trigger in staging. | No duplicate inventory is delivered. | 本地幂等逻辑测试通过；staging 未测试 | 被 Provider 阻塞 |  |  |  | Unit test confirms duplicate delivery returns reused result; real callback replay still required. |
| MV-16 | User order view | P1 | Yes | Login as test user; open `/my-orders` and order detail. | User sees only own orders and own delivery content. | 未测试 | 未测试 |  |  |  |  |
| MV-17 | Admin permission | P0 | Yes | Login as non-admin; request admin pages and admin APIs. | Access is denied. | 本地权限逻辑测试通过；真实账号未测试 | 被 Migration 阻塞 |  |  |  | Unit test covers anonymous=401 and normal user=403. |
| MV-18 | Cross-user data isolation | P0 | Yes | Login as user A and request user B order/payment/refund endpoints. | Access is denied or returns no cross-user data. | 本地资源归属逻辑测试通过；真实账号未测试 | 被 Migration 阻塞 |  |  |  | Unit test covers user A cannot access user B resource. |
| MV-19 | Refund request | P1 | Yes | User submits refund on refundable test order. | Refund request is created without over-refund. | 未测试 | 未测试 |  |  |  |  |
| MV-20 | Super admin status page | P1 | Yes | Login as super admin and open `/admin/system/project-status`; click rerun check. | Page loads without secrets; audit log records the check. | 未测试 | 未测试 |  |  |  |  |

## Product Save Specific Acceptance

The product save issue is not fully closed until all of these are recorded:

- Save success includes a returned database record.
- 0-row update is treated as failure.
- Save success does not force the operator to click Cancel.
- Cancel does not overwrite saved data.
- Reopen after save displays latest values.
- Browser refresh after save displays latest values.
- Product list and category product columns refresh after save.

## Failure Recording

For any failed item, record:

- Exact account used, excluding passwords and secrets.
- Test product/order identifier.
- Full reproduction steps.
- API route and request_id if available.
- Error message shown in UI or API response.
- Screenshot path if captured.

## 2026-06-30 本地安全逻辑测试

命令：

```powershell
$files = Get-ChildItem -LiteralPath D:\Jianlian-shop\tests\unit -Filter *.test.mjs | ForEach-Object { $_.FullName }
node --test @files
```

结果：

- 19 项通过，0 项失败。
- 覆盖商品 payload 校验、dirty 状态归一、SKU 组合生成/去重/保留已有 SKU、订单金额不信任前端价格、client_request_id 幂等、Provider 未配置拒绝回调、金额/币种不一致拒绝、充值回调幂等、库存 SKU 隔离、库存预留/交付幂等、管理员和资源归属授权。

说明：

- 这些测试是本地纯逻辑测试，不替代浏览器人工测试、Supabase RLS 测试、RPC 实际执行测试或真实 Provider 沙箱测试。
