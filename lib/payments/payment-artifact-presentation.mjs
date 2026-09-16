const MAX_PROVIDER_ARTIFACT_LENGTH = 2048;

function normalizedChannel(value) {
  if (value === "wechat_pay") return "wechat";
  return value === "wechat" || value === "alipay" ? value : "";
}

export function isMobilePaymentContext(clientDevice) {
  return ["mobile", "wechat", "alipay"].includes(String(clientDevice ?? ""));
}

export function getQrPayloadOpenAction({ value, channelCode, clientDevice }) {
  if (!isMobilePaymentContext(clientDevice)) return null;
  const channel = normalizedChannel(channelCode);
  const text = typeof value === "string" ? value.trim() : "";
  if (!channel || !text || text.length > MAX_PROVIDER_ARTIFACT_LENGTH) return null;

  let protocol = "";
  try {
    protocol = new URL(text).protocol.toLowerCase();
  } catch {
    return null;
  }

  const channelProtocolAllowed = channel === "wechat"
    ? ["https:", "weixin:", "weixinpay:"].includes(protocol)
    : ["https:", "alipay:", "alipays:"].includes(protocol);
  if (!channelProtocolAllowed) return null;

  return {
    href: text,
    label: channel === "wechat" ? "打开微信支付" : "打开支付宝支付",
    fallbackText: channel === "wechat"
      ? "如无法直接打开微信，请使用另一台设备扫描二维码。"
      : "如无法直接打开支付宝，请使用另一台设备扫描二维码。",
  };
}
