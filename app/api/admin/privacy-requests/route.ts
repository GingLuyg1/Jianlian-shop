import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { normalizePrivacyRequest, privacyInitError } from "@/lib/privacy/privacy-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const PRIVACY_STATUSES = new Set(["requested", "verifying", "blocked", "approved", "processing", "completed", "cancelled", "failed"]);
const PRIVACY_TYPES = new Set(["data_export", "account_deletion"]);
const PRIVACY_SORTS = new Set(["newest", "oldest", "recently_updated"]);
const PAGE_SIZE_DEFAULT = 20;

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
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin;
    return admin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  try {
    const { searchParams } = new URL(request.url);
    const requestedStatus = searchParams.get("status") || "all";
    const requestedType = searchParams.get("type") || "all";
    const requestedSort = searchParams.get("sort") || "newest";
    const status = PRIVACY_STATUSES.has(requestedStatus) ? requestedStatus : "all";
    const type = PRIVACY_TYPES.has(requestedType) ? requestedType : "all";
    const sort = PRIVACY_SORTS.has(requestedSort) ? requestedSort : "newest";
    const search = sanitizeSearch(searchParams.get("search") ?? searchParams.get("q"));
    const startAt = validDate(searchParams.get("startAt"), false);
    const endAt = validDate(searchParams.get("endAt"), true);
    const page = positiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(100, positiveInteger(searchParams.get("pageSize"), PAGE_SIZE_DEFAULT));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const service = requireService();
    let query = service
      .from("privacy_requests")
      .select("id,request_no,user_id,request_type,status,reason_detail,block_reasons,review_note,reviewed_by,reviewed_at,cooldown_until,completed_at,cancelled_at,failed_at,created_at,updated_at,profiles:user_id(id,email,display_name,account_status)", { count: "exact" });

    if (status !== "all") query = query.eq("status", status);
    if (type !== "all") query = query.eq("request_type", type);
    if (startAt) query = query.gte("created_at", startAt);
    if (endAt) query = query.lte("created_at", endAt);
    if (search) {
      const filters = [`request_no.ilike.%${search}%`, `reason_detail.ilike.%${search}%`];
      if (isUuid(search)) filters.push(`id.eq.${search}`, `user_id.eq.${search}`);
      query = query.or(filters.join(","));
    }
    if (sort === "oldest") query = query.order("created_at", { ascending: true });
    else if (sort === "recently_updated") query = query.order("updated_at", { ascending: false }).order("created_at", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const [{ data, error, count }, stats] = await Promise.all([
      query.range(from, to),
      loadPrivacyStats(service),
    ]);
    if (error) throw error;

    return json({
      requests: (data ?? []).map((row) => normalizePrivacyRequest(row)),
      total: count ?? 0,
      page,
      pageSize,
      stats,
      filters: { status, type, sort },
    });
  } catch (error) {
    return json({ error: safePrivacyError(error) }, { status: 500 });
  }
}

async function loadPrivacyStats(service: ReturnType<typeof requireService>) {
  const count = async (statuses: string[]) => {
    let query = service.from("privacy_requests").select("id", { count: "exact", head: true });
    query = statuses.length === 1 ? query.eq("status", statuses[0]) : query.in("status", statuses);
    const { count: value, error } = await query;
    if (error) throw error;
    return value ?? 0;
  };
  const [pending, processing, completed, closed] = await Promise.all([
    count(["requested", "verifying", "blocked", "approved"]),
    count(["processing"]),
    count(["completed"]),
    count(["cancelled", "failed"]),
  ]);
  return { pending, processing, completed, closed };
}

export async function PATCH(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const action = String(body?.action || "").trim();
  const requestId = String(body?.requestId || "").trim();
  const note = String(body?.note || "").trim();
  const auditRequestId = crypto.randomUUID();

  if (!isUuid(requestId)) return json({ error: "隐私请求 ID 格式无效。" }, { status: 400 });
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
      const { data, error } = await service.rpc("super_admin_anonymize_user_account", {
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
      admin: { id: admin.user.id, email: admin.user.email ?? null },
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
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: action || "privacy_action_failed",
      module: "privacy",
      targetType: "privacy_request",
      targetId: requestId,
      requestId: auditRequestId,
      result: "failed",
      errorMessage: error,
    });
    return json({ error: safePrivacyError(error) }, { status: 500 });
  }
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeSearch(value: string | null) {
  return (value ?? "").trim().replace(/[^\p{L}\p{N}@._+\-\s]/gu, "").slice(0, 120);
}

function validDate(value: string | null, endOfDay: boolean) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safePrivacyError(error: unknown) {
  const message = privacyInitError(error);
  if (message.includes("数据库结构尚未初始化") || message.includes("无权限")) return message;
  return "隐私请求处理失败，请稍后重试。";
}

