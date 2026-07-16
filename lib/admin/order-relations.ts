import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOrderEvidence } from "@/lib/legal/legal-service";

export type RelationGroupKey =
  | "order"
  | "items"
  | "payment_sessions"
  | "payments"
  | "chain_payment_sessions"
  | "refunds"
  | "balance"
  | "inventory"
  | "deliveries"
  | "notifications"
  | "agreements"
  | "evidence"
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
  chain_payment_sessions: "链上支付会话",
  refunds: "退款申请",
  balance: "余额流水",
  inventory: "数字库存预留",
  deliveries: "交付记录",
  notifications: "站内通知",
  agreements: "协议确认",
  evidence: "订单证据",
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

function exactMoney(amount: unknown, currency: unknown) {
  if (amount === null || typeof amount === "undefined") return null;
  const value = String(amount).trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const code = String(currency ?? "").trim().toUpperCase();
  return code === "CNY" ? `¥${value}` : `${value}${code ? ` ${code}` : ""}`;
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
      .select("id,order_id,product_id,sku_id,sku_code,product_name,sku_title,quantity,unit_price,line_total,delivery_type,delivery_status,created_at,delivery_started_at,delivery_completed_at")
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
    amount: money(item.line_total, order.currency),
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
      .select("id,session_no,business_type,business_id,business_no,provider,provider_order_no,provider_transaction_id,status,payable_amount,currency,created_at,paid_at,closed_at,last_error,updated_at")
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
    if (text(session.status) === "failed") addEvent(events, { source: "支付会话", title: "支付失败", summary: text(session.session_no) ?? "支付会话", status: text(session.status), occurredAt: text(session.closed_at) ?? text(session.updated_at) ?? "", href: `/admin/payments?search=${encodeURIComponent(text(session.session_no) ?? orderNo)}` });
  }

  const paymentsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("order_payments")
      .select("id,payment_no,payment_session_id,order_id,user_id,payment_method,channel,status,amount,currency,payable_amount,payable_currency,received_amount,received_currency,provider_trade_no,created_at,paid_at,submitted_at,reviewed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("payments", paymentsResult.rows.map((payment) => relationItem({
    id: String(payment.id),
    label: "支付记录",
    businessNo: text(payment.payment_no) ?? text(payment.provider_trade_no),
    summary: [
      text(payment.channel) ?? text(payment.payment_method) ?? "支付记录",
      exactMoney(payment.payable_amount, payment.payable_currency) ? `应付 ${exactMoney(payment.payable_amount, payment.payable_currency)}` : null,
      exactMoney(payment.received_amount, payment.received_currency) ? `到账 ${exactMoney(payment.received_amount, payment.received_currency)}` : null,
    ].filter(Boolean).join(" / "),
    status: text(payment.status),
    amount: money(payment.amount, payment.currency),
    createdAt: text(payment.paid_at) ?? text(payment.created_at),
    href: `/admin/payments?search=${encodeURIComponent(text(payment.payment_no) ?? orderNo)}`,
  })), paymentsResult.error));
  for (const payment of paymentsResult.rows) {
    addEvent(events, { source: "支付记录", title: text(payment.paid_at) ? "支付确认" : "支付记录创建", summary: text(payment.payment_no) ?? "支付记录", status: text(payment.status), occurredAt: text(payment.paid_at) ?? text(payment.created_at) ?? "", href: `/admin/payments?search=${encodeURIComponent(text(payment.payment_no) ?? orderNo)}` });
  }

  const chainSessionsResult = await safeQuery<Record<string, unknown>>(() =>
    supabase
      .from("chain_payment_sessions")
      .select("id,order_id,payment_session_id,payment_id,payment_method,network,chain_id,asset,token_contract,order_currency,order_amount,payment_currency,exchange_rate,exchange_rate_source,expected_amount,confirmed_amount,receive_address,status,submitted_tx_hash,confirmed_at,expires_at,manual_review_reason,failure_reason,created_at,updated_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  groups.push(group("chain_payment_sessions", chainSessionsResult.rows.map((session) => relationItem({
    id: String(session.id),
    label: `${text(session.asset) ?? "USDT"}-${text(session.network) ?? "链上支付"}`,
    businessNo: text(session.submitted_tx_hash),
    summary: [
      `Chain ID ${String(session.chain_id ?? "—")}`,
      exactMoney(session.expected_amount, session.payment_currency) ? `应付 ${exactMoney(session.expected_amount, session.payment_currency)}` : null,
      exactMoney(session.confirmed_amount, session.payment_currency) ? `到账 ${exactMoney(session.confirmed_amount, session.payment_currency)}` : null,
    ].filter(Boolean).join(" / "),
    status: text(session.status),
    amount: exactMoney(session.confirmed_amount ?? session.expected_amount, session.payment_currency),
    createdAt: text(session.confirmed_at) ?? text(session.created_at),
    href: `/admin/payments?search=${encodeURIComponent(text(session.submitted_tx_hash) ?? orderNo)}`,
  })), chainSessionsResult.error));
  for (const session of chainSessionsResult.rows) {
    addEvent(events, {
      source: "链上支付",
      title: text(session.confirmed_at) ? "链上到账确认" : "链上支付会话创建",
      summary: text(session.submitted_tx_hash) ?? `${text(session.asset) ?? "USDT"}-${text(session.network) ?? "BEP20"}`,
      status: text(session.status),
      occurredAt: text(session.confirmed_at) ?? text(session.created_at) ?? "",
      href: `/admin/payments?search=${encodeURIComponent(text(session.submitted_tx_hash) ?? orderNo)}`,
    });
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

  const evidenceResult = await loadOrderEvidence(supabase, orderId).catch(() => ({
    agreements: [],
    agreementError: "订单证据读取失败",
    documents: [],
    documentError: null,
    events: [],
    evidenceError: "订单证据读取失败",
  }));
  const agreementRows = asArray<Record<string, unknown>>(evidenceResult.agreements);
  groups.push(group("agreements", agreementRows.length ? agreementRows.map((agreement) => relationItem({
    id: String(agreement.id),
    label: "协议确认",
    businessNo: text(agreement.document_version),
    summary: `${text(agreement.document_type) ?? "协议"} / hash ${text(agreement.content_hash)?.slice(0, 12) ?? "—"}`,
    status: text(agreement.acceptance_source) ?? "checkout",
    amount: null,
    createdAt: text(agreement.accepted_at) ?? text(agreement.created_at),
    href: null,
  })) : [relationItem({
    id: `missing-agreements:${orderId}`,
    label: "历史记录缺失",
    businessNo: null,
    summary: "该订单没有保存协议确认版本，不能自动补写或伪造历史确认。",
    status: "missing",
    amount: null,
    createdAt: text(order.created_at),
    href: null,
  })], evidenceResult.agreementError ?? undefined));
  for (const agreement of agreementRows) {
    addEvent(events, {
      source: "协议确认",
      title: "用户确认协议版本",
      summary: `${text(agreement.document_type) ?? "协议"} ${text(agreement.document_version) ?? ""}`.trim(),
      status: text(agreement.acceptance_source) ?? "checkout",
      occurredAt: text(agreement.accepted_at) ?? "",
      href: null,
    });
  }

  const evidenceRows = asArray<Record<string, unknown>>(evidenceResult.events);
  groups.push(group("evidence", evidenceRows.map((event) => relationItem({
    id: String(event.id),
    label: text(event.title) ?? text(event.event_type) ?? "证据事件",
    businessNo: text(event.request_id),
    summary: text(event.summary) ?? text(event.source) ?? "订单证据事件",
    status: text(event.source),
    amount: null,
    createdAt: text(event.created_at),
    href: null,
  })), evidenceResult.evidenceError ?? undefined));
  for (const event of evidenceRows) {
    addEvent(events, {
      source: text(event.source) ?? "订单证据",
      title: text(event.title) ?? text(event.event_type) ?? "证据事件",
      summary: text(event.summary) ?? "订单证据事件",
      status: text(event.source),
      occurredAt: text(event.created_at) ?? "",
      href: null,
    });
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




