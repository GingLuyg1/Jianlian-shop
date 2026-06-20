import type { PaymentRecord } from "./payment-types";

export const paymentSelect = `
  *,
  orders(
    order_no,
    total_amount,
    payment_status,
    status,
    customer_email
  )
`;

export function normalizePaymentRecord(row: Record<string, unknown>): PaymentRecord {
  const proofUrls = Array.isArray(row.proof_urls)
    ? row.proof_urls.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: String(row.id ?? ""),
    payment_no: String(row.payment_no ?? ""),
    order_id: String(row.order_id ?? ""),
    user_id: String(row.user_id ?? ""),
    payment_method: String(row.payment_method ?? ""),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "CNY"),
    status: String(row.status ?? "pending"),
    transaction_reference:
      typeof row.transaction_reference === "string" ? row.transaction_reference : null,
    proof_url: typeof row.proof_url === "string" ? row.proof_url : null,
    proof_urls: proofUrls,
    user_note: typeof row.user_note === "string" ? row.user_note : null,
    admin_note: typeof row.admin_note === "string" ? row.admin_note : null,
    submitted_at: typeof row.submitted_at === "string" ? row.submitted_at : null,
    reviewed_at: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewed_by: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    orders: (row.orders as PaymentRecord["orders"]) ?? null,
  };
}

export function normalizePaymentRows(rows: unknown): PaymentRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizePaymentRecord(row as Record<string, unknown>));
}
