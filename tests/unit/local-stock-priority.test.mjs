import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLocalStockPriorityReservation,
  runLocalStockPriorityDelivery,
} from "../../lib/delivery/local-stock-priority.mjs";
import { classifyDajuFulfillmentCandidate } from "../../lib/providers/daju/fulfillment-candidate.mjs";

const supplierBinding = {
  fulfillment_source: "supplier",
  supplier: "daju",
  supplier_product_id: 45,
  supplier_sku: null,
  supplier_inputs_mapping: {},
  supplier_max_unit_cost: "7",
};

function supplierItem(overrides = {}) {
  return {
    id: "item-1",
    order_id: "order-1",
    quantity: 1,
    delivery_type: "automatic",
    delivery_status: "pending",
    product_snapshot: { supplier_binding: supplierBinding },
    ...overrides,
  };
}

test("supplier item with complete local stock is delivered locally with zero supplier purchase", async () => {
  const item = supplierItem();
  let purchases = 0;
  let claims = 0;
  const result = await runLocalStockPriorityDelivery({
    reserveLocal: async () => ({ ok: true, local_ready_count: 1, supplier_fallback_count: 0, blocked_count: 0 }),
    deliverLocal: async () => { item.delivery_status = "delivered"; return { ok: true, delivered_count: 1 }; },
    deliverSupplier: async () => {
      const classification = classifyDajuFulfillmentCandidate(item);
      if (classification.kind === "daju") { claims += 1; purchases += 1; }
      return { handled: 0, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 };
    },
  });
  assert.equal(result.local.delivered_count, 1);
  assert.equal(claims, 0);
  assert.equal(purchases, 0);
});

test("zero or insufficient local stock falls back to Daju for the whole item", async () => {
  for (const quantity of [1, 2]) {
    let localConsumed = 0;
    let purchases = 0;
    await runLocalStockPriorityDelivery({
      reserveLocal: async () => ({ ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 }),
      deliverLocal: async () => ({ ok: true, delivered_count: localConsumed }),
      deliverSupplier: async () => { purchases += 1; return { handled: 1, quantity }; },
    });
    assert.equal(localConsumed, 0);
    assert.equal(purchases, 1);
  }
});

test("supplier failure never loops back to consume local inventory", async () => {
  let reserves = 0;
  let localAttempts = 0;
  let purchases = 0;
  await assert.rejects(() => runLocalStockPriorityDelivery({
    reserveLocal: async () => { reserves += 1; return { ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 }; },
    deliverLocal: async () => { localAttempts += 1; return { ok: true, delivered_count: 0 }; },
    deliverSupplier: async () => { purchases += 1; throw new Error("supplier uncertain"); },
  }), /supplier uncertain/);
  assert.equal(reserves, 1);
  assert.equal(localAttempts, 1);
  assert.equal(purchases, 1);
});

test("partial pre-existing local reservation blocks supplier fallback", async () => {
  let supplierCalls = 0;
  await assert.rejects(() => runLocalStockPriorityDelivery({
    reserveLocal: async () => ({ ok: true, local_ready_count: 0, supplier_fallback_count: 0, blocked_count: 1 }),
    deliverLocal: async () => ({ ok: true }),
    deliverSupplier: async () => { supplierCalls += 1; return {}; },
  }), /LOCAL_STOCK_PRIORITY_STATE_BLOCKED/);
  assert.equal(supplierCalls, 0);
});

test("priority result parsing is strict and delivered supplier items stay idempotent", () => {
  assert.deepEqual(parseLocalStockPriorityReservation({
    ok: true, local_ready_count: 1, supplier_fallback_count: 2, blocked_count: 0,
  }), { localReadyCount: 1, supplierFallbackCount: 2, blockedCount: 0 });
  assert.equal(parseLocalStockPriorityReservation({ ok: true, local_ready_count: "1", supplier_fallback_count: 0, blocked_count: 0 }), null);
  assert.deepEqual(classifyDajuFulfillmentCandidate(supplierItem({ delivery_status: "delivered" })), {
    kind: "skip", reason: "ALREADY_DELIVERED",
  });
});
