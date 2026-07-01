import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sanitizeForLog } from "@/lib/monitoring/logger";

export type TraceEvent = {
  id: string;
  source: "system_error_events" | "admin_audit_logs" | "payment_events" | "order_events" | "inventory_events";
  title: string;
  summary: string;
  status: string | null;
  businessType: string | null;
  businessId: string | null;
  route: string | null;
  errorCode: string | null;
  occurredAt: string | null;
  metadata: unknown;
};

export type RequestTracePayload = {
  requestId: string;
  events: TraceEvent[];
  moduleErrors: Record<string, string>;
};

async function safeTraceQuery<T>(label: string, fn: () => PromiseLike<{ data: T[] | null; error: unknown }>) {
  try {
    const { data, error } = await fn();
    if (error) return { rows: [] as T[], error: `${label} 读取失败` };
    return { rows: data ?? [] };
  } catch {
    return { rows: [] as T[], error: `${label} 读取失败` };
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function loadRequestTrace(client: SupabaseClient, requestId: string): Promise<RequestTracePayload> {
  const moduleErrors: Record<string, string> = {};
  const events: TraceEvent[] = [];

  const systemErrors = await safeTraceQuery<Record<string, unknown>>("异常事件", () =>
    client
      .from("system_error_events")
      .select("id,level,category,error_code,title,message,route,request_id,order_id,payment_id,product_id,sku_id,status,metadata,first_seen_at,last_seen_at")
      .eq("request_id", requestId)
      .order("last_seen_at", { ascending: true })
  );
  if (systemErrors.error) moduleErrors.system_error_events = systemErrors.error;
  for (const row of systemErrors.rows) {
    events.push({
      id: `system:${row.id}`,
      source: "system_error_events",
      title: text(row.title) ?? "系统异常",
      summary: text(row.message) ?? "系统异常记录",
      status: text(row.status) ?? text(row.level),
      businessType: text(row.category),
      businessId: text(row.order_id) ?? text(row.payment_id) ?? text(row.product_id) ?? text(row.sku_id),
      route: text(row.route),
      errorCode: text(row.error_code),
      occurredAt: text(row.last_seen_at) ?? text(row.first_seen_at),
      metadata: sanitizeForLog(row.metadata ?? {}),
    });
  }

  const auditLogs = await safeTraceQuery<Record<string, unknown>>("审计日志", () =>
    client
      .from("admin_audit_logs")
      .select("id,request_id,admin_email,module,action,target_type,target_id,target_label,result,error_code,error_message,metadata,created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true })
  );
  if (auditLogs.error) moduleErrors.admin_audit_logs = auditLogs.error;
  for (const row of auditLogs.rows) {
    events.push({
      id: `audit:${row.id}`,
      source: "admin_audit_logs",
      title: text(row.action) ?? "管理员操作",
      summary: text(row.target_label) ?? text(row.admin_email) ?? "管理员操作记录",
      status: text(row.result),
      businessType: text(row.module) ?? text(row.target_type),
      businessId: text(row.target_id),
      route: null,
      errorCode: text(row.error_code),
      occurredAt: text(row.created_at),
      metadata: sanitizeForLog({ error: row.error_message, metadata: row.metadata }),
    });
  }

  const optionalTables: Array<TraceEvent["source"]> = ["payment_events", "order_events", "inventory_events"];
  for (const table of optionalTables) {
    const result = await safeTraceQuery<Record<string, unknown>>(table, () =>
      client
        .from(table)
        .select("id,event_type,status,summary,request_id,metadata,created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true })
    );
    if (result.error) moduleErrors[table] = result.error;
    for (const row of result.rows) {
      events.push({
        id: `${table}:${row.id}`,
        source: table,
        title: text(row.event_type) ?? "业务事件",
        summary: text(row.summary) ?? "业务事件记录",
        status: text(row.status),
        businessType: table.replace("_events", ""),
        businessId: null,
        route: null,
        errorCode: null,
        occurredAt: text(row.created_at),
        metadata: sanitizeForLog(row.metadata ?? {}),
      });
    }
  }

  events.sort((a, b) => String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? "")));
  return { requestId, events, moduleErrors };
}
