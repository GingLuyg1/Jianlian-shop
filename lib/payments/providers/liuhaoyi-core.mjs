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

export function parseLiuhaoyiQuery(input) {
  const parameters = input instanceof URLSearchParams ? input : new URLSearchParams(String(input ?? ""));
  return Object.fromEntries(parameters.entries());
}
