import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkOrderProductAvailability,
  evaluateOrderProductAvailability,
} from "../../lib/catalog/order-product-visibility.mjs";

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const root = (enabled = true) => ({
  id: "root",
  parent_id: null,
  level: 1,
  is_active: enabled,
});
const child = (enabled = true) => ({
  id: "child",
  parent_id: "root",
  level: 2,
  is_active: enabled,
});
const product = (status = "active") => ({
  id: "product",
  status,
  category_id: "child",
});

test("order API blocks products under a disabled root category", () => {
  assert.equal(evaluateOrderProductAvailability(product(), child(), root(false)), false);
});

test("order API blocks products under a disabled child category", () => {
  assert.equal(evaluateOrderProductAvailability(product(), child(false), root()), false);
});

test("order API blocks inactive products", () => {
  assert.equal(evaluateOrderProductAvailability(product("inactive"), child(), root()), false);
});

test("visible products are allowed and category re-enable restores eligibility", () => {
  assert.equal(evaluateOrderProductAvailability(product(), child(), root()), true);
  assert.equal(evaluateOrderProductAvailability(product(), child(), root(false)), false);
  assert.equal(evaluateOrderProductAvailability(product(), child(), root(true)), true);
});

test("missing or malformed category ancestry fails closed", () => {
  assert.equal(evaluateOrderProductAvailability(product(), child(), null), false);
  assert.equal(
    evaluateOrderProductAvailability(product(), { ...child(), parent_id: "missing" }, root()),
    false,
  );
});

test("database failures fail closed without treating the product as unavailable data", async () => {
  const fakeSupabase = (responses) => ({
    from() {
      const response = responses.shift();
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => response,
      };
      return query;
    },
  });

  assert.deepEqual(
    await checkOrderProductAvailability(
      fakeSupabase([{ data: null, error: { message: "database unavailable" } }]),
      "product",
    ),
    { available: false, reason: "check_failed" },
  );
  assert.deepEqual(
    await checkOrderProductAvailability(
      fakeSupabase([
        { data: product(), error: null },
        { data: null, error: { message: "category query unavailable" } },
      ]),
      "product",
    ),
    { available: false, reason: "check_failed" },
  );
});

test("order route fails closed before agreements, risk, RPC, balance, and BEP20", () => {
  const route = file("app/api/orders/route.ts");
  const helper = file("lib/catalog/order-product-visibility.mjs");
  const guardIndex = route.indexOf("await checkOrderProductAvailability(supabase, productId)");
  assert.ok(guardIndex > 0);
  for (const marker of [
    "await verifyCheckoutAgreements",
    "await evaluateOrderRisk",
    'supabase.rpc("create_order_with_item"',
    "await payOrderWithBalance",
    "await createBep20PaymentSession",
  ]) {
    assert.ok(guardIndex < route.indexOf(marker), `visibility guard must precede ${marker}`);
  }
  assert.match(route, /code: "PRODUCT_UNAVAILABLE"/);
  assert.match(route, /code: "PRODUCT_AVAILABILITY_CHECK_FAILED"/);
  assert.match(route, /availability\.reason === "check_failed"/);
  assert.match(helper, /if \(productError\) return \{ available: false, reason: "check_failed" \}/);
  assert.match(helper, /if \(categoryError\) return \{ available: false, reason: "check_failed" \}/);
  assert.match(helper, /if \(error\) return \{ available: false, reason: "check_failed" \}/);
});
