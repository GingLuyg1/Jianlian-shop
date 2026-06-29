import "server-only";

import type { PaymentSessionStatus } from "@/lib/payments/channel-types";

export type CanonicalPaymentStatus =
  | "created"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "closed"
  | "refunded"
  | "partially_refunded";

type TransitionOptions = {
  allowReconciliationRecovery?: boolean;
};

const TERMINAL_STATUSES = new Set<CanonicalPaymentStatus>([
  "succeeded",
  "failed",
  "expired",
  "closed",
  "refunded",
  "partially_refunded",
]);

const ALLOWED_TRANSITIONS: Record<CanonicalPaymentStatus, CanonicalPaymentStatus[]> = {
  created: ["pending", "closed", "failed"],
  pending: ["processing", "succeeded", "failed", "expired", "closed"],
  processing: ["succeeded", "failed", "expired", "closed"],
  succeeded: ["refunded", "partially_refunded"],
  failed: [],
  expired: [],
  closed: [],
  refunded: [],
  partially_refunded: [],
};

export function toCanonicalPaymentStatus(status: unknown): CanonicalPaymentStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "paid" || value === "success" || value === "successful") return "succeeded";
  if (value === "created") return "created";
  if (value === "processing") return "processing";
  if (value === "failed") return "failed";
  if (value === "expired") return "expired";
  if (value === "closed" || value === "cancelled" || value === "canceled") return "closed";
  if (value === "refunded") return "refunded";
  if (value === "partially_refunded") return "partially_refunded";
  return "pending";
}

export function toStoragePaymentStatus(status: CanonicalPaymentStatus): PaymentSessionStatus {
  if (status === "succeeded") return "paid";
  if (status === "created") return "pending";
  if (status === "refunded" || status === "partially_refunded") {
    throw new Error("当前数据库结构尚未启用退款状态");
  }
  return status;
}

export function isTerminalPaymentStatus(status: unknown) {
  return TERMINAL_STATUSES.has(toCanonicalPaymentStatus(status));
}

export function assertPaymentStatusTransition(
  currentStatus: unknown,
  nextStatus: unknown,
  options: TransitionOptions = {}
):
  | { ok: true; canonicalStatus: CanonicalPaymentStatus; storageStatus: PaymentSessionStatus; idempotent: boolean }
  | { ok: false; message: string } {
  const current = toCanonicalPaymentStatus(currentStatus);
  const next = toCanonicalPaymentStatus(nextStatus);

  if (current === next) {
    return {
      ok: true,
      canonicalStatus: next,
      storageStatus: toStoragePaymentStatus(next),
      idempotent: true,
    };
  }

  const recoveryToSucceeded =
    next === "succeeded" &&
    options.allowReconciliationRecovery === true &&
    (current === "failed" || current === "expired" || current === "closed");

  if (!recoveryToSucceeded && !ALLOWED_TRANSITIONS[current].includes(next)) {
    return {
      ok: false,
      message: "支付状态流转不合法，请通过对账或人工排查处理",
    };
  }

  return {
    ok: true,
    canonicalStatus: next,
    storageStatus: toStoragePaymentStatus(next),
    idempotent: false,
  };
}
