import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getAuditErrorMessage } from "@/lib/admin/audit-log-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const PRIVACY_REQUEST_STATUSES = ["requested", "verifying", "blocked", "approved", "processing", "completed", "cancelled", "failed"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];
export type PrivacyRequestType = "data_export" | "account_deletion";

type Row = Record<string, any>;

export const PRIVACY_DATA_CLASSIFICATION = [
  { group: "可导出数据", items: ["profiles 基本资料", "orders 订单摘要", "order_items 商品快照", "account_recharges 充值记录", "balance_transactions 余额流水", "refund_requests 退款记录", "order_deliveries 交付记录摘要", "user_notifications 通知记录"] },
  { group: "内部安全数据", items: ["admin_audit_logs 管理员操作记录", "user_risk_records 风控记录", "支付回调原文", "内部处理备注", "访问风控细节"] },
  { group: "注销后保留数据", items: ["历史订单", "支付和充值记录", "余额流水", "退款记录", "交付审计", "管理员审计记录"] },
  { group: "可匿名化字段", items: ["email", "display_name", "phone", "avatar_url", "recipient_name", "shipping_address", "country"] },
];

export function privacyInitError(error: unknown) {
  const message = getAuditErrorMessage(error, "");
  if (/privacy_requests|privacy_request_events|schema cache|PGRST205|42P01|42883|42703|Could not find/i.test(message)) {
    return "隐私系统数据库结构尚未初始化，请管理员执行 privacy_account_controls migration。";
  }
  if (/permission|policy|unauthorized|forbidden/i.test(message)) return "无权限执行该隐私操作。";
  return message || "隐私操作失败，请稍后重试。";
}

export function makePrivacyRequestNo(prefix = "PR") {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}${stamp}${Math.floor(1000 + Math.random() * 9000)}`;
}

export function maskEmail(email: string | null | undefined) {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  if (!domain) return email.slice(0, 2) + "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

export async function getCurrentUserPrivacySummary(supabase: SupabaseClient, user: Pick<User, "id" | "email" | "created_at">) {
  const [profile, orders, recharges, balance, refunds, deliveries, notifications, requests] = await Promise.all([
    safeMaybe(supabase.from("profiles").select("id,email,display_name,phone,country,recipient_name,avatar_url,created_at,updated_at,account_status,risk_status,balance").eq("id", user.id).maybeSingle()),
    safeCount(supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeCount(supabase.from("account_recharges").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeCount(supabase.from("balance_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeCount(supabase.from("refund_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeCount(supabase.from("order_deliveries").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeCount(supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id)),
    safeRows(supabase.from("privacy_requests").select("id,request_no,request_type,status,block_reasons,created_at,updated_at,cooldown_until,completed_at,cancelled_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)),
  ]);

  const profileRow = (profile.data ?? {}) as Row;
  return {
    profile: {
      email: profileRow.email ?? user.email ?? null,
      displayName: profileRow.display_name ?? null,
      accountStatus: profileRow.account_status ?? "active",
      riskStatus: profileRow.risk_status ?? "normal",
      balance: money(profileRow.balance),
      createdAt: profileRow.created_at ?? user.created_at ?? null,
      updatedAt: profileRow.updated_at ?? null,
    },
    counts: {
      orders: orders.count,
      recharges: recharges.count,
      balanceTransactions: balance.count,
      refunds: refunds.count,
      deliveries: deliveries.count,
      notifications: notifications.count,
    },
    requests: requests.rows.map(normalizePrivacyRequest),
    recentRequests: requests.rows.map(normalizePrivacyRequest),
    errors: compactErrors({ profile: profile.error, orders: orders.error, recharges: recharges.error, balance: balance.error, refunds: refunds.error, deliveries: deliveries.error, notifications: notifications.error, requests: requests.error }),
    classification: PRIVACY_DATA_CLASSIFICATION,
  };
}

export async function buildPersonalDataExport(userId: string) {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端数据导出能力未配置。");

  const [profile, orders, recharges, balanceTransactions, refunds, deliveries, notifications] = await Promise.all([
    safeMaybe(service.from("profiles").select("id,email,display_name,phone,country,recipient_name,avatar_url,created_at,updated_at,account_status,risk_status,balance").eq("id", userId).maybeSingle()),
    safeRows(service.from("orders").select("id,order_no,total_amount,currency,status,payment_status,delivery_method,customer_email,customer_note,created_at,updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000)),
    safeRows(service.from("account_recharges").select("recharge_no,channel_name,currency,requested_amount,credited_amount,status,created_at,paid_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000)),
    safeRows(service.from("balance_transactions").select("transaction_no,business_type,direction,amount,balance_before,balance_after,currency,status,remark,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000)),
    safeRows(service.from("refund_requests").select("refund_no,reason_code,reason_detail,requested_amount,approved_amount,currency,status,user_visible_note,created_at,completed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000)),
    safeRows(service.from("order_deliveries").select("delivery_type,delivery_status,delivered_at,viewed_at,created_at,updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000)),
    safeRows(service.from("user_notifications").select("title,message,status,created_at,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000)),
  ]);

  const orderIds = orders.rows.map((row) => String(row.id ?? "")).filter(Boolean);
  const orderItems = orderIds.length
    ? await safeRows(service.from("order_items").select("order_id,product_name,sku_name,quantity,unit_price,total_price,created_at").in("order_id", orderIds).limit(5000))
    : { rows: [], error: null };

  const errors = compactErrors({ profile: profile.error, orders: orders.error, orderItems: orderItems.error, recharges: recharges.error, balanceTransactions: balanceTransactions.error, refunds: refunds.error, deliveries: deliveries.error, notifications: notifications.error });
  return {
    exportedAt: new Date().toISOString(),
    scope: "当前登录用户个人数据导出",
    profile: sanitizeExportProfile(profile.data as Row | null),
    orders: orders.rows,
    orderItems: orderItems.rows,
    recharges: recharges.rows,
    balanceTransactions: balanceTransactions.rows,
    refunds: refunds.rows,
    deliveries: deliveries.rows,
    notifications: notifications.rows,
    errors,
  };
}

export async function createPrivacyRequest(input: { supabase: SupabaseClient; userId: string; requestType: PrivacyRequestType; reason?: string | null; clientRequestId?: string | null; metadata?: Row }) {
  const requestNo = makePrivacyRequestNo(input.requestType === "data_export" ? "PE" : "PD");
  const row = {
    request_no: requestNo,
    user_id: input.userId,
    request_type: input.requestType,
    status: input.requestType === "data_export" ? "completed" : "requested",
    reason_detail: input.reason ?? null,
    client_request_id: input.clientRequestId || randomUUID(),
    metadata: input.metadata ?? {},
    completed_at: input.requestType === "data_export" ? new Date().toISOString() : null,
  };
  const { data, error } = await input.supabase.from("privacy_requests").insert(row).select("*").single();
  if (error) throw new Error(privacyInitError(error));
  return normalizePrivacyRequest(data as Row);
}

export async function getDeletionBlockers(supabase: SupabaseClient, userId: string) {
  const [ordersPending, ordersPaidUndelivered, refundsPending, rechargesPending, deliveriesPending, profile] = await Promise.all([
    safeRows(supabase.from("orders").select("id,order_no,status,payment_status").eq("user_id", userId).in("status", ["pending", "pending_payment", "processing", "paid", "awaiting_delivery"]).limit(20)),
    safeRows(supabase.from("orders").select("id,order_no,status,payment_status,delivery_status").eq("user_id", userId).eq("payment_status", "paid").in("delivery_status", ["pending", "processing", "partial"]).limit(20)),
    safeRows(supabase.from("refund_requests").select("id,refund_no,status").eq("user_id", userId).in("status", ["requested", "reviewing", "approved", "processing"]).limit(20)),
    safeRows(supabase.from("account_recharges").select("id,recharge_no,status").eq("user_id", userId).in("status", ["pending", "processing"]).limit(20)),
    safeRows(supabase.from("order_deliveries").select("id,delivery_status").eq("user_id", userId).in("delivery_status", ["pending", "failed"]).limit(20)),
    safeMaybe(supabase.from("profiles").select("balance,risk_status,account_status").eq("id", userId).maybeSingle()),
  ]);
  const reasons: string[] = [];
  if (ordersPending.rows.length) reasons.push("存在待支付或处理中订单");
  if (ordersPaidUndelivered.rows.length) reasons.push("存在已支付但未交付订单");
  if (refundsPending.rows.length) reasons.push("存在待处理退款");
  if (rechargesPending.rows.length) reasons.push("存在处理中充值");
  if (deliveriesPending.rows.length) reasons.push("存在待处理交付内容");
  const profileRow = (profile.data ?? {}) as Row;
  if (money(profileRow.balance) !== 0) reasons.push("账户余额不为 0");
  if (["blocked", "high_risk"].includes(String(profileRow.risk_status ?? "normal"))) reasons.push("账户存在安全调查或风控拦截");
  const errors = compactErrors({ ordersPending: ordersPending.error, ordersPaidUndelivered: ordersPaidUndelivered.error, refundsPending: refundsPending.error, rechargesPending: rechargesPending.error, deliveriesPending: deliveriesPending.error, profile: profile.error });
  return { blocked: reasons.length > 0, reasons, errors };
}

export function normalizePrivacyRequest(row: Row) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: String(row.id ?? ""),
    requestNo: String(row.request_no ?? ""),
    userId: String(row.user_id ?? ""),
    userEmail: text(profile?.email),
    userLabel: text(profile?.display_name) ?? maskEmail(profile?.email),
    requestType: String(row.request_type ?? ""),
    status: String(row.status ?? "requested"),
    blockReasons: Array.isArray(row.block_reasons) ? row.block_reasons : [],
    reasonDetail: text(row.reason_detail),
    reviewNote: text(row.review_note),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    cooldownUntil: text(row.cooldown_until),
    completedAt: text(row.completed_at),
    cancelledAt: text(row.cancelled_at),
  };
}

async function safeMaybe(query: PromiseLike<{ data: unknown; error: unknown }>) {
  try {
    const { data, error } = await query;
    return { data, error: error ? privacyInitError(error) : null };
  } catch (error) {
    return { data: null, error: privacyInitError(error) };
  }
}

async function safeRows(query: PromiseLike<{ data: unknown; error: unknown }>) {
  try {
    const { data, error } = await query;
    return { rows: Array.isArray(data) ? (data as Row[]) : [], error: error ? privacyInitError(error) : null };
  } catch (error) {
    return { rows: [], error: privacyInitError(error) };
  }
}

async function safeCount(query: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await query;
    return { count: count ?? 0, error: error ? privacyInitError(error) : null };
  } catch (error) {
    return { count: 0, error: privacyInitError(error) };
  }
}

function compactErrors(input: Record<string, string | null>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value)));
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeExportProfile(profile: Row | null) {
  if (!profile) return null;
  return {
    email: profile.email ?? null,
    displayName: profile.display_name ?? null,
    phone: profile.phone ?? null,
    country: profile.country ?? null,
    recipientName: profile.recipient_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    balance: money(profile.balance),
    accountStatus: profile.account_status ?? "active",
    riskStatus: profile.risk_status ?? "normal",
    createdAt: profile.created_at ?? null,
    updatedAt: profile.updated_at ?? null,
  };
}
