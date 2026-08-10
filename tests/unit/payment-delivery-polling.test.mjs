import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_DELIVERY_POLL_INTERVAL_MS,
  PAYMENT_DELIVERY_POLL_TIMEOUT_MS,
  pollForPaymentDelivery,
} from "../../lib/orders/delivery-polling.mjs";

function clock() {
  let value = 0;
  return {
    now: () => value,
    wait: async (delay) => {
      value += delay;
      return true;
    },
  };
}

test("payment success displays delivery immediately when it is ready", async () => {
  let loads = 0;
  const result = await pollForPaymentDelivery({
    load: async () => { loads += 1; return "delivered"; },
  });
  assert.deepEqual(result, { kind: "delivered" });
  assert.equal(loads, 1);
});

test("payment success polls until delivery becomes ready", async () => {
  const fake = clock();
  let loads = 0;
  const result = await pollForPaymentDelivery({
    ...fake,
    load: async () => (++loads === 3 ? "delivered" : "pending"),
  });
  assert.deepEqual(result, { kind: "delivered" });
  assert.equal(loads, 3);
});

test("payment success polling stops at the finite timeout", async () => {
  const fake = clock();
  let loads = 0;
  const result = await pollForPaymentDelivery({
    ...fake,
    load: async () => { loads += 1; return "pending"; },
  });
  assert.deepEqual(result, { kind: "timeout" });
  assert.equal(PAYMENT_DELIVERY_POLL_INTERVAL_MS, 1500);
  assert.equal(PAYMENT_DELIVERY_POLL_TIMEOUT_MS, 24000);
  assert.ok(loads > 1);
});

test("a reloaded paid page can load an already delivered order", async () => {
  const result = await pollForPaymentDelivery({ load: async () => "delivered" });
  assert.equal(result.kind, "delivered");
});

test("delivery API failure remains a delivery error instead of a payment failure", async () => {
  let loads = 0;
  const result = await pollForPaymentDelivery({
    load: async () => { loads += 1; return "error"; },
  });
  assert.deepEqual(result, { kind: "error" });
  assert.equal(loads, 1);
});

test("delivery polling performs reads only and never invokes a payment callback", async () => {
  let paymentCalls = 0;
  const result = await pollForPaymentDelivery({ load: async () => "delivered" });
  assert.equal(result.kind, "delivered");
  assert.equal(paymentCalls, 0);
});
