import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard action cards route to real filtered admin workspaces", () => {
  const dashboard = file("app/admin/page.tsx");
  const expectedLinks = [
    "/admin/orders?attention=pending_orders",
    "/admin/orders?attention=manual_delivery",
    "/admin/orders?attention=auto_delivery_failed",
    "/admin/orders?attention=inventory_shortage",
    "/admin/payments?view=callbacks&attention=failed",
    "/admin/payments?view=reconciliations&attention=failed",
    "/admin/recharges?view=review",
    "/admin/products?stockLevel=low",
  ];
  for (const href of expectedLinks) assert.match(dashboard, new RegExp(href.replace(/[?]/g, "\\?")));
  assert.match(dashboard, /cursor-pointer[\s\S]*focus-visible:ring-2/);
});

test("order attention filters are enforced by the authenticated read API", () => {
  const page = file("app/admin/orders/page.tsx");
  const route = file("app/api/admin/orders/route.ts");
  const query = file("lib/orders/order-queries.ts");
  for (const attention of ["pending_orders", "manual_delivery", "auto_delivery_failed", "inventory_shortage"]) {
    assert.match(page, new RegExp(attention));
    assert.match(route, new RegExp(attention));
    assert.match(query, new RegExp(attention));
  }
  assert.match(query, /\.from\("order_deliveries"\)/);
  assert.match(query, /\.in\("status", \["paid", "processing"\]\)/);
  assert.match(query, /row\.delivery_type === "automatic"/);
});

test("callback and reconciliation action views remain read-only and use real tables", () => {
  const paymentPage = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const callbackPanel = file("components/admin/payments/AdminPaymentCallbackPanel.tsx");
  const callbackRoute = file("app/api/admin/payments/callbacks/route.ts");
  const reconciliationRoute = file("app/api/admin/payments/reconciliations/route.ts");
  assert.match(paymentPage, /view === "callbacks"/);
  assert.match(callbackPanel, /\/api\/admin\/payments\/callbacks/);
  assert.match(callbackRoute, /\.from\("payment_callback_logs"\)/);
  assert.match(callbackRoute, /DASHBOARD_PAYMENT_CALLBACK_EXCEPTION_RESULTS/);
  assert.doesNotMatch(callbackRoute, /export async function (?:POST|PATCH|DELETE)/);
  assert.match(reconciliationRoute, /result === "attention"/);
  assert.match(reconciliationRoute, /\["mismatched", "query_failed", "manual_review"\]/);
});

test("low-stock and recharge links share their destination filter contracts", () => {
  const productPage = file("app/admin/products/page.tsx");
  const productRoute = file("app/api/admin/catalog/products/route.ts");
  const rechargeRoute = file("app/api/admin/recharges/route.ts");
  const rechargePredicate = file("lib/recharges/admin-attention.ts");
  assert.match(productPage, /searchParams\.get\("stockLevel"\) === "low"/);
  assert.match(productRoute, /\.gt\("stock", 0\)\.lte\("stock", 5\)/);
  assert.match(rechargeRoute, /requiresRechargeAdminAttention/);
  assert.match(rechargePredicate, /ACTIVE_REVIEW_STATUSES/);
});

test("dashboard payment queries avoid legacy fields in incorrect positions", () => {
  const dashboard = file("app/admin/page.tsx");
  const schema = file("lib/admin/dashboard-payment-schema.mjs");
  assert.doesNotMatch(dashboard, /business_no|reconciliation_status/);
  assert.match(schema, /"id,channel,business_id,process_result,received_at"/);
  assert.match(schema, /"id,result,created_at"/);
});
