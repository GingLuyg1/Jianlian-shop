export const LIUHAOYI_MIN_PAYMENT_CENTS = 100n;
export const LIUHAOYI_MAX_PAYMENT_CENTS = 200000n;

export function isLiuhaoyiPaymentMethod(value) {
  return value === "alipay" || value === "wechat_pay" || value === "wechat";
}

export function cnyToMinorUnits(value) {
  const normalized = typeof value === "number"
    ? (Number.isFinite(value) ? value.toFixed(2) : "")
    : String(value ?? "").trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function isLiuhaoyiAmountOverLimit(value) {
  const cents = cnyToMinorUnits(value);
  return cents !== null && cents > LIUHAOYI_MAX_PAYMENT_CENTS;
}

export function assertLiuhaoyiPaymentAmount(value) {
  const cents = cnyToMinorUnits(value);
  if (cents === null) {
    throw new Error("六号易支付金额必须是最多两位小数的人民币金额");
  }
  if (cents < LIUHAOYI_MIN_PAYMENT_CENTS) {
    throw new Error("六号易单笔支付金额最低为 ¥1");
  }
  if (cents > LIUHAOYI_MAX_PAYMENT_CENTS) {
    throw new Error("支付宝/微信单笔支付最高支持 ¥2000");
  }
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function assertLiuhaoyiAmountBreakdown(requestedAmount, feeAmount, payableAmount) {
  const requested = assertLiuhaoyiPaymentAmount(requestedAmount);
  const requestedCents = cnyToMinorUnits(requestedAmount);
  const feeCents = cnyToMinorUnits(feeAmount);
  const payableCents = cnyToMinorUnits(payableAmount);
  if (feeCents !== 0n || requestedCents === null || payableCents !== requestedCents) {
    throw new Error("六号易支付不得由本站附加买家手续费");
  }
  return requested;
}
