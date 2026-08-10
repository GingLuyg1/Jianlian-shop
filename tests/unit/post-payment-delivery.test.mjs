import assert from "node:assert/strict";
import test from "node:test";

import { runLocalStockPriorityDelivery } from "../../lib/delivery/local-stock-priority.mjs";
import { runPostPaymentDelivery } from "../../lib/orders/post-payment-delivery.mjs";
import { classifyDajuFulfillmentCandidate } from "../../lib/providers/daju/fulfillment-candidate.mjs";

const supplierBinding = {
  fulfillment_source: "supplier",
  supplier: "daju",
  supplier_product_id: 45,
  supplier_sku: null,
  supplier_inputs_mapping: {},
  supplier_max_unit_cost: "7",
};

function supplierItem() {
  return {
    id: "item-1",
    order_id: "order-1",
    quantity: 1,
    delivery_type: "automatic",
    delivery_status: "pending",
    product_snapshot: { supplier_binding: supplierBinding },
  };
}

test("paid order with complete local inventory delivers locally with zero supplier purchase", async () => {
  const item = supplierItem();
  let supplierPurchases = 0;
  const result = await runPostPaymentDelivery({
    payment: { orderId: "order-1", transactionNo: "balance-1" },
    deliver: () => runLocalStockPriorityDelivery({
      reserveLocal: async () => ({ ok: true, local_ready_count: 1, supplier_fallback_count: 0, blocked_count: 0 }),
      deliverLocal: async () => {
        item.delivery_status = "delivered";
        return { ok: true, delivered_count: 1 };
      },
      deliverSupplier: async () => {
        if (classifyDajuFulfillmentCandidate(item).kind === "daju") supplierPurchases += 1;
        return { handled: 0, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 };
      },
    }),
  });

  assert.equal(result.delivery.local.delivered_count, 1);
  assert.equal(supplierPurchases, 0);
});

test("paid order without enough local inventory enters Daju fallback once", async () => {
  let supplierCalls = 0;
  const result = await runPostPaymentDelivery({
    payment: { orderId: "order-2" },
    deliver: () => runLocalStockPriorityDelivery({
      reserveLocal: async () => ({ ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 }),
      deliverLocal: async () => ({ ok: true, delivered_count: 0 }),
      deliverSupplier: async () => {
        supplierCalls += 1;
        return { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 };
      },
    }),
  });

  assert.equal(result.delivery.supplier.fulfilled, 1);
  assert.equal(supplierCalls, 1);
});

test("fulfillment failure preserves the successful payment and does not retry delivery", async () => {
  let deliveryCalls = 0;
  const payment = { orderId: "order-paid", transactionNo: "balance-1" };
  const result = await runPostPaymentDelivery({
    payment,
    deliver: async () => {
      deliveryCalls += 1;
      throw new Error("FULFILLMENT_FAILED");
    },
  });

  assert.equal(result.payment, payment);
  assert.equal(deliveryCalls, 1);
  assert.match(result.deliveryError.message, /FULFILLMENT_FAILED/);
});

test("lifecycle logging is ordered and callback failures cannot change fulfillment", async () => {
  const stages = [];
  const result = await runPostPaymentDelivery({
    payment: { orderId: "order-log" },
    deliver: async () => ({ ok: true }),
    onStage: ({ stage }) => {
      stages.push(stage);
      if (stage === "AUTO_DELIVERY_STARTED") throw new Error("LOGGER_FAILED");
    },
  });
  assert.deepEqual(stages, ["AUTO_DELIVERY_STARTED", "AUTO_DELIVERY_COMPLETED"]);
  assert.equal(result.delivery.ok, true);
});

test("repeated paid-order requests remain idempotent at the stable fulfillment boundary", async () => {
  let supplierPurchases = 0;
  let fulfilled = false;
  async function fulfillStableOrder() {
    return runPostPaymentDelivery({
      payment: { orderId: "order-stable" },
      deliver: async () => {
        if (fulfilled) return { idempotent: true };
        supplierPurchases += 1;
        fulfilled = true;
        return { idempotent: false };
      },
    });
  }

  const first = await fulfillStableOrder();
  const second = await fulfillStableOrder();
  assert.equal(first.delivery.idempotent, false);
  assert.equal(second.delivery.idempotent, true);
  assert.equal(supplierPurchases, 1);
});
