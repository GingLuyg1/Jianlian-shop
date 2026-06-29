import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { requireApiAdmin } from "@/lib/admin/api-auth";
import { recordApiError } from "@/lib/monitoring/logger";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const validLevels = new Set(["debug", "info", "warn", "error", "critical"]);
const validStatuses = new Set(["open", "investigating", "resolved", "ignored"]);

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const searchParams = new URL(request.url).searchParams;
  const page = clampNumber(searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampNumber(searchParams.get("pageSize"), 20, 10, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const service = getSupabaseServiceRoleClient();
  const client = service ?? admin.supabase;

  try {
    let query = client
      .from("system_error_events")
      .select("*", { count: "exact" })
      .order("last_seen_at", { ascending: false })
      .range(from, to);

    const level = searchParams.get("level")?.trim();
    const status = searchParams.get("status")?.trim();
    const category = searchParams.get("category")?.trim();
    const requestId = searchParams.get("requestId")?.trim();
    const orderId = searchParams.get("orderId")?.trim();
    const paymentId = searchParams.get("paymentId")?.trim();
    const startAt = searchParams.get("startAt")?.trim();
    const endAt = searchParams.get("endAt")?.trim();

    if (level && validLevels.has(level)) query = query.eq("level", level);
    if (status && validStatuses.has(status)) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (requestId) query = query.ilike("request_id", `%${requestId}%`);
    if (orderId) query = query.eq("order_id", orderId);
    if (paymentId) query = query.eq("payment_id", paymentId);
    if (startAt) query = query.gte("last_seen_at", startAt);
    if (endAt) query = query.lte("last_seen_at", endAt);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      events: data ?? [],
      count: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    const requestId = await recordApiError({
      error,
      category: "system",
      event: "admin_system_errors_list_failed",
      route: "/api/admin/system-errors",
      method: "GET",
      statusCode: isSystemErrorSchemaMissing(error) ? 503 : 500,
      adminId: admin.user.id,
    });
    return NextResponse.json(
      {
        error: isSystemErrorSchemaMissing(error)
          ? "异常事件表尚未初始化，请先执行 system_error_events migration。"
          : "异常事件加载失败，请稍后重试。",
        requestId,
        events: [],
        count: 0,
        page,
        pageSize,
      },
      { status: isSystemErrorSchemaMissing(error) ? 503 : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as
    | { id?: string; status?: string; resolutionNote?: string }
    | null;
  const id = body?.id?.trim();
  const nextStatus = body?.status?.trim();
  const resolutionNote = body?.resolutionNote?.trim() || null;

  if (!id || !nextStatus || !validStatuses.has(nextStatus)) {
    return NextResponse.json({ error: "异常处理参数不正确" }, { status: 400 });
  }

  const service = getSupabaseServiceRoleClient();
  const client = service ?? admin.supabase;

  try {
    const before = await client
      .from("system_error_events")
      .select("id,title,status,resolution_note")
      .eq("id", id)
      .maybeSingle();
    if (before.error) throw before.error;
    if (!before.data) return NextResponse.json({ error: "异常事件不存在" }, { status: 404 });

    const { data, error } = await client
      .from("system_error_events")
      .update({
        status: nextStatus,
        resolution_note: resolutionNote,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_system_error_status",
      module: "system",
      targetType: "system_error_event",
      targetId: id,
      targetLabel: String(before.data.title ?? id),
      result: "success",
      beforeSummary: before.data,
      afterSummary: { status: nextStatus, resolutionNote },
    });

    return NextResponse.json({ event: data });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "update_system_error_status",
      module: "system",
      targetType: "system_error_event",
      targetId: id,
      result: "failed",
      errorMessage: error,
    });
    const requestId = await recordApiError({
      error,
      category: "system",
      event: "admin_system_error_update_failed",
      route: "/api/admin/system-errors",
      method: "PATCH",
      statusCode: 500,
      adminId: admin.user.id,
      metadata: { id, nextStatus },
    });
    return NextResponse.json({ error: "异常处理状态更新失败，请稍后重试。", requestId }, { status: 500 });
  }
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function isSystemErrorSchemaMissing(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /system_error_events|upsert_system_error_event|schema cache|Could not find the table/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}
