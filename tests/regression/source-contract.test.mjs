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

test("guest order lookup requires token hash and does not expose delivery secrets", () => {
  const service = file("lib/orders/order-query-service.ts");
  const route = file("app/api/order-query/route.ts");
  const page = file("app/order-query/page.tsx");
  assert.match(service, /hashOrderQueryToken/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /order_query_token_hash/);
  assert.doesNotMatch(service, /delivery_content/);
  assert.match(route, /queryToken/);
  assert.match(route, /GENERIC_ERROR/);
  assert.match(route, /order_lookup/);
  assert.match(page, /仅凭订单号无法查看订单/);
});

test("order query token migration stores only hashed credentials", () => {
  const migration = file("supabase/migrations/20260630_order_query_tokens.sql");
  assert.match(migration, /order_query_token_hash/);
  assert.match(migration, /order_query_token_expires_at/);
  assert.match(migration, /order_query_token_revoked_at/);
  assert.doesNotMatch(migration, /query_token text/i);
  assert.doesNotMatch(migration, /access_token text/i);
});

test("guest order bind uses current authenticated user and refuses frontend user id", () => {
  const route = file("app/api/order-query/bind/route.ts");
  assert.match(route, /supabase\.auth\.getUser/);
  assert.match(route, /user\.id/);
  assert.match(route, /verifyOrderQueryToken/);
  assert.doesNotMatch(route, /body\.user_id|body\.userId/);
});

test("logged-in order list stays scoped to current user and supports extended filters", () => {
  const api = file("app/api/orders/route.ts");
  const queries = file("lib/orders/order-queries.ts");
  assert.match(api, /supabase\.auth\.getUser/);
  assert.match(api, /user\.id/);
  for (const key of ["deliveryStatus", "startDate", "endDate", "productSearch", "skuSearch"]) {
    assert.match(api, new RegExp(key));
    assert.match(queries, new RegExp(key));
  }
  assert.match(queries, /\.eq\("user_id", userId\)/);
});

test("high-risk APIs use shared rate limit and request size guards", () => {
  const rateLimit = file("lib/security/rate-limit.ts");
  assert.match(rateLimit, /checkRateLimit/);
  assert.match(rateLimit, /checkRequestSize/);
  for (const policy of ["order_create", "order_lookup", "payment_session_create", "payment_status_query"]) {
    assert.match(rateLimit, new RegExp(policy));
  }

  const guardedRoutes = [
    "app/api/orders/route.ts",
    "app/api/payments/create/route.ts",
    "app/api/recharges/route.ts",
    "app/api/refunds/route.ts",
    "app/api/order-query/route.ts",
    "app/api/admin/inventory/route.ts",
    "app/api/admin/media/route.ts",
    "app/api/admin/catalog/products/route.ts",
    "app/api/admin/catalog/products/[productId]/route.ts",
  ];

  for (const route of guardedRoutes) {
    const source = file(route);
    assert.match(source, /checkRateLimit/, `${route} must call checkRateLimit`);
    assert.match(source, /checkRequestSize/, `${route} must call checkRequestSize`);
  }
});

test("production readiness checks are read-only and cleanup scripts are safe by default", () => {
  const route = file("app/api/admin/system/production-readiness/route.ts");
  const service = file("lib/admin/production-readiness.ts");
  const dryRun = file("scripts/production-data-cleanup-dry-run.sql");
  const cleanupTemplate = file("scripts/production-data-cleanup-template.sql");

  assert.match(route, /requireApiAdmin/);
  assert.match(route, /buildProductionReadinessPayload/);
  assert.doesNotMatch(route, /\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
  assert.doesNotMatch(service, /\.delete\(|\.update\(|\.insert\(|\.upsert\(/);
  assert.doesNotMatch(service, /content\)/);

  assert.doesNotMatch(dryRun, /\bdelete\b|\btruncate\b|\bdrop\b|\bupdate\b|\binsert\b/i);
  assert.doesNotMatch(cleanupTemplate, /^\s*delete\s+from/im);
  assert.doesNotMatch(cleanupTemplate, /\btruncate\b|\bdrop\s+table\b/i);
  assert.match(cleanupTemplate, /必须先备份/);
  assert.match(cleanupTemplate, /必须先执行 dry-run/);
});

test("order expiration migration adds payment expiry and idempotent release RPC", () => {
  const migration = file("supabase/migrations/20260701_order_expiration_inventory_release.sql");
  assert.match(migration, /payment_expires_at/);
  assert.match(migration, /reservation_released_at/);
  assert.match(migration, /create or replace function public\.expire_unpaid_order/);
  assert.match(migration, /for update/);
  assert.match(migration, /payment_status = 'paid'/);
  assert.match(migration, /status in \('paid','processing','delivered','completed','refunded'\)/);
  assert.match(migration, /update public\.payment_sessions[\s\S]*status = case when status in \('pending','processing'\) then 'expired'/);
  assert.match(migration, /update public\.product_skus[\s\S]*stock = s\.stock \+ oi\.quantity/);
  assert.match(migration, /update public\.products p[\s\S]*stock = p\.stock \+ oi\.quantity/);
  assert.match(migration, /update public\.digital_inventory[\s\S]*status = 'available'/);
  assert.match(migration, /delivered_at is null/);
  assert.match(migration, /create trigger trg_orders_set_payment_expiration/);
});

test("order expiration internal API requires job secret and does not expose sensitive payloads", () => {
  const route = file("app/api/internal/orders/expire/route.ts");
  const service = file("lib/orders/order-expiration.ts");
  assert.match(route, /assertOrderExpirationJobAuthorized/);
  assert.match(route, /checkRateLimit\("internal_task"/);
  assert.match(route, /processExpiredOrders/);
  assert.doesNotMatch(route, /customer_email|delivery_content|secret_config|provider_raw/i);
  assert.match(service, /ORDER_EXPIRATION_JOB_SECRET/);
  assert.match(service, /INTERNAL_JOB_SECRET/);
  assert.match(service, /service\.rpc\("expire_unpaid_order"/);
  assert.match(service, /service\.rpc\("list_expirable_unpaid_orders"/);
});

test("admin order manual expiration uses unified service and audit log", () => {
  const route = file("app/api/admin/orders/[orderId]/route.ts");
  assert.match(route, /expireUnpaidOrder/);
  assert.match(route, /action\?: .*expire_unpaid_order/);
  assert.match(route, /关闭未支付订单必须填写原因/);
  assert.match(route, /writeAdminAuditLog/);
  assert.doesNotMatch(route, /status\s*=\s*["']cancelled["']/);
});

test("legal checkout requires versioned agreements and server-side recording", () => {
  const migration = file("supabase/migrations/20260701_legal_documents_order_evidence.sql");
  const checkout = file("app/checkout/page.tsx");
  const orders = file("app/api/orders/route.ts");
  const legal = file("lib/legal/legal-service.ts");
  const relations = file("lib/admin/order-relations.ts");
  assert.match(migration, /legal_documents/);
  assert.match(migration, /order_agreement_acceptances/);
  assert.match(migration, /order_evidence_events/);
  assert.match(migration, /content_hash/);
  assert.match(migration, /deny direct agreement writes/i);
  assert.match(checkout, /useState\(false\)/);
  assert.match(checkout, /\/api\/legal\/current/);
  assert.match(checkout, /agreement_version_ids/);
  assert.match(orders, /verifyCheckoutAgreements/);
  assert.match(orders, /recordOrderAgreementAcceptances/);
  assert.match(legal, /accepted_at/);
  assert.match(legal, /getRequestIpHash/);
  assert.match(relations, /协议确认/);
  assert.match(relations, /历史记录缺失/);
});

test("legal admin API manages drafts and published versions with audit logs", () => {
  const route = file("app/api/admin/legal/route.ts");
  assert.match(route, /getServerAdminContext/);
  assert.match(route, /writeAdminAuditLog/);
  assert.match(route, /create_draft|update_draft|publish|archive/);
  assert.match(route, /publish_reason|reason/);
  assert.doesNotMatch(route, /service_role.*json/i);
});
