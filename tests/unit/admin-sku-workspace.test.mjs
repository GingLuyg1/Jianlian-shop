import assert from "node:assert/strict";
import test from "node:test";

import { buildSkuWorkspaceOperations, SKU_WORKSPACE_MAX_MUTATIONS, SkuWorkspaceInputError } from "../../lib/products/admin-sku-workspace.mjs";

const draft = (code, touched = true) => ({ sku_code: code, touched });
const payload = (value) => ({ sku_code: value.sku_code });
const isEmpty = (value) => !value?.sku_code;

test("workspace helper emits create and touched update operations in one batch", () => {
  const operations = buildSkuWorkspaceOperations({
    rows: [
      { key: "existing", sku: { id: "sku-1", updated_at: "2026-10-04T12:00:00Z" }, draft: draft("one") },
      { key: "unchanged", sku: { id: "sku-2", updated_at: "2026-10-04T12:00:00Z" }, draft: draft("two", false) },
      { key: "new", draft: draft("three") },
      { key: "blank", draft: draft("") },
    ],
    buildPayload: payload,
    isEmptyDraft: isEmpty,
  });
  assert.deepEqual(operations, [
    { type: "update", sku_id: "sku-1", expected_updated_at: "2026-10-04T12:00:00Z", payload: { sku_code: "one" } },
    { type: "create", client_id: "new", payload: { sku_code: "three" } },
  ]);
});

test("workspace helper fails closed when an edited row has no optimistic version", () => {
  assert.throws(() => buildSkuWorkspaceOperations({
    rows: [{ key: "existing", sku: { id: "sku-1", updated_at: null }, draft: draft("one") }],
    buildPayload: payload,
    isEmptyDraft: isEmpty,
  }), (error) => error instanceof SkuWorkspaceInputError && error.code === "SKU_WORKSPACE_STALE");
});

test("workspace helper rejects duplicate identities and batches over 100", () => {
  assert.throws(() => buildSkuWorkspaceOperations({
    rows: [{ key: "same", draft: draft("one") }, { key: "same", draft: draft("two") }],
    buildPayload: payload,
    isEmptyDraft: isEmpty,
  }), (error) => error.code === "INVALID_SKU_WORKSPACE");
  assert.throws(() => buildSkuWorkspaceOperations({
    rows: Array.from({ length: SKU_WORKSPACE_MAX_MUTATIONS + 1 }, (_, index) => ({ key: `new-${index}`, draft: draft(String(index)) })),
    buildPayload: payload,
    isEmptyDraft: isEmpty,
  }), (error) => error.code === "SKU_BATCH_LIMIT_EXCEEDED");
});
