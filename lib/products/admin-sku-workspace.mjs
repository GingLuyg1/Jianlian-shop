export const SKU_WORKSPACE_MAX_MUTATIONS = 100;

export class SkuWorkspaceInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SkuWorkspaceInputError";
    this.code = code;
  }
}

export function buildSkuWorkspaceOperations({ rows, buildPayload, isEmptyDraft }) {
  if (!Array.isArray(rows) || typeof buildPayload !== "function" || typeof isEmptyDraft !== "function") {
    throw new SkuWorkspaceInputError("SKU workspace 参数无效", "INVALID_SKU_WORKSPACE");
  }
  const operations = [];
  const skuIds = new Set();
  const clientIds = new Set();
  for (const row of rows) {
    if (row?.sku && !row?.draft?.touched) continue;
    if (!row?.sku && isEmptyDraft(row?.draft)) continue;
    if (row?.sku) {
      if (!row.sku.id || !row.sku.updated_at) {
        throw new SkuWorkspaceInputError("SKU 已被其他操作修改，请刷新后重新确认", "SKU_WORKSPACE_STALE");
      }
      if (skuIds.has(row.sku.id)) {
        throw new SkuWorkspaceInputError("SKU workspace 包含重复 SKU", "INVALID_SKU_WORKSPACE");
      }
      skuIds.add(row.sku.id);
      operations.push({
        type: "update",
        sku_id: row.sku.id,
        expected_updated_at: row.sku.updated_at,
        payload: buildPayload(row.draft),
      });
    } else {
      if (!row?.key || clientIds.has(row.key)) {
        throw new SkuWorkspaceInputError("SKU workspace 包含重复临时行", "INVALID_SKU_WORKSPACE");
      }
      clientIds.add(row.key);
      operations.push({ type: "create", client_id: row.key, payload: buildPayload(row.draft) });
    }
    if (operations.length > SKU_WORKSPACE_MAX_MUTATIONS) {
      throw new SkuWorkspaceInputError(`一次最多保存 ${SKU_WORKSPACE_MAX_MUTATIONS} 个 SKU`, "SKU_BATCH_LIMIT_EXCEEDED");
    }
  }
  return operations;
}
