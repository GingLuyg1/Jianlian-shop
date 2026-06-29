import "server-only";

import { logServerEvent, sanitizeForLog, type MonitoringCategory } from "@/lib/monitoring/logger";

type AlertInput = {
  scenario:
    | "database_unavailable"
    | "payment_callback_failures"
    | "payment_amount_mismatch"
    | "duplicate_credit_risk"
    | "delivery_failures"
    | "reconciliation_failed"
    | "application_unhealthy"
    | "high_500_rate";
  title: string;
  message: string;
  requestId?: string | null;
  category?: MonitoringCategory;
  metadata?: Record<string, unknown>;
};

const lastAlertAt = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

export async function sendAlert(input: AlertInput) {
  const alertKey = `${input.scenario}:${input.category ?? "system"}`;
  const now = Date.now();
  const last = lastAlertAt.get(alertKey) ?? 0;
  if (now - last < DEFAULT_COOLDOWN_MS) {
    return { ok: false, skipped: "cooldown" as const };
  }
  lastAlertAt.set(alertKey, now);

  const configured = Boolean(process.env.MONITORING_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL);
  if (!configured) {
    logServerEvent({
      level: "warn",
      category: input.category ?? "system",
      event: "alert_channel_not_configured",
      message: input.message,
      requestId: input.requestId ?? undefined,
      errorCode: "ALERT_CHANNEL_NOT_CONFIGURED",
      metadata: {
        scenario: input.scenario,
        title: input.title,
        alertMetadata: sanitizeForLog(input.metadata ?? {}),
      },
    });
    return { ok: false, skipped: "not_configured" as const };
  }

  logServerEvent({
    level: "info",
    category: input.category ?? "system",
    event: "alert_ready_to_send",
    message: input.message,
    requestId: input.requestId ?? undefined,
    metadata: {
      scenario: input.scenario,
      title: input.title,
      configured,
    },
  });

  return { ok: false, skipped: "transport_not_enabled" as const };
}
