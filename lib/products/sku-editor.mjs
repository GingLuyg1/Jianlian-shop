export function isSkuDraftEmpty(row) {
  return [row.sku_title, row.sku_code, row.price, row.stock, row.original_price, row.image_url]
    .every((value) => value === "" || value === null || value === undefined)
    && (!row.touched || (row.status === "active" && !row.delivery_type && String(row.sort_order ?? 0) === "0"));
}

export function validateSkuDraft(row) {
  const errors = {};
  if (!row.sku_title.trim()) errors.sku_title = "名称必填";
  if (!row.sku_code.trim()) errors.sku_code = "Code 必填";
  if (row.price === "" || !Number.isFinite(Number(row.price)) || Number(row.price) < 0) errors.price = "价格必须为非负数";
  if (row.stock === "" || !Number.isSafeInteger(Number(row.stock)) || Number(row.stock) < 0) errors.stock = "库存必须为非负整数";
  if (row.original_price && (!Number.isFinite(Number(row.original_price)) || Number(row.original_price) < 0)) errors.original_price = "原价必须为非负数";
  if (!Number.isSafeInteger(Number(row.sort_order ?? 0)) || Number(row.sort_order ?? 0) < 0) errors.sort_order = "排序必须为非负整数";
  return errors;
}

export function ensureTrailingEmptySkuRow(rows, createRow) {
  const empty = rows.find((row) => !row.sku && isSkuDraftEmpty(row.draft));
  return [...rows.filter((row) => row.sku || !isSkuDraftEmpty(row.draft)), empty ?? createRow()];
}

export function deriveSkuProductSummary(rows) {
  const active = rows.filter((row) => row.status === "active");
  const prices = active.filter((row) => row.price !== "" && row.price !== null && row.price !== undefined)
    .map((row) => Number(row.price)).filter((price) => Number.isFinite(price) && price >= 0);
  return {
    price: prices.length ? Math.min(...prices) : null,
    stock: active.reduce((sum, row) => sum + (Number.isSafeInteger(Number(row.stock)) && Number(row.stock) >= 0 ? Number(row.stock) : 0), 0),
    has_skus: rows.length > 0,
  };
}
