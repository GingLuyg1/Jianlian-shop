import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getAuditErrorMessage, writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

type RouteContext = { params: { userId: string } };
type Row = Record<string, unknown>;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin;
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "view_user_detail",
      module: "users",
      result: "denied",
      errorMessage: "仅超级管理员可以查看用户详情",
    });
    return { ok: false as const, response: json({ error: "仅超级管理员可以查看用户详情。" }, { status: 403 }) };
  }
  return admin;
}

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;

  const serviceClient = getSupabaseServiceRoleClient();
  const supabase = serviceClient ?? admin.supabase;
  const userId = context.params.userId;

  try {
    const profileResult = await loadProfile(supabase, userId);
    if (!profileResult.profile) {
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "view_user_detail",
        module: "users",
        targetType: "user",
        targetId: userId,
        result: "failed",
        errorMessage: profileResult.error ?? "用户不存在",
      });
      return json({ error: profileResult.error ?? "用户不存在" }, { status: profileResult.schemaReady ? 404 : 503 });
    }

    const [orders, recharges, transactions, deliveries, statusHistory, riskRecords, auditLogs] = await Promise.all([
      loadRows(supabase, "orders", "id,order_no,status,payment_status,total_amount,currency,delivery_type,created_at,updated_at", userId, "created_at"),
      loadRows(supabase, "account_recharges", "id,recharge_no,channel_name,channel_code,currency,amount,requested_amount,credited_amount,status,created_at,paid_at", userId, "created_at"),
      loadRows(supabase, "balance_transactions", "id,transaction_no,business_type,business_id,direction,amount,balance_before,balance_after,currency,status,remark,created_at", userId, "created_at"),
      loadRows(supabase, "order_deliveries", "id,order_id,order_item_id,product_id,delivery_type,delivery_status,delivered_at,viewed_at,created_at,updated_at", userId, "created_at"),
      loadRowsByColumn(supabase, "user_account_status_history", "id,old_status,new_status,reason,admin_email,request_id,created_at", "target_user_id", userId, "created_at"),
      loadRowsByColumn(supabase, "user_risk_records", "id,old_risk_status,new_risk_status,reason,admin_email,request_id,created_at", "target_user_id", userId, "created_at"),
      loadAuditLogs(supabase, userId),
    ]);

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "view_sensitive_user_detail",
      module: "users",
      targetType: "user",
      targetId: userId,
      targetLabel: profileResult.profile.email,
      result: "success",
      metadata: { modules: ["profile", "orders", "recharges", "balance", "deliveries", "audit"] },
    });

    return json({
      profile: profileResult.profile,
      summary: buildSummary(profileResult.profile, orders.rows, recharges.rows, transactions.rows, deliveries.rows),
      orders: orders.rows.map(normalizeOrder),
      recharges: recharges.rows.map(normalizeRecharge),
      balanceTransactions: transactions.rows.map(normalizeBalanceTransaction),
      deliveries: deliveries.rows.map(normalizeDelivery),
      notifications: [],
      statusHistory: statusHistory.rows,
      riskRecords: riskRecords.rows,
      auditLogs: auditLogs.rows,
      errors: compactErrors({
        profile: profileResult.error,
        orders: orders.error,
        recharges: recharges.error,
        balanceTransactions: transactions.error,
        deliveries: deliveries.error,
        statusHistory: statusHistory.error,
        riskRecords: riskRecords.error,
        auditLogs: auditLogs.error,
      }),
      schemaReady: profileResult.schemaReady,
    });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "view_user_detail",
      module: "users",
      targetType: "user",
      targetId: userId,
      result: "failed",
      errorMessage: error,
    });
    return json({ error: "用户详情加载失败，请稍后重试。" }, { status: 500 });
  }
}

async function loadProfile(supabase: any, userId: string) {
  const select = "id,email,display_name,full_name,nickname,name,role,balance,created_at,updated_at,last_login_at,account_status,risk_status,status_reason,risk_reason";
  const { data, error } = await supabase.from("profiles").select(select).eq("id", userId).maybeSingle();
  if (!error) return { profile: normalizeProfile(data as Row | null), error: null as string | null, schemaReady: true };
  if (/account_status|risk_status|last_login_at|schema cache|42703/i.test(getAuditErrorMessage(error, ""))) {
    const retry = await supabase
      .from("profiles")
      .select("id,email,display_name,full_name,nickname,name,role,balance,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (!retry.error) return { profile: normalizeProfile(retry.data as Row | null), error: "用户状态字段尚未初始化，请执行 admin_user_controls migration。", schemaReady: false };
  }
  return { profile: null, error: "用户资料加载失败，请稍后重试。", schemaReady: false };
}

async function loadRows(supabase: any, table: string, select: string, userId: string, orderColumn: string) {
  return loadRowsByColumn(supabase, table, select, "user_id", userId, orderColumn);
}

async function loadRowsByColumn(supabase: any, table: string, select: string, column: string, userId: string, orderColumn: string) {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq(column, userId)
    .order(orderColumn, { ascending: false })
    .limit(50);
  return { rows: (data ?? []) as Row[], error: error ? `${table} 读取失败` : null };
}

async function loadAuditLogs(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("id,admin_email,action,module,target_type,target_id,result,before_summary,after_summary,metadata,created_at,request_id")
    .eq("target_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return { rows: (data ?? []) as Row[], error: error ? "审计日志读取失败" : null };
}

function normalizeProfile(row: Row | null) {
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    email: textOrNull(row.email),
    displayName: textOrNull(row.display_name) ?? textOrNull(row.full_name) ?? textOrNull(row.nickname) ?? textOrNull(row.name),
    role: textOrNull(row.role) ?? "user",
    accountStatus: textOrNull(row.account_status) ?? "active",
    riskStatus: textOrNull(row.risk_status) ?? "normal",
    statusReason: textOrNull(row.status_reason),
    riskReason: textOrNull(row.risk_reason),
    balance: finiteNumber(row.balance),
    createdAt: textOrNull(row.created_at),
    updatedAt: textOrNull(row.updated_at),
    lastLoginAt: textOrNull(row.last_login_at),
  };
}

function buildSummary(profile: NonNullable<ReturnType<typeof normalizeProfile>>, orders: Row[], recharges: Row[], transactions: Row[], deliveries: Row[]) {
  const totalRecharge = recharges
    .filter((row) => ["paid", "succeeded"].includes(String(row.status ?? "")))
    .reduce((sum, row) => sum + finiteNumber(row.credited_amount ?? row.requested_amount ?? row.amount), 0);
  const totalSpendFromLedger = transactions
    .filter((row) => row.direction === "debit" && row.status === "completed" && row.business_type === "order_payment")
    .reduce((sum, row) => sum + finiteNumber(row.amount), 0);
  const totalSpendFromOrders = orders
    .filter((row) => ["paid", "processing", "delivered", "completed"].includes(String(row.status ?? "")))
    .reduce((sum, row) => sum + finiteNumber(row.total_amount), 0);
  return {
    balance: profile.balance,
    totalRecharge,
    totalSpend: totalSpendFromLedger > 0 ? totalSpendFromLedger : totalSpendFromOrders,
    orderCount: orders.length,
    rechargeCount: recharges.length,
    transactionCount: transactions.length,
    deliveryCount: deliveries.length,
  };
}


function normalizeOrder(row: Row) {
  return {
    id: String(row.id ?? ""),
    orderNo: textOrNull(row.order_no),
    status: textOrNull(row.status) ?? "pending_payment",
    paymentStatus: textOrNull(row.payment_status) ?? "unpaid",
    totalAmount: finiteNumber(row.total_amount),
    currency: textOrNull(row.currency) ?? "CNY",
    deliveryType: textOrNull(row.delivery_type),
    createdAt: textOrNull(row.created_at),
    updatedAt: textOrNull(row.updated_at),
  };
}

function normalizeRecharge(row: Row) {
  return {
    id: String(row.id ?? ""),
    rechargeNo: textOrNull(row.recharge_no),
    channelName: textOrNull(row.channel_name) ?? textOrNull(row.channel_code),
    amount: finiteNumber(row.requested_amount ?? row.amount),
    creditedAmount: finiteNumber(row.credited_amount),
    currency: textOrNull(row.currency) ?? "CNY",
    status: textOrNull(row.status) ?? "pending",
    createdAt: textOrNull(row.created_at),
    paidAt: textOrNull(row.paid_at),
  };
}

function normalizeBalanceTransaction(row: Row) {
  return {
    id: String(row.id ?? ""),
    transactionNo: textOrNull(row.transaction_no),
    businessType: textOrNull(row.business_type),
    businessId: textOrNull(row.business_id),
    direction: textOrNull(row.direction) ?? "credit",
    amount: finiteNumber(row.amount),
    balanceBefore: numberOrNull(row.balance_before),
    balanceAfter: numberOrNull(row.balance_after),
    currency: textOrNull(row.currency) ?? "CNY",
    status: textOrNull(row.status) ?? "completed",
    remark: textOrNull(row.remark),
    createdAt: textOrNull(row.created_at),
  };
}

function normalizeDelivery(row: Row) {
  return {
    id: String(row.id ?? ""),
    orderId: textOrNull(row.order_id),
    orderItemId: textOrNull(row.order_item_id),
    productId: textOrNull(row.product_id),
    deliveryType: textOrNull(row.delivery_type),
    deliveryStatus: textOrNull(row.delivery_status),
    deliveredAt: textOrNull(row.delivered_at),
    viewedAt: textOrNull(row.viewed_at),
    createdAt: textOrNull(row.created_at),
    updatedAt: textOrNull(row.updated_at),
  };
}

function compactErrors(input: Record<string, string | null>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value)));
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}



