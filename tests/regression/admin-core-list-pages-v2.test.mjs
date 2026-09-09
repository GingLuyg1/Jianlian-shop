import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("six core workspaces share the scoped Admin V2 list pattern", () => {
  const shared = file("components/admin/v2/AdminList.tsx");
  const pageShell = file("components/admin/AdminPageShell.tsx");
  const users = file("app/admin/users/page.tsx");
  const risk = file("app/admin/risk/page.tsx");
  const privacy = file("app/admin/privacy-requests/page.tsx");
  const orders = file("app/admin/orders/page.tsx");
  const payments = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const paymentPage = file("app/admin/payments/page.tsx");
  const rechargePage = file("app/admin/recharges/page.tsx");

  for (const source of [users, risk, privacy, orders, payments]) {
    assert.match(source, /AdminListSurface/);
    assert.match(source, /AdminFilterBar/);
    assert.match(source, /AdminTableViewport/);
    assert.match(source, /AdminListPagination/);
    assert.match(source, /variant="v2"/);
  }
  assert.match(paymentPage, /AdminPaymentRecordsPage mode="payments"/);
  assert.match(rechargePage, /AdminPaymentRecordsPage mode="recharges"/);
  assert.match(pageShell, /variant\?: "default" \| "v2"/);
  assert.match(shared, /rounded-\[var\(--admin-v2-surface-radius\)\]/);
  assert.match(shared, /border-\[var\(--admin-v2-border\)\]/);
  assert.match(shared, /shadow-none/);
  assert.match(shared, /overflow-x-auto overflow-y-auto/);
  assert.match(shared, /h-11[\s\S]*sm:h-9/);
  assert.match(shared, /更多筛选/);
  assert.doesNotMatch(shared, /(?:hover|active):scale-/);
});

test("core list URL filters and server-backed pagination contracts stay intact", () => {
  const contracts = [
    ["app/admin/users/page.tsx", ["search", "status", "role", "risk", "registeredFrom", "registeredTo", "sort", "page", "pageSize"]],
    ["app/admin/risk/page.tsx", ["search", "level", "status", "businessType", "startAt", "endAt", "sort", "page", "pageSize"]],
    ["app/admin/privacy-requests/page.tsx", ["search", "status", "type", "startAt", "endAt", "sort", "page", "pageSize"]],
    ["app/admin/orders/page.tsx", ["search", "status", "paymentStatus", "deliveryType", "attention", "sort", "page", "pageSize"]],
    ["components/admin/payments/AdminPaymentRecordsPage.tsx", ["search", "businessType", "channel", "status", "startDate", "endDate", "sort", "view", "exceptionType", "page", "pageSize"]],
  ];

  for (const [path, queryNames] of contracts) {
    const source = file(path);
    for (const queryName of queryNames) assert.match(source, new RegExp(`(?:["']${queryName}["']|\\b${queryName}\\s*:)`));
    assert.match(source, /totalPages/);
    assert.match(source, /setPage/);
  }
});

test("V2 migration preserves approved actions and exposes no new unsafe list actions", () => {
  const users = file("app/admin/users/page.tsx");
  const risk = file("app/admin/risk/page.tsx");
  const privacy = file("app/admin/privacy-requests/page.tsx");
  const orders = file("app/admin/orders/page.tsx");
  const payments = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const fulfillment = file("components/admin/orders/OrderFulfillmentPanel.tsx");
  const reconciliation = file("components/admin/payments/AdminReconciliationPanel.tsx");

  assert.match(orders, /<OrderFulfillmentPanel/);
  assert.match(orders, /manual_delivery/);
  assert.match(fulfillment, /saving/);
  assert.match(fulfillment, /disabled=\{completed \|\| saving\}/);
  assert.match(reconciliation, /recheck/);
  assert.match(payments, /<AdminReconciliationPanel/);

  assert.doesNotMatch(users, /adjust_balance|impersonat|reset_password|delete_user/i);
  assert.doesNotMatch(risk, /submitAction|method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.doesNotMatch(privacy, /method:\s*"(?:POST|PATCH|DELETE)"|anonymize|erase_request/i);
  assert.doesNotMatch(payments, /callback_replay|force_paid|force_payment_status/i);
  assert.doesNotMatch(orders, /auto_fulfillment_retry|force_delivery|inventory_compensation/i);
});

test("global search keeps its read endpoint and navigation logic while using V2 result tokens", () => {
  const search = file("components/admin/AdminGlobalSearch.tsx");
  assert.match(search, /fetch\(`\/api\/admin\/global-search\?q=/);
  assert.match(search, /router\.push\(result\.href\)/);
  assert.match(search, /bg-\[var\(--admin-v2-selected\)\]/);
  assert.match(search, /bg-\[var\(--admin-v2-surface-muted\)\]/);
});
