import { NextResponse } from "next/server";

import { formatMoney, normalizeRefundError } from "@/lib/refunds/refund-utils";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
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

export async function POST(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) return json({ error: "Supabase 环境变量未配置。" }, { status: 500 });

    const supabase = getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "请先登录。" }, { status: 401 });

    const sizeError = checkRequestSize(request, 12 * 1024);
    if (sizeError) return sizeError;
    const rateLimit = checkRateLimit("refund_create", getUserRateLimitKey(user.id, "refund_create"));
    if (!rateLimit.allowed) return rateLimit.response!;

    const body = (await request.json().catch(() => null)) as
      | { orderNo?: string; reasonCode?: string; reasonDetail?: string; requestedAmount?: number; contactInfo?: string; clientRequestId?: string }
      | null;

    const orderNo = body?.orderNo?.trim();
    const reasonCode = body?.reasonCode?.trim() || "other";
    const requestedAmount = Number(body?.requestedAmount ?? 0);
    if (!orderNo) return json({ error: "缺少订单编号。" }, { status: 400 });
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return json({ error: "退款金额必须大于 0。" }, { status: 400 });

    const { data, error } = await supabase.rpc("create_refund_request", {
      p_order_no: orderNo,
      p_reason_code: reasonCode,
      p_reason_detail: body?.reasonDetail ?? null,
      p_requested_amount: requestedAmount,
      p_contact_info: body?.contactInfo ?? null,
      p_client_request_id: body?.clientRequestId ?? crypto.randomUUID(),
    });

    if (error) return json({ error: normalizeRefundError(error.message) }, { status: 400 });

    return json({ refund: normalizeUserRefund(data as Row), message: `退款申请已提交，金额 ${formatMoney(requestedAmount)}。` });
  } catch (error) {
    console.error("[Refunds] create failed", error);
    return json({ error: "退款申请提交失败，请稍后重试。" }, { status: 500 });
  }
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
