import "server-only";

import { createHash } from "crypto";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { CONSISTENCY_RULES, ConsistencyRule, ConsistencySeverity, getConsistencyRule } from "./rules";

type AnyRow = Record<string, any>;

export type ConsistencyIssueDraft = {
  ruleCode: string;
  severity: ConsistencySeverity;
  entityType: string;
  entityId: string | null;
  relatedEntities: Record<string, unknown>;
  title: string;
  summary: string;
  suggestion: string;
  fingerprint: string;
};

export type ConsistencyScanResult = {
  runId: string | null;
  status: "completed" | "partial_failed" | "failed";
  checkedRules: number;
  issueCount: number;
  criticalCount: number;
  issues: ConsistencyIssueDraft[];
  ruleErrors: Array<{ ruleCode: string; error: string }>;
  startedAt: string;
  completedAt: string;
};

const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "success", "succeeded", "completed"]);
const ACTIVE_SESSION_STATUSES = new Set(["pending", "processing"]);
const PAID_ORDER_STATUSES = new Set(["paid", "processing", "delivered", "completed"]);
const CANCELLED_ORDER_STATUSES = new Set(["cancelled", "closed", "failed", "refunded"]);
const RECHARGE_SUCCESS_STATUSES = new Set(["paid", "success", "succeeded", "completed"]);
const RECHARGE_FAILED_STATUSES = new Set(["failed", "expired", "closed", "cancelled", "rejected"]);
const REFUND_SUCCESS_STATUSES = new Set(["paid", "success", "succeeded", "completed", "refunded"]);
const REFUND_PENDING_STATUSES = new Set(["pending", "processing", "under_review"]);

function getSafeErrorMessage(error: unknown, fallback = "检查失败") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function isSuccessPayment(row: AnyRow) {
  return SUCCESS_PAYMENT_STATUSES.has(text(row.status).toLowerCase()) || SUCCESS_PAYMENT_STATUSES.has(text(row.payment_status).toLowerCase());
}

function isPaidOrder(row: AnyRow) {
  return text(row.payment_status).toLowerCase() === "paid" || PAID_ORDER_STATUSES.has(text(row.status).toLowerCase());
}

function fingerprint(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function issue(ruleCode: string, entityType: string, entityId: unknown, relatedEntities: Record<string, unknown>, summary: string): ConsistencyIssueDraft {
  const rule = getConsistencyRule(ruleCode) as ConsistencyRule;
  return {
    ruleCode,
    severity: rule.severity,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    relatedEntities,
    title: rule.title,
    summary,
    suggestion: rule.suggestion,
    fingerprint: fingerprint([ruleCode, entityType, entityId, relatedEntities]),
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

async function safeSelect(client: any, table: string) {
  try {
    const { data, error } = await client.from(table).select("*").limit(5000);
    if (error) return { rows: [] as AnyRow[], error: getSafeErrorMessage(error, `${table} 读取失败`) };
    return { rows: (data ?? []) as AnyRow[], error: null };
  } catch (error) {
    return { rows: [] as AnyRow[], error: getSafeErrorMessage(error, `${table} 读取失败`) };
  }
}

export async function runDataConsistencyScan(options: {
  runType?: "manual" | "scheduled" | "api";
  persist?: boolean;
  triggeredBy?: string | null;
} = {}): Promise<ConsistencyScanResult> {
  const startedAt = new Date().toISOString();
  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) {
    return {
      runId: null,
      status: "failed",
      checkedRules: 0,
      issueCount: 0,
      criticalCount: 0,
      issues: [],
      ruleErrors: [{ ruleCode: "SYSTEM", error: "服务端巡检密钥未配置，无法读取业务表" }],
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  let runId: string | null = null;
  if (options.persist !== false) {
    const { data } = await serviceClient
      .from("data_consistency_runs")
      .insert({ run_type: options.runType ?? "manual", status: "running", triggered_by: options.triggeredBy ?? null })
      .select("id")
      .maybeSingle();
    runId = data?.id ?? null;
  }

  const tables = await Promise.all([
    safeSelect(serviceClient, "orders"),
    safeSelect(serviceClient, "order_items"),
    safeSelect(serviceClient, "order_payments"),
    safeSelect(serviceClient, "payment_sessions"),
    safeSelect(serviceClient, "account_recharges"),
    safeSelect(serviceClient, "balance_transactions"),
    safeSelect(serviceClient, "refunds"),
    safeSelect(serviceClient, "digital_inventory"),
    safeSelect(serviceClient, "order_deliveries"),
  ]);

  const [orders, orderItems, orderPayments, sessions, recharges, balanceTransactions, refunds, inventory, deliveries] = tables.map((entry) => entry.rows);
  const preloadErrors = tables
    .map((entry, index) => (entry.error ? { ruleCode: `TABLE-${index + 1}`, error: entry.error } : null))
    .filter(Boolean) as Array<{ ruleCode: string; error: string }>;

  const checks: Array<{ ruleCode: string; run: () => ConsistencyIssueDraft[] }> = [
    { ruleCode: "OP-001", run: () => checkPaidOrdersWithoutPayments(orders, orderPayments, sessions) },
    { ruleCode: "OP-002", run: () => checkSuccessfulPaymentsPendingOrders(orders, orderPayments, sessions) },
    { ruleCode: "OP-003", run: () => checkOrderPaymentAmountMismatch(orders, orderPayments, sessions) },
    { ruleCode: "OP-004", run: () => checkOrderPaymentCurrencyMismatch(orders, orderPayments, sessions) },
    { ruleCode: "OP-005", run: () => checkProviderTransactionDuplicates(orderPayments, sessions) },
    { ruleCode: "OP-006", run: () => checkMultipleSuccessfulPayments(orders, orderPayments, sessions) },
    { ruleCode: "OP-007", run: () => checkCancelledOrdersWithActiveSessions(orders, sessions) },
    { ruleCode: "RB-001", run: () => checkSucceededRechargeWithoutLedger(recharges, balanceTransactions) },
    { ruleCode: "RB-002", run: () => checkFailedRechargeWithLedger(recharges, balanceTransactions) },
    { ruleCode: "RB-003", run: () => checkDuplicateRechargeLedger(balanceTransactions) },
    { ruleCode: "RB-004", run: () => checkOrphanRechargeLedger(recharges, balanceTransactions) },
    { ruleCode: "RB-005", run: () => checkRechargeLedgerAmountMismatch(recharges, balanceTransactions) },
    { ruleCode: "RB-006", run: () => checkBalanceContinuity(balanceTransactions) },
    { ruleCode: "RF-001", run: () => checkRefundOverpaid(orders, refunds) },
    { ruleCode: "RF-002", run: () => checkRefundWithoutLedger(refunds, balanceTransactions) },
    { ruleCode: "RF-003", run: () => checkRefundCurrencyMismatch(orders, refunds) },
    { ruleCode: "ID-001", run: () => checkDuplicateReservedInventory(inventory) },
    { ruleCode: "ID-002", run: () => checkDuplicateDeliveredInventory(deliveries) },
    { ruleCode: "ID-003", run: () => checkDeliveredInventoryWithoutDelivery(inventory, deliveries) },
    { ruleCode: "ID-004", run: () => checkDeliveryReferencesAvailableInventory(inventory, deliveries) },
    { ruleCode: "ID-005", run: () => checkReservedInventoryWithoutValidOrder(inventory, orders) },
    { ruleCode: "ID-006", run: () => checkCrossSkuDelivery(orderItems, inventory, deliveries) },
    { ruleCode: "ID-007", run: () => checkOrderDeliveryQuantityMismatch(orderItems, deliveries) },
  ];

  const issues: ConsistencyIssueDraft[] = [];
  const ruleErrors = [...preloadErrors];
  for (const check of checks) {
    try {
      issues.push(...check.run());
    } catch (error) {
      ruleErrors.push({ ruleCode: check.ruleCode, error: getSafeErrorMessage(error) });
    }
  }

  if (runId && options.persist !== false) {
    await persistIssues(serviceClient, runId, issues);
    await serviceClient
      .from("data_consistency_runs")
      .update({
        status: ruleErrors.length ? "partial_failed" : "completed",
        completed_at: new Date().toISOString(),
        checked_rules: checks.length,
        issue_count: issues.length,
        critical_count: issues.filter((item) => item.severity === "P0").length,
        error_summary: ruleErrors,
      })
      .eq("id", runId);
  }

  return {
    runId,
    status: ruleErrors.length ? "partial_failed" : "completed",
    checkedRules: checks.length,
    issueCount: issues.length,
    criticalCount: issues.filter((item) => item.severity === "P0").length,
    issues,
    ruleErrors,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function persistIssues(client: any, runId: string, issues: ConsistencyIssueDraft[]) {
  if (!issues.length) return;
  const fingerprints = issues.map((item) => item.fingerprint);
  const { data: existing } = await client
    .from("data_consistency_issues")
    .select("fingerprint,occurrences,first_seen_at,status")
    .in("fingerprint", fingerprints);
  const existingRows = (existing ?? []) as AnyRow[];
  const existingMap = new Map<string, AnyRow>(existingRows.map((row) => [String(row.fingerprint), row]));
  const now = new Date().toISOString();
  const rows = issues.map((item) => {
    const old = existingMap.get(item.fingerprint);
    return {
      run_id: runId,
      fingerprint: item.fingerprint,
      rule_code: item.ruleCode,
      severity: item.severity,
      entity_type: item.entityType,
      entity_id: item.entityId,
      related_entities: item.relatedEntities,
      title: item.title,
      summary: item.summary,
      suggestion: item.suggestion,
      status: old?.status && old.status !== "resolved" ? old.status : "open",
      first_seen_at: old?.first_seen_at ?? now,
      last_seen_at: now,
      occurrences: Number(old?.occurrences ?? 0) + 1,
    };
  });
  await client.from("data_consistency_issues").upsert(rows, { onConflict: "fingerprint" });
}

export async function listDataConsistencyState(filters: { severity?: string; ruleCode?: string; status?: string; page?: number; pageSize?: number }) {
  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) throw new Error("服务端巡检密钥未配置");
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(filters.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: latestRun } = await serviceClient
    .from("data_consistency_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = serviceClient
    .from("data_consistency_issues")
    .select("*", { count: "exact" })
    .order("last_seen_at", { ascending: false });

  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.ruleCode && filters.ruleCode !== "all") query = query.eq("rule_code", filters.ruleCode);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const { data: statsData } = await serviceClient.from("data_consistency_issues").select("severity,status");
  const statsRows = (statsData ?? []) as AnyRow[];
  return {
    latestRun: latestRun ?? null,
    issues: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
    rules: CONSISTENCY_RULES,
    stats: {
      total: statsRows.length,
      p0: statsRows.filter((row) => row.severity === "P0").length,
      p1: statsRows.filter((row) => row.severity === "P1").length,
      resolved: statsRows.filter((row) => row.status === "resolved").length,
      open: statsRows.filter((row) => row.status === "open" || row.status === "investigating").length,
    },
  };
}

export async function updateConsistencyIssueStatus(input: {
  issueId: string;
  status: "open" | "investigating" | "resolved" | "ignored";
  note: string;
  adminId: string;
  adminEmail?: string | null;
  request?: Request;
}) {
  if (!input.note.trim()) throw new Error("处理备注不能为空");
  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) throw new Error("服务端巡检密钥未配置");
  const resolved = input.status === "resolved" || input.status === "ignored";
  const { data, error } = await serviceClient
    .from("data_consistency_issues")
    .update({
      status: input.status,
      resolution_note: input.note.trim(),
      resolved_by: resolved ? input.adminId : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", input.issueId)
    .select("id,rule_code,title,status,entity_type,entity_id")
    .maybeSingle();
  if (error) throw error;

  await writeAdminAuditLog({
    request: input.request,
    admin: { id: input.adminId, email: input.adminEmail },
    action: "update_data_consistency_issue_status",
    module: "system",
    targetType: "data_consistency_issue",
    targetId: input.issueId,
    targetLabel: data?.title ?? input.issueId,
    result: "success",
    afterSummary: { status: input.status, note: input.note.trim(), ruleCode: data?.rule_code },
  });

  return data;
}

function successPaymentsForOrder(orderId: unknown, payments: AnyRow[], sessions: AnyRow[]) {
  return [
    ...payments.filter((row) => String(row.order_id ?? row.business_id ?? "") === String(orderId) && isSuccessPayment(row)),
    ...sessions.filter((row) => String(row.business_id ?? "") === String(orderId) && text(row.business_type).toLowerCase() === "order" && text(row.status).toLowerCase() === "paid"),
  ];
}

function checkPaidOrdersWithoutPayments(orders: AnyRow[], payments: AnyRow[], sessions: AnyRow[]) {
  return orders
    .filter(isPaidOrder)
    .filter((order) => successPaymentsForOrder(order.id, payments, sessions).length === 0)
    .map((order) => issue("OP-001", "order", order.id, { orderNo: order.order_no }, `订单 ${order.order_no ?? order.id} 已支付但未找到成功支付记录。`));
}

function checkSuccessfulPaymentsPendingOrders(orders: AnyRow[], payments: AnyRow[], sessions: AnyRow[]) {
  const ordersById = new Map(orders.map((order) => [String(order.id), order]));
  const rows = [...payments.filter(isSuccessPayment), ...sessions.filter((row) => text(row.status).toLowerCase() === "paid")];
  return rows.flatMap((payment) => {
    const orderId = String(payment.order_id ?? payment.business_id ?? "");
    const order = ordersById.get(orderId);
    if (!order || text(payment.business_type || "order").toLowerCase() !== "order") return [];
    return isPaidOrder(order)
      ? []
      : [issue("OP-002", "payment", payment.id, { orderId, orderNo: order.order_no, paymentNo: payment.payment_no ?? payment.session_no }, `支付 ${payment.payment_no ?? payment.session_no ?? payment.id} 成功但订单仍未同步为已支付。`)];
  });
}

function checkOrderPaymentAmountMismatch(orders: AnyRow[], payments: AnyRow[], sessions: AnyRow[]) {
  const ordersById = new Map(orders.map((order) => [String(order.id), order]));
  const rows = [...payments.filter(isSuccessPayment), ...sessions.filter((row) => text(row.status).toLowerCase() === "paid")];
  return rows.flatMap((payment) => {
    const orderId = String(payment.order_id ?? payment.business_id ?? "");
    const order = ordersById.get(orderId);
    if (!order || text(payment.business_type || "order").toLowerCase() !== "order") return [];
    const orderCurrency = text(order.currency || "CNY");
    const paymentCurrency = text(payment.currency || orderCurrency);
    if (orderCurrency !== paymentCurrency) return [];
    const paidAmount = amount(payment.amount ?? payment.payable_amount ?? payment.paid_amount ?? payment.total_amount);
    return amount(order.total_amount) === paidAmount
      ? []
      : [issue("OP-003", "order", order.id, { orderNo: order.order_no, paymentNo: payment.payment_no ?? payment.session_no, orderAmount: amount(order.total_amount), paymentAmount: paidAmount }, `订单 ${order.order_no ?? order.id} 金额与支付金额不一致。`)];
  });
}

function checkOrderPaymentCurrencyMismatch(orders: AnyRow[], payments: AnyRow[], sessions: AnyRow[]) {
  const ordersById = new Map(orders.map((order) => [String(order.id), order]));
  return [...payments.filter(isSuccessPayment), ...sessions.filter((row) => text(row.status).toLowerCase() === "paid")].flatMap((payment) => {
    const orderId = String(payment.order_id ?? payment.business_id ?? "");
    const order = ordersById.get(orderId);
    if (!order || text(payment.business_type || "order").toLowerCase() !== "order") return [];
    const paymentCurrency = text(payment.currency || order.currency || "CNY");
    return text(order.currency || "CNY") === paymentCurrency ? [] : [issue("OP-004", "order", order.id, { orderNo: order.order_no, paymentCurrency, orderCurrency: order.currency }, `订单 ${order.order_no ?? order.id} 币种与支付币种不一致。`)];
  });
}

function providerTradeNo(row: AnyRow) {
  return text(row.provider_transaction_id ?? row.provider_trade_no ?? row.transaction_reference ?? "");
}

function checkProviderTransactionDuplicates(payments: AnyRow[], sessions: AnyRow[]) {
  const rows = [...payments.filter(isSuccessPayment), ...sessions.filter((row) => text(row.status).toLowerCase() === "paid")].filter(providerTradeNo);
  return Array.from(groupBy(rows, providerTradeNo).entries())
    .filter(([, items]) => new Set(items.map((item) => text(item.order_id ?? item.business_id))).size > 1)
    .map(([tradeNo, items]) => issue("OP-005", "payment_transaction", tradeNo, { tradeNo, relatedCount: items.length, businessIds: items.map((item) => item.order_id ?? item.business_id) }, `渠道交易号 ${tradeNo} 关联多个订单或业务单。`));
}

function checkMultipleSuccessfulPayments(orders: AnyRow[], payments: AnyRow[], sessions: AnyRow[]) {
  return orders.flatMap((order) => {
    const rows = successPaymentsForOrder(order.id, payments, sessions);
    return rows.length > 1 ? [issue("OP-006", "order", order.id, { orderNo: order.order_no, successCount: rows.length }, `订单 ${order.order_no ?? order.id} 存在 ${rows.length} 条成功支付记录。`)] : [];
  });
}

function checkCancelledOrdersWithActiveSessions(orders: AnyRow[], sessions: AnyRow[]) {
  const ordersById = new Map(orders.map((order) => [String(order.id), order]));
  const now = Date.now();
  return sessions.flatMap((session) => {
    const order = ordersById.get(String(session.business_id ?? ""));
    if (!order || text(session.business_type).toLowerCase() !== "order") return [];
    const active = ACTIVE_SESSION_STATUSES.has(text(session.status).toLowerCase()) && (!session.expires_at || new Date(session.expires_at).getTime() > now);
    const cancelled = CANCELLED_ORDER_STATUSES.has(text(order.status).toLowerCase());
    return active && cancelled ? [issue("OP-007", "order", order.id, { orderNo: order.order_no, sessionNo: session.session_no }, `取消或关闭订单 ${order.order_no ?? order.id} 仍存在有效支付会话。`)] : [];
  });
}

function rechargeBusinessId(row: AnyRow) {
  return text(row.business_id ?? row.recharge_id ?? row.recharge_no ?? "");
}

function rechargeLedgers(rows: AnyRow[]) {
  return rows.filter((row) => ["recharge", "account_recharge"].includes(text(row.business_type).toLowerCase()) || text(row.description).includes("充值"));
}

function checkSucceededRechargeWithoutLedger(recharges: AnyRow[], ledgers: AnyRow[]) {
  const ledgerIds = new Set(rechargeLedgers(ledgers).map(rechargeBusinessId));
  return recharges.filter((row) => RECHARGE_SUCCESS_STATUSES.has(text(row.status).toLowerCase())).filter((row) => !ledgerIds.has(String(row.id)) && !ledgerIds.has(text(row.recharge_no))).map((row) => issue("RB-001", "recharge", row.id, { rechargeNo: row.recharge_no, userId: row.user_id }, `充值 ${row.recharge_no ?? row.id} 成功但缺少入账流水。`));
}

function checkFailedRechargeWithLedger(recharges: AnyRow[], ledgers: AnyRow[]) {
  const rechargesById = new Map(recharges.map((row) => [String(row.id), row]));
  const rechargesByNo = new Map(recharges.map((row) => [text(row.recharge_no), row]));
  return rechargeLedgers(ledgers).flatMap((ledger) => {
    const recharge = rechargesById.get(rechargeBusinessId(ledger)) ?? rechargesByNo.get(rechargeBusinessId(ledger));
    return recharge && RECHARGE_FAILED_STATUSES.has(text(recharge.status).toLowerCase()) ? [issue("RB-002", "recharge", recharge.id, { rechargeNo: recharge.recharge_no, transactionNo: ledger.transaction_no }, `失败或关闭充值 ${recharge.recharge_no ?? recharge.id} 存在余额入账流水。`)] : [];
  });
}

function checkDuplicateRechargeLedger(ledgers: AnyRow[]) {
  return Array.from(groupBy(rechargeLedgers(ledgers), rechargeBusinessId).entries()).filter(([key, rows]) => key && rows.length > 1).map(([key, rows]) => issue("RB-003", "recharge", key, { transactionNos: rows.map((row) => row.transaction_no), count: rows.length }, `充值 ${key} 存在重复入账流水。`));
}

function checkOrphanRechargeLedger(recharges: AnyRow[], ledgers: AnyRow[]) {
  const ids = new Set(recharges.flatMap((row) => [String(row.id), text(row.recharge_no)]));
  return rechargeLedgers(ledgers).filter((ledger) => rechargeBusinessId(ledger) && !ids.has(rechargeBusinessId(ledger))).map((ledger) => issue("RB-004", "balance_transaction", ledger.id, { transactionNo: ledger.transaction_no, businessId: rechargeBusinessId(ledger) }, `余额流水 ${ledger.transaction_no ?? ledger.id} 引用不存在的充值。`));
}

function checkRechargeLedgerAmountMismatch(recharges: AnyRow[], ledgers: AnyRow[]) {
  const byId = new Map(recharges.flatMap((row) => [[String(row.id), row], [text(row.recharge_no), row]]));
  return rechargeLedgers(ledgers).flatMap((ledger) => {
    const recharge = byId.get(rechargeBusinessId(ledger));
    if (!recharge) return [];
    const expected = amount(recharge.credited_amount ?? recharge.received_amount ?? recharge.payable_amount ?? recharge.amount);
    return expected && expected !== amount(ledger.amount) ? [issue("RB-005", "recharge", recharge.id, { rechargeNo: recharge.recharge_no, transactionNo: ledger.transaction_no, rechargeAmount: expected, ledgerAmount: amount(ledger.amount) }, `充值 ${recharge.recharge_no ?? recharge.id} 与入账流水金额不一致。`)] : [];
  });
}

function checkBalanceContinuity(ledgers: AnyRow[]) {
  const byUser = groupBy(ledgers.filter((row) => row.user_id), (row) => text(row.user_id));
  const issues: ConsistencyIssueDraft[] = [];
  for (const [userId, rows] of Array.from(byUser.entries())) {
    const sorted = [...rows].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    for (let i = 1; i < sorted.length; i += 1) {
      if (amount(sorted[i - 1].balance_after) !== amount(sorted[i].balance_before)) {
        issues.push(issue("RB-006", "user_balance", userId, { userId, previousTransaction: sorted[i - 1].transaction_no, currentTransaction: sorted[i].transaction_no }, `用户余额流水前后值不连续。`));
        break;
      }
    }
  }
  return issues;
}

function checkRefundOverpaid(orders: AnyRow[], refunds: AnyRow[]) {
  const orderMap = new Map(orders.map((row) => [String(row.id), row]));
  return Array.from(groupBy(refunds.filter((row: AnyRow) => REFUND_SUCCESS_STATUSES.has(text(row.status).toLowerCase()) || REFUND_PENDING_STATUSES.has(text(row.status).toLowerCase())), (row: AnyRow) => text(row.order_id)).entries()).flatMap(([orderId, rows]) => {
    const order = orderMap.get(orderId);
    if (!order) return [];
    const total = rows.reduce((sum, row) => sum + amount(row.amount ?? row.refund_amount ?? row.total_amount), 0);
    return total > amount(order.total_amount) ? [issue("RF-001", "order", orderId, { orderNo: order.order_no, refundAmount: total, orderAmount: amount(order.total_amount) }, `订单 ${order.order_no ?? orderId} 退款累计超过实付金额。`)] : [];
  });
}

function checkRefundWithoutLedger(refunds: AnyRow[], ledgers: AnyRow[]) {
  const refundLedgers = ledgers.filter((row) => text(row.business_type).toLowerCase().includes("refund") || text(row.description).includes("退款"));
  const ids = new Set(refundLedgers.map((row) => text(row.business_id)));
  return refunds.filter((row) => REFUND_SUCCESS_STATUSES.has(text(row.status).toLowerCase()) && text(row.refund_method).toLowerCase().includes("balance")).filter((row) => !ids.has(String(row.id)) && !ids.has(text(row.refund_no))).map((row) => issue("RF-002", "refund", row.id, { refundNo: row.refund_no, orderId: row.order_id }, `余额退款 ${row.refund_no ?? row.id} 成功但缺少余额退款流水。`));
}

function checkRefundCurrencyMismatch(orders: AnyRow[], refunds: AnyRow[]) {
  const orderMap = new Map(orders.map((row) => [String(row.id), row]));
  return refunds.filter((row) => REFUND_SUCCESS_STATUSES.has(text(row.status).toLowerCase())).flatMap((refund) => {
    const order = orderMap.get(text(refund.order_id));
    if (!order) return [];
    const refundCurrency = text(refund.currency || order.currency || "CNY");
    return text(order.currency || "CNY") === refundCurrency ? [] : [issue("RF-003", "refund", refund.id, { refundNo: refund.refund_no, orderNo: order.order_no, refundCurrency, orderCurrency: order.currency }, `退款 ${refund.refund_no ?? refund.id} 与订单币种不一致。`)];
  });
}

function checkDuplicateReservedInventory(inventory: AnyRow[]) {
  return Array.from(groupBy(inventory.filter((row: AnyRow) => text(row.status).toLowerCase() === "reserved"), (row: AnyRow) => text(row.id)).entries()).filter(([, rows]) => rows.length > 1).map(([id, rows]) => issue("ID-001", "digital_inventory", id, { inventoryId: id, count: rows.length }, `库存 ${id} 被重复预留。`));
}

function deliveryInventoryId(row: AnyRow) {
  return text(row.inventory_id ?? row.digital_inventory_id ?? row.metadata?.inventory_id ?? "");
}

function checkDuplicateDeliveredInventory(deliveries: AnyRow[]) {
  const delivered = deliveries.filter((row) => text(row.delivery_status ?? row.status).toLowerCase() === "delivered" && deliveryInventoryId(row));
  return Array.from(groupBy(delivered, deliveryInventoryId).entries()).filter(([, rows]) => rows.length > 1).map(([inventoryId, rows]) => issue("ID-002", "digital_inventory", inventoryId, { inventoryId, orderIds: rows.map((row) => row.order_id), count: rows.length }, `库存 ${inventoryId} 被重复交付。`));
}

function checkDeliveredInventoryWithoutDelivery(inventory: AnyRow[], deliveries: AnyRow[]) {
  const deliveredIds = new Set(deliveries.map(deliveryInventoryId).filter(Boolean));
  return inventory.filter((row) => text(row.status).toLowerCase() === "delivered" && !deliveredIds.has(String(row.id))).map((row) => issue("ID-003", "digital_inventory", row.id, { productId: row.product_id, skuId: row.sku_id }, `已交付库存 ${row.id} 缺少交付记录。`));
}

function checkDeliveryReferencesAvailableInventory(inventory: AnyRow[], deliveries: AnyRow[]) {
  const inventoryMap = new Map(inventory.map((row) => [String(row.id), row]));
  return deliveries.flatMap((delivery) => {
    const inventoryRow = inventoryMap.get(deliveryInventoryId(delivery));
    return inventoryRow && text(inventoryRow.status).toLowerCase() === "available" ? [issue("ID-004", "digital_inventory", inventoryRow.id, { orderId: delivery.order_id, deliveryId: delivery.id }, `交付记录引用了仍为 available 的库存。`)] : [];
  });
}

function checkReservedInventoryWithoutValidOrder(inventory: AnyRow[], orders: AnyRow[]) {
  const orderMap = new Map(orders.map((row) => [String(row.id), row]));
  return inventory.filter((row) => text(row.status).toLowerCase() === "reserved").flatMap((row) => {
    const orderId = text(row.order_id ?? row.reserved_order_id);
    const order = orderMap.get(orderId);
    const invalid = !order || CANCELLED_ORDER_STATUSES.has(text(order.status).toLowerCase());
    return invalid ? [issue("ID-005", "digital_inventory", row.id, { inventoryId: row.id, orderId, productId: row.product_id, skuId: row.sku_id }, `预留库存 ${row.id} 缺少有效订单。`)] : [];
  });
}

function checkCrossSkuDelivery(orderItems: AnyRow[], inventory: AnyRow[], deliveries: AnyRow[]) {
  const itemMap = new Map(orderItems.map((row) => [String(row.id), row]));
  const inventoryMap = new Map(inventory.map((row) => [String(row.id), row]));
  return deliveries.flatMap((delivery) => {
    const item = itemMap.get(text(delivery.order_item_id));
    const inventoryRow = inventoryMap.get(deliveryInventoryId(delivery));
    if (!item || !inventoryRow) return [];
    const itemSku = text(item.sku_id);
    const inventorySku = text(inventoryRow.sku_id);
    return itemSku && inventorySku && itemSku !== inventorySku ? [issue("ID-006", "order_delivery", delivery.id, { orderId: delivery.order_id, orderItemId: delivery.order_item_id, inventoryId: inventoryRow.id, itemSku, inventorySku }, `订单项 SKU 与交付库存 SKU 不一致。`)] : [];
  });
}

function checkOrderDeliveryQuantityMismatch(orderItems: AnyRow[], deliveries: AnyRow[]) {
  const deliveredByItem = groupBy(deliveries.filter((row) => text(row.delivery_status ?? row.status).toLowerCase() === "delivered"), (row) => text(row.order_item_id));
  return orderItems.flatMap((item) => {
    const deliveryType = text(item.delivery_type).toLowerCase();
    if (!deliveryType.includes("auto") && !deliveryType.includes("digital") && !deliveryType.includes("card") && !deliveryType.includes("account")) return [];
    const count = deliveredByItem.get(String(item.id))?.length ?? 0;
    const quantity = Math.max(1, Number(item.quantity ?? 1));
    return count > 0 && count !== quantity ? [issue("ID-007", "order_item", item.id, { orderId: item.order_id, orderItemId: item.id, quantity, deliveredCount: count }, `订单项交付数量与购买数量不一致。`)] : [];
  });
}


