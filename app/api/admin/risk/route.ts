import { NextResponse } from "next/server";

import { normalizeRiskError, number, requireRiskAdmin, text } from "@/lib/risk/admin-risk";
import { sanitizePostgrestFilterTerm } from "@/lib/security/postgrest-sanitize";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["open", "pending", "reviewing", "approved", "rejected", "monitoring", "resolved", "expired", "cancelled"]);
const BUSINESS_TYPES = new Set(["account", "login", "order", "inventory", "payment", "recharge", "refund", "delivery"]);
const SORTS = new Set(["newest", "oldest", "risk_desc", "risk_asc"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProfileLookup = { email: string | null; displayName: string | null };

export async function GET(request: Request) {
  const admin = await requireRiskAdmin();
  if (!admin.ok) return admin.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = clampInteger(searchParams.get("page"), 1, 1, 100000);
    const pageSize = clampInteger(searchParams.get("pageSize"), 20, 1, 100);
    const level = searchParams.get("level")?.trim() ?? "all";
    const status = searchParams.get("status")?.trim() ?? "all";
    const businessType = searchParams.get("businessType")?.trim() ?? "all";
    const rule = searchParams.get("rule")?.trim() ?? "";
    const rawSearch = (searchParams.get("search") ?? "").trim().slice(0, 120);
    const search = sanitizeSearch(rawSearch);
    const startAt = validDate(searchParams.get("startAt"));
    const endAt = validDate(searchParams.get("endAt"));
    const requestedSort = searchParams.get("sort")?.trim() ?? "newest";
    const sort = SORTS.has(requestedSort) ? requestedSort : "newest";

    const profileReader = getSupabaseServiceRoleClient() ?? admin.supabase;
    let matchedUserIds: string[] = [];
    if (rawSearch) {
      const safeUserSearch = sanitizePostgrestFilterTerm(rawSearch);
      if (safeUserSearch && (rawSearch.includes("@") || rawSearch.includes(".") || /[\u4e00-\u9fff]/.test(rawSearch) || !UUID_PATTERN.test(rawSearch))) {
        const { data: matchedProfiles } = await profileReader
          .from("profiles")
          .select("id")
          .or(`email.ilike.%${safeUserSearch}%,display_name.ilike.%${safeUserSearch}%`)
          .limit(50);
        matchedUserIds = (matchedProfiles ?? [])
          .map((item: { id?: unknown }) => text(item.id))
          .filter((item): item is string => typeof item === "string" && UUID_PATTERN.test(item));
      }
    }

    let query = admin.supabase
      .from("risk_events")
      .select("*", { count: "exact" });

    if (LEVELS.has(level)) query = query.eq("risk_level", level);
    if (STATUSES.has(status)) query = query.eq("status", status);
    if (BUSINESS_TYPES.has(businessType)) query = query.eq("business_type", businessType);
    if (rule) query = query.eq("rule_code", rule.slice(0, 80));
    if (rawSearch) {
      const filters: string[] = [];
      if (search) {
        filters.push(`rule_code.ilike.%${search}%`, `business_id.ilike.%${search}%`, `request_id.ilike.%${search}%`);
      }
      if (UUID_PATTERN.test(rawSearch)) {
        filters.unshift(`id.eq.${rawSearch}`, `user_id.eq.${rawSearch}`);
      }
      if (matchedUserIds.length > 0) {
        filters.push(`user_id.in.(${matchedUserIds.join(",")})`);
      }
      if (filters.length > 0) {
        query = query.or(filters.join(","));
      } else {
        return NextResponse.json({
          events: [],
          total: 0,
          page,
          pageSize,
          sort,
          stats: await loadStats(admin.supabase),
        });
      }
    }
    if (startAt) query = query.gte("created_at", startAt);
    if (endAt) query = query.lte("created_at", endAt);

    if (sort === "oldest") query = query.order("last_seen_at", { ascending: true });
    else if (sort === "risk_desc") query = query.order("risk_score", { ascending: false }).order("last_seen_at", { ascending: false });
    else if (sort === "risk_asc") query = query.order("risk_score", { ascending: true }).order("last_seen_at", { ascending: false });
    else query = query.order("last_seen_at", { ascending: false });

    query = query.range((page - 1) * pageSize, page * pageSize - 1);

    const [{ data, error, count }, stats] = await Promise.all([query, loadStats(admin.supabase)]);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const profileMap = await loadProfilesByIds(
      profileReader,
      rows.map((row) => text(row.user_id)).filter((id): id is string => Boolean(id)),
    );

    return NextResponse.json({
      events: rows.map((row) => normalizeRiskEvent(row, profileMap)),
      total: count ?? 0,
      page,
      pageSize,
      sort,
      stats,
    });
  } catch (error) {
    return NextResponse.json({ error: normalizeRiskError(error) }, { status: 503 });
  }
}

async function loadProfilesByIds(supabase: any, userIds: string[]): Promise<Map<string, ProfileLookup>> {
  const uniqueIds = Array.from(new Set(userIds));
  const map = new Map<string, ProfileLookup>();
  if (uniqueIds.length === 0) return map;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id,email,display_name")
      .in("id", uniqueIds);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const id = text(row.id);
      if (id) {
        map.set(id, {
          email: text(row.email),
          displayName: text(row.display_name),
        });
      }
    }
  } catch {
    // Non-blocking enrichment: still return risk events even if profile lookup fails.
  }
  return map;
}

async function loadStats(supabase: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [pending, high, todayEvents, processed, orderRisk, paymentRisk, refundRisk, accountRisk] = await Promise.all([
    countBy(supabase, (query) => query.in("status", ["open", "pending", "reviewing"])),
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
  if (error) throw error;
  return count ?? 0;
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sanitizeSearch(value: string | null) {
  return (value ?? "").trim().replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 80);
}

function validDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeRiskEvent(row: Record<string, unknown>, profileMap: Map<string, ProfileLookup>) {
  const userId = text(row.user_id);
  const profile = userId ? profileMap.get(userId) : undefined;
  return {
    id: text(row.id) ?? "",
    ruleCode: text(row.rule_code) ?? "",
    riskLevel: text(row.risk_level) ?? "low",
    riskScore: number(row.risk_score),
    recommendedAction: text(row.recommended_action) ?? "allow",
    businessType: text(row.business_type) ?? "",
    businessId: text(row.business_id),
    userId,
    userEmail: profile?.email ?? null,
    userDisplayName: profile?.displayName ?? null,
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
