export const SKU_BULK_BATCH_LIMIT = 100;
export const SKU_BULK_ACTIONS = Object.freeze(["set_draft", "set_sold_out", "activate"]);
export const SKU_BULK_TARGET_STATUS = Object.freeze({
  set_draft: "draft",
  set_sold_out: "sold_out",
  activate: "active",
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_FIELDS = new Set(["sku_ids", "action"]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function parseSkuBulkOperationRequest(value) {
  const body = record(value);
  if (!body) return { ok: false, code: "INVALID_BULK_REQUEST", message: "批量操作参数无效" };
  if (Object.keys(body).some((key) => !REQUEST_FIELDS.has(key))) {
    return { ok: false, code: "UNSUPPORTED_BULK_PARAMETER", message: "批量操作包含不支持的参数" };
  }
  if (!SKU_BULK_ACTIONS.includes(body.action)) {
    return { ok: false, code: "INVALID_BULK_ACTION", message: "批量操作类型无效" };
  }
  if (!Array.isArray(body.sku_ids) || body.sku_ids.length === 0) {
    return { ok: false, code: "EMPTY_SKU_SELECTION", message: "请至少选择一个 SKU" };
  }
  if (body.sku_ids.length > SKU_BULK_BATCH_LIMIT) {
    return { ok: false, code: "SKU_BATCH_LIMIT_EXCEEDED", message: `单次最多操作 ${SKU_BULK_BATCH_LIMIT} 个 SKU` };
  }

  const skuIds = body.sku_ids.map((value) => typeof value === "string" ? value.trim() : "");
  if (skuIds.some((value) => !UUID_PATTERN.test(value))) {
    return { ok: false, code: "MALFORMED_SKU_ID", message: "SKU ID 格式无效" };
  }
  if (new Set(skuIds).size !== skuIds.length) {
    return { ok: false, code: "DUPLICATE_SKU_ID", message: "SKU 选择中存在重复 ID" };
  }
  return { ok: true, action: body.action, skuIds };
}

export function buildSkuBulkPreview({ action, skus, readinessBySku = {}, activationGuardBySku = {} }) {
  const targetStatus = SKU_BULK_TARGET_STATUS[action];
  if (!targetStatus) throw new Error("INVALID_BULK_ACTION");

  const items = skus.map((sku) => {
    const id = String(sku.id);
    const currentStatus = String(sku.status ?? "draft");
    if (currentStatus === targetStatus) {
      return {
        sku_id: id,
        sku_code: sku.sku_code ? String(sku.sku_code) : null,
        current_status: currentStatus,
        target_status: targetStatus,
        disposition: "no_change",
        can_execute: true,
        reasons: ["NO_CHANGE"],
        readiness: action === "activate" ? readinessBySku[id] ?? null : null,
      };
    }

    const readiness = action === "activate" ? readinessBySku[id] ?? null : null;
    const guardRequired = action === "activate" && activationGuardBySku[id] === true;
    const reasons = guardRequired
      ? Array.isArray(readiness?.reasons) && readiness.reasons.length > 0
        ? readiness.reasons
        : readiness?.ready === true
          ? []
          : ["READINESS_CHECK_FAILED"]
      : [];
    const blocked = reasons.length > 0;
    return {
      sku_id: id,
      sku_code: sku.sku_code ? String(sku.sku_code) : null,
      current_status: currentStatus,
      target_status: targetStatus,
      disposition: blocked ? "blocked" : "will_change",
      can_execute: !blocked,
      reasons,
      readiness,
    };
  });

  const blockedCount = items.filter((item) => item.disposition === "blocked").length;
  const willChangeCount = items.filter((item) => item.disposition === "will_change").length;
  const noChangeCount = items.filter((item) => item.disposition === "no_change").length;
  return {
    action,
    target_status: targetStatus,
    selected_count: items.length,
    executable_count: willChangeCount,
    will_change_count: willChangeCount,
    no_change_count: noChangeCount,
    blocked_count: blockedCount,
    can_execute: blockedCount === 0,
    execution_supported: action !== "activate",
    items,
  };
}

export async function executeSkuBulkStatusUpdate({ preview, updateStatuses }) {
  if (!preview.can_execute) {
    return { ok: false, code: "BULK_OPERATION_BLOCKED", updated_count: 0, rows: [] };
  }
  if (!preview.execution_supported || preview.action === "activate") {
    return { ok: false, code: "BULK_ACTIVATION_DEFERRED_FOR_ATOMICITY", updated_count: 0, rows: [] };
  }

  const expectedIds = preview.items
    .filter((item) => item.disposition === "will_change")
    .map((item) => item.sku_id);
  if (expectedIds.length === 0) return { ok: true, code: "NO_CHANGE", updated_count: 0, rows: [] };

  const rows = await updateStatuses(expectedIds, preview.target_status);
  const updatedIds = new Set(rows.map((row) => String(row.id)));
  const exactRows = rows.length === expectedIds.length
    && expectedIds.every((id) => updatedIds.has(id))
    && rows.every((row) => String(row.status) === preview.target_status);
  if (!exactRows) {
    return { ok: false, code: "BULK_UPDATE_COUNT_MISMATCH", updated_count: rows.length, rows };
  }
  return { ok: true, code: "BULK_OPERATION_COMPLETED", updated_count: rows.length, rows };
}
