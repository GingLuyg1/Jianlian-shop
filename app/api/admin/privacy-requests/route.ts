import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { normalizePrivacyRequest, privacyInitError } from "@/lib/privacy/privacy-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

type PatchBody = {
  action?: string;
  requestId?: string;
  note?: string;
};

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function requireService() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端隐私管理能力未配置。");
  return service;
}

async function requireSuperAdmin() {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin;
  if ((admin.user.email ?? admin.profile.email ?? "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { ok: false as const, response: json({ error: "只有超级管理员可以处理隐私请求。" }, { status: 403 }) };
  }
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const type = searchParams.get("type") || "all";
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 30), 1), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const service = requireService();
    let query = service
      .from("privacy_requests")
      .select("*, profiles:user_id(email, display_name, account_status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status !== "all") query = query.eq("status", status);
    if (type !== "all") query = query.eq("request_type", type);
    if (q) query = query.or(`request_no.ilike.%${q}%,reason_detail.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return json({
      requests: (data ?? []).map((row) => normalizePrivacyRequest(row)),
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    return json({ error: privacyInitError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const action = String(body?.action || "").trim();
  const requestId = String(body?.requestId || "").trim();
  const note = String(body?.note || "").trim();
  const auditRequestId = crypto.randomUUID();

  if (!requestId) return json({ error: "缺少隐私请求 ID。" }, { status: 400 });
  if (["approve", "reject", "processing", "complete_anonymize"].includes(action) && !note) {
    return json({ error: "请填写处理备注。" }, { status: 400 });
  }

  try {
    const service = requireService();
    const { data: current, error: loadError } = await service
      .from("privacy_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (loadError) throw loadError;

    let updated: unknown = null;
    const now = new Date().toISOString();

    if (action === "recheck") {
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: current.block_reasons?.length ? "blocked" : "verifying", reviewed_by: admin.user.id, review_note: note || null, reviewed_at: now, updated_at: now })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error) throw error;
      updated = data;
    } else if (action === "approve") {
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: "approved", reviewed_by: admin.user.id, review_note: note, reviewed_at: now, updated_at: now })
        .eq("id", requestId)
        .in("status", ["requested", "verifying", "blocked"])
        .select("*")
        .single();
      if (error) throw error;
      updated = data;
    } else if (action === "reject") {
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: "failed", failed_at: now, reviewed_by: admin.user.id, review_note: note, reviewed_at: now, updated_at: now })
        .eq("id", requestId)
        .not("status", "in", "(completed,cancelled)")
        .select("*")
        .single();
      if (error) throw error;
      updated = data;
    } else if (action === "processing") {
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: "processing", reviewed_by: admin.user.id, review_note: note, reviewed_at: now, updated_at: now })
        .eq("id", requestId)
        .in("status", ["approved", "verifying"])
        .select("*")
        .single();
      if (error) throw error;
      updated = data;
    } else if (action === "cancel") {
      const { data, error } = await service
        .from("privacy_requests")
        .update({ status: "cancelled", cancelled_at: now, reviewed_by: admin.user.id, review_note: note || "管理员取消", reviewed_at: now, updated_at: now })
        .eq("id", requestId)
        .not("status", "in", "(completed,cancelled)")
        .select("*")
        .single();
      if (error) throw error;
      updated = data;
    } else if (action === "complete_anonymize") {
      const { data, error } = await service.rpc("anonymize_user_account", {
        p_request_id: requestId,
        p_admin_id: admin.user.id,
        p_reason: note,
      });
      if (error) throw error;
      updated = data;
    } else {
      return json({ error: "不支持的隐私处理操作。" }, { status: 400 });
    }

    const { error: eventError } = await service.from("privacy_request_events").insert({
      request_id: requestId,
      user_id: current.user_id,
      actor_type: "admin",
      actor_id: admin.user.id,
      event_type: action,
      message: note || action,
      metadata: { beforeStatus: current.status },
    });
    if (eventError) console.warn("[PrivacyAdmin] failed to write privacy request event", eventError.message);

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? admin.profile.email ?? null },
      action: `privacy_${action}`,
      module: "privacy",
      targetType: "privacy_request",
      targetId: requestId,
      targetLabel: current.request_no,
      requestId: auditRequestId,
      result: "success",
      beforeSummary: { status: current.status },
      afterSummary: updated,
      metadata: { note },
    });

    return json({ ok: true, request: updated });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? admin.profile.email ?? null },
      action: action || "privacy_action_failed",
      module: "privacy",
      targetType: "privacy_request",
      targetId: requestId,
      requestId: auditRequestId,
      result: "failed",
      errorMessage: error,
    });
    return json({ error: privacyInitError(error) }, { status: 500 });
  }
}

