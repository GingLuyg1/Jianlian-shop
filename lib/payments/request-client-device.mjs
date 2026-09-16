const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|mobile/i;

export function derivePaymentClientDevice(userAgent) {
  const value = typeof userAgent === "string" ? userAgent.slice(0, 1024) : "";
  if (/micromessenger/i.test(value)) return "wechat";
  if (/alipayclient/i.test(value)) return "alipay";
  if (MOBILE_USER_AGENT.test(value)) return "mobile";
  return "pc";
}

export function normalizePaymentClientDevice(value) {
  return ["pc", "mobile", "wechat", "alipay"].includes(value) ? value : "pc";
}
