import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSupplierStatus, runSupplierReconciliation } from "../../scripts/ops/supplier-reconciliation-runtime.mjs";

const allowed = ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "REFUNDED", "UNKNOWN"];
function fixture({ status = "DELIVERED", queryError = false, attempts, rpcError = false, readError = false } = {}) {
  const calls = [], queries = [];
  let selected;
  const rows = attempts ?? [{ id: "test-attempt", supplier: "daju", status: "EXTERNAL_CREATED", external_order_id: "test-order" }];
  const builder = {
    select() { return this; },
    in(field, values) { assert.equal(field, "status"); selected = values; return this; },
    async limit(n) { assert.equal(n, 100); return { data: rows, error: readError }; },
  };
  const service = {
    from(table) { assert.equal(table, "supplier_purchase_attempts"); return builder; },
    async rpc(name, args) {
      assert.equal(name, "internal_supplier_purchase_record_evidence");
      assert.ok(allowed.includes(args.p_status));
      assert.match(args.p_result_class, /^[A-Z][A-Z0-9_]{0,99}$/);
      assert.match(args.p_safe_fingerprint, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(args).sort(), ["p_attempt_id", "p_external_order_row_id", "p_status", "p_result_class", "p_safe_fingerprint", "p_checked_at"].sort());
      calls.push(args); return { error: rpcError };
    },
  };
  return { calls, queries, selected: () => selected, run: () => runSupplierReconciliation({ service, getOrder: async code => {
    queries.push(code);
    if (queryError) throw Error("SENSITIVE_ERROR_SENTINEL");
    return { status, delivered: "SECRET_DELIVERY_SENTINEL", raw: { apiKey: "SECRET_KEY_SENTINEL" } };
  } }) };
}

for (const [raw, expected] of Object.entries({ DELIVERED: "DELIVERED", SUCCEEDED: "DELIVERED", COMPLETED: "DELIVERED", PENDING: "PENDING", CREATED: "PENDING", WAITING: "PENDING", PROCESSING: "PROCESSING", IN_PROGRESS: "PROCESSING", FAILED: "FAILED", REJECTED: "FAILED", CANCELLED: "FAILED", CANCELED: "FAILED", REFUNDED: "REFUNDED", unrecognized: "UNKNOWN" })) {
  test(`${raw} normalizes to RPC ${expected} with uppercase result class`, async () => {
    assert.equal(normalizeSupplierStatus(raw), expected);
    const f = fixture({ status: raw });
    assert.equal(await f.run(), 1);
    assert.equal(f.calls[0].p_status, expected);
    assert.equal(f.calls[0].p_result_class, expected === "DELIVERED" ? "PROVIDER_SUCCESS" : "PROVIDER_STATE");
    assert.doesNotMatch(JSON.stringify(f.calls), /SENTINEL|delivered|apiKey/);
  });
}
test("non-string and prototype names fail closed to UNKNOWN", () => {
  for (const x of [null, undefined, {}, 1, "constructor", "__proto__"]) assert.equal(normalizeSupplierStatus(x), "UNKNOWN");
});
test("query failure emits UNKNOWN/QUERY_FAILED without provider error contents", async () => {
  const f = fixture({ queryError: true }); assert.equal(await f.run(), 1);
  assert.equal(f.calls[0].p_status, "UNKNOWN"); assert.equal(f.calls[0].p_result_class, "QUERY_FAILED");
  assert.doesNotMatch(JSON.stringify(f.calls), /SENSITIVE_ERROR/);
});
test("scan accepts only EXTERNAL_CREATED/RECONCILING, excludes crash-recovery states", async () => {
  const attempts = ["SUBMITTING", "UNCERTAIN", "EXTERNAL_CREATED", "RECONCILING"].map(status => ({ id: status, supplier: "daju", status, external_order_id: status }));
  const f = fixture({ attempts }); assert.equal(await f.run(), 2);
  assert.deepEqual(f.selected(), ["EXTERNAL_CREATED", "RECONCILING"]);
  assert.deepEqual(f.queries, ["EXTERNAL_CREATED", "RECONCILING"]);
});
test("empty candidate set finishes with zero queries/evidence", async () => {
  const f = fixture({ attempts: [] }); assert.equal(await f.run(), 0);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.queries, []);
});
test("read/RPC failures stop safely without exposing error contents", async () => {
  const f = fixture({ readError: true }); await assert.rejects(f.run(), /SUPPLIER_RECONCILIATION_READ_FAILED/); assert.equal(f.queries.length, 0);
  await assert.rejects(fixture({ rpcError: true }).run(), /SUPPLIER_RECONCILIATION_EVIDENCE_WRITE_FAILED/);
});


test("worker source never calls provider purchase", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("scripts/ops/supplier-reconciliation-worker.mjs", "utf8") + await fs.readFile("scripts/ops/supplier-reconciliation-runtime.mjs", "utf8");
  assert.match(source, /getOrder\(orderCode\)/);
  assert.doesNotMatch(source, /\.purchase\(/);
  assert.match(source, /SUPPLIER_AUTO_PURCHASE_ENABLED/);
  assert.match(source, /SUPPLIER_RECONCILIATION_ENABLED/);
  assert.match(source, /internal_supplier_purchase_record_evidence/);
});

test("systemd runtime forces reconciliation-only mode", async () => {
  const fs = await import("node:fs/promises");
  const service = await fs.readFile("ops/systemd/jianlian-supplier-reconciliation.service", "utf8");
  const timer = await fs.readFile("ops/systemd/jianlian-supplier-reconciliation.timer", "utf8");
  assert.match(service, /SUPPLIER_RECONCILIATION_ENABLED=true/);
  assert.match(service, /SUPPLIER_AUTO_PURCHASE_ENABLED=false/);
  assert.match(service, /Type=oneshot/);
  assert.match(timer, /OnUnitActiveSec=5min/);
});
