import { NextResponse } from "next/server";

import { recordSystemError } from "@/lib/monitoring/logger";
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

export async function GET() {
  const started = Date.now();
  const checks: HealthCheck[] = [];

  checks.push({
    name: "application_process",
    status: "ok",
    message: "应用进程存活",
    critical: true,
    durationMs: 0,
  });

  checks.push(await checkDatabase());
  checks.push(await checkPaymentCore());
  checks.push(await checkTable("orders", "订单服务", true));
  checks.push(await checkTable("digital_inventory", "数字库存服务", false));
  checks.push(await checkTable("order_deliveries", "自动发货服务", false));
  checks.push(await checkTable("payment_reconciliations", "对账服务", false));
  checks.push({
    name: "notification_service",
    status: process.env.MONITORING_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL ? "ok" : "not_configured",
    message: process.env.MONITORING_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL ? "告警通道已配置" : "告警通道未配置",
    critical: false,
  });

  const criticalFailed = checks.some((check) => check.critical && check.status === "unhealthy");
  const degraded = checks.some((check) => ["degraded", "unhealthy", "not_configured"].includes(check.status));
  const status = criticalFailed ? "unhealthy" : degraded ? "degraded" : "healthy";

  if (criticalFailed) {
    await recordSystemError({
      level: "critical",
      category: "system",
      event: "health_readiness_unhealthy",
      title: "健康检查失败",
      message: "核心健康检查失败",
      route: "/api/health/readiness",
      errorCode: "HEALTH_UNHEALTHY",
      metadata: { checks },
    });
  }

  return NextResponse.json(
    {
      status,
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
  );
}

async function checkDatabase(): Promise<HealthCheck> {
  const started = Date.now();
  if (!hasSupabaseServerConfig()) {
    return {
      name: "database_connection",
      status: "unhealthy",
      message: "Supabase 环境变量未配置",
      critical: true,
      durationMs: Date.now() - started,
    };
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      name: "database_connection",
      status: "degraded",
      message: "Service role 未配置，无法执行完整数据库探测",
      critical: true,
      durationMs: Date.now() - started,
    };
  }

  try {
    const { error } = await service.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    return {
      name: "database_connection",
      status: error ? "unhealthy" : "ok",
      message: error ? "数据库连接不可用" : "数据库连接正常",
      critical: true,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: "database_connection",
      status: "unhealthy",
      message: "数据库连接检查异常",
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
      message: "支付核心需要 service role 才能完整检查",
      critical: false,
      durationMs: Date.now() - started,
    };
  }
  try {
    const { error } = await service.from("payment_sessions").select("id", { count: "exact", head: true }).limit(1);
    return {
      name: "payment_core",
      status: error ? "degraded" : "ok",
      message: error ? "支付会话表尚未就绪" : "支付核心表可访问",
      critical: false,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: "payment_core",
      status: "degraded",
      message: "支付核心检查异常",
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
      message: `${label}未执行完整检查`,
      critical,
      durationMs: Date.now() - started,
    };
  }
  try {
    const { error } = await service.from(table).select("id", { count: "exact", head: true }).limit(1);
    return {
      name: table,
      status: error ? (critical ? "unhealthy" : "degraded") : "ok",
      message: error ? `${label}不可用或未初始化` : `${label}正常`,
      critical,
      durationMs: Date.now() - started,
    };
  } catch {
    return {
      name: table,
      status: critical ? "unhealthy" : "degraded",
      message: `${label}检查异常`,
      critical,
      durationMs: Date.now() - started,
    };
  }
}
