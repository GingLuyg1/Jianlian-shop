import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getEmailProviderStatus } from "@/lib/email/provider";
import { getRequestIdFromRequest, withRequestIdHeader } from "@/lib/monitoring/request-id";
import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestIdFromRequest(request, "status");
  const admin = await requireApiAdmin();
  if (!admin.ok) return withRequestIdHeader(admin.response, requestId);
  const client = getSupabaseServiceRoleClient() ?? admin.supabase;
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [errors, critical, channels, emailJobs] = await Promise.all([
    safeCount(client.from("system_error_events").select("id", { count: "exact", head: true }).gte("last_seen_at", since)),
    safeCount(client.from("system_error_events").select("id", { count: "exact", head: true }).eq("level", "critical").in("status", ["open", "investigating"])),
    safeCount(client.from("payment_channels").select("id", { count: "exact", head: true }).eq("enabled", true).eq("configured", true)),
    safeCount(client.from("email_delivery_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "retrying", "failed"])),
  ]);

  const email = getEmailProviderStatus();
  const release = getReleaseInfo();
  const response = NextResponse.json({
    status: errors.error ? "warning" : "ok",
    release: { environment: release.environment, commit_sha: release.shortCommit, application_version: release.release, build_time: release.buildTime },
    database: { status: errors.error ? "warning" : "ok" },
    errors: { last_24_hours: errors.count, unresolved_critical: critical.count, available: !errors.error },
    providers: {
      email: { status: email.configured ? "configured" : "not_configured", provider: email.provider },
      payment: { status: channels.error ? "unknown" : channels.count > 0 ? "configured" : "not_configured", configured_channels: channels.count },
    },
    background_jobs: { email_pending_or_failed: emailJobs.count, available: !emailJobs.error },
    migration_status: errors.error ? "warning" : "available",
    checked_at: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
  return withRequestIdHeader(response, requestId);
}

async function safeCount(query: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const result = await query;
    return { count: result.count ?? 0, error: Boolean(result.error) };
  } catch {
    return { count: 0, error: true };
  }
}
