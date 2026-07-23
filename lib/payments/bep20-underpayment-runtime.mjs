export class Bep20UnderpaymentRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Bep20UnderpaymentRuntimeError";
    this.code = code;
  }
}

export function readBep20UnderpaymentConfirmations(value) {
  const text = String(value ?? "").trim();
  const parsed = Number(text);
  if (!text || !Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Bep20UnderpaymentRuntimeError(
      "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID",
      "BEP20 确认数配置缺失或格式错误",
    );
  }
  return parsed;
}

export function isBep20UnderpaymentIrreversibleConfirmation(value) {
  return value === true;
}

export function summarizeBep20UnderpaymentSessionId(value) {
  const text = String(value ?? "");
  return text.length > 16 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text;
}

function parseUnsignedDecimal(value) {
  const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Bep20UnderpaymentRuntimeError(
      "BEP20_UNDERPAYMENT_PREVIEW_AMOUNT_INVALID",
      "欠额结算预览金额无效",
    );
  }
  const fraction = match[2] ?? "";
  return {
    coefficient: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  };
}

function formatUnsignedDecimal(coefficient, scale) {
  const negative = coefficient < 0n;
  const absolute = negative ? -coefficient : coefficient;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const integer = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function alignUnsignedDecimals(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * 10n ** BigInt(scale - left.scale),
    right: right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

export function subtractBep20UnderpaymentDecimal(left, right) {
  const aligned = alignUnsignedDecimals(parseUnsignedDecimal(left), parseUnsignedDecimal(right));
  if (aligned.left < aligned.right) {
    throw new Bep20UnderpaymentRuntimeError(
      "BEP20_UNDERPAYMENT_PREVIEW_AMOUNT_INVALID",
      "欠额结算预览金额顺序无效",
    );
  }
  return formatUnsignedDecimal(aligned.left - aligned.right, aligned.scale);
}

export function addBep20UnderpaymentDecimal(left, right) {
  const aligned = alignUnsignedDecimals(parseUnsignedDecimal(left), parseUnsignedDecimal(right));
  return formatUnsignedDecimal(aligned.left + aligned.right, aligned.scale);
}

export function multiplyBep20UnderpaymentDecimalToCny(amount, exchangeRate) {
  const left = parseUnsignedDecimal(amount);
  const right = parseUnsignedDecimal(exchangeRate);
  const coefficient = left.coefficient * right.coefficient;
  const scale = left.scale + right.scale;
  if (scale <= 2) {
    return formatUnsignedDecimal(coefficient * 10n ** BigInt(2 - scale), 2);
  }
  const divisor = 10n ** BigInt(scale - 2);
  const quotient = coefficient / divisor;
  const remainder = coefficient % divisor;
  const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  return formatUnsignedDecimal(rounded, 2);
}

export async function readBep20UnderpaymentCandidatesSafely(readCandidates) {
  try {
    return { ok: true, candidates: await readCandidates() };
  } catch {
    return {
      ok: false,
      code: "BEP20_UNDERPAYMENT_LIST_FAILED",
      candidates: [],
    };
  }
}

export async function settleBep20UnderpaymentCandidates(candidates, settle, onError) {
  const results = [];
  for (const sessionId of candidates) {
    try {
      results.push(await settle(sessionId));
    } catch (error) {
      results.push(onError(sessionId, error));
    }
  }
  return results;
}

export function summarizeBep20UnderpaymentBatch(results) {
  return {
    processed: results.filter((item) => item.code === "SETTLED").length,
    skipped: results.filter((item) => item.code === "ALREADY_SETTLED").length,
    failed: results.filter((item) => !item.ok).length,
  };
}
