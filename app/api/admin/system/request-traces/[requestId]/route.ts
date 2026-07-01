import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { recordApiError } from "@/lib/monitoring/logger";
import { validateRequestId, withRequestIdHeader } from "@/lib/monitoring/request-id";
import { loadRequestTrace } from "@/lib/monitoring/trace-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { requestId: string } }) {
  const safeRequestId = validateRequestId(params.requestId);
  if (!safeRequestId) {
    const response = NextResponse.json({ error: "Request ID 不合法或过长。" }, { status: 400 });
    response.headers.set("X-Request-ID", "invalid-request-id");
    return response;
  }

  const admin = await requireApiAdmin();
  if (!admin.ok) return withRequestIdHeader(admin.response, safeRequestId);

  const client = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    const payload = await loadRequestTrace(client, safeRequestId);
    const response = NextResponse.json(payload);
    return withRequestIdHeader(response, safeRequestId);
  } catch (error) {
    await recordApiError({
      error,
      category: "system",
      event: "admin_request_trace_load_failed",
      route: `/api/admin/system/request-traces/${safeRequestId}`,
      method: "GET",
      statusCode: 500,
      requestId: safeRequestId,
      adminId: admin.user.id,
    });
    const response = NextResponse.json(
      { error: "请求链路加载失败，请稍后重试。", requestId: safeRequestId, events: [], moduleErrors: {} },
      { status: 500 }
    );
    return withRequestIdHeader(response, safeRequestId);
  }
}
