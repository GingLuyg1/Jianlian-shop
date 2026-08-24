// @ts-check

/**
 * @typedef {{ userId: string; recipientEmail: string | null | undefined; rechargeId: string | null | undefined; rechargeNo: string | null | undefined; creditedAmount: unknown; currency: string | null | undefined; source: string }} RechargeSuccessEmailInput
 * @typedef {{ ok: true; deduped: boolean; job: unknown } | { ok: false; error: string }} QueueEmailResult
 * @typedef {"missing_recipient_email" | "missing_recharge_identity" | "invalid_credited_amount" | "invalid_currency" | "queue_failed"} RechargeSuccessEmailWarningReason
 * @typedef {{ rechargeId?: string | null; reason: RechargeSuccessEmailWarningReason }} RechargeSuccessEmailWarningContext
 * @typedef {{
 *   queue: (input: import("./jobs").QueueBusinessEmailInput) => Promise<QueueEmailResult>;
 *   createIdempotencyKey: (parts: Array<string | number | null | undefined>) => string;
 *   warn: (code: string, context: RechargeSuccessEmailWarningContext) => void;
 * }} RechargeSuccessEmailDependencies
 * @typedef {{ ok: true; queued: true; deduped: boolean; job: unknown } | { ok: true; queued: false; skipped?: string; error?: string }} RechargeSuccessEmailResult
 */

/** @param {RechargeSuccessEmailDependencies} dependencies @param {string} code @param {RechargeSuccessEmailWarningContext} context */
function safeWarn(dependencies, code, context) {
  try {
    dependencies.warn(code, context);
  } catch {
    // Email warning failures must never escape into the recharge business path.
  }
}

/** @param {string} decimal */
function normalizeScaleSixDecimal(decimal) {
  const [whole, rawDecimals = ""] = decimal.split(".");
  let decimals = rawDecimals.padEnd(2, "0");
  while (decimals.length > 2 && decimals.endsWith("0")) decimals = decimals.slice(0, -1);
  return `${whole}.${decimals}`;
}

/** @param {unknown} value @returns {string} @throws {RangeError} */
export function formatRechargeCreditedAmount(value) {
  if (typeof value === "string") {
    const decimal = value.trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(decimal) || Number(decimal) <= 0) {
      throw new RangeError("credited_amount must be a positive plain decimal with at most 6 fractional digits");
    }
    return normalizeScaleSixDecimal(decimal);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError("credited_amount must be a finite positive number");
  }
  const scaled = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError("credited_amount exceeds safe numeric(18,6) representation");
  }
  const fixed = value.toFixed(6);
  const stabilized = Number(fixed);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  if (Math.abs(value - stabilized) > tolerance) {
    throw new RangeError("credited_amount has more than 6 significant fractional digits");
  }
  return normalizeScaleSixDecimal(fixed);
}

/** @param {RechargeSuccessEmailInput} input @param {RechargeSuccessEmailDependencies} dependencies @returns {Promise<RechargeSuccessEmailResult>} */
export async function queueRechargeSuccessEmailRuntime(input, dependencies) {
  const rechargeId = typeof input.rechargeId === "string" ? input.rechargeId.trim() : "";
  const rechargeNo = typeof input.rechargeNo === "string" ? input.rechargeNo.trim() : "";
  const recipientEmail = typeof input.recipientEmail === "string" ? input.recipientEmail.trim() : "";
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";

  if (!recipientEmail) {
    safeWarn(dependencies, "missing_recipient_email", { rechargeId: rechargeId || null, reason: "missing_recipient_email" });
    return { ok: true, queued: false, skipped: "missing_recipient_email" };
  }
  if (!rechargeId || !rechargeNo) {
    safeWarn(dependencies, "missing_recharge_identity", { rechargeId: rechargeId || null, reason: "missing_recharge_identity" });
    return { ok: true, queued: false, skipped: "missing_recharge_identity" };
  }
  if (!currency) {
    safeWarn(dependencies, "invalid_currency", { rechargeId, reason: "invalid_currency" });
    return { ok: true, queued: false, skipped: "invalid_currency" };
  }

  try {
    const creditedAmount = formatRechargeCreditedAmount(input.creditedAmount);
    const result = await dependencies.queue({
      userId: input.userId,
      recipientEmail,
      templateCode: "recharge_success",
      variables: {
        recharge_no: rechargeNo,
        credited_amount: creditedAmount,
        currency,
      },
      businessType: "recharge",
      businessId: rechargeId,
      businessNo: rechargeNo,
      idempotencyKey: dependencies.createIdempotencyKey(["email", "recharge_success", "recharge", rechargeId, "v1"]),
      metadata: { source: input.source },
    });
    if (!result.ok) {
      safeWarn(dependencies, "queue_failed", { rechargeId, reason: "queue_failed" });
      return { ok: true, queued: false, error: "queue_failed" };
    }
    return { ok: true, queued: true, deduped: result.deduped, job: result.job };
  } catch (error) {
    /** @type {RechargeSuccessEmailWarningReason} */
    const reason = error instanceof RangeError ? "invalid_credited_amount" : "queue_failed";
    safeWarn(dependencies, reason, { rechargeId, reason });
    return { ok: true, queued: false, error: reason };
  }
}
