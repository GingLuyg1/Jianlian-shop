import assert from "node:assert/strict";
import test from "node:test";

import {
  SKU_BULK_BATCH_LIMIT,
  buildSkuBulkPreview,
  executeSkuBulkStatusUpdate,
  parseSkuBulkOperationRequest,
} from "../../lib/products/admin-sku-bulk-operations.mjs";
import { evaluateSkuActivationReadiness } from "../../lib/products/sku-activation-readiness.mjs";

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const product = { id: id(900), delivery_type: "automatic" };
const sku = (number, overrides = {}) => ({
  id: id(number),
  product_id: product.id,
  sku_code: `${number}-usd`,
  status: "draft",
  stock: 0,
  delivery_type: "automatic",
  metadata: {},
  ...overrides,
});

test("bulk request validation rejects empty, duplicate, malformed, oversized and unsupported input", () => {
  assert.equal(parseSkuBulkOperationRequest({ sku_ids: [], action: "set_draft" }).code, "EMPTY_SKU_SELECTION");
  assert.equal(parseSkuBulkOperationRequest({ sku_ids: [id(1), id(1)], action: "set_draft" }).code, "DUPLICATE_SKU_ID");
  assert.equal(parseSkuBulkOperationRequest({ sku_ids: ["not-a-uuid"], action: "set_draft" }).code, "MALFORMED_SKU_ID");
  assert.equal(parseSkuBulkOperationRequest({ sku_ids: Array.from({ length: SKU_BULK_BATCH_LIMIT + 1 }, (_, index) => id(index)), action: "set_draft" }).code, "SKU_BATCH_LIMIT_EXCEEDED");
  assert.equal(parseSkuBulkOperationRequest({ sku_ids: [id(1)], action: "delete" }).code, "INVALID_BULK_ACTION");
  for (const forbidden of ["force", "override", "ignore_readiness", "skip_failed", "target_status"]) {
    assert.equal(parseSkuBulkOperationRequest({ sku_ids: [id(1)], action: "set_draft", [forbidden]: true }).code, "UNSUPPORTED_BULK_PARAMETER");
  }
});

test("set_draft preview separates changes and no-op rows without blocking", () => {
  const preview = buildSkuBulkPreview({
    action: "set_draft",
    skus: [sku(1, { status: "active" }), sku(2, { status: "active" }), sku(3, { status: "draft" })],
  });
  assert.deepEqual({
    selected: preview.selected_count,
    willChange: preview.will_change_count,
    noChange: preview.no_change_count,
    blocked: preview.blocked_count,
    canExecute: preview.can_execute,
  }, { selected: 3, willChange: 2, noChange: 1, blocked: 0, canExecute: true });
});

test("set_sold_out preview preserves no-op semantics", () => {
  const preview = buildSkuBulkPreview({
    action: "set_sold_out",
    skus: [sku(1, { status: "active" }), sku(2, { status: "sold_out" })],
  });
  assert.equal(preview.will_change_count, 1);
  assert.equal(preview.no_change_count, 1);
  assert.equal(preview.blocked_count, 0);
});

test("ten Apple-style zero-stock unbound SKUs all fail authoritative activation readiness", () => {
  const skus = Array.from({ length: 10 }, (_, index) => sku(index + 1, { metadata: { inventory_state: "requires_verification" } }));
  const readinessBySku = Object.fromEntries(skus.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: 0 })]));
  const activationGuardBySku = Object.fromEntries(skus.map((row) => [row.id, true]));
  const preview = buildSkuBulkPreview({ action: "activate", skus, readinessBySku, activationGuardBySku });
  assert.equal(preview.selected_count, 10);
  assert.equal(preview.executable_count, 0);
  assert.equal(preview.blocked_count, 10);
  assert.equal(preview.can_execute, false);
  for (const item of preview.items) {
    assert.ok(item.reasons.includes("ZERO_STOCK"));
    assert.ok(item.reasons.includes("NO_FULFILLMENT_SOURCE"));
    assert.ok(item.reasons.includes("INVENTORY_REQUIRES_VERIFICATION"));
  }
});

test("all ready activation preview passes readiness but execution remains deferred for atomicity", () => {
  const rows = [sku(1, { stock: 1 }), sku(2, { stock: 2 })];
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: row.stock })]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku: { [rows[0].id]: true, [rows[1].id]: true } });
  assert.equal(preview.can_execute, true);
  assert.equal(preview.blocked_count, 0);
  assert.equal(preview.execution_supported, false);
});

test("one blocked SKU blocks the entire activation batch and performs zero writes", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => sku(index + 1, { stock: index === 9 ? 0 : 1 }));
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: row.stock })]));
  const activationGuardBySku = Object.fromEntries(rows.map((row) => [row.id, true]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku });
  let writeCalls = 0;
  const execution = await executeSkuBulkStatusUpdate({ preview, updateStatuses: async () => { writeCalls += 1; return []; } });
  assert.equal(preview.blocked_count, 1);
  assert.equal(preview.can_execute, false);
  assert.equal(execution.code, "BULK_OPERATION_BLOCKED");
  assert.equal(execution.updated_count, 0);
  assert.equal(writeCalls, 0, "BLOCKED_BATCH_WRITES must stay zero");
});

test("draft execution performs one exact batch update and verifies returned rows", async () => {
  const rows = [sku(1, { status: "active" }), sku(2, { status: "active" }), sku(3, { status: "draft" })];
  const preview = buildSkuBulkPreview({ action: "set_draft", skus: rows });
  const calls = [];
  const execution = await executeSkuBulkStatusUpdate({
    preview,
    updateStatuses: async (skuIds, targetStatus) => {
      calls.push({ skuIds, targetStatus });
      return skuIds.map((skuId) => ({ id: skuId, status: targetStatus }));
    },
  });
  assert.equal(execution.ok, true);
  assert.equal(execution.updated_count, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { skuIds: [id(1), id(2)], targetStatus: "draft" });
});

test("batch result count mismatch is never reported as success", async () => {
  const preview = buildSkuBulkPreview({ action: "set_sold_out", skus: [sku(1), sku(2)] });
  const execution = await executeSkuBulkStatusUpdate({ preview, updateStatuses: async (skuIds, targetStatus) => [{ id: skuIds[0], status: targetStatus }] });
  assert.equal(execution.ok, false);
  assert.equal(execution.code, "BULK_UPDATE_COUNT_MISMATCH");
});

test("parent product stock and binding never substitute for exact SKU evidence", () => {
  const parentWithFalseEvidence = {
    ...product,
    stock: 999,
    metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 14, supplier_sku: "2", supplier_max_unit_cost: "1.00" },
  };
  const row = sku(1, { stock: 1 });
  const readiness = evaluateSkuActivationReadiness({ product: parentWithFalseEvidence, sku: row, localAvailableCount: 0 });
  assert.equal(readiness.ready, false);
  assert.ok(readiness.reasons.includes("LOCAL_INVENTORY_EMPTY"));
  assert.ok(readiness.reasons.includes("NO_FULFILLMENT_SOURCE"));
});
