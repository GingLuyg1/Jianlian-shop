import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("legacy recharge and orders aliases forward to original authorized handlers", () => {
  const recharge = readFileSync("app/api/recharge/create/route.ts", "utf8");
  const orders = readFileSync("app/my-orders/page.tsx", "utf8");
  assert.ok(recharge.includes('POST as createRecharge'));
  assert.ok(recharge.includes("return createRecharge(request)"));
  assert.ok(orders.includes('import MyOrdersPage from "@/app/account/orders/page"'));
  assert.ok(orders.includes("<MyOrdersPage />"));
  assert.ok(!recharge.includes("@next-codemod-error"));
  assert.ok(!orders.includes("@next-codemod-error"));
});
