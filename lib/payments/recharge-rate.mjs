const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

function parseDecimal(value, options = {}) {
  const { maxScale = 18, allowZero = false } = options;
  if (typeof value !== "string") return null;
  const text = value.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match || (match[1]?.length ?? 0) > maxScale) return null;
  const [whole, fraction = ""] = text.split(".");
  const coefficient = BigInt(`${whole}${fraction}`);
  if (!allowZero && coefficient <= 0n) return null;
  return { coefficient, scale: fraction.length };
}

function pow10(scale) {
  return 10n ** BigInt(scale);
}

function formatScaled(value, scale) {
  const whole = value / pow10(scale);
  if (scale === 0) return whole.toString();
  const fraction = (value % pow10(scale)).toString().padStart(scale, "0");
  return `${whole}.${fraction}`;
}

export function deriveRechargeSettlementRate(marketRate) {
  const parsed = parseDecimal(marketRate, { maxScale: 6 });
  if (!parsed) return null;
  const tenths = parsed.coefficient * 10n / pow10(parsed.scale);
  if (tenths <= 0n) return null;
  return formatScaled(tenths, 1);
}

export function calculateExpectedUsdtAmount(requestedCnyAmount, settlementRate) {
  const requested = parseDecimal(requestedCnyAmount, { maxScale: 2 });
  const rate = parseDecimal(settlementRate, { maxScale: 1 });
  if (!requested || !rate) return null;
  const numerator = requested.coefficient * pow10(rate.scale + 6);
  const denominator = rate.coefficient * pow10(requested.scale);
  const scaled = (numerator + denominator - 1n) / denominator;
  return formatScaled(scaled, 6);
}

export function calculateCreditedCnyAmount(actualReceivedUsdt, settlementRate) {
  const actual = parseDecimal(actualReceivedUsdt, { maxScale: 18 });
  const rate = parseDecimal(settlementRate, { maxScale: 1 });
  if (!actual || !rate) return null;
  const product = actual.coefficient * rate.coefficient;
  const productScale = actual.scale + rate.scale;
  const cents = productScale <= 2
    ? product * pow10(2 - productScale)
    : product / pow10(productScale - 2);
  return formatScaled(cents, 2);
}

export function parseRequestedCnyAmount(value) {
  const parsed = parseDecimal(value, { maxScale: 2 });
  if (!parsed) return null;
  return formatScaled(parsed.coefficient, parsed.scale);
}

export function compareRechargeDecimals(leftValue, rightValue) {
  const left = parseDecimal(leftValue, { maxScale: 18, allowZero: true });
  const right = parseDecimal(rightValue, { maxScale: 18, allowZero: true });
  if (!left || !right) return null;
  const scale = Math.max(left.scale, right.scale);
  const leftScaled = left.coefficient * pow10(scale - left.scale);
  const rightScaled = right.coefficient * pow10(scale - right.scale);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

export function isCanonicalRechargeRate(value) {
  return typeof value === "string"
    && /^\d+\.\d$/.test(value)
    && parseDecimal(value, { maxScale: 1 }) !== null;
}
