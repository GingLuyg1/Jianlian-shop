import { NextRequest, NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { auditEmailAdminAction, summarizeEmailError } from "@/lib/email/jobs";
import { getEmailProviderStatus } from "@/lib/email/provider";
import { getAdminRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

const VALID_STATUSES = new Set(["pending", "processing", "sent", "retrying", "failed", "cancelled"]);

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) return { ok: false as const, response: json({ error: admin.message }, { status: admin.status }) };
  const limit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "email_deliveries_read"));
  if (!limit.allowed) return { ok: false as const, response: limit.response! };
  const service = getSupabaseServiceRoleClient();
  if (!service) return { ok: false as const, response: json({ error: "后台服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" }, { status: 503 }) };
  return { ok: true as const, admin, service };
}

export async function GET(request: NextRequest) {
  const ctx = await requireSuperAdmin(request);
  if (!ctx.ok) return ctx.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const templateCode = url.searchParams.get("templateCode")?.trim();
  const businessNo = url.searchParams.get("businessNo")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? 20) || 20));
  const from = (page - 1) * pageSize;

  let query = ctx.service
    .from("email_delivery_jobs")
    .select("id,template_code,template_version,recipient_summary,business_type,business_id,business_no,idempotency_key,status,attempts,max_attempts,next_retry_at,provider,provider_message_id,last_error_code,last_error_message,created_at,updated_at,sent_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (status && VALID_STATUSES.has(status)) query = query.eq("status", status);
  if (templateCode) query = query.eq("template_code", templateCode);
  if (businessNo) query = query.ilike("business_no", `%${businessNo}%`);

  const { data, error, count } = await query;
  if (error) return json({ error: summarizeEmailError(error) }, { status: 500 });
  return json({ deliveries: data ?? [], total: count ?? 0, page, pageSize, provider: getEmailProviderStatus() });
}
