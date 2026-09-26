import { createHash, timingSafeEqual } from "node:crypto";

export function buildLiuhaoyiSignContent(parameters) {
  return Object.entries(parameters ?? {})
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== null && value !== undefined && String(value) !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

export function createLiuhaoyiMd5Signature(parameters, merchantKey) {
  if (!String(merchantKey ?? "")) throw new Error("六号易商户密钥未配置");
  return createHash("md5")
    .update(buildLiuhaoyiSignContent(parameters) + String(merchantKey), "utf8")
    .digest("hex");
}

export function verifyLiuhaoyiMd5Signature(parameters, merchantKey) {
  const supplied = String(parameters?.sign ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(supplied)) return false;
  const expected = createLiuhaoyiMd5Signature(parameters, merchantKey);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export function liuhaoyiTypeForChannel(channelCode) {
  if (channelCode === "alipay") return "alipay";
  if (channelCode === "wechat" || channelCode === "wechat_pay") return "wxpay";
  throw new Error("六号易不支持该支付渠道");
}

export function liuhaoyiChannelForType(type) {
  if (type === "alipay") return "alipay";
  if (type === "wxpay") return "wechat";
  throw new Error("六号易回调支付渠道不支持");
}

export function isExpectedLiuhaoyiMerchant(parameters, merchantId) {
  return String(parameters?.pid ?? "") === String(merchantId ?? "") && String(merchantId ?? "") !== "";
}

export function liuhaoyiCallbackResponseBody(ok) {
  return ok === true ? "success" : "fail";
}

export function extractLiuhaoyiCreateIdentity(payload) {
  const providerOrderNo = String(payload?.trade_no ?? "").trim().slice(0, 160);
  return providerOrderNo ? { providerOrderNo } : {};
}

function safeHttpsUrl(value) {
  const text = typeof value === "string" ? value.trim().slice(0, 2048) : "";
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safePaymentDeepLink(value) {
  const text = typeof value === "string" ? value.trim().slice(0, 2048) : "";
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return ["alipay:", "alipays:", "weixin:", "weixinpay:"].includes(url.protocol.toLowerCase())
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

function safeQrCodeValue(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 2048) return undefined;
  try {
    const protocol = new URL(text).protocol.toLowerCase();
    return ["https:", "alipay:", "alipays:", "weixin:", "weixinpay:"].includes(protocol)
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

export function selectLiuhaoyiPaymentArtifact(payload) {
  const paymentUrl = safeHttpsUrl(payload?.payurl);
  if (paymentUrl) return { paymentType: "redirect", paymentUrl };

  const qrCodeValue = safeQrCodeValue(payload?.qrcode);
  if (qrCodeValue) return { paymentType: "qrcode", qrCodeValue };

  const deepLinkUrl = safePaymentDeepLink(payload?.urlscheme);
  if (deepLinkUrl) return { paymentType: "deeplink", deepLinkUrl };

  return { paymentType: "redirect" };
}

export function normalizeLiuhaoyiSessionPresentation(input) {
  const paymentUrl = typeof input?.paymentUrl === "string" && input.paymentUrl.trim()
    ? input.paymentUrl.trim()
    : undefined;
  const qrCodeUrl = typeof input?.qrCodeUrl === "string" && input.qrCodeUrl.trim()
    ? input.qrCodeUrl.trim()
    : undefined;
  const qrCodeValue = typeof input?.qrCodeValue === "string" && input.qrCodeValue.trim()
    ? safeQrCodeValue(input.qrCodeValue)
    : undefined;
  const isLiuhaoyiCheckout = input?.provider === "liuhaoyi"
    && ["alipay", "wechat", "wechat_pay"].includes(input?.channelCode);
  const legacyQrCodeValue = isLiuhaoyiCheckout && !paymentUrl && !qrCodeValue
    ? safeQrCodeValue(qrCodeUrl)
    : undefined;

  if (legacyQrCodeValue) {
    return { paymentType: "qrcode", paymentUrl: undefined, qrCodeUrl: undefined, qrCodeValue: legacyQrCodeValue };
  }
  if (isLiuhaoyiCheckout && input?.paymentType === "deeplink") {
    return { paymentType: "deeplink", deepLinkUrl: safePaymentDeepLink(paymentUrl) };
  }
  const result = {
    paymentType: input?.paymentType === "qrcode" || input?.paymentType === "address" || input?.paymentType === "deeplink"
      ? input.paymentType
      : "redirect",
    paymentUrl,
    qrCodeUrl: isLiuhaoyiCheckout ? undefined : qrCodeUrl,
  };
  return isLiuhaoyiCheckout && qrCodeValue ? { ...result, qrCodeValue } : result;
}

export function parseLiuhaoyiQuery(input) {
  const parameters = input instanceof URLSearchParams ? input : new URLSearchParams(String(input ?? ""));
  return Object.fromEntries(parameters.entries());
}

export function liuhaoyiPaidTimeMs(value) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const text = value.trim();
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text);
  if (local) return Date.parse(`${local[1]}T${local[2]}+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return Number.NaN;
  }
  return Date.parse(text);
}

export function normalizeLiuhaoyiPaidAt(value) {
  const timestamp = liuhaoyiPaidTimeMs(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
