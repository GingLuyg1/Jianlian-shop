import assert from "node:assert/strict";
import test from "node:test";

import {
  SKU_BULK_BATCH_LIMIT,
  buildSkuBulkPreview,
  executeSkuBulkActivation,
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
  assert.equal(preview.execution_supported, true);
});

test("set_sold_out preview preserves no-op semantics", () => {
  const preview = buildSkuBulkPreview({
    action: "set_sold_out",
    skus: [sku(1, { status: "active" }), sku(2, { status: "sold_out" })],
  });
  assert.equal(preview.will_change_count, 1);
  assert.equal(preview.no_change_count, 1);
  assert.equal(preview.blocked_count, 0);
  assert.equal(preview.execution_supported, true);
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

test("all ready activation preview enables transactional execution", () => {
  const rows = [sku(1, { stock: 1 }), sku(2, { stock: 2 })];
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: row.stock })]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku: { [rows[0].id]: true, [rows[1].id]: true } });
  assert.equal(preview.can_execute, true);
  assert.equal(preview.blocked_count, 0);
  assert.equal(preview.execution_supported, true);
});

test("one blocked SKU blocks the entire activation batch and performs zero writes", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => sku(index + 1, { stock: index === 9 ? 0 : 1 }));
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: row.stock })]));
  const activationGuardBySku = Object.fromEntries(rows.map((row) => [row.id, true]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku });
  let writeCalls = 0;
  const execution = await executeSkuBulkActivation({ preview, runTransaction: async () => { writeCalls += 1; return {}; } });
  assert.equal(preview.blocked_count, 1);
  assert.equal(preview.can_execute, false);
  assert.equal(execution.code, "BULK_ACTIVATION_NOT_READY");
  assert.equal(execution.updated_count, 0);
  assert.equal(writeCalls, 0, "BLOCKED_BATCH_WRITES must stay zero");
});

test("draft, sold-out and ready activation each call their transactional RPC exactly once", async () => {
  const readyRows = [sku(1, { stock: 1 }), sku(2, { stock: 2 })];
  const readyBySku = Object.fromEntries(readyRows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: row.stock })]));
  const statusRows = [sku(1, { status: "active" })];
  const cases = [
    { action: "set_draft", preview: buildSkuBulkPreview({ action: "set_draft", skus: statusRows }), writeCalls: 1 },
    { action: "set_sold_out", preview: buildSkuBulkPreview({ action: "set_sold_out", skus: statusRows }), writeCalls: 1 },
    { action: "activate", preview: buildSkuBulkPreview({ action: "activate", skus: readyRows, readinessBySku: readyBySku, activationGuardBySku: { [readyRows[0].id]: true, [readyRows[1].id]: true } }), writeCalls: 1 },
  ];
  for (const scenario of cases) {
    let writeCalls = 0;
    const selected = scenario.preview.items.map((item) => item.sku_id);
    const runner = scenario.action === "activate" ? executeSkuBulkActivation : executeSkuBulkStatusUpdate;
    const execution = await runner({
      preview: scenario.preview,
      productId: product.id,
      skuIds: selected,
      runTransaction: async () => {
        writeCalls += 1;
        return { ok: true, code: scenario.action === "activate" ? "BULK_ACTIVATION_COMPLETED" : undefined, selected_count: selected.length, updated_count: selected.length, no_change_count: 0, blocked_count: 0, selected_sku_ids: selected, updated_sku_ids: selected, unchanged_sku_ids: [], product_summary: { has_skus: true, stock: 0, price: 1 } };
      },
    });
    assert.equal(scenario.preview.can_execute, true, `${scenario.action} preview should remain functional`);
    assert.equal(writeCalls, scenario.writeCalls);
    assert.equal(execution.ok, true);
    assert.equal(execution.code, scenario.action === "activate" ? "BULK_ACTIVATION_COMPLETED" : "BULK_STATUS_UPDATED");
    assert.equal(execution.updated_count, scenario.action === "activate" ? 2 : 1);
  }
});

test("activation helper rejects a stale blocked transaction response with zero reported writes", async () => {
  const rows = [sku(1, { stock: 1 }), sku(2, { stock: 1 })];
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: 1 })]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku: { [rows[0].id]: true, [rows[1].id]: true } });
  const selected = rows.map((row) => row.id);
  let calls = 0;
  const result = await executeSkuBulkActivation({
    preview,
    productId: product.id,
    skuIds: selected,
    runTransaction: async () => {
      calls += 1;
      return { ok: false, code: "BULK_ACTIVATION_NOT_READY", selected_count: 2, updated_count: 0, no_change_count: 0, blocked_count: 1, selected_sku_ids: selected, blocked_items: [{ sku_id: rows[1].id, reasons: ["ZERO_STOCK"] }] };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.code, "BULK_ACTIVATION_NOT_READY");
  assert.equal(result.updated_count, 0);
});

test("activation helper rejects a non-exact committed identity set", async () => {
  const rows = [sku(1, { stock: 1 }), sku(2, { stock: 1 })];
  const readinessBySku = Object.fromEntries(rows.map((row) => [row.id, evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: 1 })]));
  const preview = buildSkuBulkPreview({ action: "activate", skus: rows, readinessBySku, activationGuardBySku: { [rows[0].id]: true, [rows[1].id]: true } });
  const result = await executeSkuBulkActivation({
    preview,
    productId: product.id,
    skuIds: rows.map((row) => row.id),
    runTransaction: async () => ({ ok: true, code: "BULK_ACTIVATION_COMPLETED", selected_count: 2, updated_count: 2, no_change_count: 0, blocked_count: 0, selected_sku_ids: [rows[0].id, id(99)] }),
  });
  assert.equal(result.code, "BULK_ACTIVATION_RESPONSE_INVALID");
  assert.equal(result.updated_count, 0);
});

test("invalid committed response never reports a guessed partial success", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => sku(index + 1, { status: "active" }));
  const preview = buildSkuBulkPreview({ action: "set_draft", skus: rows });
  let writeCalls = 0;
  const execution = await executeSkuBulkStatusUpdate({
    preview,
    runTransaction: async ({ skuIds, targetStatus }) => {
      writeCalls += 1;
      return { ok: true, selected_count: 10, updated_count: 9, no_change_count: 0, selected_sku_ids: skuIds, target_status: targetStatus };
    },
    productId: product.id,
    skuIds: rows.map((row) => row.id),
  });
  assert.equal(preview.selected_count, 10);
  assert.equal(preview.will_change_count, 10);
  assert.equal(execution.code, "BULK_STATUS_COMMITTED_RESPONSE_INVALID");
  assert.equal(execution.updated_count, 0);
  assert.equal(writeCalls, 1, "the helper must make one RPC call and reject an invalid response");
});

test("transactional result must cover the exact selected identity set", async () => {
  const rows = [sku(1, { status: "active" }), sku(2, { status: "active" })];
  const preview = buildSkuBulkPreview({ action: "set_draft", skus: rows });
  const execution = await executeSkuBulkStatusUpdate({
    preview,
    productId: product.id,
    skuIds: rows.map((row) => row.id),
    runTransaction: async () => ({ ok: true, selected_count: 2, updated_count: 2, no_change_count: 0, selected_sku_ids: [rows[0].id, id(99)] }),
  });
  assert.equal(execution.code, "BULK_STATUS_COMMITTED_RESPONSE_INVALID");
});

test("all-no-change status execution remains a successful single transaction", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => sku(index + 1, { status: "draft" }));
  const preview = buildSkuBulkPreview({ action: "set_draft", skus: rows });
  let calls = 0;
  const selected = rows.map((row) => row.id);
  const execution = await executeSkuBulkStatusUpdate({
    preview,
    productId: product.id,
    skuIds: selected,
    runTransaction: async () => {
      calls += 1;
      return { ok: true, selected_count: 10, updated_count: 0, no_change_count: 10, selected_sku_ids: selected, product_summary: { has_skus: true, stock: 0, price: 1 } };
    },
  });
  assert.equal(preview.will_change_count, 0);
  assert.equal(preview.no_change_count, 10);
  assert.equal(execution.ok, true);
  assert.equal(execution.updated_count, 0);
  assert.equal(execution.no_change_count, 10);
  assert.equal(calls, 1);
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
