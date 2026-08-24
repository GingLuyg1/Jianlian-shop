import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { maskEmail, normalizeRefundError } from "@/lib/refunds/refund-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const SEARCH_MATCH_LIMIT = 50;
const SEARCH_TOO_BROAD_MESSAGE = "搜索结果过多，请输入更完整的退款单号、订单号或用户邮箱。";

class RefundSearchTooBroadError extends Error {
  constructor() {
    super(SEARCH_TOO_BROAD_MESSAGE);
    this.name = "RefundSearchTooBroadError";
  }
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin;
  return admin;
}

function rowIds(rows: Row[] | null | undefined) {
  return Array.from(new Set((rows ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean)));
}

function boundedRowIds(rows: Row[] | null | undefined) {
  if ((rows?.length ?? 0) > SEARCH_MATCH_LIMIT) throw new RefundSearchTooBroadError();
  return rowIds(rows);
}

function refundReadError(error: unknown) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "").trim()
    : "";
  const normalized = raw ? normalizeRefundError(raw) : "";
  const message = !raw || normalized === raw
    ? "退款售后列表读取失败，请稍后重试。"
    : normalized;
  return json({ error: message }, { status: 503 });
}

async function findRefundIdsForSearch(supabase: SupabaseClient, q: string) {
  const pattern = `%${q}%`;
  const [refundMatches, orderMatches, profileMatches] = await Promise.all([
    supabase.from("refund_requests").select("id").ilike("refund_no", pattern).limit(SEARCH_MATCH_LIMIT + 1),
    supabase.from("orders").select("id").ilike("order_no", pattern).limit(SEARCH_MATCH_LIMIT + 1),
    supabase.from("profiles").select("id").ilike("email", pattern).limit(SEARCH_MATCH_LIMIT + 1),
  ]);

  if (refundMatches.error) throw refundMatches.error;
  if (orderMatches.error) throw orderMatches.error;
  if (profileMatches.error) throw profileMatches.error;

  const directRefundIds = boundedRowIds(refundMatches.data as Row[] | null);
  const orderIds = boundedRowIds(orderMatches.data as Row[] | null);
  const userIds = boundedRowIds(profileMatches.data as Row[] | null);
  const [orderRefundMatches, userRefundMatches] = await Promise.all([
    orderIds.length
      ? supabase.from("refund_requests").select("id").in("order_id", orderIds).limit(SEARCH_MATCH_LIMIT + 1)
      : Promise.resolve({ data: [] as Row[], error: null }),
    userIds.length
      ? supabase.from("refund_requests").select("id").in("user_id", userIds).limit(SEARCH_MATCH_LIMIT + 1)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);

  if (orderRefundMatches.error) throw orderRefundMatches.error;
  if (userRefundMatches.error) throw userRefundMatches.error;

  const matchingRefundIds = Array.from(new Set([
    ...directRefundIds,
    ...boundedRowIds(orderRefundMatches.data as Row[] | null),
    ...boundedRowIds(userRefundMatches.data as Row[] | null),
  ]));
  if (matchingRefundIds.length > SEARCH_MATCH_LIMIT) throw new RefundSearchTooBroadError();
  return matchingRefundIds;
}

async function loadProfilesById(supabase: SupabaseClient, rows: Row[]) {
  const userIds = Array.from(new Set(rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean)));
  if (!userIds.length) return new Map<string, Row>();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name")
    .in("id", userIds);
  if (error) throw error;

  return new Map(
    ((data ?? []) as Row[]).map((profile) => [String(profile.id ?? ""), profile]),
  );
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return json({ error: "退款售后服务暂时不可用，请稍后重试。" }, { status: 503 });
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
    const matchingRefundIds = q ? await findRefundIdsForSearch(supabase, q) : null;
    if (matchingRefundIds && matchingRefundIds.length === 0) {
      return json({ refunds: [], total: 0, page, pageSize });
    }

    let query = supabase
      .from("refund_requests")
      .select("*,orders(order_no,total_amount,currency,status,payment_status,payment_method,delivery_type,created_at)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (channel && channel !== "all") query = query.eq("refund_method", channel);
    if (start) query = query.gte("created_at", start);
    if (end) query = query.lte("created_at", end);
    if (matchingRefundIds) query = query.in("id", matchingRefundIds);

    const { data, error, count } = await query;
    if (error) return refundReadError(error);

    const refundRows = (data ?? []) as Row[];
    const profilesById = await loadProfilesById(supabase, refundRows);
    const rows = refundRows.map((row) => normalizeAdminRefund(
      row,
      profilesById.get(String(row.user_id ?? "")) ?? null,
    )).filter((row) => {
      if (delivered === "yes") return row.deliveryDelivered;
      if (delivered === "no") return !row.deliveryDelivered;
      return true;
    });

    return json({ refunds: rows, total: count ?? rows.length, page, pageSize });
  } catch (error) {
    if (error instanceof RefundSearchTooBroadError) {
      return json({ error: SEARCH_TOO_BROAD_MESSAGE }, { status: 400 });
    }
    console.error("[Admin Refunds] list failed", error);
    return refundReadError(error);
  }
}

function normalizeAdminRefund(row: Row, profile: Row | null) {
  const order = row.orders && typeof row.orders === "object" ? (row.orders as Row) : null;
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
