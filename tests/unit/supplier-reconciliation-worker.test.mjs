import assert from "node:assert/strict";
import test from "node:test";


test("worker source never calls provider purchase", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("scripts/ops/supplier-reconciliation-worker.mjs", "utf8");
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
