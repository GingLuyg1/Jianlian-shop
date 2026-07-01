import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { normalizeRiskError, number, requireRiskAdmin, text } from "@/lib/risk/admin-risk";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const ACTIONS = new Set(["approve", "reject", "monitor", "release"]);

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireRiskAdmin();
  if (!admin.ok) return admin.response;

  try {
    const { data, error } = await admin.supabase
      .from("risk_events")
      .select("*,risk_reviews(*)")
      .eq("id", context.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "风险事件不存在。" }, { status: 404 });
    return NextResponse.json({ event: normalizeRiskDetail(data as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({ error: normalizeRiskError(error) }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireRiskAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as { action?: string; reason?: string; confirmHighRisk?: boolean } | null;
  const action = String(body?.action ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "不支持的风险审核动作。" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "请填写审核原因。" }, { status: 400 });

  try {
    const beforeResult = await admin.supabase
      .from("risk_events")
      .select("*")
      .eq("id", context.params.id)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;
    const before = beforeResult.data as Record<string, unknown> | null;
    if (!before) return NextResponse.json({ error: "风险事件不存在。" }, { status: 404 });

    if (["high", "critical"].includes(String(before.risk_level)) && !body?.confirmHighRisk) {
      return NextResponse.json({ error: "高风险审核动作需要二次确认。" }, { status: 409 });
    }

    const nextStatus = actionToStatus(action);
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin.supabase
      .from("risk_events")
      .update({
        status: nextStatus,
        resolved_at: ["approved", "rejected", "resolved"].includes(nextStatus) ? now : null,
        updated_at: now,
      })
      .eq("id", context.params.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const reviewInsert = await admin.supabase.from("risk_reviews").insert({
      risk_event_id: context.params.id,
      business_type: text(before.business_type),
      business_id: text(before.business_id),
      review_status: nextStatus,
      decision: action,
      reason,
      reviewed_by: admin.user.id,
      reviewed_at: now,
    });
    if (reviewInsert.error) throw reviewInsert.error;

    const audit = await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: `risk_${action}`,
      module: "system",
      targetType: "risk_event",
      targetId: context.params.id,
      targetLabel: text(before.rule_code),
      result: "success",
      beforeSummary: summarizeRisk(before),
      afterSummary: summarizeRisk(updated as Record<string, unknown>),
      metadata: { decision: action, reason },
    });
    if (!audit.ok) {
      return NextResponse.json({ error: "风险审核已保存，但审计日志写入失败，请联系技术处理。" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, event: normalizeRiskDetail(updated as Record<string, unknown>) });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: `risk_${action || "unknown"}`,
      module: "system",
      targetType: "risk_event",
      targetId: context.params.id,
      result: "failed",
      errorMessage: normalizeRiskError(error),
    });
    return NextResponse.json({ error: normalizeRiskError(error, "风险审核操作失败。") }, { status: 400 });
  }
}

function actionToStatus(action: string) {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "release") return "resolved";
  return "monitoring";
}

function normalizeRiskDetail(row: Record<string, unknown>) {
  const reviews = Array.isArray(row.risk_reviews) ? row.risk_reviews as Record<string, unknown>[] : [];
  return {
    id: text(row.id) ?? "",
    ruleCode: text(row.rule_code) ?? "",
    riskLevel: text(row.risk_level) ?? "low",
    riskScore: number(row.risk_score),
    recommendedAction: text(row.recommended_action) ?? "allow",
    businessType: text(row.business_type) ?? "",
    businessId: text(row.business_id),
    userId: text(row.user_id),
    requestId: text(row.request_id),
    sourceHash: text(row.source_hash)?.slice(0, 16) ?? null,
    summary: text(row.summary) ?? "无摘要",
    status: text(row.status) ?? "open",
    occurrences: number(row.occurrences || 1),
    firstSeenAt: text(row.first_seen_at),
    lastSeenAt: text(row.last_seen_at),
    expiresAt: text(row.expires_at),
    metadata: safeMetadata(row.metadata),
    reviews: reviews.map((review) => ({
      id: text(review.id) ?? "",
      status: text(review.review_status) ?? "",
      decision: text(review.decision) ?? "",
      reason: text(review.reason) ?? "",
      reviewedBy: text(review.reviewed_by),
      reviewedAt: text(review.reviewed_at),
    })),
  };
}

function summarizeRisk(row: Record<string, unknown>) {
  return {
    rule_code: text(row.rule_code),
    risk_level: text(row.risk_level),
    risk_score: number(row.risk_score),
    recommended_action: text(row.recommended_action),
    status: text(row.status),
    business_type: text(row.business_type),
    business_id: text(row.business_id),
  };
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret|key|authorization|cookie|content|callback|payload/i.test(key)) continue;
    output[key] = typeof raw === "string" ? raw.slice(0, 160) : raw;
  }
  return output;
}
