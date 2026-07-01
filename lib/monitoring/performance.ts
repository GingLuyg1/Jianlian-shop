import "server-only";

import { recordPerformance } from "@/lib/monitoring/logger";

type PerformanceTraceInput = {
  operation: string;
  route?: string | null;
  method?: string | null;
  queryType?: "select" | "insert" | "update" | "delete" | "rpc" | "aggregate" | "unknown";
  requestId?: string | null;
  userId?: string | null;
  adminId?: string | null;
  warnAtMs?: number;
  errorAtMs?: number;
  metadata?: Record<string, unknown>;
};

export type PerformanceTraceResult<T> = {
  result: T;
  durationMs: number;
};

export async function withPerformanceTrace<T>(
  input: PerformanceTraceInput,
  operation: () => Promise<T>,
  getResultCount?: (result: T) => number | null | undefined
): Promise<PerformanceTraceResult<T>> {
  const started = Date.now();
  let status: "success" | "failed" = "success";
  try {
    const result = await operation();
    const durationMs = Date.now() - started;
    await safeRecordPerformance(input, durationMs, status, getResultCount?.(result));
    return { result, durationMs };
  } catch (error) {
    status = "failed";
    const durationMs = Date.now() - started;
    await safeRecordPerformance(input, durationMs, status, null);
    throw error;
  }
}

export async function measureQuery<T>(
  operation: string,
  query: () => Promise<T>,
  options: Omit<PerformanceTraceInput, "operation"> = {}
) {
  return withPerformanceTrace({ ...options, operation }, query);
}

async function safeRecordPerformance(
  input: PerformanceTraceInput,
  durationMs: number,
  status: "success" | "failed",
  resultCount: number | null | undefined
) {
  try {
    await recordPerformance({
      event: input.operation,
      durationMs,
      warnAtMs: input.warnAtMs,
      errorAtMs: input.errorAtMs,
      route: input.route,
      method: input.method,
      requestId: input.requestId ?? undefined,
      userId: input.userId ?? undefined,
      adminId: input.adminId ?? undefined,
      metadata: {
        operation: input.operation,
        query_type: input.queryType ?? "unknown",
        result_count: typeof resultCount === "number" && Number.isFinite(resultCount) ? Math.max(0, Math.trunc(resultCount)) : null,
        status,
        ...(input.metadata ?? {}),
      },
    });
  } catch {
    // Performance logging must never block the business request.
  }
}

