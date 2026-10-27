import assert from "node:assert/strict";
import test from "node:test";
import { inspectLaunchCatalog } from "../../scripts/probe-bitrefill-launch-readonly.mjs";

test("launch inspection never mistakes Applebee's for Apple or turns a catalog price into cost", async () => {
  const product = { id: "applebees-usa", name: "Applebee's USA", country: "US", currency: "USD",
    inStock: true, packages: [{ packageId: "restaurant-5", value: "5", price: 999 }], range: null };
  let details = 0;
  const client = { ping: async () => ({ message: "pong" }),
    listProductsBounded: async () => ({ products: [product], pagesRead: 1, truncated: false }),
    searchProducts: async () => ({ products: [product] }),
    getProduct: async () => { details += 1; return { product }; } };
  const result = await inspectLaunchCatalog(client);
  assert.equal(details, 0);
  assert.equal(result.mapping.length, 10);
  assert.ok(result.mapping.every((m) => m.matches.length === 0 && !m.enabled && !m.bindingWritten));
  assert.equal(result.trustedCost, false);
});

test("launch inspection preserves completed GET authentication on a later schema error", async () => {
  const progress = { auth: "NOT_CHECKED", catalog: {}, searches: {}, products: [], mapping: [] };
  const client = { ping: async () => ({ message: "pong" }),
    listProductsBounded: async () => { throw new Error("INVALID_RESPONSE"); } };
  await assert.rejects(inspectLaunchCatalog(client, progress), /INVALID_RESPONSE/);
  assert.equal(progress.auth, "PASS_PERSONAL_GET_ONLY");
});
