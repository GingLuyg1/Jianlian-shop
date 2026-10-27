import { NextResponse } from "next/server";

import { normalizeRefundError } from "@/lib/refunds/refund-utils";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) return json({ error: "Supabase 环境变量未配置。" }, { status: 500 });

    const supabase = getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "请先登录。" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("orderNo")?.trim();
    const status = searchParams.get("status")?.trim();
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 10), 1), 50);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("refund_requests")
      .select("*,orders(order_no,total_amount,currency,status,payment_status,created_at)", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") query = query.eq("status", status);
    if (orderNo) query = query.eq("orders.order_no", orderNo);

    const { data, error, count } = await query;
    if (error) return json({ error: normalizeRefundError(error.message) }, { status: 503 });

    return json({
      refunds: (data ?? []).map(normalizeUserRefund),
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("[Refunds] list failed", error);
    return json({ error: "退款记录读取失败，请稍后重试。" }, { status: 500 });
  }
}

export async function POST() {
  // Closed for every customer, including old clients. Do not parse a body,
  // acquire a database client or invoke financial/risk workflows here.
  return json(
    { code: "CUSTOMER_REFUND_REQUEST_DISABLED", error: "退款及售后请联系人工客服，由管理员审核处理。" },
    { status: 410, headers: { Allow: "GET", "Cache-Control": "no-store" } }
  );
}

function normalizeUserRefund(row: Row) {
  const order = row.orders && typeof row.orders === "object" ? (row.orders as Row) : null;
  return {
    id: String(row.id ?? ""),
    refundNo: String(row.refund_no ?? ""),
    orderNo: String(order?.order_no ?? row.order_no ?? ""),
    requestedAmount: money(row.requested_amount),
    approvedAmount: row.approved_amount == null ? null : money(row.approved_amount),
    currency: String(row.currency ?? order?.currency ?? "CNY"),
    status: String(row.status ?? "requested"),
    reasonCode: String(row.reason_code ?? "other"),
    reasonDetail: text(row.reason_detail),
    reviewNote: text(row.user_visible_note),
    refundMethod: String(row.refund_method ?? "balance"),
    createdAt: text(row.created_at),
    reviewedAt: text(row.reviewed_at),
    completedAt: text(row.completed_at),
  };
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
