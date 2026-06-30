import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { buildPersonalDataExport, createPrivacyRequest, getCurrentUserPrivacySummary, getDeletionBlockers, privacyInitError } from "@/lib/privacy/privacy-service";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  reason?: string;
  clientRequestId?: string;
  confirmText?: string;
};

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireUser() {
  if (!hasSupabaseServerConfig()) return { ok: false as const, response: json({ error: "Supabase 环境变量未配置。" }, { status: 500 }) };
  const supabase = getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: json({ error: "请先登录。" }, { status: 401 }) };
  return { ok: true as const, supabase, user };
}

export async function GET() {
  const current = await requireUser();
  if (!current.ok) return current.response;

  try {
    const summary = await getCurrentUserPrivacySummary(current.supabase, current.user);
    return json(summary);
  } catch (error) {
    return json({ error: privacyInitError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const current = await requireUser();
  if (!current.ok) return current.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  const action = String(body?.action ?? "").trim();
  const requestId = String(body?.clientRequestId ?? crypto.randomUUID()).trim();

  try {
    if (action === "export_data") {
      const exportData = await buildPersonalDataExport(current.user.id);
      const service = getSupabaseServiceRoleClient();
      if (service) {
        await createPrivacyRequest({
          supabase: service,
          userId: current.user.id,
          requestType: "data_export",
          reason: "用户主动导出个人数据",
          clientRequestId: requestId,
          metadata: { format: "json", sections: Object.keys(exportData) },
        }).catch(() => null);
      }
      await writeAdminAuditLog({
        request,
        admin: { id: current.user.id, email: current.user.email ?? null },
        action: "export_own_personal_data",
        module: "privacy",
        targetType: "user",
        targetId: current.user.id,
        targetLabel: current.user.email ?? null,
        requestId,
        result: "success",
        afterSummary: { sections: Object.keys(exportData), errors: exportData.errors },
      });
      return json({ fileName: `jianlian-personal-data-${new Date().toISOString().slice(0, 10)}.json`, data: exportData });
    }

    if (action === "check_deletion") {
      const blockers = await getDeletionBlockers(current.supabase, current.user.id);
      return json(blockers);
    }

    if (action === "request_deletion") {
      if (body?.confirmText !== "确认注销") return json({ error: "请输入“确认注销”完成二次确认。" }, { status: 400 });
      const blockers = await getDeletionBlockers(current.supabase, current.user.id);
      const service = getSupabaseServiceRoleClient();
      if (!service) return json({ error: "服务端隐私请求能力未配置。" }, { status: 500 });
      const privacyRequest = await createPrivacyRequest({
        supabase: service,
        userId: current.user.id,
        requestType: "account_deletion",
        reason: body.reason ?? null,
        clientRequestId: requestId,
        metadata: { requestedBy: "user" },
      });
      const nextStatus = blockers.blocked ? "blocked" : "verifying";
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: nextStatus, block_reasons: blockers.reasons, updated_at: new Date().toISOString() })
        .eq("id", privacyRequest.id)
        .select("*")
        .single();
      if (error) throw error;
      const { error: eventError } = await service.from("privacy_request_events").insert({
        request_id: privacyRequest.id,
        user_id: current.user.id,
        event_type: blockers.blocked ? "deletion_blocked" : "deletion_requested",
        actor_type: "user",
        actor_id: current.user.id,
        message: blockers.blocked ? blockers.reasons.join("；") : "用户提交账号注销申请",
        metadata: { blockers },
      });
      if (eventError) console.warn("[Privacy] failed to write privacy request event", eventError.message);
      await writeAdminAuditLog({
        request,
        admin: { id: current.user.id, email: current.user.email ?? null },
        action: "request_account_deletion",
        module: "privacy",
        targetType: "privacy_request",
        targetId: privacyRequest.id,
        targetLabel: privacyRequest.requestNo,
        requestId,
        result: "success",
        afterSummary: { status: nextStatus, blockers: blockers.reasons },
      });
      return json({ request: data, blockers });
    }

    if (action === "cancel_deletion") {
      const service = getSupabaseServiceRoleClient();
      if (!service) return json({ error: "服务端隐私请求能力未配置。" }, { status: 500 });
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", current.user.id)
        .eq("request_type", "account_deletion")
        .in("status", ["requested", "verifying", "blocked", "approved"])
        .select("*");
      if (error) throw error;
      await writeAdminAuditLog({
        request,
        admin: { id: current.user.id, email: current.user.email ?? null },
        action: "cancel_account_deletion",
        module: "privacy",
        targetType: "user",
        targetId: current.user.id,
        requestId,
        result: "success",
        afterSummary: { cancelled: data?.length ?? 0 },
      });
      return json({ cancelled: data?.length ?? 0 });
    }

    return json({ error: "不支持的隐私操作。" }, { status: 400 });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: current.user.id, email: current.user.email ?? null },
      action: action || "privacy_action_failed",
      module: "privacy",
      targetType: "user",
      targetId: current.user.id,
      requestId,
      result: "failed",
      errorMessage: error,
    });
    return json({ error: privacyInitError(error) }, { status: 500 });
  }
}

