import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Admin V2 detail primitives keep responsive facts, timelines, links, and drawers", () => {
  const detail = file("components/admin/v2/AdminDetail.tsx");
  const info = file("components/admin/v2/AdminInfoGrid.tsx");

  assert.match(detail, /export function AdminDetailBackLink/);
  assert.match(detail, /export function AdminRelatedLink/);
  assert.match(detail, /export function AdminTimeline/);
  assert.match(detail, /export function AdminDetailDrawer/);
  assert.match(detail, /@radix-ui\/react-dialog/);
  assert.match(detail, /<DialogPrimitive\.Root open modal/);
  assert.match(detail, /<DialogPrimitive\.Portal>/);
  assert.match(detail, /<DialogPrimitive\.Overlay/);
  assert.match(detail, /<DialogPrimitive\.Content/);
  assert.match(detail, /<DialogPrimitive\.Title/);
  assert.match(detail, /<DialogPrimitive\.Description/);
  assert.match(detail, /<DialogPrimitive\.Close/);
  assert.match(detail, /min-h-11/);
  assert.match(detail, /overflow-y-auto overflow-x-hidden/);
  assert.match(info, /grid-cols-1/);
  assert.match(info, /\[overflow-wrap:anywhere\]/);
});

test("Admin detail drawer delegates the complete modal keyboard and focus contract to Radix", () => {
  const detail = file("components/admin/v2/AdminDetail.tsx");

  assert.match(detail, /<DialogPrimitive\.Root open modal onOpenChange=/);
  assert.match(detail, /if \(!open\) onClose\(\)/);
  assert.match(detail, /onOpenAutoFocus=/);
  assert.match(detail, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(detail, /onCloseAutoFocus=/);
  assert.match(detail, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(detail, /<DialogPrimitive\.Overlay/);
  assert.match(detail, /<DialogPrimitive\.Close[\s\S]*ref=\{closeButtonRef\}/);
  assert.doesNotMatch(detail, /onEscapeKeyDown=\{[^}]*preventDefault/);
  assert.doesNotMatch(detail, /onPointerDownOutside=\{[^}]*preventDefault/);
});

test("user, risk, and request trace detail pages use the V2 detail hierarchy", () => {
  const user = file("app/admin/users/[userId]/page.tsx");
  const risk = file("app/admin/risk/[id]/page.tsx");
  const trace = file("app/admin/system/request-traces/[requestId]/page.tsx");

  for (const source of [user, risk, trace]) {
    assert.match(source, /AdminPageShell/);
    assert.match(source, /AdminSection/);
    assert.match(source, /AdminInfoGrid/);
    assert.match(source, /AdminReadOnlyBadge/);
    assert.match(source, /AdminDetailBackLink/);
    assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  }
  assert.match(user, /AdminRelatedLink/);
  assert.match(user, /AdminTimeline/);
  assert.match(risk, /AdminRelatedLink/);
  assert.match(risk, /AdminTimeline/);
  assert.match(trace, /AdminTimeline/);
});

test("detail histories remain bounded and strict audit targets remain intact", () => {
  const userApi = file("app/api/admin/users/[userId]/route.ts");
  const risk = file("app/admin/risk/[id]/page.tsx");

  assert.match(userApi, /\.limit\(50\)/);
  assert.match(userApi, /\.limit\(30\)/);
  assert.match(risk, /targetId=\$\{encodeURIComponent\(id\)\}&pageSize=50/);
  assert.match(risk, /log\.target_id === id/);
  assert.match(userApi, /target_id/);
});

test("existing order, payment, recharge and reconciliation actions survive presentation migration", () => {
  const orders = file("app/admin/orders/page.tsx");
  const fulfillment = file("components/admin/orders/OrderFulfillmentPanel.tsx");
  const payments = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const reconciliation = file("components/admin/payments/AdminReconciliationPanel.tsx");

  for (const source of [orders, payments, reconciliation]) assert.match(source, /AdminDetailDrawer/);
  assert.match(orders, /fetch\(`\/api\/admin\/orders\/\$\{order\.id\}`/);
  assert.match(orders, /<OrderFulfillmentPanel/);
  assert.match(fulfillment, /\/items\/\$\{itemId\}\/deliver/);
  assert.match(payments, /\/api\/admin\/payments\/\$\{detail\.id\}/);
  assert.match(payments, /\/api\/admin\/recharges\/\$\{rechargeId\}\/actions/);
  assert.match(reconciliation, /\/reconciliations\/\$\{row\.id\}\/recheck/);
  assert.match(reconciliation, /if \(recheckingRef\.current\.has\(row\.id\)\) return/);
});

test("read-only detail workspaces expose no new unsafe actions", () => {
  const user = file("app/admin/users/[userId]/page.tsx");
  const risk = file("app/admin/risk/[id]/page.tsx");
  const trace = file("app/admin/system/request-traces/[requestId]/page.tsx");

  assert.doesNotMatch(user, /adjust_balance|impersonat|reset_password|delete_user|method:\s*"(?:POST|PATCH|DELETE)"/i);
  assert.doesNotMatch(risk, /submitAction|method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.doesNotMatch(trace, /method:\s*"(?:POST|PATCH|DELETE)"/);
});
