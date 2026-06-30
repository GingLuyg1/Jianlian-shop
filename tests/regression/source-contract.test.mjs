import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function file(path) {
  return readFileSync(join(root, path), "utf8");
}

test("order API whitelists input and does not accept frontend price fields", () => {
  const source = file("app/api/orders/route.ts");
  assert.match(source, /ORDER_CREATE_ALLOWED_KEYS/);
  assert.match(source, /client_request_id/);
  assert.match(source, /create_order_with_item/);
  assert.doesNotMatch(source, /ORDER_CREATE_ALLOWED_KEYS[\s\S]*price/);
  assert.doesNotMatch(source, /ORDER_CREATE_ALLOWED_KEYS[\s\S]*total_amount/);
});

test("order creation RPC recalculates product and SKU amounts server-side", () => {
  const migration = file("supabase/migrations/20260629_direct_purchase_order_idempotency.sql");
  assert.match(migration, /p_client_request_id/);
  assert.match(migration, /orders_user_client_request_uidx/i);
  assert.match(migration, /where user_id = v_user_id\s+and client_request_id = v_request_id/i);
  assert.match(migration, /return query[\s\S]*v_existing_order\.total_amount/i);
  assert.match(migration, /where s\.id = p_sku_id/i);
  assert.match(migration, /v_unit_price := coalesce\(v_sku\.price, 0\)::numeric/i);
  assert.match(migration, /v_line_total := round\(\(v_unit_price \* v_quantity\)::numeric, 2\)/i);
});

test("payment callbacks use provider verification and complete-payment service, not browser paid input", () => {
  const route = file("app/api/payments/callback/[channel]/route.ts");
  const service = file("lib/payments/payment-callback-service.ts");
  assert.match(route, /handlePaymentCallback/);
  assert.match(service, /verifyCallback/);
  assert.match(service, /parseCallback/);
  assert.match(service, /completePayment\(/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("payment provider placeholders must not simulate success or fake payment artifacts", () => {
  const providers = file("lib/payments/providers.ts");
  assert.match(providers, /PROVIDER_NOT_CONFIGURED|渠道尚未配置|未配置/);
  assert.doesNotMatch(providers, /fake|mock-success|simulate.*success|假二维码|假地址/i);
});

test("admin APIs require server-side admin checks", () => {
  const adminRoutes = [
    "app/api/admin/catalog/products/route.ts",
    "app/api/admin/catalog/products/[productId]/route.ts",
    "app/api/admin/catalog/categories/route.ts",
    "app/api/admin/catalog/categories/[categoryId]/route.ts",
    "app/api/admin/orders/route.ts",
    "app/api/admin/payments/route.ts",
  ];
  for (const route of adminRoutes) {
    const source = file(route);
    assert.match(source, /require(Api)?Admin|requireCatalogAdmin|requireSuperAdmin|getServerAdminContext/, `${route} must guard admin access`);
  }
});

test("service role key is not exposed through NEXT_PUBLIC variables", () => {
  const serviceRole = file("lib/supabase/service-role.ts");
  const envExample = existsSync(join(root, ".env.example")) ? file(".env.example") : "";
  const testEnvExample = existsSync(join(root, ".env.test.example")) ? file(".env.test.example") : "";
  assert.match(serviceRole, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
  assert.doesNotMatch(testEnvExample, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
});

test("digital delivery migration filters inventory by SKU and prevents cross-SKU allocation", () => {
  const migration = file("supabase/migrations/20260629_multi_sku_core.sql");
  assert.match(migration, /digital_inventory\(product_id, sku_id, status/i);
  assert.match(migration, /or sku_id = v_item\.sku_id/i);
  assert.match(migration, /v_item\.sku_id is null and sku_id is null/i);
});




test("data consistency scan rules are centralized and cover critical domains", () => {
  const rules = file("lib/consistency/rules.ts");
  for (const code of ["OP-001", "OP-003", "RB-001", "RB-003", "RF-001", "ID-002", "ID-006"]) {
    assert.match(rules, new RegExp(code));
  }
  assert.match(rules, /CONSISTENCY_RULES/);
  assert.match(rules, /suggestion/);
});

test("data consistency scanner is read-only for business data and persists only scan records", () => {
  const scanner = file("lib/consistency/scanner.ts");
  assert.match(scanner, /safeSelect/);
  assert.match(scanner, /data_consistency_runs/);
  assert.match(scanner, /data_consistency_issues/);
  assert.doesNotMatch(scanner, /\.from\("orders"\)\s*\n\s*\.update/);
  assert.doesNotMatch(scanner, /\.from\("balance_transactions"\)\s*\n\s*\.insert/);
  assert.doesNotMatch(scanner, /\.from\("digital_inventory"\)\s*\n\s*\.update/);
});

test("data consistency APIs require super-admin or internal secret", () => {
  const adminRoute = file("app/api/admin/system/data-consistency/route.ts");
  const issueRoute = file("app/api/admin/system/data-consistency/[issueId]/route.ts");
  const internalRoute = file("app/api/internal/data-consistency/route.ts");
  assert.match(adminRoute, /requireApiAdmin/);
  assert.match(adminRoute, /SUPER_ADMIN_EMAIL/);
  assert.match(issueRoute, /SUPER_ADMIN_EMAIL/);
  assert.match(internalRoute, /DATA_CONSISTENCY_SCAN_SECRET/);
  assert.doesNotMatch(internalRoute, /process\.env\.NEXT_PUBLIC_/);
});

test("data consistency migration stores fingerprints and keeps user access read-only", () => {
  const migration = file("supabase/migrations/20260630_data_consistency_scan.sql");
  assert.match(migration, /data_consistency_runs/);
  assert.match(migration, /data_consistency_issues/);
  assert.match(migration, /fingerprint text not null/);
  assert.match(migration, /unique \(fingerprint\)/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /for insert\s+with check/i);
  assert.doesNotMatch(migration, /for update\s+using/i);
});

test("data consistency admin page does not expose direct data repair actions", () => {
  const page = file("components/admin/system/DataConsistencyClient.tsx");
  assert.match(page, /立即巡检/);
  assert.match(page, /标记处理中/);
  assert.match(page, /标记已解决/);
  assert.doesNotMatch(page, /执行 SQL|修改余额|重分配库存|标记支付成功/);
});
