// A stable display alias only; never send this value to payment/order APIs.
export function rechargeDisplayNumber(rechargeNo: string) {
  let hash = 2166136261;
  for (const char of rechargeNo) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return String((hash >>> 0) % 1000000).padStart(6, "0");
}

export function rechargeCreditedCny(record: { creditedCnyAmount: string | null; creditedAmount: number; currency: string }) {
  const value = record.creditedCnyAmount !== null && record.creditedCnyAmount !== ""
    ? Number(record.creditedCnyAmount) : record.currency === "CNY" ? record.creditedAmount : null;
  return value !== null && Number.isFinite(value) ? `¥${value.toFixed(2)}` : "—";
}

export function meaningfulBalanceRemark(value: string | null) {
  return value?.split(/\r?\n/).map(line => line.trim()).filter(line => line
    && !/^(?:订单余额支付|账户充值入账)[。！!]?$/u.test(line)
    && !/测试环境|测试余额充值/u.test(line)
    && !/^USDT-BEP20 fingerprint recharge credited by exact requested CNY amount[.!]?$/i.test(line)
  ).join("\n") ?? "";
}

export function balanceRechargeChannel(record: { channelName?: string | null; channelCode?: string | null; remark: string | null }, knownName?: string) {
  if (record.channelName?.trim()) return record.channelName;
  const names: Record<string, string> = { alipay: "支付宝", wechat: "微信支付", usdt_bep20: "USDT BEP20" };
  if (record.channelCode && names[record.channelCode]) return names[record.channelCode];
  if (knownName) return knownName;
  // This exact ledger remark is written only by the existing BEP20 credit RPC.
  if (record.remark?.includes("USDT-BEP20 fingerprint recharge credited by exact requested CNY amount")) return "USDT BEP20";
  return "暂不可用";
}
