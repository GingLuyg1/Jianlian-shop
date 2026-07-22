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
