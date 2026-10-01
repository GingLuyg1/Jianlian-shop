import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildCatalogSkuDiagnostics, inspectCatalogSkuSchema } from "../../lib/products/catalog-readiness.mjs";
import { findCheckoutSkuOption, mergeCheckoutSkuOptions } from "../../lib/products/checkout-sku-options.mjs";
import { LEGACY_SKU_DEFINITIONS, planLegacySkuBackfill } from "../../lib/products/legacy-sku-backfill.mjs";
import { derivePublicCatalogSkuSummary } from "../../lib/products/public-catalog-sku-summary.mjs";

const root = process.cwd();
const file = (name) => readFileSync(join(root, name), "utf8");
const apple = { id: "apple-product", slug: "gift-apple-us", delivery_type: "automatic" };

test("Apple legacy dry-run plans ten exact safe SKU rows", () => {
  const plan = planLegacySkuBackfill([apple], []);
  assert.equal(plan.insert.length, 10);
  assert.deepEqual(plan.insert.map((row) => row.sku_code), ["2-usd", "3-usd", "4-usd", "5-usd", "10-usd", "15-usd", "20-usd", "25-usd", "50-usd", "100-usd"]);
  assert.deepEqual(plan.insert.map((row) => row.price), [14.84, 22.26, 29.68, 37.1, 74.2, 111.3, 148.4, 185.5, 371, 742]);
  assert.ok(plan.insert.every((row) => row.stock === 0 && row.status === "draft"));
  assert.equal(plan.partial.find((row) => row.slug === apple.slug)?.status, "empty");
});

test("second backfill plan is idempotent", () => {
  const first = planLegacySkuBackfill([apple], []);
  const existing = first.insert.map((row, index) => ({ ...row, id: `sku-${index}` }));
  const second = planLegacySkuBackfill([apple], existing);
  assert.equal(second.insert.length, 0);
  assert.equal(second.update.length, 0);
  assert.equal(second.skip.length, 10);
  assert.equal(second.conflict.length, 0);
  assert.equal(second.partial.find((row) => row.slug === apple.slug)?.status, "complete");
});

test("partial existing SKU state plans only missing rows", () => {
  const initial = planLegacySkuBackfill([apple], []);
  const plan = planLegacySkuBackfill([apple], [{ ...initial.insert[0], id: "existing" }]);
  assert.equal(plan.skip.length, 1);
  assert.equal(plan.insert.length, 9);
  assert.equal(plan.partial.find((row) => row.slug === apple.slug)?.status, "partial");
});

test("duplicate code and price mismatch are explicit conflicts and never updates", () => {
  const expected = LEGACY_SKU_DEFINITIONS[apple.slug][0];
  const duplicate = planLegacySkuBackfill([apple], [
    { id: "a", product_id: apple.id, combination_key: expected.sku_code, ...expected },
    { id: "b", product_id: apple.id, combination_key: expected.sku_code, ...expected },
  ]);
  assert.equal(duplicate.conflict.find((item) => item.definition?.sku_code === expected.sku_code)?.code, "SKU_CODE_NOT_UNIQUE");

  const price = planLegacySkuBackfill([apple], [{ id: "a", product_id: apple.id, combination_key: expected.sku_code, ...expected, price: 999 }]);
  const conflict = price.conflict.find((item) => item.definition?.sku_code === expected.sku_code);
  assert.equal(conflict?.code, "SKU_DEFINITION_CONFLICT");
  assert.deepEqual(conflict?.fields, ["price"]);
  assert.equal(price.update.length, 0);
});

test("missing products are diagnostics only and Giffgaff is not fabricated", () => {
  const plan = planLegacySkuBackfill([apple], []);
  assert.deepEqual(plan.missingProduct, [{ slug: "gift-giffgaff-topup", code: "PRODUCT_MISSING" }]);
  assert.equal(plan.insert.some((row) => row.sku_code.endsWith("-gbp")), false);
});

test("database checkout SKU wins while partial legacy entries remain visible but fail safe", () => {
  const legacy = [
    { id: "2-usd", code: "2-usd", label: "2 USD", rmb: 14.84 },
    { id: "3-usd", code: "3-usd", label: "3 USD", rmb: 22.26 },
  ];
  const database = [{ id: "db-2", code: "2-usd", label: "Database 2 USD", rmb: 15, stock: 8, status: "active", isDatabaseSku: true }];
  const merged = mergeCheckoutSkuOptions(database, legacy, { productHasSkus: true });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "db-2");
  assert.equal(merged[0].rmb, 15);
  assert.equal(merged.filter((row) => row.code === "2-usd").length, 1);
  assert.deepEqual(merged[1], { ...legacy[1], stock: 0, status: "draft", isDatabaseSku: false, isCompatibilityPlaceholder: true });
  assert.equal(findCheckoutSkuOption(merged, "2-usd")?.id, "db-2");
  assert.equal(findCheckoutSkuOption(merged, "DB-2")?.code, "2-usd");
});

test("legacy checkout compatibility remains unchanged before any DB SKU exists", () => {
  const legacy = [{ id: "2-usd", code: "2-usd", label: "2 USD", rmb: 14.84 }];
  assert.equal(mergeCheckoutSkuOptions([], legacy, { productHasSkus: false }), legacy);
});

test("migrated products with only hidden database SKUs expose fail-closed legacy placeholders", () => {
  const legacy = [
    { id: "2-usd", code: "2-usd", label: "2 USD", rmb: 14.84 },
    { id: "3-usd", code: "3-usd", label: "3 USD", rmb: 22.26 },
  ];
  const merged = mergeCheckoutSkuOptions([], legacy, { productHasSkus: true });
  assert.deepEqual(merged, legacy.map((option) => ({
    ...option,
    stock: 0,
    status: "draft",
    isDatabaseSku: false,
    isCompatibilityPlaceholder: true,
  })));
  const requested = findCheckoutSkuOption(merged, "2-usd");
  assert.equal(requested?.isCompatibilityPlaceholder, true);
  assert.equal(requested?.status, "draft");
  assert.equal(requested?.stock, 0);
});

test("active database SKU remains authoritative while missing legacy codes fail closed", () => {
  const legacy = [
    { id: "2-usd", code: "2-usd", label: "2 USD", rmb: 14.84 },
    { id: "3-usd", code: "3-usd", label: "3 USD", rmb: 22.26 },
  ];
  const database = [{ id: "db-2", code: "2-usd", label: "DB 2 USD", rmb: 15.5, stock: 7, status: "active", isDatabaseSku: true }];
  const merged = mergeCheckoutSkuOptions(database, legacy, { productHasSkus: true });
  assert.deepEqual(findCheckoutSkuOption(merged, "2-usd"), database[0]);
  assert.equal(findCheckoutSkuOption(merged, "db-2")?.rmb, 15.5);
  assert.equal(findCheckoutSkuOption(merged, "3-usd")?.isCompatibilityPlaceholder, true);
});

test("migrated products never reuse positive parent stock when all public SKUs are hidden", () => {
  const summary = derivePublicCatalogSkuSummary(
    { has_skus: true, price: 14.84, stock: 999, status: "active" },
    [],
  );
  assert.deepEqual(summary, { productHasSkus: true, minPrice: 14.84, maxPrice: 14.84, effectiveStock: 0 });

  const legacySummary = derivePublicCatalogSkuSummary(
    { has_skus: false, price: 14.84, stock: 999, status: "active" },
    [],
  );
  assert.equal(legacySummary.effectiveStock, 999);
});

test("schema readiness passes and fails closed on products.has_skus", async () => {
  const service = (errors = {}) => ({
    from(table) {
      return {
        select() {
          return { limit: async () => ({ data: [], error: errors[table] ?? null }) };
        },
      };
    },
  });
  assert.deepEqual(await inspectCatalogSkuSchema(service()), { ready: true, issues: [] });
  const missing = await inspectCatalogSkuSchema(service({ products: { code: "42703", message: "column products.has_skus does not exist" } }));
  assert.equal(missing.ready, false);
  assert.equal(missing.issues[0].code, "PRODUCTS_HAS_SKUS_UNAVAILABLE");
});

test("Admin diagnostics expose legacy and supplier readiness without mutations", () => {
  const diagnostics = buildCatalogSkuDiagnostics(apple, [{
    id: "sku-2", sku_code: "2-usd", stock: 50,
    metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_stock_snapshot: 50, supplier_stock_sync_status: "partial", supplier_stock_stale: true },
  }], { ready: true, issues: [] });
  assert.equal(diagnostics.legacy_db_sku_missing, true);
  assert.equal(diagnostics.legacy_missing_codes.length, 9);
  assert.equal(diagnostics.supplier_unbound_count, 1);
  assert.equal(diagnostics.supplier_stale_count, 1);
  assert.equal(diagnostics.supplier_problem_count, 1);

  const unbound = buildCatalogSkuDiagnostics(
    { ...apple, metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15 } },
    [{ id: "sku-2", sku_code: "2-usd", stock: 0, metadata: {} }],
    { ready: true, issues: [] },
  );
  assert.equal(unbound.supplier_unbound_count, 1);
});

test("forward-only migration adds only derived has_skus readiness and never copies stock", () => {
  const sql = file("supabase/migrations/20260929120000_admin_catalog_sku_readiness_v1.sql");
  assert.match(sql, /^-- Forward-only:/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  assert.match(sql, /add column if not exists has_skus boolean/);
  assert.match(sql, /set has_skus = exists/);
  assert.match(sql, /create index if not exists products_has_skus_idx/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.product_skus/i);
  assert.doesNotMatch(sql, /product_skus[\s\S]{0,80}set\s+stock/i);
});

test("SKU writes probe schema before insert, update or delete", () => {
  const collection = file("app/api/admin/products/[id]/skus/route.ts");
  const item = file("app/api/admin/products/[id]/skus/[skuId]/route.ts");
  assert.ok(collection.indexOf("inspectCatalogSkuSchema(service)") < collection.indexOf('.from("product_skus").insert'));
  assert.ok(item.indexOf("inspectCatalogSkuSchema(service)") < item.indexOf('.from("product_skus").update'));
  assert.match(item, /CATALOG_SKU_SCHEMA_NOT_READY/g);
});

test("backfill is dry-run by default and execute requires a second state read", () => {
  const script = file("scripts/backfill-legacy-product-skus.mjs");
  assert.match(script, /process\.argv\.includes\("--execute"\)/);
  assert.match(script, /if \(!execute\) process\.exit\(0\)/);
  assert.match(script, /const verifiedState = await readTargetState\(\)/);
  assert.match(script, /target state changed after planning/);
  assert.match(script, /schemaReadiness\.ready/);
  assert.match(script, /const summaryProductIds/);
  assert.match(script, /row\.insert \+ row\.skip === row\.expected/);
});
