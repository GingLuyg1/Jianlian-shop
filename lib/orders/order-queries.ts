import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeOrderStatus,
  normalizePaymentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "./order-status";
import type {
  Bep20PaymentState,
  OrderDeliveryRecord,
  OrderItemRecord,
  OrderListResult,
  OrderLogRecord,
  OrderRecord,
} from "./order-types";

const orderSelect = `
  id,order_no,user_id,status,payment_status,payment_method,subtotal,discount_amount,total_amount,currency,
  customer_email,customer_name,customer_phone,shipping_address,customer_note,admin_note,delivery_type,
  paid_at,processed_at,completed_at,cancelled_at,created_at,updated_at,
  order_items(*),
  order_status_logs(*),
  order_deliveries(id,order_id,order_item_id,delivery_type,delivery_status,delivered_at,created_at,updated_at)
`;

type Bep20SessionSummary = {
  order_id?: string | null;
  status?: string | null;
  manual_review_decision?: string | null;
  expires_at?: string | null;
  submitted_tx_hash?: string | null;
  failure_reason?: string | null;
  created_at?: string | null;
};

export function getOrderErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试"
) {
  const message =
    (error as { message?: string } | null | undefined)?.message ??
    (typeof error === "string" ? error : "");
  if (
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    message.includes("PGRST205") ||
    message.includes("42P01")
  ) {
    return "订单数据表已创建但接口缓存可能尚未刷新，请稍后重试或重新加载。";
  }
  return message || fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeItem(row: Record<string, unknown>): OrderItemRecord {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    product_id: row.product_id ? String(row.product_id) : null,
    sku_id: row.sku_id ? String(row.sku_id) : null,
    sku_code: row.sku_code ? String(row.sku_code) : null,
    sku_title: row.sku_title ? String(row.sku_title) : null,
    option_snapshot:
      row.option_snapshot && typeof row.option_snapshot === "object"
        ? (row.option_snapshot as Array<Record<string, unknown>> | Record<string, unknown>)
        : null,
    product_name: String(row.product_name ?? ""),
    product_slug: row.product_slug ? String(row.product_slug) : null,
    product_image_url: row.product_image_url ? String(row.product_image_url) : null,
    category_name: row.category_name ? String(row.category_name) : null,
    unit_price: normalizeNumber(row.unit_price),
    quantity: normalizeNumber(row.quantity, 1),
    line_total: normalizeNumber(row.line_total),
    delivery_type: row.delivery_type ? String(row.delivery_type) : null,
    delivery_status: row.delivery_status ? String(row.delivery_status) : null,
    delivered_quantity: row.delivered_quantity === null || row.delivered_quantity === undefined ? null : normalizeNumber(row.delivered_quantity),
    delivery_failure_reason: row.delivery_failure_reason ? String(row.delivery_failure_reason) : null,
    delivery_started_at: row.delivery_started_at ? String(row.delivery_started_at) : null,
    delivery_completed_at: row.delivery_completed_at ? String(row.delivery_completed_at) : null,
    product_snapshot:
      row.product_snapshot && typeof row.product_snapshot === "object"
        ? (row.product_snapshot as Record<string, unknown>)
        : null,
    created_at: String(row.created_at ?? ""),
  };
}

function normalizeLog(row: Record<string, unknown>): OrderLogRecord {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    from_status: row.from_status ? String(row.from_status) : null,
    to_status: String(row.to_status ?? ""),
    operator_id: row.operator_id ? String(row.operator_id) : null,
    operator_type: row.operator_type ? String(row.operator_type) : null,
    note: row.note ? String(row.note) : null,
    created_at: String(row.created_at ?? ""),
  };
}

function normalizeDelivery(row: Record<string, unknown>): OrderDeliveryRecord {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    order_item_id: row.order_item_id ? String(row.order_item_id) : null,
    delivery_type: row.delivery_type ? String(row.delivery_type) : null,
    delivery_content: null,
    delivery_status: String(row.delivery_status ?? "pending"),
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    viewed_at: row.viewed_at ? String(row.viewed_at) : null,
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    delivery_note: row.delivery_note ? String(row.delivery_note) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function normalizeOrder(row: Record<string, unknown>): OrderRecord {
  const items = Array.isArray(row.order_items)
    ? (row.order_items as Array<Record<string, unknown>>).map(normalizeItem)
    : [];
  const logs = Array.isArray(row.order_status_logs)
    ? (row.order_status_logs as Array<Record<string, unknown>>).map(normalizeLog)
    : [];
  const deliveries = Array.isArray(row.order_deliveries)
    ? (row.order_deliveries as Array<Record<string, unknown>>).map(normalizeDelivery)
    : [];

  return {
    id: String(row.id),
    order_no: String(row.order_no ?? ""),
    user_id: String(row.user_id ?? ""),
    status: normalizeOrderStatus(row.status),
    payment_status: normalizePaymentStatus(row.payment_status),
    payment_method: row.payment_method ? String(row.payment_method) : null,
    subtotal: normalizeNumber(row.subtotal),
    discount_amount: normalizeNumber(row.discount_amount),
    total_amount: normalizeNumber(row.total_amount),
    currency: String(row.currency ?? "CNY"),
    customer_email: row.customer_email ? String(row.customer_email) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    shipping_address:
      row.shipping_address && typeof row.shipping_address === "object"
        ? (row.shipping_address as Record<string, unknown>)
        : null,
    customer_note: row.customer_note ? String(row.customer_note) : null,
    admin_note: row.admin_note ? String(row.admin_note) : null,
    delivery_type: row.delivery_type ? String(row.delivery_type) : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    processed_at: row.processed_at ? String(row.processed_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    order_items: items,
    order_status_logs: logs.sort(
      (first, second) =>
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    ),
    order_deliveries: deliveries.sort(
      (first, second) =>
        new Date(second.updated_at || second.created_at).getTime() -
        new Date(first.updated_at || first.created_at).getTime()
    ),
    bep20_payment_state: typeof row.bep20_payment_state === "string"
      ? (row.bep20_payment_state as Bep20PaymentState)
      : undefined,
  };
}

function isBep20SchemaMissing(error: unknown) {
  const value = error as { code?: string | null; message?: string | null } | null;
  const text = `${value?.code ?? ""} ${value?.message ?? ""}`;
  return /PGRST205|42P01|chain_payment_sessions|schema cache|does not exist/i.test(text);
}

function deriveBep20PaymentState(order: OrderRecord, session?: Bep20SessionSummary | null): Bep20PaymentState {
  if (order.payment_method !== "usdt_bep20") return "not_applicable";
  if (order.payment_status === "paid" || order.status === "paid") return "paid";
  if (["cancelled", "refunded", "failed"].includes(order.status)) return "closed";

  const stillUnpaid = order.status === "pending_payment" && order.payment_status === "unpaid";
  if (!stillUnpaid) return "closed";
  if (!session) return "renew_payment_session";

  const status = String(session.status ?? "").trim();
  const decision = String(session.manual_review_decision ?? "").trim();
  if (decision === "rejected") return "rejected";
  if (status === "paid") return "paid";
  if (status === "manual_review") return "manual_review_pending";
  if (status === "confirming") return "confirming";
  if (status === "payment_failed") return "payment_failed";
  if (status === "underpaid") return "underpaid";
  if (["verified", "completing"].includes(status)) return "view_status";
  if (status === "expired") return "renew_payment_session";
  if (["waiting_payment", "submitted", "failed"].includes(status)) {
    const expiresAt = Date.parse(String(session.expires_at ?? ""));
    return Number.isFinite(expiresAt) && expiresAt > Date.now() ? "continue_active_payment" : "renew_payment_session";
  }
  return "renew_payment_session";
}

async function attachBep20PaymentStates(supabase: SupabaseClient, orders: OrderRecord[]) {
  const targetOrders = orders.filter((order) => order.payment_method === "usdt_bep20");
  if (!targetOrders.length) return orders;

  const orderIds = targetOrders.map((order) => order.id);
  const { data, error } = await supabase
    .from("chain_payment_sessions")
    .select("order_id,status,manual_review_decision,expires_at,submitted_tx_hash,failure_reason,created_at")
    .in("order_id", orderIds)
    .eq("payment_method", "usdt_bep20")
    .order("created_at", { ascending: false });

  if (error) {
    if (!isBep20SchemaMissing(error)) throw error;
    return orders.map((order) => ({
      ...order,
      bep20_payment_state: deriveBep20PaymentState(order, null),
    }));
  }

  const latestByOrderId = new Map<string, Bep20SessionSummary>();
  for (const row of (data ?? []) as Bep20SessionSummary[]) {
    const orderId = String(row.order_id ?? "");
    if (orderId && !latestByOrderId.has(orderId)) latestByOrderId.set(orderId, row);
  }

  return orders.map((order) => ({
    ...order,
    bep20_payment_state: deriveBep20PaymentState(order, latestByOrderId.get(order.id) ?? null),
  }));
}

export async function listUserOrders(
  supabase: SupabaseClient,
  userId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: OrderStatus | "all";
    paymentStatus?: PaymentStatus | "all";
    deliveryStatus?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    customerEmail?: string;
    productSearch?: string;
    skuSearch?: string;
  } = {}
): Promise<OrderListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select(orderSelect, { count: "exact" })
    .eq("user_id", userId);

  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.paymentStatus && options.paymentStatus !== "all") {
    query = query.eq("payment_status", options.paymentStatus);
  }

  const search = options.search?.trim();
  if (search) query = query.ilike("order_no", `%${search}%`);

  if (options.startDate) query = query.gte("created_at", options.startDate);
  if (options.endDate) query = query.lte("created_at", options.endDate);

  const customerEmail = options.customerEmail?.trim().toLowerCase();
  if (customerEmail) query = query.ilike("customer_email", customerEmail);

  if (options.deliveryStatus && options.deliveryStatus !== "all") {
    const { data: deliveryRows } = await supabase
      .from("order_deliveries")
      .select("order_id")
      .eq("delivery_status", options.deliveryStatus)
      .limit(5000);
    const orderIds = Array.from(
      new Set(((deliveryRows ?? []) as Array<{ order_id?: string }>).map((row) => row.order_id).filter(Boolean))
    ) as string[];
    query = orderIds.length ? query.in("id", orderIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const itemKeyword = (options.productSearch || options.skuSearch || "").trim();
  if (itemKeyword) {
    const escaped = itemKeyword.replace(/[,%]/g, "");
    const { data: itemRows } = await supabase
      .from("order_items")
      .select("order_id")
      .or(`product_name.ilike.%${escaped}%,sku_code.ilike.%${escaped}%,sku_title.ilike.%${escaped}%`)
      .limit(5000);
    const orderIds = Array.from(
      new Set(((itemRows ?? []) as Array<{ order_id?: string }>).map((row) => row.order_id).filter(Boolean))
    ) as string[];
    query = orderIds.length ? query.in("id", orderIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(getOrderErrorMessage(error, "订单读取失败"));

  const orders = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeOrder);
  return {
    orders: await attachBep20PaymentStates(supabase, orders),
    count: count ?? 0,
  };
}
export async function getUserOrderByNo(
  supabase: SupabaseClient,
  userId: string,
  orderNo: string
) {
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("user_id", userId)
    .eq("order_no", orderNo)
    .maybeSingle();

  if (error) throw new Error(getOrderErrorMessage(error, "订单详情读取失败"));
  if (!data) return null;
  const [order] = await attachBep20PaymentStates(supabase, [normalizeOrder(data as Record<string, unknown>)]);
  return order;
}

export async function listAdminOrders(
  supabase: SupabaseClient,
  options: {
    page?: number;
    pageSize?: number;
    status?: OrderStatus | "all";
    paymentStatus?: PaymentStatus | "all";
    deliveryType?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: "created_at" | "updated_at" | "total_amount";
    sortDirection?: "asc" | "desc";
    search?: string;
  } = {}
): Promise<OrderListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("orders").select(orderSelect, { count: "exact" });

  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.paymentStatus && options.paymentStatus !== "all") {
    query = query.eq("payment_status", options.paymentStatus);
  }
  if (options.deliveryType && options.deliveryType !== "all") {
    query = query.eq("delivery_type", options.deliveryType);
  }
  if (options.startDate) query = query.gte("created_at", options.startDate);
  if (options.endDate) query = query.lte("created_at", options.endDate);

  const search = options.search?.trim();
  if (search) query = query.or(`order_no.ilike.%${search}%,customer_email.ilike.%${search}%`);

  const sortBy = options.sortBy ?? "created_at";
  const sortDirection = options.sortDirection ?? "desc";
  const { data, error, count } = await query
    .order(sortBy, { ascending: sortDirection === "asc" })
    .range(from, to);

  if (error) throw new Error(getOrderErrorMessage(error, "订单读取失败"));

  return {
    orders: ((data ?? []) as Array<Record<string, unknown>>).map(normalizeOrder),
    count: count ?? 0,
  };
}




