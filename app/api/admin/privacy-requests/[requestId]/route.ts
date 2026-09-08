import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { normalizePrivacyRequest, privacyInitError } from "@/lib/privacy/privacy-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type RouteContext = { params: { requestId: string } };
type Row = Record<string, unknown>;

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;
  const requestId = context.params.requestId;
  if (!isUuid(requestId)) return json({ error: "隐私请求 ID 格式无效。" }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "服务端隐私管理能力未配置。" }, { status: 503 });

  try {
    const [{ data: requestRow, error: requestError }, eventsResult, auditResult] = await Promise.all([
      service
        .from("privacy_requests")
        .select("id,request_no,user_id,request_type,status,reason_detail,block_reasons,review_note,reviewed_by,reviewed_at,cooldown_until,completed_at,cancelled_at,failed_at,created_at,updated_at,profiles:user_id(id,email,display_name,account_status)")
        .eq("id", requestId)
        .maybeSingle(),
      service
        .from("privacy_request_events")
        .select("id,request_id,user_id,actor_type,actor_id,event_type,message,created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("admin_audit_logs")
        .select("id,admin_email,action,module,target_type,target_id,target_label,result,request_id,reason,created_at")
        .eq("target_id", requestId)
        .eq("target_type", "privacy_request")
        .eq("module", "privacy")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (requestError) throw requestError;
    if (!requestRow) return json({ error: "隐私请求不存在。" }, { status: 404 });

    return json({
      request: normalizePrivacyRequest(requestRow as Row),
      events: ((eventsResult.data ?? []) as Row[]).map(normalizeEvent),
      auditLogs: (auditResult.data ?? []) as Row[],
      errors: compactErrors({
        events: eventsResult.error ? "请求时间线读取失败" : null,
        auditLogs: auditResult.error ? "后台审计读取失败" : null,
      }),
    });
  } catch (error) {
    const message = privacyInitError(error);
    const safeMessage = message.includes("数据库结构尚未初始化") || message.includes("无权限")
      ? message
      : "隐私请求详情加载失败，请稍后重试。";
    return json({ error: safeMessage }, { status: 500 });
  }
}

function normalizeEvent(row: Row) {
  return {
    id: String(row.id ?? ""),
    requestId: text(row.request_id),
    userId: text(row.user_id),
    actorType: text(row.actor_type) ?? "system",
    actorId: text(row.actor_id),
    eventType: text(row.event_type) ?? "unknown",
    message: text(row.message),
    createdAt: text(row.created_at),
  };
}

function compactErrors(input: Record<string, string | null>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value)));
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
