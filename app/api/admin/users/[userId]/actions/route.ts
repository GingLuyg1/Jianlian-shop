import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { getAuditErrorMessage, writeAdminAuditLog } from "@/lib/admin/audit-log-service";

export const dynamic = "force-dynamic";

const ACCOUNT_STATUSES = new Set(["active", "restricted", "suspended", "disabled"]);
const RISK_STATUSES = new Set(["normal", "watch", "high_risk", "blocked"]);
const ADJUSTMENT_TYPES = new Set(["increase", "decrease", "compensation", "refund", "correction", "other"]);
const DIRECTIONS = new Set(["credit", "debit"]);

type RouteContext = { params: { userId: string } };

type ActionBody = {
  action?: string;
  nextStatus?: string;
  nextRiskStatus?: string;
  adjustmentType?: string;
  direction?: string;
  amount?: number | string;
  reason?: string;
  requestId?: string;
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin() {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin;
  return admin;
}

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body) return json({ error: "请求参数不正确。" }, { status: 400 });

  const userId = context.params.userId;
  const action = String(body.action ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const requestId = String(body.requestId ?? randomUUID()).trim();

  if (!reason) return json({ error: "请填写操作原因。" }, { status: 400 });
  if (!requestId || requestId.length > 160) return json({ error: "缺少有效的请求编号。" }, { status: 400 });

  try {
    if (action === "update_account_status") {
      const nextStatus = String(body.nextStatus ?? "").trim();
      if (!ACCOUNT_STATUSES.has(nextStatus)) return json({ error: "账户状态不合法。" }, { status: 400 });
      const before = await loadProfile(admin.supabase, userId);
      const { data, error } = await admin.supabase.rpc("super_admin_update_user_account_status", {
        p_user_id: userId,
        p_next_status: nextStatus,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (error) throw error;
      const after = await loadProfile(admin.supabase, userId);
      const audit = await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "update_user_account_status",
        module: "users",
        targetType: "user",
        targetId: userId,
        targetLabel: after?.email ?? before?.email ?? null,
        requestId,
        result: "success",
        beforeSummary: before,
        afterSummary: after,
        metadata: { rpc: data },
      });
      if (!audit.ok) return json({ error: "账户状态已处理，但审计日志写入失败，请联系技术处理。" }, { status: 500 });
      return json({ ok: true, result: data, profile: after });
    }

    if (action === "update_risk_status") {
      const nextRiskStatus = String(body.nextRiskStatus ?? "").trim();
      if (!RISK_STATUSES.has(nextRiskStatus)) return json({ error: "风险状态不合法。" }, { status: 400 });
      const before = await loadProfile(admin.supabase, userId);
      const { data, error } = await admin.supabase.rpc("super_admin_update_user_risk_status", {
        p_user_id: userId,
        p_next_status: nextRiskStatus,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (error) throw error;
      const after = await loadProfile(admin.supabase, userId);
      const audit = await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "update_user_risk_status",
        module: "users",
        targetType: "user",
        targetId: userId,
        targetLabel: after?.email ?? before?.email ?? null,
        requestId,
        result: "success",
        beforeSummary: before,
        afterSummary: after,
        metadata: { rpc: data },
      });
      if (!audit.ok) return json({ error: "风险状态已处理，但审计日志写入失败，请联系技术处理。" }, { status: 500 });
      return json({ ok: true, result: data, profile: after });
    }

    if (action === "adjust_balance") {
      const adjustmentType = String(body.adjustmentType ?? "").trim();
      const direction = String(body.direction ?? "").trim();
      const amount = Number(body.amount);
      if (!ADJUSTMENT_TYPES.has(adjustmentType)) return json({ error: "调整类型不合法。" }, { status: 400 });
      if (!DIRECTIONS.has(direction)) return json({ error: "调整方向不合法。" }, { status: 400 });
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "调整金额必须大于 0。" }, { status: 400 });
      const before = await loadProfile(admin.supabase, userId);
      const { data, error } = await admin.supabase.rpc("super_admin_adjust_user_balance", {
        p_user_id: userId,
        p_adjustment_type: adjustmentType,
        p_direction: direction,
        p_amount: amount,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (error) throw error;
      const after = await loadProfile(admin.supabase, userId);
      const audit = await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "adjust_user_balance",
        module: "users",
        targetType: "user",
        targetId: userId,
        targetLabel: after?.email ?? before?.email ?? null,
        requestId,
        result: "success",
        beforeSummary: { balance: before?.balance ?? null },
        afterSummary: { balance: after?.balance ?? null, adjustmentType, direction, amount },
        metadata: { rpc: data },
      });
      if (!audit.ok) return json({ error: "余额调整已处理，但审计日志写入失败，请联系技术处理。" }, { status: 500 });
      return json({ ok: true, result: data, profile: after });
    }

    return json({ error: "不支持的用户管理操作。" }, { status: 400 });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: action || "unknown_user_action",
      module: "users",
      targetType: "user",
      targetId: userId,
      requestId,
      result: "failed",
      errorMessage: error,
      metadata: { action },
    });
    return json({ error: toChineseError(error) }, { status: 400 });
  }
}

async function loadProfile(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id,email,display_name,role,balance,account_status,risk_status,status_reason,risk_reason,updated_at")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

function toChineseError(error: unknown) {
  const message = getAuditErrorMessage(error, "操作失败，请稍后重试。");
  if (/permission|policy|unauthorized|forbidden|无后台|无权/i.test(message)) return "无权限执行该操作。";
  if (/not found|不存在/i.test(message)) return "用户不存在或数据未初始化。";
  if (/余额|balance|小于 0|amount/i.test(message)) return message;
  if (/account_status|risk_status|admin_update_user|admin_adjust_user_balance|schema cache|PGRST|42883|42P01/i.test(message)) {
    return "用户管理数据库结构尚未初始化，请先执行 admin_user_controls migration。";
  }
  return message;
}


