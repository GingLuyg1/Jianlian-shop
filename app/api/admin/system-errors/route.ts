import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getSafeErrorResponse } from "@/lib/monitoring/error-codes";
import { recordApiError } from "@/lib/monitoring/logger";
import { getRequestIdFromRequest, withRequestIdHeader } from "@/lib/monitoring/request-id";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const validLevels = new Set(["debug", "info", "warn", "error", "critical"]);
const validStatuses = new Set(["open", "investigating", "resolved", "ignored"]);

export async function GET(request: Request) {
  const requestId = getRequestIdFromRequest(request, "errors");
  const admin = await requireApiAdmin();
  if (!admin.ok) return withRequestIdHeader(admin.response, requestId);
  const params = new URL(request.url).searchParams;
  const page = clampNumber(params.get("page"), 1, 1, 100000);
  const pageSize = clampNumber(params.get("pageSize"), 20, 10, 100);
  const client = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    let query = client.from("system_error_events").select("*", { count: "exact" }).order("last_seen_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    const level = params.get("level")?.trim();
    const status = params.get("status")?.trim();
    const category = params.get("category")?.trim();
    const traceId = params.get("requestId")?.trim();
    const orderId = params.get("orderId")?.trim();
    const paymentId = params.get("paymentId")?.trim();
    const startAt = params.get("startAt")?.trim();
    const endAt = params.get("endAt")?.trim();
    if (level && validLevels.has(level)) query = query.eq("level", level);
    if (status && validStatuses.has(status)) query = query.eq("status", status);
    if (category) query = query.eq("category", category.slice(0, 40));
    if (traceId) query = query.ilike("request_id", `%${traceId.slice(0, 120)}%`);
    if (orderId) query = query.eq("order_id", orderId);
    if (paymentId) query = query.eq("payment_id", paymentId);
    if (startAt) query = query.gte("last_seen_at", startAt);
    if (endAt) query = query.lte("last_seen_at", endAt);
    const { data, error, count } = await query;
    if (error) throw error;
    return withRequestIdHeader(NextResponse.json({ success: true, events: data ?? [], count: count ?? 0, page, pageSize, request_id: requestId }, { headers: { "Cache-Control": "no-store" } }), requestId);
  } catch (error) {
    await recordApiError({ error, category: "system", event: "admin_system_errors_list_failed", route: "/api/admin/system-errors", method: "GET", statusCode: isSchemaMissing(error) ? 503 : 500, requestId, adminId: admin.user.id });
    const message = isSchemaMissing(error) ? "异常事件表尚未初始化，请先执行 system_error_events migration。" : "异常事件加载失败，请稍后重试。";
    return withRequestIdHeader(NextResponse.json({ ...getSafeErrorResponse("DATABASE_UNAVAILABLE", requestId, message), events: [], count: 0, page, pageSize }, { status: isSchemaMissing(error) ? 503 : 500 }), requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = getRequestIdFromRequest(request, "errors");
  const admin = await requireApiAdmin();
  if (!admin.ok) return withRequestIdHeader(admin.response, requestId);
  const body = (await request.json().catch(() => null)) as { id?: unknown; status?: unknown; resolutionNote?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const nextStatus = typeof body?.status === "string" ? body.status.trim() : "";
  const resolutionNote = typeof body?.resolutionNote === "string" ? body.resolutionNote.trim() : "";
  if (!id || !validStatuses.has(nextStatus)) return errorResponse("VALIDATION_FAILED", "异常处理参数不正确。", requestId, 400);
  if ((nextStatus === "resolved" || nextStatus === "ignored") && !resolutionNote) return errorResponse("VALIDATION_FAILED", "标记已解决或已忽略时必须填写处理说明。", requestId, 400);
  const client = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    const before = await client.from("system_error_events").select("id,title,status,resolution_note").eq("id", id).maybeSingle();
    if (before.error) throw before.error;
    if (!before.data) return errorResponse("INTERNAL_ERROR", "异常事件不存在。", requestId, 404);
    const updated = await client.from("system_error_events").update({ status: nextStatus, resolution_note: resolutionNote || null, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
    if (updated.error || !updated.data) throw updated.error ?? new Error("update returned no row");
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "update_system_error_status", module: "system", targetType: "system_error_event", targetId: id, targetLabel: String(before.data.title ?? id), result: "success", beforeSummary: before.data, afterSummary: { status: nextStatus, resolutionNote: resolutionNote || null } });
    return withRequestIdHeader(NextResponse.json({ success: true, event: updated.data, request_id: requestId }, { headers: { "Cache-Control": "no-store" } }), requestId);
  } catch (error) {
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "update_system_error_status", module: "system", targetType: "system_error_event", targetId: id, result: "failed", errorMessage: "异常状态更新失败" });
    await recordApiError({ error, category: "system", event: "admin_system_error_update_failed", route: "/api/admin/system-errors", method: "PATCH", statusCode: 500, requestId, adminId: admin.user.id, metadata: { id, nextStatus } });
    return errorResponse("INTERNAL_ERROR", "异常处理状态更新失败，请稍后重试。", requestId, 500);
  }
}

function errorResponse(code: "VALIDATION_FAILED" | "INTERNAL_ERROR", message: string, requestId: string, status: number) {
  return withRequestIdHeader(NextResponse.json(getSafeErrorResponse(code, requestId, message), { status }), requestId);
}
function clampNumber(value: string | null, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback; }
function isSchemaMissing(error: unknown) { const value = error as { message?: unknown; code?: unknown } | null; return /system_error_events|upsert_system_error_event|schema cache|Could not find the table/i.test(String(value?.message ?? "")) || ["42P01", "42703", "PGRST205"].includes(String(value?.code ?? "")); }
