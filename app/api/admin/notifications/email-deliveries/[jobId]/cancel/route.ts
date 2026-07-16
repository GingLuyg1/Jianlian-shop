import { NextRequest, NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { auditEmailAdminAction, summarizeEmailError } from "@/lib/email/jobs";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
    const limit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "email_delivery_cancel"));
  if (!limit.allowed) return limit.response!;
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "后台服务未配置。" }, { status: 503 });

  const now = new Date().toISOString();
  const updated = await service
    .from("email_delivery_jobs")
    .update({ status: "cancelled", cancelled_at: now, next_retry_at: null, locked_at: null, locked_by: null })
    .eq("id", params.jobId)
    .in("status", ["pending", "retrying", "failed"])
    .select("id,template_code,business_no,status")
    .maybeSingle();
  if (updated.error) return NextResponse.json({ error: summarizeEmailError(updated.error) }, { status: 500 });
  if (!updated.data) return NextResponse.json({ error: "任务不存在、正在处理或已发送，不能取消。" }, { status: 409 });

  await auditEmailAdminAction({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "email_delivery_cancel",
    targetId: params.jobId,
    targetLabel: `${updated.data.template_code}:${updated.data.business_no ?? ""}`,
    result: "success",
    afterSummary: { status: "cancelled" },
  });
  return NextResponse.json({ job: updated.data });
}
