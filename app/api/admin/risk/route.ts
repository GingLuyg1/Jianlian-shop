import { NextResponse } from "next/server";

import { normalizeRiskError, number, requireRiskAdmin, text } from "@/lib/risk/admin-risk";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["open", "pending", "reviewing", "approved", "rejected", "monitoring", "resolved", "expired", "cancelled"]);
const BUSINESS_TYPES = new Set(["account", "login", "order", "inventory", "payment", "recharge", "refund", "delivery"]);

export async function GET(request: Request) {
  const admin = await requireRiskAdmin();
  if (!admin.ok) return admin.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 30), 1), 100);
    const level = searchParams.get("level")?.trim() ?? "all";
    const status = searchParams.get("status")?.trim() ?? "all";
    const businessType = searchParams.get("businessType")?.trim() ?? "all";
    const rule = searchParams.get("rule")?.trim() ?? "";

    let query = admin.supabase
      .from("risk_events")
      .select("*", { count: "exact" })
      .order("last_seen_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (LEVELS.has(level)) query = query.eq("risk_level", level);
    if (STATUSES.has(status)) query = query.eq("status", status);
    if (BUSINESS_TYPES.has(businessType)) query = query.eq("business_type", businessType);
    if (rule) query = query.eq("rule_code", rule.slice(0, 80));

    const [{ data, error, count }, stats] = await Promise.all([query, loadStats(admin.supabase)]);
    if (error) throw error;

    return NextResponse.json({
      events: (data ?? []).map(normalizeRiskEvent),
      total: count ?? 0,
      page,
      pageSize,
      stats,
    });
  } catch (error) {
    return NextResponse.json({ error: normalizeRiskError(error) }, { status: 503 });
  }
}

async function loadStats(supabase: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [pending, high, todayEvents, processed, orderRisk, paymentRisk, refundRisk, accountRisk] = await Promise.all([
    countBy(supabase, (query) => query.in("status", ["pending", "reviewing"])),
    countBy(supabase, (query) => query.in("risk_level", ["high", "critical"])),
    countBy(supabase, (query) => query.gte("created_at", today.toISOString())),
    countBy(supabase, (query) => query.in("status", ["approved", "rejected", "resolved", "cancelled"])),
    countBy(supabase, (query) => query.eq("business_type", "order")),
    countBy(supabase, (query) => query.eq("business_type", "payment")),
    countBy(supabase, (query) => query.eq("business_type", "refund")),
    countBy(supabase, (query) => query.eq("business_type", "account")),
  ]);
  return { pending, high, today: todayEvents, processed, orderRisk, paymentRisk, refundRisk, accountRisk };
}

async function countBy(supabase: any, apply: (query: any) => any) {
  const query = apply(supabase.from("risk_events").select("id", { count: "exact", head: true }));
  const { count, error } = await query.limit(1);
  if (error) return 0;
  return count ?? 0;
}

function normalizeRiskEvent(row: Record<string, unknown>) {
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
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

