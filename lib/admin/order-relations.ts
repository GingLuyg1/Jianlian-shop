import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RelationGroupKey =
  | "order"
  | "items"
  | "payment_sessions"
  | "payments"
  | "refunds"
  | "balance"
  | "inventory"
  | "deliveries"
  | "notifications"
  | "audit";

export type BusinessRelationItem = {
  id: string;
  label: string;
  businessNo: string | null;
  summary: string;
  status: string | null;
  amount: string | null;
  createdAt: string | null;
  href: string | null;
};

export type BusinessRelationGroup = {
  key: RelationGroupKey;
  label: string;
  items: BusinessRelationItem[];
  error?: string;
};

export type BusinessTimelineEvent = {
  id: string;
  source: string;
  title: string;
  summary: string;
  status: string | null;
  occurredAt: string;
  href: string | null;
};

export type OrderRelationsPayload = {
  orderId: string;
  orderNo: string;
  groups: BusinessRelationGroup[];
  timeline: BusinessTimelineEvent[];
};

const RELATION_LABELS: Record<RelationGroupKey, string> = {
  order: "订单",
  items: "订单项",
  payment_sessions: "支付会话",
  payments: "成功支付记录",
  refunds: "退款申请",
  balance: "余额流水",
  inventory: "数字库存预留",
  deliveries: "交付记录",
  notifications: "站内通知",
  audit: "管理员审计记录",
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function money(amount: unknown, currency: unknown = "CNY") {
  if (amount === null || typeof amount === "undefined") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return `${String(currency || "CNY") === "CNY" ? "¥" : String(currency || "")}${n.toFixed(2)}`;
}

async function safeQuery<T>(fn: () => any): Promise<{ rows: T[]; error?: string }> {
  try {
    const { data, error } = await fn();
    if (error) return { rows: [], error: "读取失败" };
    return { rows: data ? (Array.isArray(data) ? data : [data]) : [] };
  } catch {
    return { rows: [], error: "读取失败" };
  }
}

function group(key: RelationGroupKey, items: BusinessRelationItem[], error?: string): BusinessRelationGroup {
  return { key, label: RELATION_LABELS[key], items, error };
}

function relationItem(input: Partial<BusinessRelationItem> & { id: string; label: string; summary: string }): BusinessRelationItem {
  return {
    businessNo: null,
    status: null,
    amount: null,
    createdAt: null,
    href: null,
    ...input,
  };
}

function addEvent(events: BusinessTimelineEvent[], event: Omit<BusinessTimelineEvent, "id"> & { id?: string }) {
  if (!event.occurredAt) return;
  const id = event.id ?? `${event.source}:${event.title}:${event.occurredAt}`;
  if (events.some((item) => item.id === id)) return;
  events.push({ ...event, id });
}

export async function loadAdminOrderRelations(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderRelationsPayload | null> {
  const orderResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("orders")
      .select("id,order_no,user_id,customer_email,total_amount,currency,status,payment_status,delivery_type,created_at,paid_at,processed_at,completed_at,cancelled_at,updated_at")
      .eq("id", orderId)
      .limit(1)
      .single()
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const orderNo = text(order.order_no) ?? String(order.id);
  const events: BusinessTimelineEvent[] = [];
  const groups: BusinessRelationGroup[] = [];

  groups.push(group("order", [relationItem({
    id: String(order.id),
    label: "订单",
    businessNo: orderNo,
    summary: `订单状态 ${text(order.status) ?? "—"} / 支付 ${text(order.payment_status) ?? "—"}`,
    status: text(order.status),
    amount: money(order.total_amount, order.currency),
    createdAt: text(order.created_at),
    href: `/admin/orders?search=${encodeURIComponent(orderNo)}`,
  })], orderResult.error));
  addEvent(events, { source: "订单", title: "订单创建", summary: `订单 ${orderNo}`, status: text(order.status), occurredAt: text(order.created_at) ?? "", href: `/admin/orders?search=${encodeURIComponent(orderNo)}` });
  if (text(order.paid_at)) addEvent(events, { source: "订单", title: "订单已支付", summary: orderNo, status: text(order.payment_status), occurredAt: text(order.paid_at)!, href: `/admin/orders?search=${encodeURIComponent(orderNo)}` });
  if (text(order.completed_at)) addEvent(events, { source: "订单", title: "订单完成", summary: orderNo, status: text(order.status), occurredAt: text(order.completed_at)!, href: `/admin/orders?search=${encodeURIComponent(orderNo)}` });
  if (text(order.cancelled_at)) addEvent(events, { source: "订单", title: "订单取消", summary: orderNo, status: text(order.status), occurredAt: text(order.cancelled_at)!, href: `/admin/orders?search=${encodeURIComponent(orderNo)}` });

  const itemsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("order_items")
      .select("id,order_id,product_id,sku_id,sku_code,product_name,sku_title,quantity,unit_price,line_total,currency,delivery_type,delivery_status,created_at,delivery_started_at,delivery_completed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
  );
  const orderItems = itemsResult.rows;
  groups.push(group("items", orderItems.map((item) => relationItem({
    id: String(item.id),
    label: text(item.sku_code) ? "SKU 订单项" : "订单项",
    businessNo: text(item.sku_code),
    summary: `${text(item.product_name) ?? "订单商品"}${text(item.sku_title) ? ` / ${text(item.sku_title)}` : ""} x ${Number(item.quantity ?? 0)}`,
    status: text(item.delivery_status) ?? text(item.delivery_type),
    amount: money(item.line_total, item.currency),
    createdAt: text(item.created_at),
    href: item.product_id ? `/admin/products?search=${encodeURIComponent(text(item.product_name) ?? String(item.product_id))}` : null,
  })), itemsResult.error));
  for (const item of orderItems) {
    if (text(item.delivery_started_at)) addEvent(events, { source: "订单项", title: "开始交付", summary: text(item.product_name) ?? "订单商品", status: text(item.delivery_status), occurredAt: text(item.delivery_started_at)!, href: null });
    if (text(item.delivery_completed_at)) addEvent(events, { source: "订单项", title: "交付完成", summary: text(item.product_name) ?? "订单商品", status: text(item.delivery_status), occurredAt: text(item.delivery_completed_at)!, href: null });
  }

  const sessionsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("payment_sessions")
      .select("id,session_no,business_type,business_id,business_no,provider,provider_order_no,provider_transaction_id,status,payable_amount,currency,created_at,paid_at,failed_at,updated_at")
      .eq("business_type", "order")
      .eq("business_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("payment_sessions", sessionsResult.rows.map((session) => relationItem({
    id: String(session.id),
    label: "支付会话",
    businessNo: text(session.session_no) ?? text(session.provider_order_no),
    summary: `${text(session.provider) ?? "支付渠道"}${text(session.provider_transaction_id) ? ` / ${text(session.provider_transaction_id)}` : ""}`,
    status: text(session.status),
    amount: money(session.payable_amount, session.currency),
    createdAt: text(session.paid_at) ?? text(session.created_at),
    href: `/admin/payments?search=${encodeURIComponent(text(session.session_no) ?? orderNo)}`,
  })), sessionsResult.error));
  for (const session of sessionsResult.rows) {
    addEvent(events, { source: "支付会话", title: "支付会话创建", summary: text(session.session_no) ?? "支付会话", status: text(session.status), occurredAt: text(session.created_at) ?? "", href: `/admin/payments?search=${encodeURIComponent(text(session.session_no) ?? orderNo)}` });
    if (text(session.paid_at)) addEvent(events, { source: "支付会话", title: "支付成功", summary: text(session.session_no) ?? "支付会话", status: text(session.status), occurredAt: text(session.paid_at)!, href: `/admin/payments?search=${encodeURIComponent(text(session.session_no) ?? orderNo)}` });
    if (text(session.failed_at)) addEvent(events, { source: "支付会话", title: "支付失败", summary: text(session.session_no) ?? "支付会话", status: text(session.status), occurredAt: text(session.failed_at)!, href: `/admin/payments?search=${encodeURIComponent(text(session.session_no) ?? orderNo)}` });
  }

  const paymentsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("order_payments")
      .select("id,payment_no,order_id,user_id,payment_method,channel,status,amount,currency,provider_trade_no,created_at,paid_at,submitted_at,reviewed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("payments", paymentsResult.rows.map((payment) => relationItem({
    id: String(payment.id),
    label: "支付记录",
    businessNo: text(payment.payment_no) ?? text(payment.provider_trade_no),
    summary: text(payment.channel) ?? text(payment.payment_method) ?? "支付记录",
    status: text(payment.status),
    amount: money(payment.amount, payment.currency),
    createdAt: text(payment.paid_at) ?? text(payment.created_at),
    href: `/admin/payments?search=${encodeURIComponent(text(payment.payment_no) ?? orderNo)}`,
  })), paymentsResult.error));
  for (const payment of paymentsResult.rows) {
    addEvent(events, { source: "支付记录", title: text(payment.paid_at) ? "支付确认" : "支付记录创建", summary: text(payment.payment_no) ?? "支付记录", status: text(payment.status), occurredAt: text(payment.paid_at) ?? text(payment.created_at) ?? "", href: `/admin/payments?search=${encodeURIComponent(text(payment.payment_no) ?? orderNo)}` });
  }

  const refundsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("refund_requests")
      .select("id,refund_no,order_id,payment_id,user_id,requested_amount,approved_amount,currency,status,reason_code,created_at,reviewed_at,completed_at,failed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("refunds", refundsResult.rows.map((refund) => relationItem({
    id: String(refund.id),
    label: "退款申请",
    businessNo: text(refund.refund_no),
    summary: text(refund.reason_code) ?? "退款申请",
    status: text(refund.status),
    amount: money(refund.approved_amount ?? refund.requested_amount, refund.currency),
    createdAt: text(refund.created_at),
    href: `/admin/refunds?search=${encodeURIComponent(text(refund.refund_no) ?? orderNo)}`,
  })), refundsResult.error));
  for (const refund of refundsResult.rows) {
    addEvent(events, { source: "退款", title: "退款申请", summary: text(refund.refund_no) ?? "退款申请", status: text(refund.status), occurredAt: text(refund.created_at) ?? "", href: `/admin/refunds?search=${encodeURIComponent(text(refund.refund_no) ?? orderNo)}` });
    if (text(refund.reviewed_at)) addEvent(events, { source: "退款", title: "退款审核", summary: text(refund.refund_no) ?? "退款审核", status: text(refund.status), occurredAt: text(refund.reviewed_at)!, href: `/admin/refunds?search=${encodeURIComponent(text(refund.refund_no) ?? orderNo)}` });
    if (text(refund.completed_at)) addEvent(events, { source: "退款", title: "退款完成", summary: text(refund.refund_no) ?? "退款完成", status: text(refund.status), occurredAt: text(refund.completed_at)!, href: `/admin/refunds?search=${encodeURIComponent(text(refund.refund_no) ?? orderNo)}` });
  }

  const balanceResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("balance_transactions")
      .select("id,transaction_no,user_id,business_type,business_id,direction,amount,currency,status,created_at")
      .or(`business_id.eq.${orderId},business_id.eq.${orderNo}`)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("balance", balanceResult.rows.map((tx) => relationItem({
    id: String(tx.id),
    label: "余额流水",
    businessNo: text(tx.transaction_no),
    summary: `${text(tx.business_type) ?? "余额"} / ${text(tx.direction) ?? "变动"}`,
    status: text(tx.status),
    amount: money(tx.amount, tx.currency),
    createdAt: text(tx.created_at),
    href: `/admin/users?transaction=${encodeURIComponent(text(tx.transaction_no) ?? String(tx.id))}`,
  })), balanceResult.error));
  for (const tx of balanceResult.rows) {
    addEvent(events, { source: "余额流水", title: "余额流水产生", summary: text(tx.transaction_no) ?? text(tx.business_type) ?? "余额流水", status: text(tx.status), occurredAt: text(tx.created_at) ?? "", href: `/admin/users?transaction=${encodeURIComponent(text(tx.transaction_no) ?? String(tx.id))}` });
  }

  const deliveriesResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("order_deliveries")
      .select("id,order_id,order_item_id,user_id,product_id,inventory_id,delivery_type,delivery_status,delivery_no,delivered_at,created_at,updated_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("deliveries", deliveriesResult.rows.map((delivery) => relationItem({
    id: String(delivery.id),
    label: "交付记录",
    businessNo: text(delivery.delivery_no),
    summary: text(delivery.delivery_type) ?? "交付记录",
    status: text(delivery.delivery_status),
    amount: null,
    createdAt: text(delivery.delivered_at) ?? text(delivery.created_at),
    href: `/admin/orders?search=${encodeURIComponent(orderNo)}`,
  })), deliveriesResult.error));
  for (const delivery of deliveriesResult.rows) {
    addEvent(events, { source: "交付", title: text(delivery.delivered_at) ? "交付完成" : "交付记录创建", summary: text(delivery.delivery_no) ?? text(delivery.delivery_type) ?? "交付记录", status: text(delivery.delivery_status), occurredAt: text(delivery.delivered_at) ?? text(delivery.created_at) ?? "", href: `/admin/orders?search=${encodeURIComponent(orderNo)}` });
  }

  const inventoryResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("digital_inventory")
      .select("id,batch_no,batch_id,product_id,sku_id,status,reserved_order_id,delivered_order_id,reserved_at,delivered_at,created_at")
      .or(`reserved_order_id.eq.${orderId},delivered_order_id.eq.${orderId}`)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("inventory", inventoryResult.rows.map((inventory) => relationItem({
    id: String(inventory.id),
    label: "数字库存",
    businessNo: text(inventory.batch_no),
    summary: `库存 ${text(inventory.status) ?? "—"}`,
    status: text(inventory.status),
    amount: null,
    createdAt: text(inventory.delivered_at) ?? text(inventory.reserved_at) ?? text(inventory.created_at),
    href: text(inventory.batch_no) ? `/admin/inventory?batch=${encodeURIComponent(text(inventory.batch_no)!)}` : "/admin/inventory",
  })), inventoryResult.error));
  for (const inventory of inventoryResult.rows) {
    if (text(inventory.reserved_at)) addEvent(events, { source: "数字库存", title: "库存预留", summary: text(inventory.batch_no) ?? "数字库存", status: text(inventory.status), occurredAt: text(inventory.reserved_at)!, href: text(inventory.batch_no) ? `/admin/inventory?batch=${encodeURIComponent(text(inventory.batch_no)!)}` : "/admin/inventory" });
    if (text(inventory.delivered_at)) addEvent(events, { source: "数字库存", title: "库存交付", summary: text(inventory.batch_no) ?? "数字库存", status: text(inventory.status), occurredAt: text(inventory.delivered_at)!, href: text(inventory.batch_no) ? `/admin/inventory?batch=${encodeURIComponent(text(inventory.batch_no)!)}` : "/admin/inventory" });
  }

  const notificationResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("user_notifications")
      .select("id,user_id,title,type,status,business_type,business_id,created_at,read_at")
      .eq("business_type", "order")
      .eq("business_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("notifications", notificationResult.rows.map((notice) => relationItem({
    id: String(notice.id),
    label: "站内通知",
    businessNo: null,
    summary: text(notice.title) ?? text(notice.type) ?? "站内通知",
    status: text(notice.status) ?? (text(notice.read_at) ? "read" : "unread"),
    amount: null,
    createdAt: text(notice.created_at),
    href: null,
  })), notificationResult.error));
  for (const notice of notificationResult.rows) {
    addEvent(events, { source: "通知", title: "站内通知", summary: text(notice.title) ?? "站内通知", status: text(notice.status), occurredAt: text(notice.created_at) ?? "", href: null });
  }

  const auditResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("admin_audit_logs")
      .select("id,request_id,admin_email,module,action,target_type,target_id,result,created_at")
      .or(`target_id.eq.${orderId},target_id.eq.${orderNo}`)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("audit", auditResult.rows.map((log) => relationItem({
    id: String(log.id),
    label: "审计记录",
    businessNo: text(log.request_id),
    summary: `${text(log.module) ?? "system"} / ${text(log.action) ?? "操作"}`,
    status: text(log.result),
    amount: null,
    createdAt: text(log.created_at),
    href: text(log.request_id) ? `/admin/audit-logs?requestId=${encodeURIComponent(text(log.request_id)!)}` : "/admin/audit-logs",
  })), auditResult.error));
  for (const log of auditResult.rows) {
    addEvent(events, { source: "管理员操作", title: text(log.action) ?? "管理员操作", summary: text(log.admin_email) ? `操作人 ${text(log.admin_email)}` : "管理员操作", status: text(log.result), occurredAt: text(log.created_at) ?? "", href: text(log.request_id) ? `/admin/audit-logs?requestId=${encodeURIComponent(text(log.request_id)!)}` : "/admin/audit-logs" });
  }

  const timeline = events
    .filter((event) => Boolean(event.occurredAt))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return { orderId: String(order.id), orderNo, groups, timeline };
}

