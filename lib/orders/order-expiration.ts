import "server-only";

import { randomUUID } from "crypto";

import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const ORDER_PAYMENT_TIMEOUT_MINUTES = Number(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES ?? 30);
export const ORDER_EXPIRATION_BATCH_LIMIT = Number(process.env.ORDER_EXPIRATION_BATCH_LIMIT ?? 50);

export type ExpireOrderResult = {
  ok: boolean;
  code: string;
  orderId?: string;
  orderNo?: string | null;
  releasedNormal?: number;
  releasedSku?: number;
  releasedDigital?: number;
  message?: string;
  requestId: string;
};

export type ExpireBatchResult = {
  requestId: string;
  processed: number;
  skipped: number;
  failed: number;
  results: ExpireOrderResult[];
};

function requireServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端数据库权限未配置，无法处理订单超时");
  return service;
}

function normalizeRpcResult(value: unknown, requestId: string): ExpireOrderResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    ok: row.ok !== false,
    code: String(row.code ?? "UNKNOWN"),
    orderId: typeof row.order_id === "string" ? row.order_id : undefined,
    orderNo: typeof row.order_no === "string" ? row.order_no : null,
    releasedNormal: Number(row.released_normal ?? 0),
    releasedSku: Number(row.released_sku ?? 0),
    releasedDigital: Number(row.released_digital ?? 0),
    message: typeof row.message === "string" ? row.message : undefined,
    requestId,
  };
}

export async function expireUnpaidOrder(orderId: string, reason = "payment_timeout") {
  const requestId = randomUUID();
  const service = requireServiceClient();
  const { data, error } = await service.rpc("expire_unpaid_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) {
    return {
      ok: false,
      code: typeof error.code === "string" ? error.code : "EXPIRE_FAILED",
      orderId,
      message: getSafeErrorMessage(error, "订单超时处理失败"),
      requestId,
    } satisfies ExpireOrderResult;
  }
  return normalizeRpcResult(data, requestId);
}

export async function processExpiredOrders(limit = ORDER_EXPIRATION_BATCH_LIMIT, reason = "payment_timeout") {
  const requestId = randomUUID();
  const service = requireServiceClient();
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || ORDER_EXPIRATION_BATCH_LIMIT), 200));

  const { data, error } = await service.rpc("list_expirable_unpaid_orders", { p_limit: safeLimit });
  if (error) {
    return {
      requestId,
      processed: 0,
      skipped: 0,
      failed: 1,
      results: [{ ok: false, code: "LIST_FAILED", message: getSafeErrorMessage(error, "读取过期订单失败"), requestId }],
    } satisfies ExpireBatchResult;
  }

  const orderIds = (Array.isArray(data) ? data : [])
    .map((row) => (row && typeof row === "object" ? String((row as { order_id?: unknown }).order_id ?? "") : ""))
    .filter(Boolean);

  const results: ExpireOrderResult[] = [];
  for (const orderId of orderIds) {
    try {
      results.push(await expireUnpaidOrder(orderId, reason));
    } catch (error) {
      results.push({ ok: false, code: "EXPIRE_THROWN", orderId, message: getSafeErrorMessage(error, "订单超时处理失败"), requestId });
    }
  }

  return {
    requestId,
    processed: results.filter((item) => item.code === "EXPIRED").length,
    skipped: results.filter((item) => item.ok && item.code !== "EXPIRED").length,
    failed: results.filter((item) => !item.ok).length,
    results,
  } satisfies ExpireBatchResult;
}

export function assertOrderExpirationJobAuthorized(request: Request) {
  const expected = process.env.ORDER_EXPIRATION_JOB_SECRET || process.env.INTERNAL_JOB_SECRET;
  if (!expected) return { ok: false, status: 503, message: "订单超时任务密钥未配置" } as const;
  const provided = request.headers.get("x-internal-job-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) return { ok: false, status: 401, message: "无权执行订单超时任务" } as const;
  return { ok: true } as const;
}
