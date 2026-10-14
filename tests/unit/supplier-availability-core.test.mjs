import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSupplierAvailability } from "../../lib/providers/core/availability-core.mjs";

const now = Date.parse("2026-10-15T01:00:00Z");
const base = { checked_at: "2026-10-15T00:30:00Z", error_state: null,
  freshness: { supplier_stock_stale: false, supplier_stock_sync_status: "synced" } };
const evaluate = (snapshot) => evaluateSupplierAvailability(snapshot, now, 3_600_000);

test("quantity and boolean suppliers retain distinct stock evidence", () => {
  assert.deepEqual(evaluate({ ...base, quantity: 5, supplier_quantity_known: true }),
    { state: "AVAILABLE", quantity: 5, quantityKnown: true, purchasable: true });
  assert.deepEqual(evaluate({ ...base, quantity: 0, supplier_quantity_known: true }),
    { state: "UNAVAILABLE", quantity: 0, quantityKnown: true, purchasable: false });
  assert.deepEqual(evaluate({ ...base, available: true, quantity: null, supplier_quantity_known: false }),
    { state: "AVAILABLE", quantity: null, quantityKnown: false, purchasable: true });
  assert.deepEqual(evaluate({ ...base, available: false, quantity: null, supplier_quantity_known: false }),
    { state: "UNAVAILABLE", quantity: null, quantityKnown: false, purchasable: false });
});

test("missing, error, stale and inconsistent evidence is UNKNOWN and fail-closed", () => {
  for (const snapshot of [null, {}, { ...base, available: true, supplier_quantity_known: false },
    { ...base, available: "true", quantity: null, supplier_quantity_known: false },
    { ...base, quantity: 1, supplier_quantity_known: false, available: true },
    { ...base, quantity: -1, supplier_quantity_known: true },
    { ...base, quantity: 2.5, supplier_quantity_known: true },
    { ...base, quantity: 5, available: false, supplier_quantity_known: true },
    { ...base, quantity: 5, supplier_quantity_known: true, checked_at: "2026-10-15" },
    { ...base, quantity: 5, supplier_quantity_known: true, error_state: "503" },
    { ...base, quantity: 5, supplier_quantity_known: true, freshness: { supplier_stock_stale: true, supplier_stock_sync_status: "error" } },
    { ...base, quantity: 5, supplier_quantity_known: true, checked_at: "2026-10-14T00:00:00Z" }]) {
    assert.deepEqual(evaluate(snapshot), { state: "UNKNOWN", quantity: null, quantityKnown: false, purchasable: false });
  }
});
