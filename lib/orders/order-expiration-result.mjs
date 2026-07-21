function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function countFrom(container, key) {
  if (!container || !Object.prototype.hasOwnProperty.call(container, key)) return undefined;
  const value = container[key];
  if (value === null || value === undefined || value === "") return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

function releaseCount(row, key) {
  const release = objectOrNull(row.release);
  const nested = countFrom(release, key);
  if (nested !== undefined || (release && Object.prototype.hasOwnProperty.call(release, key))) return nested;
  return countFrom(row, key);
}

export function normalizeOrderExpirationRpcResult(value, requestId) {
  const row = objectOrNull(value) ?? {};
  return {
    ok: row.ok !== false,
    code: String(row.code ?? "UNKNOWN"),
    orderId: typeof row.order_id === "string" ? row.order_id : undefined,
    orderNo: typeof row.order_no === "string" ? row.order_no : null,
    releasedNormal: releaseCount(row, "released_normal"),
    releasedSku: releaseCount(row, "released_sku"),
    releasedDigital: releaseCount(row, "released_digital"),
    message: typeof row.message === "string" ? row.message : undefined,
    requestId,
  };
}
