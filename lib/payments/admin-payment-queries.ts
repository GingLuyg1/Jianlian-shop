import type { AdminPaymentRecord, PaymentBusinessType, UnifiedPaymentStatus } from "./admin-payment-types";
import { normalizeUnifiedPaymentStatus } from "./admin-payment-types";

export type PaymentListFilters = {
  search?: string;
  businessType?: string;
  channel?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sort?: string;
  view?: string;
  exceptionType?: string;
  rechargeOnly?: boolean;
};

export const adminOrderPaymentSelect = `
  id,
  payment_no,
  order_id,
  user_id,
  payment_method,
  amount,
  currency,
  status,
  transaction_reference,
  user_note,
  admin_note,
  submitted_at,
  reviewed_at,
  created_at,
  updated_at,
  business_type,
  channel,
  network,
  business_amount,
  fee_amount,
  payable_amount,
  received_amount,
  provider_trade_no,
  paid_at,
  callback_status,
  exception_type,
  error_summary,
  orders(order_no,total_amount,customer_email,payment_status,status)
`;

export const adminRechargeSelect = `
  id,
  recharge_no,
  user_id,
  user_email,
  channel,
  network,
  amount,
  fee_amount,
  payable_amount,
  received_amount,
  status,
  provider_trade_no,
  paid_at,
  callback_status,
  exception_type,
  error_summary,
  user_note,
  admin_note,
  created_at,
  updated_at
`;

type AnyRow = Record<string, any>;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeOrderPaymentRow(row: AnyRow): AdminPaymentRecord {
  const order = row.orders && typeof row.orders === "object" ? row.orders : null;
  const amount = numberValue(row.amount);
  const businessAmount = numberValue(row.business_amount ?? order?.total_amount ?? amount);
  const feeAmount = numberValue(row.fee_amount);
  const payableAmount = numberValue(row.payable_amount ?? amount);
  const receivedAmount = numberValue(row.received_amount ?? (row.status === "paid" ? amount : 0));
  const channel = stringOrNull(row.channel) ?? stringOrNull(row.payment_method);

  return {
    id: String(row.id ?? ""),
    source: "order_payments",
    payment_no: String(row.payment_no ?? ""),
    business_type: "order",
    business_no: stringOrNull(order?.order_no),
    user_email: stringOrNull(order?.customer_email),
    channel,
    network: stringOrNull(row.network),
    business_amount: businessAmount,
    fee_amount: feeAmount,
    payable_amount: payableAmount,
    received_amount: receivedAmount,
    platform_net_amount: Math.max(receivedAmount - feeAmount, 0),
    status: normalizeUnifiedPaymentStatus(row.status === "submitted" || row.status === "under_review" ? "processing" : row.status),
    provider_trade_no: stringOrNull(row.provider_trade_no),
    transaction_reference: stringOrNull(row.transaction_reference),
    callback_status: stringOrNull(row.callback_status),
    exception_type: stringOrNull(row.exception_type),
    error_summary: stringOrNull(row.error_summary),
    user_note: stringOrNull(row.user_note),
    admin_note: stringOrNull(row.admin_note),
    created_at: String(row.created_at ?? ""),
    paid_at: stringOrNull(row.paid_at ?? row.reviewed_at),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function normalizeRechargeRow(row: AnyRow): AdminPaymentRecord {
  const businessAmount = numberValue(row.amount);
  const feeAmount = numberValue(row.fee_amount);
  const payableAmount = numberValue(row.payable_amount ?? businessAmount + feeAmount);
  const receivedAmount = numberValue(row.received_amount);

  return {
    id: String(row.id ?? ""),
    source: "account_recharges",
    payment_no: String(row.recharge_no ?? ""),
    business_type: "recharge",
    business_no: String(row.recharge_no ?? ""),
    user_email: stringOrNull(row.user_email),
    channel: stringOrNull(row.channel),
    network: stringOrNull(row.network),
    business_amount: businessAmount,
    fee_amount: feeAmount,
    payable_amount: payableAmount,
    received_amount: receivedAmount,
    platform_net_amount: Math.max(receivedAmount - feeAmount, 0),
    status: normalizeUnifiedPaymentStatus(row.status),
    provider_trade_no: stringOrNull(row.provider_trade_no),
    transaction_reference: null,
    callback_status: stringOrNull(row.callback_status),
    exception_type: stringOrNull(row.exception_type),
    error_summary: stringOrNull(row.error_summary),
    user_note: stringOrNull(row.user_note),
    admin_note: stringOrNull(row.admin_note),
    created_at: String(row.created_at ?? ""),
    paid_at: stringOrNull(row.paid_at),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function filterPaymentRecords(rows: AdminPaymentRecord[], filters: PaymentListFilters) {
  const search = (filters.search ?? "").trim().toLowerCase();
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : null;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : null;

  return rows.filter((row) => {
    if (filters.rechargeOnly && row.business_type !== "recharge") return false;
    if (filters.businessType && filters.businessType !== "all" && row.business_type !== filters.businessType) return false;
    if (filters.channel && filters.channel !== "all" && row.channel !== filters.channel) return false;
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.view === "exceptions" && !row.exception_type) return false;
    if (filters.exceptionType && filters.exceptionType !== "all" && row.exception_type !== filters.exceptionType) return false;
    if (start !== null && new Date(row.created_at).getTime() < start) return false;
    if (end !== null && new Date(row.created_at).getTime() > end) return false;
    if (!search) return true;
    return [row.payment_no, row.business_no, row.user_email, row.provider_trade_no]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

export function sortPaymentRecords(rows: AdminPaymentRecord[], sort = "created_desc") {
  const nextRows = [...rows];
  nextRows.sort((a, b) => {
    if (sort === "created_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === "amount_desc") return b.payable_amount - a.payable_amount;
    if (sort === "amount_asc") return a.payable_amount - b.payable_amount;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return nextRows;
}

export function isPaymentSchemaMissing(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  return /order_payments|account_recharges|payment_callback_logs|payment_channels|schema cache|PGRST205|42P01|42703/i.test(message);
}

export function sanitizePaymentError(error: unknown, fallback = "支付数据加载失败") {
  if (isPaymentSchemaMissing(error)) return "支付数据库尚未初始化，请先执行支付管理 migration。";
  return fallback;
}
