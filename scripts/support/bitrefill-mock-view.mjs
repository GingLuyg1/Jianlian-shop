// Explicit allowlist: no private delivery content, raw webhook or raw response.
export function projectMockAdminRows(state) {
  return state.order_items.map((item) => {
    const unit = state.supplier_purchase_attempt_items.find((r) => r.order_item_id === item.id);
    const attempt = state.supplier_purchase_attempts.find((r) => r.id === unit?.attempt_id);
    const child = state.supplier_external_orders.find((r) => r.attempt_item_id === unit?.id);
    const root = state.supplier_fulfillment_requests.find((r) => r.order_item_id === item.id);
    return { id: item.id, orderId: item.order_id, status: item.refunded ? "REFUNDED" : root?.status ?? "WAITING_PAYMENT",
      attemptStatus: attempt?.status ?? null, invoiceId: attempt?.external_invoice_id ?? null,
      childId: child?.external_order_id ?? null, childStatus: child?.normalized_status ?? null,
      cost: unit?.quoted_unit_cost ?? null, currency: unit?.frozen_currency ?? "USD", costVerified: false,
      evidenceCount: state.evidence.filter((e) => e.child_id === child?.id).length,
      nextAction: child?.normalized_status === "FAILED" && !item.refunded ? "MANUAL_REFUND_REVIEW"
        : attempt?.status === "UNCERTAIN" ? "MANUAL_NO_POST_RETRY"
          : item.delivery_status === "delivered" ? "NONE" : "GET_RECONCILIATION" };
  });
}

export function mockAdminReadClient(state) {
  const tables = { ...state, supplier_reconciliation_evidence: state.evidence.map((e) => {
    const child = state.supplier_external_orders.find((c) => c.id === e.child_id);
    return { attempt_id: child.attempt_id, external_order_row_id: child.id, normalized_status: e.status,
      result_class: "SYNTHETIC_GET", checked_at: "2026-10-25T00:00:00Z" };
  }) };
  return { from(table) {
    let rows = structuredClone(tables[table]), columns;
    const ordering = [];
    let rangeStart = 0, rangeEnd = Infinity, rowLimit = Infinity;
    const query = { select(value) { columns = value.split(","); return query; },
      eq(field, value) { rows = rows.filter((r) => r[field] === value); return query; },
      in(field, values) { rows = rows.filter((r) => values.includes(r[field])); return query; },
      order(field, { ascending }) { ordering.push({ field, ascending }); return query; },
      range(start, end) { rangeStart = start; rangeEnd = end; return query; },
      limit(count) { rowLimit = count; return query; },
      then(ok, fail) {
        const sorted = [...rows].sort((a, b) => {
          for (const { field, ascending } of ordering) {
            const comparison = String(a[field] ?? "").localeCompare(String(b[field] ?? "")) * (ascending ? 1 : -1);
            if (comparison) return comparison;
          }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(rangeStart, rangeEnd + 1).slice(0, rowLimit)
          .map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))), error: null }).then(ok, fail);
      } };
    return query;
  } };
}
