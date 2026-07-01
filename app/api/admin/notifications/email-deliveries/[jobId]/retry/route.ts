import { NextRequest, NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { auditEmailAdminAction, processEmailDeliveryJob, summarizeEmailError } from "@/lib/email/jobs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message }, { status: admin.status });
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await auditEmailAdminAction({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "email_delivery_retry_denied", targetId: params.jobId, result: "denied" });
    return json({ error: "无权重试邮件发送。" }, { status: 403 });
  }
  const limit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "email_delivery_retry"));
  if (!limit.allowed) return limit.response!;

  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "后台服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" }, { status: 503 });
  const loaded = await service.from("email_delivery_jobs").select("id,status,template_code,business_no").eq("id", params.jobId).maybeSingle();
  if (loaded.error) return json({ error: summarizeEmailError(loaded.error) }, { status: 500 });
  if (!loaded.data) return json({ error: "邮件任务不存在。" }, { status: 404 });
  if (loaded.data.status === "sent") return json({ error: "已发送任务不能重试。" }, { status: 400 });
  if (loaded.data.status === "cancelled") return json({ error: "已取消任务不能重试。" }, { status: 400 });

  const result = await processEmailDeliveryJob(params.jobId, "admin_retry");
  await auditEmailAdminAction({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "email_delivery_retry",
    targetId: params.jobId,
    targetLabel: `${loaded.data.template_code}:${loaded.data.business_no ?? ""}`,
    result: result.ok ? "success" : "failed",
    afterSummary: result.ok ? { status: result.job?.status } : null,
    errorMessage: result.ok ? null : result.error,
  });
  if (!result.ok) return json({ error: result.error ?? "邮件重试失败。" }, { status: 500 });
  return json({ job: result.job });
}
