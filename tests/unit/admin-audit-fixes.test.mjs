import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("P0 dead admin system routes exist and render real workspaces", () => {
  assert.match(read("app/admin/system/page.tsx"), /ProductionReadinessClient/);
  assert.match(read("app/admin/system/consistency/page.tsx"), /DataConsistencyClient/);
  assert.match(read("next.config.js"), /digital-steam\.jpg/);
});

test("P0 dashboard summary uses real ticket counts and exact active product count", () => {
  const summaryRoute = read("app/api/admin/dashboard/summary/route.ts");
  assert.match(summaryRoute, /getAdminTicketCountsFast/);
  assert.doesNotMatch(summaryRoute, /\.from\("support_tickets"\)/);
  assert.match(summaryRoute, /activeProducts/);
  assert.match(summaryRoute, /selectAllPaginated/);
});

test("P0 payment timezone filter uses +08:00 and order search supports UUIDs & underscores", () => {
  const paymentQueries = read("lib/payments/admin-payment-queries.ts");
  assert.match(paymentQueries, /T00:00:00\+08:00/);
  assert.match(paymentQueries, /T23:59:59\.999\+08:00/);
  assert.match(paymentQueries, /payment_session_no:/);

  const orderQueries = read("lib/orders/order-queries.ts");
  assert.match(orderQueries, /id\.eq\.\$\{rawSearch\},user_id\.eq\.\$\{rawSearch\}/);
  assert.doesNotMatch(orderQueries, /replace\(\/\[\\\\\%_\*\(\),\]\/g/);
});

test("P0 sensitive admin write routes enforce super_admin and write rate limits", () => {
  for (const rel of [
    "app/api/admin/payment-channels/route.ts",
    "app/api/admin/settings/route.ts",
    "app/api/admin/recharges/[rechargeId]/actions/route.ts",
    "app/api/admin/suppliers/kuajingzy/bindings/[productId]/route.ts",
    "app/api/admin/suppliers/kuajingzy/stock/[productId]/route.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /getServerSuperAdminContext/, `${rel} must require super_admin`);
    assert.match(src, /checkRateLimit/, `${rel} must enforce rate limit`);
  }

  const refundDetail = read("app/api/admin/refunds/[refundId]/route.ts");
  assert.doesNotMatch(refundDetail, /select\("\*,orders\(\*/);
  assert.match(refundDetail, /checkRateLimit/);

  const emailTemplatesRoute = read("app/api/admin/notifications/email-templates/route.ts");
  assert.match(emailTemplatesRoute, /requireSuperAdmin\(false\)/);
  assert.match(emailTemplatesRoute, /requireSuperAdmin\(true\)/);
});

test("P1 confirm dialog, Chinese labels, responsive filter bars, and ticket URL wrap", () => {
  assert.match(read("components/admin/v2/AdminConfirmDialog.tsx"), /export function AdminConfirmDialog/);
  const ordersPage = read("app/admin/orders/page.tsx");
  assert.match(ordersPage, /AdminConfirmDialog/);
  assert.doesNotMatch(ordersPage, /window\.prompt\(/);

  const refundsPage = read("app/admin/refunds/page.tsx");
  assert.match(refundsPage, /AdminConfirmDialog/);
  assert.doesNotMatch(refundsPage, /window\.confirm\(/);

  const auditLogsPage = read("app/admin/audit-logs/page.tsx");
  assert.doesNotMatch(auditLogsPage, /150px_150px_130px_150px_150px_150px_150px_76px/);

  const ticketsPage = read("app/admin/tickets/page.tsx");
  assert.match(ticketsPage, /\[overflow-wrap:anywhere\]/);

  const templatesWorkspace = read("components/admin/email/AdminEmailTemplatesWorkspace.tsx");
  assert.doesNotMatch(templatesWorkspace, /变量 数据库结构/);
});

test("Round-2: Daju RBAC, financial write rate limits, inventory batch keys, and Beijing timezone", () => {
  for (const rel of [
    "app/api/admin/suppliers/daju/route.ts",
    "app/api/admin/suppliers/daju/bindings/[productId]/route.ts",
    "app/api/admin/suppliers/daju/stock/route.ts",
    "app/api/admin/suppliers/daju/stock/[productId]/route.ts",
  ]) {
    assert.match(read(rel), /getServerSuperAdminContext/, `${rel} must enforce super_admin`);
  }

  for (const rel of [
    "app/api/admin/suppliers/daju/bindings/[productId]/route.ts",
    "app/api/admin/suppliers/daju/stock/route.ts",
    "app/api/admin/suppliers/daju/stock/[productId]/route.ts",
    "app/api/admin/suppliers/bitrefill/bindings/[productId]/route.ts",
    "app/api/admin/users/[userId]/actions/route.ts",
    "app/api/admin/admin-users/route.ts",
    "app/api/admin/admin-users/[userId]/route.ts",
    "app/api/admin/payments/[paymentId]/overpayment-credit/route.ts",
    "app/api/admin/payments/[paymentId]/route.ts",
    "app/api/admin/orders/[orderId]/route.ts",
  ]) {
    assert.match(read(rel), /checkRateLimit/, `${rel} must enforce rate limit`);
  }

  const inventoryPage = read("app/admin/inventory/page.tsx");
  assert.match(inventoryPage, /key=\{\`\$\{row\.product_id\}:\$\{row\.batch_no \|\| "default"\}\`\}/);
  assert.match(inventoryPage, /timeZone:\s*"Asia\/Shanghai"/);

  const opsWorkspace = read("components/admin/OperationsReadonlyWorkspace.tsx");
  assert.match(opsWorkspace, /timeZone:\s*'Asia\/Shanghai'/);
  assert.match(opsWorkspace, /statusLabel\(s\.toLowerCase\(\)\)/);

  const settingsPage = read("app/admin/settings/page.tsx");
  assert.match(settingsPage, /statusLabel\(log\.setting_key\)/);

  const riskPage = read("app/admin/risk/page.tsx");
  assert.match(riskPage, /timeZone:\s*"Asia\/Shanghai"/);
});
