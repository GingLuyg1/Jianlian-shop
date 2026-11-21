import test from "node:test";
import assert from "node:assert/strict";
import { read, patches, patch, migrationPath } from "../support/kuajingzy-atomic-cap-patch.mjs";

test("cap exhaustion alone maps to a safe 409 before RPC fallback or logging", () => {
  const route = read("app/api/orders/route.ts");
  const start = route.indexOf('    if (error?.message === "KUAJINGZY_SELLABLE_CAP_EXHAUSTED")');
  const end = route.indexOf("    if (error) {", start);
  assert.ok(start > 0 && end > start);
  const handler = new Function("error", "NextResponse", route.slice(start, end));
  const response = handler({ message: "KUAJINGZY_SELLABLE_CAP_EXHAUSTED", details: "PRIVATE_SQL" }, { json: Response.json });
  assert.equal(response.status, 409);
  return response.json().then(body => {
    assert.deepEqual(body, { error: "商品当前不可购买，请刷新后重试", code: "KUAJINGZY_ORDER_UNAVAILABLE" });
    for (const message of ["other", "KUAJINGZY_SELLABLE_CAP_EXHAUSTED extra"]) {
      assert.equal(handler({ message }, { json: Response.json }), undefined);
    }
    assert.equal(handler(null, { json: Response.json }), undefined);
    assert.ok(start < route.indexOf("      logCreateOrderRpcError({", start));
    assert.ok(start < route.indexOf("await createPaymentSession("));
  });
});

test("migration anchors and RPC fingerprints fail closed and preserve ACL", () => {
  const sql = read(migrationPath);
  for (const marker of ["UNKNOWN_CREATE_ORDER_BASELINE", "UNKNOWN_RELEASE_INVENTORY_BASELINE",
    "ATOMIC_CAP_ANCHOR_DRIFT", "ATOMIC_CAP_POSTCHECK_FAILED", "original_acl", "has_function_privilege",
    "lock_timeout", "statement_timeout"]) assert.ok(sql.includes(marker));
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.doesNotMatch(sql, /create table|add column|grant execute/i);
  for (const kind of ["create", "release"]) {
    for (const [anchor] of patches(kind)) assert.throws(() => patch(anchor + anchor, kind), /ANCHOR_DRIFT/);
  }
  assert.match(read("lib/providers/kuajingzy/purchase-policy.mjs"), /KUAJINGZY_PURCHASE_RELEASE_ENABLED = false/);
});
