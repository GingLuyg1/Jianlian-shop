// Human aftercare projection only: supplier refund != customer refund.
// No payment/refund RPC and no order/delivery mutation exists in this module.
export function projectBitrefillAftercare({ roots, units, attempts, children, orders = [] }) {
  const byOrder = new Map();
  for (const root of roots.filter((r) => r.supplier === "bitrefill")) {
    const group = byOrder.get(root.order_id) ?? { roots: [], units: [], children: [], attempts: [] };
    group.roots.push(root);
    const linked = units.filter((u) => u.fulfillment_request_id === root.id);
    group.units.push(...linked);
    group.children.push(...children.filter((c) => linked.some((u) => u.id === c.attempt_item_id)));
    group.attempts.push(...attempts.filter((a) => linked.some((u) => u.attempt_id === a.id)));
    byOrder.set(root.order_id, group);
  }
  const cases = [];
  for (const [orderId, group] of byOrder) {
    const delivered = group.children.filter((c) => c.normalized_status === "DELIVERED").length;
    const failed = group.children.filter((c) => c.normalized_status === "FAILED").length;
    const refunded = group.children.filter((c) => c.normalized_status === "REFUNDED").length;
    const planned = Math.max(group.roots.length, group.units.length);
    const uncertain = group.attempts.some((a) => ["UNCERTAIN", "MANUAL_REVIEW", "FAILED"].includes(a.status)) ||
      group.roots.some((r) => ["UNCERTAIN", "FAILED", "FAILED_VALIDATION", "NEEDS_INPUT"].includes(r.status));
    if (!failed && !refunded && !uncertain && !(delivered && delivered < planned)) continue;
    const kind = delivered && (failed || refunded || uncertain || delivered < planned) ? "PARTIAL_FAILURE"
      : refunded ? "SUPPLIER_REFUNDED" : failed ? "SUPPLIER_FAILED" : "MANUAL_REVIEW";
    const order = orders.find((o) => o.id === orderId);
    cases.push({ id: `bitrefill:${orderId}`, orderId, orderNo: order?.order_no ?? null, kind,
      deliveredUnits: delivered, failedUnits: failed, supplierRefundedUnits: refunded,
      roots: group.roots.map((r) => ({ id: r.id, orderItemId: r.order_item_id, status: r.status })),
      invoices: [...new Set(group.attempts.map((a) => a.external_invoice_id).filter(Boolean))],
      automaticCustomerRefund: false, automaticRedelivery: false, nextAction: "ADMIN_MANUAL_REVIEW",
      customerInstruction: "请联系人工客服；退款由管理员人工审核处理" });
  }
  return cases;
}

export async function readBitrefillAftercare(client, page = 1) {
  if (!Number.isInteger(page) || page < 1 || page > 9999) throw new Error("AFTERCARE_PAGE_INVALID");
  const rows = (r) => { if (r.error || !Array.isArray(r.data)) throw new Error("AFTERCARE_READ_UNAVAILABLE"); return r.data; };
  const rootResult = await client.from("supplier_fulfillment_requests").select("id,order_id,order_item_id,supplier,status,created_at", { count: "exact" })
    .eq("supplier", "bitrefill").order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(1001);
  const snapshot = rows(rootResult);
  // Group by complete order before paging, so a split page cannot hide a partial
  // failure. Over-cap data fails closed instead of reporting incomplete counts.
  if (!Number.isInteger(rootResult.count) || rootResult.count > 1000 || rootResult.count !== snapshot.length) throw new Error("AFTERCARE_SNAPSHOT_LIMIT_REQUIRES_INDEXED_QUERY");
  const orderIds = [...new Set(snapshot.map((r) => r.order_id))];
  const selected = orderIds.slice((page - 1) * 25, page * 25);
  const roots = snapshot.filter((r) => selected.includes(r.order_id));
  if (!roots.length) return { cases: [], page, hasMore: false, scope: "bounded_order_page", automaticCustomerRefund: false };
  const units = rows(await client.from("supplier_purchase_attempt_items").select("id,attempt_id,fulfillment_request_id")
    .in("fulfillment_request_id", roots.map((r) => r.id)).limit(501));
  if (units.length > 500) throw new Error("AFTERCARE_CARDINALITY_INVALID");
  const attemptIds = [...new Set(units.map((u) => u.attempt_id))];
  const [a, c, o] = await Promise.all([
    attemptIds.length ? client.from("supplier_purchase_attempts").select("id,status,external_invoice_id").in("id", attemptIds).limit(501) : { data: [] },
    attemptIds.length ? client.from("supplier_external_orders").select("attempt_item_id,normalized_status").in("attempt_id", attemptIds).limit(501) : { data: [] },
    client.from("orders").select("id,order_no").in("id", [...new Set(roots.map((r) => r.order_id))]).limit(26),
  ]);
  const attempts = rows(a), children = rows(c), orders = rows(o);
  if (attempts.length > 500 || children.length > 500) throw new Error("AFTERCARE_CARDINALITY_INVALID");
  return { cases: projectBitrefillAftercare({ roots, units, attempts, children, orders }), page,
    hasMore: page * 25 < orderIds.length, scope: "bounded_order_page", automaticCustomerRefund: false };
}
