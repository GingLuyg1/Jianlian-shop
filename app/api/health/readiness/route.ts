import { NextResponse } from "next/server";

import { getRequestIdFromRequest, withRequestIdHeader } from "@/lib/monitoring/request-id";
import { getReleaseInfo } from "@/lib/system/release-info";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "unhealthy" | "not_configured";

type HealthCheck = {
  name: string;
  status: CheckStatus;
  message: string;
  critical?: boolean;
  durationMs?: number;
};

export async function GET(request: Request) {
  const requestId = getRequestIdFromRequest(request, "ready");
  const started = Date.now();
  const checks: HealthCheck[] = [];

  checks.push({
    name: "application_process",
    status: "ok",
    message: "Application process is alive.",
    critical: true,
    durationMs: 0,
  });

  checks.push(await checkDatabase());
  checks.push(await checkPaymentCore());
  checks.push(await checkTable("orders", "Orders service", true));
  checks.push(await checkTable("digital_inventory", "Digital inventory service", false));
  checks.push(await checkTable("order_deliveries", "Delivery service", false));
  checks.push(await checkTable("payment_reconciliations", "Payment reconciliation service", false));
  checks.push({
    name: "notification_service",
    status: process.env.MONITORING_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL ? "ok" : "not_configured",
    message:
      process.env.MONITORING_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL
        ? "Alert channel is configured."
        : "Alert channel is not configured.",
    critical: false,
  });

  const criticalFailed = checks.some((check) => check.critical && check.status === "unhealthy");
  const degraded = checks.some((check) => ["degraded", "unhealthy", "not_configured"].includes(check.status));
  const status = criticalFailed ? "unhealthy" : degraded ? "degraded" : "healthy";
  const release = getReleaseInfo(status);

  return withRequestIdHeader(NextResponse.json(
    {
      status,
      environment: release.environment,
      version: release.release,
      commit_sha: shortSha(release.commit),
      build_time: release.buildTime,
      database_reachable: checks.find((check) => check.name === "database_connection")?.status === "ok",
      database_schema_status: status,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - started,
      checks,
    },
    {
      status: status === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  ), requestId);
}

function shortSha(value: string) {
  return value && value !== "unknown" ? value.slice(0, 12) : "unknown";
}

async function checkDatabase(): Promise<HealthCheck> {
  const started = Date.now();
  if (!hasSupabaseServerConfig()) {
    return {
      name: "database_connection",
      status: "unhealthy",
      message: "Supabase environment variables are not configured.",
      critical: true,
      durationMs: Date.now() - started,
    };
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      name: "database_connection",
      status: "degraded",
      message: "Service role is not configured; full database probing is unavailable.",
      critical: true,
      durationMs: Date.now() - started,
    };
  }

  try {
    const { error } = await service.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    return {
      name: "database_connection",
      status: error ? "unhealthy" : "ok",
      message: error ? "Database connection is unavailable." : "Database connection is healthy.",
      critical: true,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: "database_connection",
      status: "unhealthy",
      message: "Database connection check failed.",
      critical: true,
      durationMs: Date.now() - started,
    };
  }
}

async function checkPaymentCore(): Promise<HealthCheck> {
  const started = Date.now();
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      name: "payment_core",
      status: "not_configured",
      message: "Payment core check requires server service configuration.",
      critical: false,
      durationMs: Date.now() - started,
    };
  }
  try {
    const { error } = await service.from("payment_sessions").select("id", { count: "exact", head: true }).limit(1);
    return {
      name: "payment_core",
      status: error ? "degraded" : "ok",
      message: error ? "Payment session table is unavailable or not initialized." : "Payment core tables are reachable.",
      critical: false,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: "payment_core",
      status: "degraded",
      message: "Payment core check failed.",
      critical: false,
      durationMs: Date.now() - started,
    };
  }
}

async function checkTable(table: string, label: string, critical: boolean): Promise<HealthCheck> {
  const started = Date.now();
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      name: table,
      status: "not_configured",
      message: `${label} check requires server service configuration.`,
      critical,
      durationMs: Date.now() - started,
    };
  }
  try {
    const { error } = await service.from(table).select("id", { count: "exact", head: true }).limit(1);
    return {
      name: table,
      status: error ? (critical ? "unhealthy" : "degraded") : "ok",
      message: error ? `${label} is unavailable or not initialized.` : `${label} is healthy.`,
      critical,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: table,
      status: critical ? "unhealthy" : "degraded",
      message: `${label} check failed.`,
      critical,
      durationMs: Date.now() - started,
    };
  }
}
