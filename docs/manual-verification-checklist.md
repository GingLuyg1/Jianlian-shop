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
| MV-01 | Product create | P0 | No | Create a `[TEST]` product in `/admin/products`; save; reopen product list. | Product is returned by API, appears in list, and persists after refresh. | 未测试 | 未测试 |  |  |  |  |
| MV-02 | Product edit | P0 | No | Edit name, price, status and category; save. | API returns persisted row; updated values are shown immediately. | 未测试 | 未测试 |  |  |  |  |
| MV-03 | Close after product save | P0 | No | Save product, then close edit drawer/modal without clicking cancel. | Dialog closes without stale unsaved-change prompt. | 未测试 | 未测试 |  |  |  |  |
| MV-04 | Product refresh persistence | P0 | No | Save product, refresh browser, reopen product. | Latest values remain visible. | 未测试 | 未测试 |  |  |  |  |
| MV-05 | Category three-column linkage | P1 | No | Open category admin; create/edit parent, child and leaf category selections. | Columns update without losing selected branch. | 未测试 | 未测试 |  |  |  |  |
| MV-06 | Multi-SKU creation | P0 | Yes | Execute required SKU migration in test DB; create option groups/values/SKUs from admin UI if available. | SKU combinations are created with stable IDs and prices. | 未测试 | 未测试 |  |  |  | Admin UI is currently incomplete. |
| MV-07 | Multi-SKU save | P0 | Yes | Edit SKU price/stock/status; save and reopen. | SKU row persists; partial SKU child save failure is reported as failure. | 未测试 | 未测试 |  |  |  | Admin UI is currently incomplete. |
| MV-08 | Frontend SKU selection | P0 | Yes | Open SKU product detail; select valid/invalid/sold-out combinations. | Valid SKU can be selected; invalid and sold-out SKUs are disabled; order sends real `sku_id`. | 未测试 | 未测试 |  |  |  | Frontend selector is currently incomplete. |
| MV-09 | Direct purchase | P0 | Yes | Open a single-SKU product; click buy now; submit checkout. | Order is created once with correct amount and `client_request_id`. | 未测试 | 未测试 |  |  |  | Do not treat payment as complete. |
| MV-10 | Duplicate order prevention | P0 | Yes | Submit same checkout request twice with the same `client_request_id`. | Duplicate order is not created. | 未测试 | 未测试 |  |  |  | Requires idempotency migration. |
| MV-11 | Payment provider unconfigured state | P0 | No | Create payment session for test order with current provider config. | UI/API clearly reports provider not configured; no fake paid state is produced. | 未测试 | 未测试 |  |  |  | Real collection is not allowed. |
| MV-12 | Digital inventory import | P1 | Yes | Import `[TEST]` digital inventory lines for one product. | Batch is recorded, inventory count increases, raw content is not exposed in list APIs. | 未测试 | 未测试 |  |  |  | SKU-specific import is incomplete. |
| MV-13 | SKU digital inventory isolation | P0 | Yes | Import inventory for SKU A; create order for SKU B. | SKU B order does not receive SKU A inventory. | 未测试 | 未测试 |  |  |  | Requires SKU migration and real SKU flow. |
| MV-14 | Automatic delivery | P1 | Yes | Pay/mark a test digital order through allowed test path; trigger delivery. | One delivery is created and visible to the buyer only. | 未测试 | 未测试 |  |  |  | Do not fake provider success. |
| MV-15 | Duplicate delivery callback | P1 | Yes | Replay the same paid callback/delivery trigger in staging. | No duplicate inventory is delivered. | 未测试 | 未测试 |  |  |  | Needs provider sandbox or controlled callback test. |
| MV-16 | User order view | P1 | Yes | Login as test user; open `/my-orders` and order detail. | User sees only own orders and own delivery content. | 未测试 | 未测试 |  |  |  |  |
| MV-17 | Admin permission | P0 | Yes | Login as non-admin; request admin pages and admin APIs. | Access is denied. | 未测试 | 未测试 |  |  |  |  |
| MV-18 | Cross-user data isolation | P0 | Yes | Login as user A and request user B order/payment/refund endpoints. | Access is denied or returns no cross-user data. | 未测试 | 未测试 |  |  |  |  |
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
