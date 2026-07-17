const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export function createBep20CompletionInput(expectedAmount, txHash, logIndex) {
  const amount = String(expectedAmount ?? "").trim();
  if (!DECIMAL_PATTERN.test(amount) || amount === "0" || /^0(?:\.0+)?$/.test(amount)) {
    throw new Error("BEP20_EXPECTED_AMOUNT_INVALID");
  }
  return {
    amount,
    currency: "USDT",
    providerTransactionId: `${String(txHash).toLowerCase()}:${Number(logIndex)}`,
  };
}

export function decideBep20TransferStatus(input) {
  const raw = BigInt(input.rawAmount);
  const expected = BigInt(input.expectedRawAmount);
  const transferTime = Date.parse(input.transferTimestamp);
  const deadlines = [input.sessionExpiresAt, input.exchangeRateExpiresAt]
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  const deadline = deadlines.length ? Math.min(...deadlines) : Number.NaN;

  if (!Number.isFinite(transferTime)) return "manual_review";
  if (Number.isFinite(deadline) && transferTime > deadline) return "manual_review";
  if (raw < expected) return "underpaid";
  if (raw > expected) return "manual_review";
  if (Number(input.confirmations) < Number(input.requiredConfirmations)) return "confirming";
  return "verified";
}

export function parseEvmUint256(value) {
  const text = String(value ?? "").trim();
  if (!/^0x[0-9a-f]{64}$/i.test(text)) throw new Error("EVM_UINT256_INVALID");
  const parsed = BigInt(text);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("EVM_UINT256_UNSAFE");
  return Number(parsed);
}

export function validateTokenDecimalsResult(rpcResult, configuredDecimals) {
  const actual = parseEvmUint256(rpcResult);
  const configured = Number(configuredDecimals);
  if (!Number.isInteger(actual) || actual < 0 || actual > 36) return false;
  if (!Number.isInteger(configured) || configured < 0 || configured > 36) return false;
  return actual === configured;
}

export async function checkTokenDecimalsWithRpc(rpcCall, tokenContract, configuredDecimals) {
  const result = await rpcCall("eth_call", [{ to: tokenContract, data: "0x313ce567" }, "latest"]);
  return validateTokenDecimalsResult(result, configuredDecimals);
}

export function createSharedAsyncCheck() {
  const inFlight = new Map();
  return async function run(key, operation) {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = Promise.resolve().then(operation);
    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  };
}

export function validateFrozenSettlement(input) {
  const paidCurrency = String(input.paidCurrency ?? "").trim().toUpperCase();
  const sessionCurrency = String(input.sessionCurrency ?? "").trim().toUpperCase();
  if (!paidCurrency || paidCurrency !== sessionCurrency) return { ok: false, reason: "currency_mismatch" };
  const paid = decimalToSixUnits(input.paidAmount);
  const payable = decimalToSixUnits(input.payableAmount);
  if (paid < payable) return { ok: false, reason: "underpaid" };
  if (paid > payable) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, reason: "matched" };
}

export function normalizeBep20TxHash(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) throw new Error("TX_HASH_INVALID");
  return text;
}

function decimalToSixUnits(value) {
  const text = String(value ?? "").trim();
  if (!DECIMAL_PATTERN.test(text)) throw new Error("SETTLEMENT_AMOUNT_INVALID");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > 6) throw new Error("SETTLEMENT_SCALE_INVALID");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}
