export function toMinorUnits(value, decimals = 2) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("金额格式不正确");
  const [whole, fraction = ""] = text.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  if (fraction.length > decimals) throw new Error("金额小数位超出限制");
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(padded || "0");
}

export function formatMinorUnits(value, decimals = 2) {
  const amount = BigInt(value);
  const base = BigInt(10 ** decimals);
  const whole = amount / base;
  const fraction = String(amount % base).padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

export function calculateOrderTotal(items) {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("商品数量必须是正整数");
    return total + toMinorUnits(item.serverUnitPrice) * BigInt(quantity);
  }, 0n);
}

export function createIdempotencyStore() {
  const records = new Map();
  return {
    resolve(key, create) {
      if (records.has(key)) return { reused: true, value: records.get(key) };
      const value = create();
      records.set(key, value);
      return { reused: false, value };
    },
    get size() {
      return records.size;
    },
  };
}

export function validatePaymentCallback(session, callback) {
  if (!session.providerConfigured) return { ok: false, reason: "支付渠道暂未配置" };
  if (session.status === "paid") return { ok: true, duplicate: true };
  if (String(session.currency) !== String(callback.currency)) return { ok: false, reason: "支付币种不一致" };
  if (toMinorUnits(callback.amount, session.decimals ?? 2) !== toMinorUnits(session.payableAmount, session.decimals ?? 2)) {
    return { ok: false, reason: "支付金额不一致" };
  }
  if (!callback.signatureValid) return { ok: false, reason: "支付回调验签失败" };
  return { ok: true, duplicate: false };
}

export function applyRechargeCallback(state, callback) {
  const validation = validatePaymentCallback(state.session, callback);
  if (!validation.ok) return { ...state, accepted: false, reason: validation.reason };
  if (validation.duplicate || state.processedCallbackIds.has(callback.callbackId)) {
    return { ...state, accepted: true, duplicate: true };
  }

  return {
    ...state,
    accepted: true,
    duplicate: false,
    session: { ...state.session, status: "paid" },
    balanceMinor: state.balanceMinor + toMinorUnits(state.session.creditedAmount, state.session.decimals ?? 2),
    ledgerCount: state.ledgerCount + 1,
    processedCallbackIds: new Set([...state.processedCallbackIds, callback.callbackId]),
  };
}
