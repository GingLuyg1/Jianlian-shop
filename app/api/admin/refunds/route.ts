import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { maskEmail, normalizeRefundError } from "@/lib/refunds/refund-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin;
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();
  const channel = searchParams.get("channel")?.trim();
  const delivered = searchParams.get("delivered")?.trim();
  const start = searchParams.get("start")?.trim();
  const end = searchParams.get("end")?.trim();
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 20), 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from("refund_requests")
      .select("*,orders(order_no,total_amount,currency,status,payment_status,payment_method,delivery_type,created_at),profiles(email,display_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (channel && channel !== "all") query = query.eq("refund_method", channel);
    if (start) query = query.gte("created_at", start);
    if (end) query = query.lte("created_at", end);
    if (q) query = query.or(`refund_no.ilike.%${q}%,orders.order_no.ilike.%${q}%,profiles.email.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) return json({ error: normalizeRefundError(error.message) }, { status: 503 });

    const rows = (data ?? []).map(normalizeAdminRefund).filter((row) => {
      if (delivered === "yes") return row.deliveryDelivered;
      if (delivered === "no") return !row.deliveryDelivered;
      return true;
    });

    return json({ refunds: rows, total: count ?? rows.length, page, pageSize });
  } catch (error) {
    console.error("[Admin Refunds] list failed", error);
    return json({ error: "退款售后列表读取失败，请稍后重试。" }, { status: 500 });
  }
}

function normalizeAdminRefund(row: Row) {
  const order = row.orders && typeof row.orders === "object" ? (row.orders as Row) : null;
  const profile = row.profiles && typeof row.profiles === "object" ? (row.profiles as Row) : null;
  const snapshot = row.delivery_status_snapshot && typeof row.delivery_status_snapshot === "object" ? (row.delivery_status_snapshot as Row) : {};
  const deliveredCount = Number(snapshot.delivered_count ?? 0);
  const requested = money(row.requested_amount);
  const approved = row.approved_amount == null ? null : money(row.approved_amount);
  const createdAt = text(row.created_at);
  return {
    id: String(row.id ?? ""),
    refundNo: String(row.refund_no ?? ""),
    orderNo: String(order?.order_no ?? ""),
    userId: String(row.user_id ?? ""),
    userEmail: String(profile?.email ?? ""),
    userLabel: maskEmail(profile?.email),
    requestedAmount: requested,
    approvedAmount: approved,
    currency: String(row.currency ?? order?.currency ?? "CNY"),
    paymentMethod: String(order?.payment_method ?? "-"),
    refundMethod: String(row.refund_method ?? "balance"),
    reasonCode: String(row.reason_code ?? "other"),
    reasonDetail: text(row.reason_detail),
    contactInfo: text(row.contact_info),
    status: String(row.status ?? "requested"),
    providerRefundId: text(row.provider_refund_id),
    providerStatus: text(row.provider_status),
    deliveryDelivered: deliveredCount > 0,
    deliverySnapshot: snapshot,
    reviewNote: text(row.review_note),
    userVisibleNote: text(row.user_visible_note),
    createdAt,
    reviewedAt: text(row.reviewed_at),
    completedAt: text(row.completed_at),
    failedAt: text(row.failed_at),
    waitHours: createdAt ? Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 36_000) / 100) : null,
    order,
  };
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
