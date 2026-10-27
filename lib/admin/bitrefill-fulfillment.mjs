// Admin-only projection. Caller authenticates BEFORE constructing service client.
// Explicit column allowlists; never select secrets, webhook bodies or responses.
export async function readBitrefillFulfillment(client, page = 1) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("BITREFILL_PAGE_INVALID");
  const required = (result) => { if (result.error || !Array.isArray(result.data)) throw new Error("BITREFILL_ADMIN_READ_UNAVAILABLE"); return result.data; };
  const attempts = required(await client.from("supplier_purchase_attempts")
    .select("id,status,external_invoice_id,created_at,last_error_code").eq("supplier", "bitrefill")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 25, page * 25));
  const hasMore = attempts.length > 25, selected = attempts.slice(0, 25);
  if (!selected.length) return { rows: [], page, hasMore: false, realPurchaseEnabled: false };
  const ids = selected.map((r) => r.id);
  const [itemResult, childResult, evidenceResult] = await Promise.all([
    client.from("supplier_purchase_attempt_items").select("id,attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,frozen_package_id,quoted_unit_cost,frozen_currency").in("attempt_id", ids).limit(501),
    client.from("supplier_external_orders").select("id,attempt_id,attempt_item_id,external_order_id,normalized_status").in("attempt_id", ids).limit(501),
    client.from("supplier_reconciliation_evidence").select("attempt_id,external_order_row_id,normalized_status,result_class,checked_at").in("attempt_id", ids).order("checked_at", { ascending: false }).limit(201),
  ]);
  const items = required(itemResult), children = required(childResult), evidence = required(evidenceResult);
  if (items.length > 500 || children.length > 500) throw new Error("BITREFILL_ADMIN_CARDINALITY_INVALID");
  const roots = items.length ? required(await client.from("supplier_fulfillment_requests")
    .select("id,order_id,status").in("id", [...new Set(items.map((r) => r.fulfillment_request_id))]).limit(501)) : [];
  const orders = roots.length ? required(await client.from("orders").select("id,order_no")
    .in("id", [...new Set(roots.map((r) => r.order_id))]).limit(501)) : [];
  const orderMap = new Map(orders.map((r) => [r.id, r.order_no]));
  const rootMap = new Map(roots.map((r) => [r.id, r])), childMap = new Map(children.map((r) => [r.attempt_item_id, r]));
  const rows = selected.map((attempt) => ({ id: attempt.id, status: attempt.status, invoiceId: attempt.external_invoice_id,
    createdAt: attempt.created_at, errorCode: /^[A-Z][A-Z0-9_]{0,99}$/.test(attempt.last_error_code ?? "") ? attempt.last_error_code : null,
    units: items.filter((item) => item.attempt_id === attempt.id).map((item) => {
      const child = childMap.get(item.id), root = rootMap.get(item.fulfillment_request_id);
      return { id: item.id, orderId: root?.order_id ?? null, orderNo: orderMap.get(root?.order_id) ?? null, orderItemId: item.order_item_id,
        unitIndex: item.unit_index, productId: item.frozen_product_id, packageId: item.frozen_package_id,
        cost: String(item.quoted_unit_cost), currency: item.frozen_currency, costVerified: false,
        fulfillmentStatus: root?.status ?? "UNKNOWN", childId: child?.external_order_id ?? null,
        childStatus: child?.normalized_status ?? "UNKNOWN" };
    }),
    // At most the latest 200 safe events for this page, not an unbounded history.
    events: evidence.slice(0, 200).filter((e) => e.attempt_id === attempt.id).map((e) => ({
      status: e.normalized_status, resultClass: e.result_class, checkedAt: e.checked_at })),
    manualReview: ["UNCERTAIN", "MANUAL_REVIEW", "FAILED"].includes(attempt.status) || children.some((child) =>
      child.attempt_id === attempt.id && ["FAILED", "REFUNDED"].includes(child.normalized_status)),
  }));
  return { rows, page, hasMore, evidenceTruncated: evidence.length > 200, realPurchaseEnabled: false };
}
