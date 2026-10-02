import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  evaluateSkuActivationReadiness,
  isAutomaticSkuActivation,
  readSkuActivationReadiness,
  summarizeSkuReadiness,
} from "../../lib/products/sku-activation-readiness.mjs";

const root = process.cwd();
const file = (name) => readFileSync(join(root, name), "utf8");
const product = { id: "product-1", has_skus: true, delivery_type: "automatic", metadata: {} };
const sku = (overrides = {}) => ({
  id: "sku-1",
  product_id: product.id,
  sku_code: "2-usd",
  stock: 0,
  status: "draft",
  delivery_type: "automatic",
  metadata: {},
  ...overrides,
});

test("automatic draft SKU with zero stock and no source cannot activate", () => {
  const result = evaluateSkuActivationReadiness({ product, sku: sku(), localAvailableCount: 0 });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes("ZERO_STOCK"));
  assert.ok(result.reasons.includes("LOCAL_INVENTORY_EMPTY"));
  assert.ok(result.reasons.includes("NO_FULFILLMENT_SOURCE"));
});

test("positive stock without a real fulfillment source cannot activate", () => {
  const result = evaluateSkuActivationReadiness({ product, sku: sku({ stock: 9 }), localAvailableCount: 0 });
  assert.equal(result.ready, false);
  assert.ok(!result.reasons.includes("ZERO_STOCK"));
  assert.ok(result.reasons.includes("NO_FULFILLMENT_SOURCE"));
});

test("incomplete exact supplier binding cannot activate", () => {
  const result = evaluateSkuActivationReadiness({
    product,
    sku: sku({ stock: 5, metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15 } }),
    localAvailableCount: 99,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes("SUPPLIER_BINDING_INCOMPLETE"));
  assert.ok(result.reasons.includes("NO_FULFILLMENT_SOURCE"));
  assert.equal(result.source, "none");
});

test("requires_verification remains fail closed without later trusted evidence", () => {
  const result = evaluateSkuActivationReadiness({
    product,
    sku: sku({ stock: 5, metadata: { inventory_state: "requires_verification" } }),
    localAvailableCount: 0,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.includes("INVENTORY_REQUIRES_VERIFICATION"));
});

test("SKU-level available local inventory is a valid existing fulfillment source", () => {
  const result = evaluateSkuActivationReadiness({ product, sku: sku({ stock: 2 }), localAvailableCount: 2 });
  assert.equal(result.ready, true);
  assert.equal(result.source, "local_inventory");
  assert.deepEqual(result.reasons, []);
});

test("valid exact supplier binding and synced matching stock can activate", () => {
  const result = evaluateSkuActivationReadiness({
    product,
    sku: sku({
      stock: 7,
      metadata: {
        fulfillment_source: "supplier",
        supplier: "daju",
        supplier_product_id: 15,
        supplier_sku: "13",
        supplier_inputs_mapping: {},
        supplier_max_unit_cost: "8.50",
        supplier_stock_snapshot: 7,
        supplier_stock_sync_status: "synced",
        supplier_stock_last_success_at: "2026-10-01T00:00:00.000Z",
        supplier_stock_stale: false,
      },
    }),
    localAvailableCount: 0,
  });
  assert.equal(result.ready, true);
  assert.equal(result.source, "supplier");
});

test("parent product supplier binding never substitutes for exact SKU binding", () => {
  const result = evaluateSkuActivationReadiness({
    product: { ...product, metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_max_unit_cost: "8.5" } },
    sku: sku({ stock: 5 }),
    localAvailableCount: 0,
  });
  assert.equal(result.ready, false);
  assert.equal(result.source, "none");
});

test("only non-active to active automatic transitions invoke the guard", () => {
  assert.equal(isAutomaticSkuActivation("draft", "active", product, sku()), true);
  assert.equal(isAutomaticSkuActivation("active", "draft", product, sku()), false);
  assert.equal(isAutomaticSkuActivation("active", "active", product, sku()), false);
  assert.equal(isAutomaticSkuActivation("draft", "sold_out", product, sku()), false);
  assert.equal(isAutomaticSkuActivation("draft", "active", { ...product, has_skus: false, delivery_type: "manual" }, sku({ delivery_type: null })), false);
});

test("server readiness counts only available inventory for the exact product and SKU", async () => {
  const calls = [];
  const service = {
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns, options) {
          calls.push(["select", columns, options]);
          return {
            eq(key1, value1) {
              calls.push(["eq", key1, value1]);
              return {
                eq(key2, value2) {
                  calls.push(["eq", key2, value2]);
                  return {
                    eq(key3, value3) {
                      calls.push(["eq", key3, value3]);
                      return Promise.resolve({ count: 3, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const result = await readSkuActivationReadiness(service, product, sku({ stock: 3 }));
  assert.equal(result.ready, true);
  assert.equal(result.local_available_count, 3);
  assert.deepEqual(calls.filter(([name]) => name === "eq"), [
    ["eq", "product_id", "product-1"],
    ["eq", "sku_id", "sku-1"],
    ["eq", "status", "available"],
  ]);
});

test("readiness summary reports real SKU state without treating unbound as automatically broken", () => {
  const rows = [sku(), sku({ id: "sku-2", sku_code: "3-usd", stock: 2, status: "active", metadata: { inventory_state: "requires_verification" } })];
  const summary = summarizeSkuReadiness(rows, [
    { sku_id: "sku-1", activation_readiness: evaluateSkuActivationReadiness({ product, sku: rows[0], localAvailableCount: 0 }) },
    { sku_id: "sku-2", activation_readiness: evaluateSkuActivationReadiness({ product, sku: rows[1], localAvailableCount: 2 }) },
  ]);
  assert.deepEqual(summary, { total: 2, active: 1, draft: 1, zero_stock: 1, supplier_unbound: 2, requires_verification: 1, local_inventory_available: 1, no_verified_source: 1, activation_ready: 1 });
});

test("SKU write routes enforce readiness before insert/update and expose structured errors", () => {
  const collection = file("app/api/admin/products/[id]/skus/route.ts");
  const item = file("app/api/admin/products/[id]/skus/[skuId]/route.ts");
  const collectionGuard = collection.lastIndexOf("readSkuActivationReadiness", collection.indexOf('.from("product_skus").insert'));
  const itemGuard = item.lastIndexOf("readSkuActivationReadiness", item.indexOf('.from("product_skus").update'));
  assert.ok(collectionGuard > 0 && collectionGuard < collection.indexOf('.from("product_skus").insert'));
  assert.ok(itemGuard > 0 && itemGuard < item.indexOf('.from("product_skus").update'));
  for (const source of [collection, item]) {
    assert.match(source, /SKU_ACTIVATION_NOT_READY/);
    assert.match(source, /reasons:\s*readiness\.reasons/);
  }
});

test("Admin UI exposes multi-SKU stock semantics, readiness badges and activation confirmation", () => {
  const page = file("app/admin/products/page.tsx");
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(page, />多 SKU</);
  assert.match(page, /SKU 汇总库存/);
  assert.match(page, /供应商库存：未同步/);
  assert.match(manager, />库存待验证</);
  assert.match(manager, /SKU 激活已阻止/);
  assert.match(manager, /激活后该 SKU 将可能在前台进入可售范围/);
  assert.match(manager, /当前无可验证履约来源/);
});
