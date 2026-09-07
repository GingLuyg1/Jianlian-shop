import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("manual-delivery attention opens the existing guarded per-item delivery workflow", () => {
  const orders = file("app/admin/orders/page.tsx");
  const panel = file("components/admin/orders/OrderFulfillmentPanel.tsx");
  const route = file("app/api/admin/orders/[orderId]/items/[itemId]/deliver/route.ts");

  assert.match(orders, /attention === "manual_delivery" \? "处理交付" : "查看"/);
  assert.match(orders, /<OrderFulfillmentPanel/);
  assert.match(panel, /window\.confirm\("确认提交该订单项的人工交付内容/);
  assert.match(panel, /disabled=\{completed \|\| saving\}/);
  assert.match(panel, /await onReload\(\)/);
  assert.match(route, /getServerAdminContext\(\)/);
  assert.match(route, /rpc\("admin_deliver_order_item_manual"/);
  assert.match(route, /writeAdminAuditLog/);
});

test("reconciliation recheck is confirmed, single-flight in the UI, and state-gated on the server", () => {
  const panel = file("components/admin/payments/AdminReconciliationPanel.tsx");
  const route = file("app/api/admin/payments/reconciliations/[reconciliationId]/recheck/route.ts");

  assert.match(panel, /useRef\(new Set<string>\(\)\)/);
  assert.match(panel, /recheckingRef\.current\.has\(row\.id\)/);
  assert.match(panel, /AlertDialog/);
  assert.match(panel, /pendingRecheck/);
  assert.match(panel, /recheckingRef\.current\.add\(row\.id\)/);
  assert.match(panel, /await loadRows\(\)/);
  assert.match(panel, /await loadDetail\(row\)/);
  assert.match(route, /RECHECKABLE_RESULTS = new Set\(\["mismatched", "query_failed", "manual_review"\]\)/);
  assert.match(route, /getServerAdminContext\(\)/);
  assert.match(route, /isUuid\(params\.reconciliationId\)/);
  assert.match(route, /reconciliation_not_found/);
  assert.match(route, /recheck_status_not_allowed/);
  assert.match(route, /recheck_record_invalid/);
  assert.match(route, /writeAdminAuditLog/);
  assert.match(route, /beforeSummary/);
  assert.match(route, /afterSummary/);
  assert.match(route, /safeRecheckResult/);
  assert.match(route, /runPaymentReconciliation/);
});

test("callback replay remains absent, failed automatic delivery remains unexposed, and shortage remains navigation-only", () => {
  const callbackRoute = file("app/api/admin/payments/callbacks/route.ts");
  const orders = file("app/admin/orders/page.tsx");
  const actionCenter = file("app/admin/page.tsx");

  assert.doesNotMatch(callbackRoute, /export async function (?:POST|PATCH|DELETE)/);
  assert.doesNotMatch(orders, /retry_auto_delivery/);
  assert.doesNotMatch(orders, /manual_inventory/);
  assert.match(actionCenter, /\/admin\/orders\?attention=inventory_shortage/);
});
