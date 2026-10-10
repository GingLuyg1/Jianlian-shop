import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import test from "node:test";

import { buildCatalogSkuDiagnostics } from "../../lib/products/catalog-readiness.mjs";
import {
  buildSkuOperationalDiagnostic,
  getSupplierDiagnosticState,
  readSkuLocalInventoryDiagnostics,
  summarizeSkuOperationalDiagnostics,
} from "../../lib/products/fulfillment-inventory-diagnostics.mjs";
import { evaluateSkuActivationReadiness } from "../../lib/products/sku-activation-readiness.mjs";
import { decorateAdminCatalogProducts, DEFAULT_ADMIN_CATALOG_FILTERS } from "../../lib/products/admin-catalog-operations.mjs";

const root = process.cwd();
const file = (path) => readFileSync(join(root, path), "utf8");
const product = { id: "product-1", slug: "gift-apple-us", has_skus: true, delivery_type: "automatic", metadata: {} };
const sku = (overrides = {}) => ({
  id: "sku-1", product_id: product.id, sku_code: "2-usd", sku_title: "2 USD", status: "draft",
  stock: 2, delivery_type: "automatic", metadata: {}, ...overrides,
});
const supplierMetadata = (overrides = {}) => ({
  fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13",
  supplier_inputs_mapping: {}, supplier_max_unit_cost: "8.50", supplier_stock_snapshot: 2,
  supplier_stock_sync_status: "synced", supplier_stock_last_success_at: "2026-10-05T00:00:00.000Z",
  supplier_stock_stale: false, ...overrides,
});

test("automatic diagnostics distinguish local, supplier, hybrid and no-source fulfillment", () => {
  const local = buildSkuOperationalDiagnostic({ product, sku: sku(), localAvailableCount: 2 });
  const supplier = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: supplierMetadata() }), localAvailableCount: 0 });
  const hybrid = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: supplierMetadata() }), localAvailableCount: 2 });
  const none = buildSkuOperationalDiagnostic({ product, sku: sku({ stock: 0 }), localAvailableCount: 0 });
  assert.equal(local.fulfillment_source, "local_inventory");
  assert.equal(supplier.fulfillment_source, "supplier");
  assert.equal(hybrid.fulfillment_source, "hybrid");
  assert.equal(none.fulfillment_source, "none");
  assert.equal(none.health, "blocked");
  assert.ok(none.activation.reasons.includes("NO_FULFILLMENT_SOURCE"));
});

test("manual and shipping diagnostics use the existing P2.3 not-required activation contract", () => {
  for (const deliveryType of ["manual", "shipping"]) {
    const currentProduct = { ...product, delivery_type: deliveryType };
    const currentSku = sku({ delivery_type: null, stock: 0 });
    const readiness = evaluateSkuActivationReadiness({ product: currentProduct, sku: currentSku, localAvailableCount: 0 });
    const diagnostic = buildSkuOperationalDiagnostic({ product: currentProduct, sku: currentSku, activationReadiness: readiness });
    // The existing JS helper is automatic-only; the write guard skips it for
    // these delivery types, just as the SQL evaluator returns not_required.
    assert.match(file("lib/products/sku-activation-readiness.mjs"), /getEffectiveSkuDeliveryType\(product, sku\) === "automatic"/);
    assert.match(file("supabase/migrations/20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql"), /not_required/);
    assert.equal(diagnostic.fulfillment_source, deliveryType);
    assert.equal(diagnostic.activation.ready, true);
    assert.deepEqual(diagnostic.activation.reasons, []);
    assert.equal(diagnostic.health, "ready");
  }
});

test("supplier snapshot states reuse sync evidence without inventing a freshness threshold", () => {
  assert.equal(getSupplierDiagnosticState(supplierMetadata()), "fresh");
  assert.equal(getSupplierDiagnosticState(supplierMetadata({ supplier_stock_stale: true })), "stale");
  assert.equal(getSupplierDiagnosticState(supplierMetadata({ supplier_stock_sync_status: "error" })), "error");
  assert.equal(getSupplierDiagnosticState(supplierMetadata({ supplier_stock_last_success_at: "2026-10-05" })), "unknown");
  assert.equal(getSupplierDiagnosticState(supplierMetadata({ supplier_stock_last_success_at: undefined })), "unknown");
  assert.equal(getSupplierDiagnosticState({}), "not_applicable");
  const checkedAt = Date.parse("2026-10-05T00:00:00.000Z");
  const atBoundary = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: supplierMetadata() }), now: checkedAt + 60_000 });
  assert.equal(atBoundary.supplier_stock.state, "fresh");
  assert.equal(atBoundary.supplier_stock.age_seconds, 60);
  const malformedTimestamp = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: { supplier_stock_last_success_at: "invalid" } }), localAvailableCount: 2 });
  assert.equal(malformedTimestamp.health, "unknown");
  assert.equal(malformedTimestamp.activation.ready, false);
  assert.ok(malformedTimestamp.diagnostic_issues.includes("MALFORMED_SUPPLIER_TIMESTAMP"));
});

test("malformed metadata and inventory read errors fail closed without leaking raw metadata", () => {
  const malformed = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: "bad" }), localAvailableCount: 2 });
  const readError = buildSkuOperationalDiagnostic({ product, sku: sku(), localAvailableCount: 0, localInventoryError: true });
  assert.equal(malformed.health, "unknown");
  assert.equal(malformed.activation.ready, false);
  assert.equal(malformed.fulfillment_source, "unknown");
  assert.deepEqual(malformed.diagnostic_issues, ["MALFORMED_METADATA"]);
  assert.equal(readError.health, "unknown");
  assert.equal(readError.local_inventory.available_count, null);
  assert.ok(readError.activation.reasons.includes("READINESS_CHECK_FAILED"));

  const secretMetadata = supplierMetadata({ api_key: "never-expose", token: "never-expose", merchant_secret: "never-expose" });
  const diagnostic = buildSkuOperationalDiagnostic({ product, sku: sku({ metadata: secretMetadata }) });
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /never-expose|api_key|merchant_secret|token/);
  const catalogDiagnostics = buildCatalogSkuDiagnostics(product, [sku({ metadata: { ...secretMetadata, supplier_stock_sync_error: "secret detail" } })], { ready: true, issues: [] });
  assert.doesNotMatch(JSON.stringify(catalogDiagnostics), /never-expose|secret detail|api_key|merchant_secret|token/);
  const poisonedFields = buildCatalogSkuDiagnostics(product, [sku({ metadata: supplierMetadata({
    supplier_product_id: "never-expose", supplier_sku: "never-expose",
    supplier_stock_snapshot: "never-expose", supplier_stock_sync_status: "never-expose",
    supplier_stock_last_success_at: "never-expose", supplier_stock_sync_attempted_at: "never-expose",
    inventory_state: "never-expose",
    supplier_stock_sync_error: "DONOTEXPOSETHISUPPERCASETOKEN",
  }) })], { ready: true, issues: [] });
  assert.doesNotMatch(JSON.stringify(poisonedFields), /never-expose/);
  assert.doesNotMatch(JSON.stringify(poisonedFields), /DONOTEXPOSETHISUPPERCASETOKEN/);
});

test("Apple diagnostics report ten blocked no-source rows while dig-apple creates no synthetic SKU", () => {
  const appleSkus = Array.from({ length: 10 }, (_, index) => sku({
    id: `sku-${index + 1}`, sku_code: `${index + 1}-usd`, stock: 0,
    metadata: { inventory_state: "requires_verification" },
  }));
  const apple = buildCatalogSkuDiagnostics(product, appleSkus, { ready: true, issues: [] });
  assert.equal(apple.operational_rows.length, 10);
  assert.deepEqual(apple.operational_summary, {
    ready: 0, attention: 0, blocked: 10, unknown: 0, no_source: 10,
    local_inventory_available: 0, supplier_bound: 0,
  });
  assert.equal(apple.operational_rows.every((row) => row.verification.required), true);

  const dig = buildCatalogSkuDiagnostics({ id: "dig", slug: "dig-apple-id-us", has_skus: false, delivery_type: "automatic", metadata: supplierMetadata() }, [], { ready: true, issues: [] });
  assert.equal(dig.operational_rows.length, 0);
  assert.equal(dig.operational_summary.ready, 0);
});

test("health summary is derived from one stable diagnostic contract", () => {
  const rows = [
    buildSkuOperationalDiagnostic({ product, sku: sku({ id: "ready" }), localAvailableCount: 2 }),
    buildSkuOperationalDiagnostic({ product, sku: sku({ id: "blocked", stock: 0 }) }),
    buildSkuOperationalDiagnostic({ product, sku: sku({ id: "unknown", metadata: [] }) }),
  ];
  assert.deepEqual(summarizeSkuOperationalDiagnostics(rows), {
    ready: 1, attention: 0, blocked: 1, unknown: 1, no_source: 1,
    local_inventory_available: 1, supplier_bound: 0,
  });
});

test("local inventory diagnostics use bounded set-based reads instead of per-SKU requests", async () => {
  const calls = [];
  const service = {
    from(table) {
      calls.push(["from", table]);
      const chain = {
        select(columns) { calls.push(["select", columns]); return chain; },
        in(key, values) { calls.push(["in", key, values]); return chain; },
        eq(key, value) { calls.push(["eq", key, value]); return chain; },
        order() { return chain; },
        range() { return Promise.resolve({ count: 2, data: [{ id: "inventory-1", product_id: "product-1", sku_id: "sku-1" }, { id: "inventory-2", product_id: "product-1", sku_id: "sku-1" }], error: null }); },
      };
      return chain;
    },
  };
  const result = await readSkuLocalInventoryDiagnostics(service, [sku(), sku({ id: "sku-2" })]);
  assert.equal(result.queryCount, 1);
  assert.equal(result.availableBySku["sku-1"], 2);
  assert.equal(calls.filter(([name]) => name === "from").length, 1);
  assert.deepEqual(calls.find(([name, key]) => name === "eq" && key === "status"), ["eq", "status", "available"]);
});

test("inventory pagination follows exact count even below the requested PostgREST page size", async () => {
  const inventory = Array.from({ length: 5 }, (_, index) => ({ id: `i-${index}`, product_id: product.id, sku_id: "sku-1" }));
  const service = { from() { const chain = {
    select() { return chain; }, in() { return chain; }, eq() { return chain; }, order() { return chain; },
    range(offset) { return Promise.resolve({ data: inventory.slice(offset, offset + 2), count: 5, error: null }); },
  }; return chain; } };
  const result = await readSkuLocalInventoryDiagnostics(service, Array.from({ length: 47 }, (_, index) => sku({ id: index ? `s-${index}` : "sku-1" })));
  assert.equal(result.error, false);
  assert.equal(result.availableBySku["sku-1"], 5);
  assert.equal(result.queryCount, 3); // 47 SKUs, not 47 queries.
});

test("inventory throws, row caps, missing count and identity mismatches fail closed", async () => {
  for (const response of [
    { error: { code: "test" } },
    { count: null, data: [] },
    { count: 5000, data: [] },
    { count: 1, data: [] },
    { count: 1, data: [{ id: "i-1", product_id: "wrong-product", sku_id: "sku-1" }] },
    "throw",
  ]) {
    const service = { from() { const chain = {
      select() { return chain; }, in() { return chain; }, eq() { return chain; }, order() { return chain; },
      range() { if (response === "throw") throw new Error("private-detail"); return Promise.resolve(response); },
    }; return chain; } };
    const result = await readSkuLocalInventoryDiagnostics(service, [sku()]);
    assert.equal(result.error, true);
    assert.deepEqual(result.availableBySku, {});
    assert.doesNotMatch(JSON.stringify(result), /private-detail/);
  }
});

test("47-product diagnostics keep batch query count and compact response size observable", async (t) => {
  let reads = 0;
  const service = { from(table) {
    assert.equal(table, "digital_inventory"); reads += 1;
    const chain = {
      select() { return chain; }, in() { return chain; }, eq() { return chain; }, order() { return chain; },
      range() { return Promise.resolve({ count: 0, data: [], error: null }); },
    }; return chain;
  } };
  const products = Array.from({ length: 47 }, (_, index) => ({ ...product, id: `product-${index}` }));
  const skus = products.map((current, index) => sku({ id: `sku-${index}`, product_id: current.id, stock: 0 }));
  const started = performance.now();
  const inventory = await readSkuLocalInventoryDiagnostics(service, skus);
  const decorated = decorateAdminCatalogProducts(products, skus, DEFAULT_ADMIN_CATALOG_FILTERS, inventory);
  assert.equal(reads, 1);
  assert.equal(inventory.queryCount, 1);
  assert.equal(decorated.length, 47);
  assert.equal(decorated.every((row) => row.operational_summary.fulfillment_blocked === 1), true);
  t.diagnostic(`fixture_products=47 inventory_queries=${reads} summary_bytes=${Buffer.byteLength(JSON.stringify(decorated.map((row) => row.operational_summary)))} elapsed_ms=${(performance.now() - started).toFixed(2)}`);
});

test("product list and workspace wire diagnostics without supplier network calls or raw metadata panels", () => {
  const listRoute = file("app/api/admin/catalog/products/route.ts");
  const workspaceRoute = file("app/api/admin/products/[id]/skus/route.ts");
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(listRoute, /readSkuLocalInventoryDiagnostics/);
  assert.match(listRoute, /result\.count !== \(result\.data \?\? \[\]\)\.length/);
  assert.match(listRoute, /PRODUCT_FILTER_SCAN_INCOMPLETE/);
  assert.match(workspaceRoute, /readSkuLocalInventoryDiagnostics/);
  assert.doesNotMatch(listRoute, /fetch\(|syncDaju|supplier.*request/i);
  assert.doesNotMatch(workspaceRoute, /fetch\(|syncDaju|supplier.*request/i);
  assert.match(manager, /交付与库存诊断/);
  assert.match(manager, /没有供货来源/);
  assert.doesNotMatch(manager, /mapping=.*website=.*supplier=/);
  assert.match(manager, /catch \(error\) \{ setDiagnostics\(null\)/);
  assert.match(manager, /diagnostic\.next_actions\.map/);
  assert.match(file("lib/supabase/admin-catalog.ts"), /cache: "no-store"/);
});
