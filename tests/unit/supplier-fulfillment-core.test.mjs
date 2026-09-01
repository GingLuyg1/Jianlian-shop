import assert from "node:assert/strict";
import test from "node:test";
import { fulfillSupplierCandidates, reconcileSupplierExistingCandidate } from "../../lib/providers/core/fulfillment-core.mjs";

test("supplier core does not repurchase fulfilled claims", async () => {
  let purchases = 0;
  const result = await fulfillSupplierCandidates({
    candidates: [{ orderId:"o1", orderItemId:"i1", binding:{ productId:1 }, bindingInvalid:false }],
    triggerSource: "test",
    createRequestId: () => "jianlian:o1:i1",
    store: {
      claim: async (_c, requestId) => ({ action:"NONE", requestId, attemptToken:null, status:"FULFILLED", orderCode:"S1" }),
      recordOutcome: async () => { throw new Error("unexpected outcome"); },
    },
    client: { purchase: async () => { purchases += 1; } },
  });
  assert.deepEqual(result, { handled:1, fulfilled:1, failed:0, uncertain:0, needsInput:0 });
  assert.equal(purchases, 0);
});

test("supplier core fulfills a normal purchase through the injected adapter contract", async () => {
  let purchaseCalls = 0;
  const saved = [];
  const result = await fulfillSupplierCandidates({
    candidates: [{
      orderId: "o2",
      orderItemId: "i2",
      quantity: 2,
      orderFields: {},
      binding: { productId: 22, sku: "SKU-22" },
      bindingInvalid: false,
    }],
    triggerSource: "test",
    createRequestId: () => "jianlian:o2:i2",
    store: {
      claim: async () => ({ action: "PURCHASE", attemptToken: "a2", status: "PURCHASING", orderCode: null }),
      recordOutcome: async (outcome) => { saved.push(outcome); },
    },
    client: {
      getProduct: async () => ({ id: 22, price: 3 }),
      purchase: async (payload) => {
        purchaseCalls += 1;
        assert.equal(payload.requestId, "jianlian:o2:i2");
        return { orderCode: "S2", unitPrice: 3, totalPrice: 6, delivered: ["A", "B"] };
      },
    },
    validateReadiness: () => ({ ok: true, inputs: { email: "buyer@example.com" } }),
    decideError: () => { throw new Error("unexpected decideError"); },
    decideOrderResult: () => ({ kind: "fulfilled" }),
    extractDeliveredContent: (order) => order.delivered.join("\n"),
    countDelivered: (order) => order.delivered.length,
    outcome: (_candidate, _claim, requestId, state, retryable, code, extra = {}) => ({
      requestId,
      state,
      retryable,
      code,
      ...extra,
    }),
  });

  assert.deepEqual(result, { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 });
  assert.equal(purchaseCalls, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].state, "FULFILLED");
  assert.equal(saved[0].orderCode, "S2");
  assert.equal(saved[0].deliveredContent, "A\nB");
});

test('supplier core reconciliation is GET-only and never purchases', async () => {
  let gets = 0;
  let purchases = 0;
  const saved = [];
  const result = await reconcileSupplierExistingCandidate({
    candidate: { orderId: 'o3', orderItemId: 'i3', quantity: 1, binding: { productId: 33 }, bindingInvalid: false },
    orderCode: 'S3',
    triggerSource: 'test',
    createRequestId: () => 'jianlian:o3:i3',
    store: {
      claim: async () => ({ action: 'NONE', status: 'PURCHASING', attemptToken: 'a3', orderCode: 'S3' }),
      recordOutcome: async (outcome) => { saved.push(outcome); },
    },
    client: {
      getOrder: async (orderCode) => { gets += 1; assert.equal(orderCode, 'S3'); return { orderCode: 'S3', unitPrice: 4, totalPrice: 4, delivered: ['SECRET-3'] }; },
      purchase: async () => { purchases += 1; throw new Error('purchase must not be called'); },
    },
    validateReconciliation: () => ({ ok: true }),
    extractDeliveredContent: (order) => order.delivered.join('\n'),
    countDelivered: (order) => order.delivered.length,
    outcome: (_candidate, _claim, requestId, state, retryable, code, extra = {}) => ({ requestId, state, retryable, code, ...extra }),
  });
  assert.deepEqual(result, { ok: true, orderCode: 'S3', requestId: 'jianlian:o3:i3', deliveredCount: 1 });
  assert.equal(gets, 1);
  assert.equal(purchases, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].state, 'FULFILLED');
  assert.equal(saved[0].deliveredContent, 'SECRET-3');
});
