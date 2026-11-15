// scripts/internal/snpay-production-canary.ts
import { readFile, stat } from "node:fs/promises";

// lib/payments/payment-errors.ts
function getSafeErrorMessage(error, fallback = "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5") {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

// lib/payments/payment-expiry.mjs
var PAYMENT_SESSION_EXPIRY_MINUTES = 15;
var PAYMENT_SESSION_EXPIRY_MS = PAYMENT_SESSION_EXPIRY_MINUTES * 60 * 1e3;
function createPaymentExpiryWindow(now = /* @__PURE__ */ new Date()) {
  const createdAtMs = new Date(now).getTime();
  if (!Number.isFinite(createdAtMs)) throw new TypeError("Invalid payment creation time");
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + PAYMENT_SESSION_EXPIRY_MS).toISOString()
  };
}

// lib/payments/recharge-rate.mjs
var DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;
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
function parseRequestedCnyAmount(value) {
  const parsed = parseDecimal(value, { maxScale: 2 });
  if (!parsed) return null;
  return formatScaled(parsed.coefficient, parsed.scale);
}
function compareRechargeDecimals(leftValue, rightValue) {
  const left = parseDecimal(leftValue, { maxScale: 18, allowZero: true });
  const right = parseDecimal(rightValue, { maxScale: 18, allowZero: true });
  if (!left || !right) return null;
  const scale = Math.max(left.scale, right.scale);
  const leftScaled = left.coefficient * pow10(scale - left.scale);
  const rightScaled = right.coefficient * pow10(scale - right.scale);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

// lib/payments/online-payment-policy.mjs
var ONLINE_CNY_MAXIMUM = 2e3;
var ONLINE_PAYMENT_LIMIT_MESSAGE = "\u652F\u4ED8\u91D1\u989D\u5927\u4E8E2000\u8054\u7CFB\u4EBA\u5DE5\u5BA2\u670D\u5904\u7406\u3002";
function isOnlineCnyOverLimit(value) {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  return compareRechargeDecimals(text, String(ONLINE_CNY_MAXIMUM)) === 1;
}
function isStrictPositiveCny(value) {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  return parseRequestedCnyAmount(text) !== null;
}

// lib/payments/provider-contracts.mjs
var DEFAULT_DEEP_LINK_SCHEMES = /* @__PURE__ */ new Set(["alipay:", "alipays:", "weixin:", "weixinpay:"]);
function safeHttps(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
function safeDeepLink(value, schemes = DEFAULT_DEEP_LINK_SCHEMES) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return schemes.has(url.protocol.toLowerCase()) ? value : null;
  } catch {
    return null;
  }
}
function paymentArtifactFromCreateResult(result) {
  if (!result || typeof result !== "object") return null;
  const fallbackUrl = safeHttps(result.paymentUrl);
  if (result.paymentType === "redirect") {
    return fallbackUrl ? { type: "redirect", url: fallbackUrl } : null;
  }
  if (result.paymentType === "qrcode") {
    const payload = typeof result.qrCodeValue === "string" ? result.qrCodeValue.trim() : "";
    if (!payload || payload.length > 4096 || /[\u0000-\u001F\u007F]/.test(payload)) return null;
    return fallbackUrl ? { type: "qrcode", payload, fallbackUrl } : { type: "qrcode", payload };
  }
  if (result.paymentType === "deeplink") {
    const url = safeDeepLink(result.deepLinkUrl);
    if (!url) return null;
    return fallbackUrl ? { type: "deeplink", url, fallbackUrl } : { type: "deeplink", url };
  }
  if (result.paymentType === "address") {
    const address = typeof result.walletAddress === "string" ? result.walletAddress.trim() : "";
    const network = typeof result.network === "string" ? result.network.trim() : "";
    return address && address.length <= 256 && network && network.length <= 32 ? { type: "address", address, network } : null;
  }
  return null;
}
function providerAmountWithinLimits(capability, channel, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || !capability) return false;
  if (capability.supportedCurrencies?.length === 1 && capability.supportedCurrencies[0] === "CNY" && !isStrictPositiveCny(amount)) return false;
  for (const maximum of [channel?.maximumAmount, capability.maximumAmount]) {
    if (maximum !== null && maximum !== void 0 && (!Number.isFinite(Number(maximum)) || Number(maximum) <= 0)) return false;
  }
  const minimum = Math.max(Number(channel?.minimumAmount ?? 0), Number(capability.minimumAmount ?? 0));
  const maximums = [channel?.maximumAmount, capability.maximumAmount].filter((item) => item !== null && item !== void 0).map(Number).filter((item) => Number.isFinite(item) && item > 0);
  return value >= minimum && (maximums.length === 0 || value <= Math.min(...maximums));
}
function providerSupportsChannel(capability, channel, currency) {
  return Boolean(capability?.supportedChannels?.includes(channel) && capability?.supportedCurrencies?.includes(currency));
}

// lib/payments/liuhaoyi-limits.mjs
var LIUHAOYI_MIN_PAYMENT_CENTS = 100n;
var LIUHAOYI_MAX_PAYMENT_CENTS = 200000n;
function isLiuhaoyiPaymentMethod(value) {
  return value === "alipay" || value === "wechat_pay" || value === "wechat";
}
function cnyToMinorUnits(value) {
  const normalized = typeof value === "number" ? Number.isFinite(value) ? value.toFixed(2) : "" : String(value ?? "").trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}
function assertLiuhaoyiPaymentAmount(value) {
  const cents = cnyToMinorUnits(value);
  if (cents === null) {
    throw new Error("\u516D\u53F7\u6613\u652F\u4ED8\u91D1\u989D\u5FC5\u987B\u662F\u6700\u591A\u4E24\u4F4D\u5C0F\u6570\u7684\u4EBA\u6C11\u5E01\u91D1\u989D");
  }
  if (cents < LIUHAOYI_MIN_PAYMENT_CENTS) {
    throw new Error("\u516D\u53F7\u6613\u5355\u7B14\u652F\u4ED8\u91D1\u989D\u6700\u4F4E\u4E3A \xA51");
  }
  if (cents > LIUHAOYI_MAX_PAYMENT_CENTS) {
    throw new Error("\u652F\u4ED8\u5B9D/\u5FAE\u4FE1\u5355\u7B14\u652F\u4ED8\u6700\u9AD8\u652F\u6301 \xA52000");
  }
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
function assertLiuhaoyiAmountBreakdown(requestedAmount, feeAmount, payableAmount) {
  const requested = assertLiuhaoyiPaymentAmount(requestedAmount);
  const requestedCents = cnyToMinorUnits(requestedAmount);
  const feeCents = cnyToMinorUnits(feeAmount);
  const payableCents = cnyToMinorUnits(payableAmount);
  if (feeCents !== 0n || requestedCents === null || payableCents !== requestedCents) {
    throw new Error("\u516D\u53F7\u6613\u652F\u4ED8\u4E0D\u5F97\u7531\u672C\u7AD9\u9644\u52A0\u4E70\u5BB6\u624B\u7EED\u8D39");
  }
  return requested;
}

// lib/payments/providers/liuhaoyi-core.mjs
import { createHash, timingSafeEqual } from "node:crypto";
function buildLiuhaoyiSignContent(parameters) {
  return Object.entries(parameters ?? {}).filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== null && value !== void 0 && String(value) !== "").sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${String(value)}`).join("&");
}
function createLiuhaoyiMd5Signature(parameters, merchantKey) {
  if (!String(merchantKey ?? "")) throw new Error("\u516D\u53F7\u6613\u5546\u6237\u5BC6\u94A5\u672A\u914D\u7F6E");
  return createHash("md5").update(buildLiuhaoyiSignContent(parameters) + String(merchantKey), "utf8").digest("hex");
}
function verifyLiuhaoyiMd5Signature(parameters, merchantKey) {
  const supplied = String(parameters?.sign ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(supplied)) return false;
  const expected = createLiuhaoyiMd5Signature(parameters, merchantKey);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
function liuhaoyiTypeForChannel(channelCode) {
  if (channelCode === "alipay") return "alipay";
  if (channelCode === "wechat" || channelCode === "wechat_pay") return "wxpay";
  throw new Error("\u516D\u53F7\u6613\u4E0D\u652F\u6301\u8BE5\u652F\u4ED8\u6E20\u9053");
}
function liuhaoyiChannelForType(type) {
  if (type === "alipay") return "alipay";
  if (type === "wxpay") return "wechat";
  throw new Error("\u516D\u53F7\u6613\u56DE\u8C03\u652F\u4ED8\u6E20\u9053\u4E0D\u652F\u6301");
}
function isExpectedLiuhaoyiMerchant(parameters, merchantId) {
  return String(parameters?.pid ?? "") === String(merchantId ?? "") && String(merchantId ?? "") !== "";
}
function liuhaoyiCallbackResponseBody(ok) {
  return ok === true ? "success" : "fail";
}
function extractLiuhaoyiCreateIdentity(payload) {
  const providerOrderNo = String(payload?.trade_no ?? "").trim().slice(0, 160);
  return providerOrderNo ? { providerOrderNo } : {};
}
function safeHttpsUrl(value) {
  const text = typeof value === "string" ? value.trim().slice(0, 2048) : "";
  if (!text) return void 0;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : void 0;
  } catch {
    return void 0;
  }
}
function safePaymentDeepLink(value) {
  const text = typeof value === "string" ? value.trim().slice(0, 2048) : "";
  if (!text) return void 0;
  try {
    const url = new URL(text);
    return ["alipay:", "alipays:", "weixin:", "weixinpay:"].includes(url.protocol.toLowerCase()) ? text : void 0;
  } catch {
    return void 0;
  }
}
function safeQrCodeValue(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 2048) return void 0;
  try {
    const protocol = new URL(text).protocol.toLowerCase();
    return ["https:", "alipay:", "alipays:", "weixin:", "weixinpay:"].includes(protocol) ? text : void 0;
  } catch {
    return void 0;
  }
}
function selectLiuhaoyiPaymentArtifact(payload) {
  const paymentUrl = safeHttpsUrl(payload?.payurl);
  if (paymentUrl) return { paymentType: "redirect", paymentUrl };
  const qrCodeValue = safeQrCodeValue(payload?.qrcode);
  if (qrCodeValue) return { paymentType: "qrcode", qrCodeValue };
  const deepLinkUrl = safePaymentDeepLink(payload?.urlscheme);
  if (deepLinkUrl) return { paymentType: "deeplink", deepLinkUrl };
  return { paymentType: "redirect" };
}
function normalizeLiuhaoyiSessionPresentation(input) {
  const paymentUrl = typeof input?.paymentUrl === "string" && input.paymentUrl.trim() ? input.paymentUrl.trim() : void 0;
  const qrCodeUrl = typeof input?.qrCodeUrl === "string" && input.qrCodeUrl.trim() ? input.qrCodeUrl.trim() : void 0;
  const qrCodeValue = typeof input?.qrCodeValue === "string" && input.qrCodeValue.trim() ? safeQrCodeValue(input.qrCodeValue) : void 0;
  const isLiuhaoyiCheckout = input?.provider === "liuhaoyi" && ["alipay", "wechat", "wechat_pay"].includes(input?.channelCode);
  const legacyQrCodeValue = isLiuhaoyiCheckout && !paymentUrl && !qrCodeValue ? safeQrCodeValue(qrCodeUrl) : void 0;
  if (legacyQrCodeValue) {
    return { paymentType: "qrcode", paymentUrl: void 0, qrCodeUrl: void 0, qrCodeValue: legacyQrCodeValue };
  }
  if (isLiuhaoyiCheckout && input?.paymentType === "deeplink") {
    return { paymentType: "deeplink", deepLinkUrl: safePaymentDeepLink(paymentUrl) };
  }
  const result = {
    paymentType: input?.paymentType === "qrcode" || input?.paymentType === "address" || input?.paymentType === "deeplink" ? input.paymentType : "redirect",
    paymentUrl,
    qrCodeUrl: isLiuhaoyiCheckout ? void 0 : qrCodeUrl
  };
  return isLiuhaoyiCheckout && qrCodeValue ? { ...result, qrCodeValue } : result;
}
function parseLiuhaoyiQuery(input) {
  const parameters = input instanceof URLSearchParams ? input : new URLSearchParams(String(input ?? ""));
  return Object.fromEntries(parameters.entries());
}
function liuhaoyiPaidTimeMs(value) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const text = value.trim();
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text);
  if (local) return Date.parse(`${local[1]}T${local[2]}+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return Number.NaN;
  }
  return Date.parse(text);
}
function normalizeLiuhaoyiPaidAt(value) {
  const timestamp = liuhaoyiPaidTimeMs(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// lib/payments/request-client-device.mjs
function normalizePaymentClientDevice(value) {
  return ["pc", "mobile", "wechat", "alipay"].includes(value) ? value : "pc";
}

// lib/payments/providers/liuhaoyi-submit.mjs
var FORM_FIELDS = ["pid", "type", "out_trade_no", "notify_url", "return_url", "name", "money", "sign_type", "sign"];
function buildLiuhaoyiSubmitForm({ apiBaseUrl, merchantId, merchantKey, channelCode, sessionNo, notifyUrl, returnUrl, subject, money: money2 }) {
  const action = new URL("submit.php", apiBaseUrl);
  if (action.protocol !== "https:" || action.username || action.password) throw new Error("\u516D\u53F7\u6613\u63D0\u4EA4\u5730\u5740\u65E0\u6548");
  const unsigned = {
    pid: String(merchantId),
    type: liuhaoyiTypeForChannel(channelCode),
    out_trade_no: String(sessionNo),
    notify_url: String(notifyUrl),
    return_url: String(returnUrl),
    name: String(subject).slice(0, 127),
    money: String(money2)
  };
  const fields = { ...unsigned, sign_type: "MD5", sign: createLiuhaoyiMd5Signature(unsigned, merchantKey) };
  return { action: action.toString(), method: "POST", fields };
}
function normalizeLiuhaoyiSubmitForm(value) {
  if (!value || typeof value !== "object" || value.method !== "POST") return null;
  let action;
  try {
    action = new URL(value.action);
    if (action.protocol !== "https:" || action.username || action.password || !action.pathname.endsWith("/submit.php")) return null;
  } catch {
    return null;
  }
  const fields = value.fields;
  if (!fields || typeof fields !== "object" || Object.keys(fields).length !== FORM_FIELDS.length) return null;
  if (FORM_FIELDS.some((name) => typeof fields[name] !== "string" || !fields[name] || fields[name].length > 2048)) return null;
  if (!/^[a-f0-9]{32}$/.test(fields.sign) || fields.sign_type !== "MD5") return null;
  if (!["alipay", "wxpay"].includes(fields.type)) return null;
  return { action: action.toString(), method: "POST", fields: Object.fromEntries(FORM_FIELDS.map((name) => [name, fields[name]])) };
}

// lib/payments/providers/liuhaoyi.ts
var DEFAULT_TIMEOUT_MS = 1e4;
var LiuhaoyiProviderError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LiuhaoyiProviderError";
    this.code = code;
  }
};
function configuration() {
  const merchantId = String(process.env.LIUHAOYI_MERCHANT_ID ?? "").trim();
  const merchantKey = String(process.env.LIUHAOYI_MERCHANT_KEY ?? "").trim();
  const apiBaseUrl = String(process.env.LIUHAOYI_API_BASE_URL ?? "").trim();
  const siteUrl = String(process.env.LIUHAOYI_SITE_URL ?? "").trim();
  const checkoutMode = String(process.env.LIUHAOYI_CHECKOUT_MODE ?? "mapi").trim();
  if (!merchantId || !merchantKey || !apiBaseUrl || !siteUrl) {
    throw new LiuhaoyiProviderError("LIUHAOYI_NOT_CONFIGURED", "\u516D\u53F7\u6613\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E");
  }
  if (checkoutMode !== "mapi" && checkoutMode !== "submit") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CHECKOUT_MODE_INVALID", "\u516D\u53F7\u6613\u7ED3\u7B97\u6A21\u5F0F\u914D\u7F6E\u65E0\u6548");
  }
  return {
    merchantId,
    merchantKey,
    apiBaseUrl: httpsUrl(apiBaseUrl, "\u516D\u53F7\u6613 API \u5730\u5740\u914D\u7F6E\u65E0\u6548"),
    siteUrl: httpsUrl(siteUrl, "\u516D\u53F7\u6613\u7F51\u7AD9\u56DE\u8C03\u5730\u5740\u914D\u7F6E\u65E0\u6548"),
    timeoutMs: boundedTimeout(process.env.LIUHAOYI_TIMEOUT_MS),
    checkoutMode
  };
}
function isUnifiedInput(input) {
  return "sessionNo" in input && typeof input.sessionNo === "string";
}
async function createPayment(input) {
  if (!isUnifiedInput(input)) {
    throw new LiuhaoyiProviderError("LIUHAOYI_UNIFIED_SESSION_REQUIRED", "\u516D\u53F7\u6613\u652F\u4ED8\u5FC5\u987B\u901A\u8FC7\u7EDF\u4E00\u652F\u4ED8\u4F1A\u8BDD\u521B\u5EFA");
  }
  if (input.currency !== "CNY") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CURRENCY_INVALID", "\u516D\u53F7\u6613\u4EC5\u652F\u6301\u4EBA\u6C11\u5E01\u652F\u4ED8");
  }
  const config = configuration();
  let money2;
  try {
    money2 = assertLiuhaoyiAmountBreakdown(input.requestedAmount, input.feeAmount, input.payableAmount);
  } catch {
    throw new LiuhaoyiProviderError("LIUHAOYI_FEE_CONFIGURATION_INVALID", "\u516D\u53F7\u6613\u652F\u4ED8\u4E0D\u5F97\u7531\u672C\u7AD9\u9644\u52A0\u4E70\u5BB6\u624B\u7EED\u8D39");
  }
  const channelType = liuhaoyiTypeForChannel(input.channel.code);
  const clientDevice = normalizePaymentClientDevice(input.clientDevice);
  const clientIp = String(input.clientIp ?? "").trim();
  if (!clientIp) throw new LiuhaoyiProviderError("LIUHAOYI_CLIENT_IP_REQUIRED", "\u65E0\u6CD5\u786E\u8BA4\u4ED8\u6B3E\u5BA2\u6237\u7AEF IP");
  const notifyUrl = new URL(`/api/payments/callback/${input.channel.code}`, config.siteUrl).toString();
  const returnPath = input.businessType === "order" ? `/payment?order=${encodeURIComponent(input.businessNo)}` : `/payment?recharge=${encodeURIComponent(input.businessNo)}`;
  const returnUrl = new URL(returnPath, config.siteUrl).toString();
  const subject = boundedText(input.subject || `Jianlian ${input.businessType} ${input.businessNo}`, 127);
  if (config.checkoutMode === "submit") {
    const submitForm = buildLiuhaoyiSubmitForm({
      apiBaseUrl: config.apiBaseUrl,
      merchantId: config.merchantId,
      merchantKey: config.merchantKey,
      channelCode: input.channel.code,
      sessionNo: input.sessionNo,
      notifyUrl,
      returnUrl,
      subject,
      money: money2
    });
    return {
      status: "pending",
      paymentType: "redirect",
      submitForm,
      expiresAt: input.expiresAt,
      metadata: { provider: "liuhaoyi", clientDevice, checkoutMode: "submit", submitForm }
    };
  }
  const unsigned = {
    pid: config.merchantId,
    type: channelType,
    out_trade_no: input.sessionNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: subject,
    money: money2,
    clientip: clientIp,
    device: clientDevice
  };
  const form = new URLSearchParams({
    ...unsigned,
    sign: createLiuhaoyiMd5Signature(unsigned, config.merchantKey),
    sign_type: "MD5"
  });
  const payload = await fetchJson(new URL("mapi.php", config.apiBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString()
  }, config.timeoutMs, "\u516D\u53F7\u6613\u521B\u5EFA\u652F\u4ED8\u5931\u8D25");
  if (String(payload.code ?? "") !== "1") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CREATE_REJECTED", safeProviderMessage(payload, "\u516D\u53F7\u6613\u6682\u65F6\u65E0\u6CD5\u521B\u5EFA\u652F\u4ED8\u5355"));
  }
  const paymentArtifact = selectLiuhaoyiPaymentArtifact(payload);
  const createIdentity = extractLiuhaoyiCreateIdentity(payload);
  if (!paymentArtifact.paymentUrl && !paymentArtifact.qrCodeValue && !paymentArtifact.deepLinkUrl) {
    throw new LiuhaoyiProviderError("LIUHAOYI_PAYMENT_ARTIFACT_MISSING", "\u516D\u53F7\u6613\u672A\u8FD4\u56DE\u53EF\u7528\u7684\u4ED8\u6B3E\u4FE1\u606F");
  }
  return {
    status: "pending",
    ...paymentArtifact,
    artifact: paymentArtifactFromCreateResult(paymentArtifact) ?? void 0,
    ...createIdentity,
    expiresAt: input.expiresAt,
    metadata: { provider: "liuhaoyi", clientDevice }
  };
}
async function queryPayment(paymentNo, options) {
  const config = configuration();
  const endpoint = new URL("api.php", config.apiBaseUrl);
  endpoint.searchParams.set("act", "order");
  endpoint.searchParams.set("pid", config.merchantId);
  endpoint.searchParams.set("key", config.merchantKey);
  endpoint.searchParams.set("out_trade_no", paymentNo);
  const queryTimeoutMs = Number.isInteger(options?.timeoutMs) && (options?.timeoutMs ?? 0) >= 1e3 ? Math.min(options.timeoutMs, config.timeoutMs) : config.timeoutMs;
  const payload = await fetchJson(endpoint, { method: "GET", cache: "no-store" }, queryTimeoutMs, "\u516D\u53F7\u6613\u8BA2\u5355\u67E5\u8BE2\u5931\u8D25");
  const found = String(payload.code ?? "") === "1";
  const paid = found && String(payload.status ?? "") === "1";
  const providerTradeNo = boundedOptionalText(payload.trade_no, 160);
  const providerType = boundedOptionalText(payload.type, 32);
  const providerChannel = providerType === "wxpay" ? "wechat" : providerType === "alipay" ? "alipay" : void 0;
  const providerPaidAt = boundedOptionalText(payload.endtime, 64);
  const paidAt = normalizeLiuhaoyiPaidAt(providerPaidAt);
  return {
    status: paid ? "paid" : "pending",
    found,
    paid,
    providerChannel,
    providerTransactionIdPresent: Boolean(providerTradeNo),
    providerPaidAt,
    paidAt: paidAt ?? void 0,
    providerTransactionId: providerTradeNo,
    amount: typeof payload.money === "string" || typeof payload.money === "number" ? payload.money : void 0,
    currency: "CNY",
    rawSummarySafe: {
      found,
      paid,
      providerChannel: providerChannel ?? null,
      providerTransactionIdPresent: Boolean(providerTradeNo),
      providerPaidAtPresent: Boolean(providerPaidAt)
    },
    rawSummary: {
      found,
      paid,
      type: boundedOptionalText(payload.type, 32),
      outTradeNo: boundedOptionalText(payload.out_trade_no, 160),
      providerTradeNoPresent: Boolean(providerTradeNo),
      addtime: boundedOptionalText(payload.addtime, 64),
      endtime: boundedOptionalText(payload.endtime, 64)
    }
  };
}
function callbackParameters(context) {
  if (!context?.requestUrl) return {};
  return parseLiuhaoyiQuery(new URL(context.requestUrl).searchParams);
}
async function verifyCallback(_payload, context) {
  if (!context || typeof context === "string") return false;
  try {
    const config = configuration();
    const parameters = callbackParameters(context);
    return isExpectedLiuhaoyiMerchant(parameters, config.merchantId) && String(parameters.sign_type ?? "").toUpperCase() === "MD5" && verifyLiuhaoyiMd5Signature(parameters, config.merchantKey);
  } catch {
    return false;
  }
}
async function parseCallback(_payload, context) {
  const config = configuration();
  const parameters = callbackParameters(context);
  const expectedChannel = context?.channelCode;
  const callbackChannel = liuhaoyiChannelForType(parameters.type);
  if (!isExpectedLiuhaoyiMerchant(parameters, config.merchantId)) throw new LiuhaoyiProviderError("LIUHAOYI_PID_MISMATCH", "\u516D\u53F7\u6613\u56DE\u8C03\u5546\u6237\u53F7\u4E0D\u5339\u914D");
  if (callbackChannel !== expectedChannel) throw new LiuhaoyiProviderError("LIUHAOYI_CHANNEL_MISMATCH", "\u516D\u53F7\u6613\u56DE\u8C03\u652F\u4ED8\u6E20\u9053\u4E0D\u5339\u914D");
  if (parameters.trade_status !== "TRADE_SUCCESS") throw new LiuhaoyiProviderError("LIUHAOYI_STATUS_INVALID", "\u516D\u53F7\u6613\u56DE\u8C03\u652F\u4ED8\u72B6\u6001\u65E0\u6548");
  const sessionNo = boundedOptionalText(parameters.out_trade_no, 160);
  const providerTransactionId = boundedOptionalText(parameters.trade_no, 160);
  if (!sessionNo || !providerTransactionId) throw new LiuhaoyiProviderError("LIUHAOYI_CALLBACK_ID_INVALID", "\u516D\u53F7\u6613\u56DE\u8C03\u7F3A\u5C11\u652F\u4ED8\u5355\u53F7");
  const amount = assertLiuhaoyiPaymentAmount(parameters.money);
  const rawPaidAt = boundedOptionalText(parameters.endtime, 64);
  const paidAt = normalizeLiuhaoyiPaidAt(rawPaidAt);
  if (rawPaidAt && !paidAt) {
    throw new LiuhaoyiProviderError("LIUHAOYI_PAID_AT_INVALID", "\u516D\u53F7\u6613\u652F\u4ED8\u65F6\u95F4\u65E0\u6548");
  }
  return {
    provider: "liuhaoyi",
    businessNo: sessionNo,
    sessionNo,
    providerOrderNo: providerTransactionId,
    providerTransactionId,
    status: "paid",
    amount,
    currency: "CNY",
    channelCode: callbackChannel,
    paidAt: paidAt ?? void 0,
    rawSummary: {
      tradeStatus: "TRADE_SUCCESS",
      providerTransactionIdPresent: true,
      providerPaidAtPresent: Boolean(paidAt)
    }
  };
}
var liuhaoyiProvider = {
  createPayment,
  queryPayment,
  async closePayment() {
    throw new LiuhaoyiProviderError("LIUHAOYI_CLOSE_UNSUPPORTED", "\u516D\u53F7\u6613 V1 \u6682\u4E0D\u652F\u6301\u5173\u95ED\u652F\u4ED8\u5355");
  },
  verifyCallback,
  parseCallback,
  formatCallbackResponse(result) {
    return new Response(liuhaoyiCallbackResponseBody(result.ok), {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
async function fetchJson(url, init, timeoutMs, fallback) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new LiuhaoyiProviderError("LIUHAOYI_HTTP_ERROR", fallback);
    return payload;
  } catch (error) {
    if (error instanceof LiuhaoyiProviderError) throw error;
    throw new LiuhaoyiProviderError("LIUHAOYI_REQUEST_FAILED", fallback);
  } finally {
    clearTimeout(timer);
  }
}
function httpsUrl(value, message) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url;
  } catch {
    throw new LiuhaoyiProviderError("LIUHAOYI_URL_INVALID", message);
  }
}
function boundedTimeout(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= 1e3 && parsed <= 3e4 ? parsed : DEFAULT_TIMEOUT_MS;
}
function boundedText(value, maximum) {
  return String(value ?? "").trim().slice(0, maximum);
}
function boundedOptionalText(value, maximum) {
  const text = boundedText(value, maximum);
  return text || void 0;
}
function safeProviderMessage(payload, fallback) {
  const message = boundedOptionalText(payload.msg ?? payload.message, 160);
  return message && !/key|secret|sign|token|credential/i.test(message) ? message : fallback;
}

// lib/payments/providers/snpay.ts
import { readFileSync } from "node:fs";

// lib/payments/providers/snpay-core.mjs
import {
  constants,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify
} from "node:crypto";
var DEFAULT_TIMEOUT_MS2 = 1e4;
var MAX_CLOCK_SKEW_SECONDS = 300;
var SAFE_URL_SCHEMES = /* @__PURE__ */ new Set(["https:"]);
var SAFE_DEEP_LINK_SCHEMES = /* @__PURE__ */ new Set(["alipays:", "weixin:", "weixinpay:"]);
var SnpayCoreError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SnpayCoreError";
    this.code = code;
  }
};
function getSnpayBusinessErrorDiagnostics(error, sensitiveValues = []) {
  if (error?.code !== "SNPAY_API_REJECTED") return {};
  const diagnostics = {
    providerErrorResponseSignatureVerified: error.providerErrorResponseSignatureVerified === true
  };
  const rawCode = error.providerBusinessCode;
  if (typeof rawCode === "string" || typeof rawCode === "number" && Number.isFinite(rawCode)) {
    const code = String(rawCode).trim();
    if (/^[A-Za-z0-9_.:-]{1,32}$/.test(code) && !/^(?:sb_secret_|eyJ)/.test(code) && !sensitiveValues.some((value) => typeof value === "string" && value && code.includes(value))) {
      diagnostics.providerBusinessCode = code;
    }
  }
  const message = safeBusinessMessage(error.providerBusinessMessageSafe, sensitiveValues);
  if (message) diagnostics.providerBusinessMessageSafe = message;
  return diagnostics;
}
function safeBusinessMessage(value, sensitiveValues) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!text || /[<>{}]|(?:https?:\/\/|www\.|\b[a-z][a-z0-9+.-]*:\/\/)|[?&][\w-]+\s*=|\b(?:sign|signature|timestamp|canonical|private[_ -]?key|public[_ -]?key|merchant[_ -]?(?:key|secret)|token|secret|authorization)\b\s*[:=]|-----BEGIN|sb_secret_/i.test(text)) return null;
  if (sensitiveValues.some((secret) => typeof secret === "string" && secret && text.includes(secret))) return null;
  const redacted = text.replace(/[A-Za-z0-9+/_=-]{24,}/g, "[redacted]");
  return Array.from(redacted).slice(0, 200).join("");
}
function businessRejectError(payload, publicKey, options) {
  const error = new SnpayCoreError("SNPAY_API_REJECTED", "SNPAY \u62D2\u7EDD\u4E86\u8BF7\u6C42");
  let safeMessage;
  for (const field of ["msg", "message", "error", "errmsg"]) {
    safeMessage = safeBusinessMessage(payload[field], options.sensitiveValues);
    if (safeMessage) break;
  }
  Object.assign(error, getSnpayBusinessErrorDiagnostics({
    code: error.code,
    providerBusinessCode: payload.code,
    providerBusinessMessageSafe: safeMessage,
    providerErrorResponseSignatureVerified: verifySnpaySignedPayload(payload, publicKey, { now: options.now })
  }, options.sensitiveValues));
  return error;
}
function snpayCanonicalString(parameters) {
  return Object.keys(parameters ?? {}).filter((key) => key !== "sign" && key !== "sign_type").filter((key) => {
    const value = parameters[key];
    return value !== void 0 && value !== null && String(value).trim() !== "" && !Array.isArray(value) && !Buffer.isBuffer(value);
  }).sort((left, right) => Buffer.compare(Buffer.from(left, "ascii"), Buffer.from(right, "ascii"))).map((key) => `${key}=${String(parameters[key])}`).join("&");
}
function normalizeSnpayPrivateKey(value) {
  return normalizePem(value, "PRIVATE KEY");
}
function normalizeSnpayPlatformPublicKey(value) {
  return normalizePem(value, "PUBLIC KEY");
}
function createSnpaySignature(parameters, privateKey) {
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(snpayCanonicalString(parameters), "utf8");
    signer.end();
    return signer.sign({
      key: createPrivateKey(normalizeSnpayPrivateKey(privateKey)),
      padding: constants.RSA_PKCS1_PADDING
    }, "base64");
  } catch {
    throw new SnpayCoreError("SNPAY_SIGNING_FAILED", "SNPAY \u8BF7\u6C42\u7B7E\u540D\u5931\u8D25");
  }
}
function verifySnpaySignedPayload(parameters, publicKey, options = {}) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return false;
  if (String(parameters.sign_type ?? "").toUpperCase() !== "RSA") return false;
  const signature = strictBase64(parameters.sign);
  if (!signature || !validTimestamp(parameters.timestamp, options.now ?? Date.now(), options.maxClockSkewSeconds)) {
    return false;
  }
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(snpayCanonicalString(parameters), "utf8");
    verifier.end();
    return verifier.verify({
      key: createPublicKey(normalizeSnpayPlatformPublicKey(publicKey)),
      padding: constants.RSA_PKCS1_PADDING
    }, signature);
  } catch {
    return false;
  }
}
function snpayTypeForChannel(channel) {
  if (channel === "alipay") return "alipay";
  if (channel === "wechat") return "wxpay";
  throw new SnpayCoreError("SNPAY_CHANNEL_UNSUPPORTED", "SNPAY \u4E0D\u652F\u6301\u8BE5\u652F\u4ED8\u6E20\u9053");
}
function snpayChannelForType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "alipay") return "alipay";
  if (["wxpay", "wechat", "wechat_pay"].includes(normalized)) return "wechat";
  return null;
}
function normalizeSnpayPaidAt(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:Z| ?(?:\+|-)\d{2}:?\d{2})?$/);
  if (!match) return null;
  const calendarCheck = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  ));
  if (calendarCheck.getUTCFullYear() !== Number(match[1]) || calendarCheck.getUTCMonth() !== Number(match[2]) - 1 || calendarCheck.getUTCDate() !== Number(match[3]) || calendarCheck.getUTCHours() !== Number(match[4]) || calendarCheck.getUTCMinutes() !== Number(match[5]) || calendarCheck.getUTCSeconds() !== Number(match[6])) return null;
  const hasZone = /(?:Z|(?:\+|-)\d{2}:?\d{2})$/.test(text);
  const parsed = hasZone ? Date.parse(text.replace(" ", "T")) : Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function parseSnpayCallbackBody(rawBody) {
  const text = String(rawBody ?? "");
  if (!text.trim()) return {};
  if (text.trimStart().startsWith("{")) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}
function selectSnpayPaymentArtifact(payload) {
  const value = boundedText2(payload?.pay_info ?? payload?.qrcode ?? payload?.pay_url, 2048);
  if (!value) throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_MISSING", "SNPAY \u672A\u8FD4\u56DE\u4ED8\u6B3E\u4FE1\u606F");
  const parsed = safeUrl(value);
  if (parsed && SAFE_URL_SCHEMES.has(parsed.protocol) && !parsed.username && !parsed.password) {
    return { paymentType: "redirect", paymentUrl: parsed.toString(), artifact: { type: "redirect", url: parsed.toString() } };
  }
  if (parsed && SAFE_DEEP_LINK_SCHEMES.has(parsed.protocol) && !parsed.username && !parsed.password) {
    return { paymentType: "deeplink", deepLinkUrl: value, artifact: { type: "deeplink", url: value } };
  }
  if (/^(?:https:\/\/|alipays:|weixin:|weixinpay:)/i.test(value)) {
    throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_UNSAFE", "SNPAY \u8FD4\u56DE\u4E86\u4E0D\u5B89\u5168\u7684\u4ED8\u6B3E\u5730\u5740");
  }
  if (/^(?:javascript|data|file|vbscript):/i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_UNSAFE", "SNPAY \u8FD4\u56DE\u4E86\u4E0D\u5B89\u5168\u7684\u4ED8\u6B3E\u4FE1\u606F");
  }
  return { paymentType: "qrcode", qrCodeValue: value, artifact: { type: "qrcode", payload: value } };
}
function createSnpayClient(configuration3) {
  const merchantId = requiredText(configuration3?.merchantId, "SNPAY_MERCHANT_ID_MISSING", "SNPAY \u5546\u6237\u53F7\u672A\u914D\u7F6E");
  const privateKey = requiredText(configuration3?.merchantPrivateKey, "SNPAY_PRIVATE_KEY_MISSING", "SNPAY \u5546\u6237\u79C1\u94A5\u672A\u914D\u7F6E");
  const platformPublicKey = requiredText(configuration3?.platformPublicKey, "SNPAY_PLATFORM_KEY_MISSING", "SNPAY \u5E73\u53F0\u516C\u94A5\u672A\u914D\u7F6E");
  const apiBaseUrl = httpsBaseUrl(configuration3?.apiBaseUrl);
  const fetchImpl = configuration3?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new SnpayCoreError("SNPAY_FETCH_UNAVAILABLE", "SNPAY \u7F51\u7EDC\u5BA2\u6237\u7AEF\u4E0D\u53EF\u7528");
  const now = typeof configuration3?.now === "function" ? configuration3.now : () => Date.now();
  const timeoutMs = boundedTimeout2(configuration3?.timeoutMs);
  async function signedRequest(path, fields, options = {}) {
    const startedAt = Date.now();
    const timestamp = Math.floor(now() / 1e3).toString();
    const unsigned = { pid: merchantId, ...fields, timestamp, sign_type: "RSA" };
    const form = new URLSearchParams({
      ...stringFields(unsigned),
      sign: createSnpaySignature(unsigned, privateKey)
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeout2(options.timeoutMs ?? timeoutMs));
    try {
      const response = await fetchImpl(new URL(path, apiBaseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json",
          "user-agent": "Jianlian-SNPAY-V2/1.0"
        },
        body: form.toString(),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok) throw new SnpayCoreError("SNPAY_HTTP_ERROR", `SNPAY HTTP ${response.status}`);
      const payload = await safeJson(response);
      if (String(payload.code ?? "") !== "0") {
        const error = businessRejectError(payload, platformPublicKey, {
          now: now(),
          sensitiveValues: [privateKey, platformPublicKey, payload.sign, form.get("sign")]
        });
        console.error("[SNPAY business rejection]", {
          provider: "snpay",
          operation: path === "/api/pay/create" ? "create" : "query",
          localErrorCode: error.code,
          providerBusinessCode: error.providerBusinessCode,
          providerMessageSafe: error.providerBusinessMessageSafe,
          providerErrorResponseSignatureVerified: error.providerErrorResponseSignatureVerified,
          httpStatus: response.status,
          durationMs: Math.max(0, Date.now() - startedAt)
        });
        throw error;
      }
      if (!verifySnpaySignedPayload(payload, platformPublicKey, { now: now() })) {
        throw new SnpayCoreError("SNPAY_RESPONSE_SIGNATURE_INVALID", "SNPAY \u54CD\u5E94\u9A8C\u7B7E\u5931\u8D25");
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new SnpayCoreError("SNPAY_TIMEOUT", "SNPAY \u8BF7\u6C42\u8D85\u65F6");
      if (error instanceof SnpayCoreError) throw error;
      throw new SnpayCoreError("SNPAY_NETWORK_ERROR", "SNPAY \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async createPayment(input) {
      const type = snpayTypeForChannel(input.channelCode);
      const payload = await signedRequest("/api/pay/create", {
        type,
        out_trade_no: boundedRequired(input.sessionNo, 160, "SNPAY_SESSION_ID_INVALID"),
        notify_url: safeHttpsCallback(input.notifyUrl),
        return_url: safeHttpsCallback(input.returnUrl),
        name: boundedRequired(input.subject, 127, "SNPAY_SUBJECT_INVALID"),
        money: money(input.amount),
        clientip: validIp(input.clientIp),
        method: "web"
      }, input.options);
      if (Object.hasOwn(payload, "type")) assertChannel(payload.type, input.channelCode);
      if (Object.hasOwn(payload, "money")) assertAmount(payload.money, input.amount);
      const providerOrderNo = boundedRequired(payload.trade_no, 160, "SNPAY_PROVIDER_ORDER_MISSING");
      if (!/^[A-Za-z0-9_-]+$/.test(providerOrderNo) || typeof payload.trade_no !== "string" && !(Number.isSafeInteger(payload.trade_no) && payload.trade_no > 0)) {
        throw new SnpayCoreError("SNPAY_PROVIDER_ORDER_INVALID", "SNPAY \u5E73\u53F0\u8BA2\u5355\u53F7\u65E0\u6548");
      }
      if (!["jump", "qrcode", "urlscheme"].includes(payload.pay_type)) {
        throw new SnpayCoreError("SNPAY_PAYMENT_TYPE_UNSUPPORTED", "SNPAY \u8FD4\u56DE\u4E86\u4E0D\u652F\u6301\u7684\u4ED8\u6B3E\u5165\u53E3\u7C7B\u578B");
      }
      if (typeof payload.pay_info !== "string") {
        throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_MISSING", "SNPAY \u672A\u8FD4\u56DE\u6709\u6548\u4ED8\u6B3E\u4FE1\u606F");
      }
      const payInfo = boundedRequired(payload.pay_info, 2048, "SNPAY_PAYMENT_ARTIFACT_MISSING");
      const artifact = selectSnpayPaymentArtifact({ pay_info: payInfo });
      if (payload.pay_type === "jump" && artifact.paymentType !== "redirect" || payload.pay_type === "urlscheme" && artifact.paymentType !== "deeplink" || /[<>]/.test(payInfo)) {
        throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_UNSAFE", "SNPAY \u8FD4\u56DE\u4E86\u4E0D\u5B89\u5168\u7684\u4ED8\u6B3E\u4FE1\u606F");
      }
      return { payload, providerOrderNo, ...artifact };
    },
    async queryPayment(input) {
      const payload = await signedRequest("/api/pay/query", {
        trade_no: boundedRequired(input.providerOrderNo, 160, "SNPAY_PROVIDER_ORDER_MISSING")
      }, input.options);
      assertMerchant(payload.pid, merchantId);
      assertIdentity(payload.out_trade_no, input.sessionNo);
      assertProviderOrder(payload.trade_no, input.providerOrderNo);
      assertChannel(payload.type, input.channelCode);
      assertAmount(payload.money, input.amount);
      const state = normalizeProviderState(payload);
      const paidAt = state.paid ? normalizeSnpayPaidAt(payload.endtime ?? payload.paid_at) : null;
      if (state.paid && !paidAt) throw new SnpayCoreError("SNPAY_PAID_AT_INVALID", "SNPAY \u5DF2\u652F\u4ED8\u8BA2\u5355\u7F3A\u5C11\u53EF\u4FE1\u4ED8\u6B3E\u65F6\u95F4");
      return { payload, ...state, paidAt };
    },
    verifyCallback(rawBody, expected = {}) {
      const payload = parseSnpayCallbackBody(rawBody);
      return verifySnpaySignedPayload(payload, platformPublicKey, { now: now() }) && String(payload.pid ?? "") === merchantId && (!expected.channelCode || snpayChannelForType(payload.type) === expected.channelCode);
    },
    parseCallback(rawBody, expected) {
      const payload = parseSnpayCallbackBody(rawBody);
      if (!this.verifyCallback(rawBody, expected)) throw new SnpayCoreError("SNPAY_CALLBACK_SIGNATURE_INVALID", "SNPAY \u56DE\u8C03\u9A8C\u7B7E\u5931\u8D25");
      const state = normalizeProviderState(payload);
      const sessionNo = boundedRequired(payload.out_trade_no, 160, "SNPAY_SESSION_ID_INVALID");
      const providerTransactionId = boundedRequired(payload.trade_no, 160, "SNPAY_PROVIDER_ORDER_MISSING");
      const channelCode = snpayChannelForType(payload.type);
      if (!channelCode) throw new SnpayCoreError("SNPAY_CHANNEL_MISMATCH", "SNPAY \u56DE\u8C03\u6E20\u9053\u65E0\u6548");
      const amount = numericMoney(payload.money);
      const paidAt = state.paid ? normalizeSnpayPaidAt(payload.endtime ?? payload.paid_at) : null;
      if (state.paid && !paidAt) throw new SnpayCoreError("SNPAY_PAID_AT_INVALID", "SNPAY \u56DE\u8C03\u7F3A\u5C11\u53EF\u4FE1\u4ED8\u6B3E\u65F6\u95F4");
      return { payload, sessionNo, providerTransactionId, channelCode, amount, paidAt, ...state };
    }
  };
}
function normalizeProviderState(payload) {
  const raw = String(payload.trade_status ?? payload.status ?? "").trim().toUpperCase();
  if (["1", "PAID", "SUCCESS", "TRADE_SUCCESS", "TRADE_FINISHED"].includes(raw)) return { found: true, paid: true, status: "paid" };
  if (["0", "UNPAID", "PENDING", "WAIT_BUYER_PAY", "PROCESSING"].includes(raw)) return { found: true, paid: false, status: "pending" };
  if (["CLOSED", "CANCELLED", "CANCELED"].includes(raw)) return { found: true, paid: false, status: "closed" };
  if (["EXPIRED", "TIMEOUT"].includes(raw)) return { found: true, paid: false, status: "expired" };
  throw new SnpayCoreError("SNPAY_STATUS_INVALID", "SNPAY \u8FD4\u56DE\u4E86\u672A\u77E5\u8BA2\u5355\u72B6\u6001");
}
function assertMerchant(value, expected) {
  if (String(value ?? "") !== expected) throw new SnpayCoreError("SNPAY_MERCHANT_MISMATCH", "SNPAY \u5546\u6237\u8EAB\u4EFD\u4E0D\u5339\u914D");
}
function assertIdentity(value, expected) {
  if (String(value ?? "") !== String(expected ?? "")) throw new SnpayCoreError("SNPAY_ORDER_IDENTITY_MISMATCH", "SNPAY \u5546\u6237\u8BA2\u5355\u8EAB\u4EFD\u4E0D\u5339\u914D");
}
function assertProviderOrder(value, expected) {
  if (String(value ?? "") !== String(expected ?? "")) throw new SnpayCoreError("SNPAY_PROVIDER_ORDER_MISMATCH", "SNPAY \u5E73\u53F0\u8BA2\u5355\u8EAB\u4EFD\u4E0D\u5339\u914D");
}
function assertChannel(value, expected) {
  if (snpayChannelForType(value) !== expected) throw new SnpayCoreError("SNPAY_CHANNEL_MISMATCH", "SNPAY \u6E20\u9053\u8EAB\u4EFD\u4E0D\u5339\u914D");
}
function assertAmount(value, expected) {
  if (Math.abs(numericMoney(value) - numericMoney(expected)) > 1e-6) {
    throw new SnpayCoreError("SNPAY_AMOUNT_MISMATCH", "SNPAY \u91D1\u989D\u4E0D\u5339\u914D");
  }
}
function money(value) {
  return numericMoney(value).toFixed(2);
}
function numericMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new SnpayCoreError("SNPAY_AMOUNT_INVALID", "SNPAY \u91D1\u989D\u65E0\u6548");
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}
function validTimestamp(value, nowMs, maxClockSkewSeconds = MAX_CLOCK_SKEW_SECONDS) {
  if (typeof value !== "string") return false;
  const text = value;
  if (!/^\d{10}$/.test(text)) return false;
  const skew = Math.abs(Math.floor(Number(nowMs) / 1e3) - Number(text));
  return Number.isFinite(skew) && skew <= maxClockSkewSeconds;
}
function strictBase64(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 4096 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  try {
    const decoded = Buffer.from(text, "base64");
    return decoded.length > 0 && decoded.toString("base64") === text ? decoded : null;
  } catch {
    return null;
  }
}
function normalizePem(value, label) {
  const text = String(value ?? "").trim().replace(/\r/g, "");
  if (!text) throw new SnpayCoreError("SNPAY_KEY_MISSING", `SNPAY ${label} \u672A\u914D\u7F6E`);
  if (text.includes("-----BEGIN")) return `${text}
`;
  const body = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) throw new SnpayCoreError("SNPAY_KEY_INVALID", `SNPAY ${label} \u683C\u5F0F\u65E0\u6548`);
  return `-----BEGIN ${label}-----
${body.match(/.{1,64}/g)?.join("\n") ?? body}
-----END ${label}-----
`;
}
function httpsBaseUrl(value) {
  const parsed = safeUrl(requiredText(value, "SNPAY_API_BASE_MISSING", "SNPAY API \u5730\u5740\u672A\u914D\u7F6E"));
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new SnpayCoreError("SNPAY_API_BASE_INVALID", "SNPAY API \u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS");
  }
  return new URL(parsed.pathname.endsWith("/") ? parsed.toString() : `${parsed.toString()}/`);
}
function safeHttpsCallback(value) {
  const parsed = safeUrl(value);
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new SnpayCoreError("SNPAY_CALLBACK_URL_INVALID", "SNPAY \u56DE\u8C03\u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS");
  }
  return parsed.toString();
}
function safeUrl(value) {
  try {
    return new URL(String(value ?? ""));
  } catch {
    return null;
  }
}
function validIp(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 64 || !/^[0-9a-f:.]+$/i.test(text)) throw new SnpayCoreError("SNPAY_CLIENT_IP_INVALID", "SNPAY \u5BA2\u6237\u7AEF IP \u65E0\u6548");
  return text;
}
function requiredText(value, code, message) {
  const text = String(value ?? "").trim();
  if (!text) throw new SnpayCoreError(code, message);
  return text;
}
function boundedRequired(value, maxLength, code) {
  const text = boundedText2(value, maxLength);
  if (!text) throw new SnpayCoreError(code, "SNPAY \u8BA2\u5355\u6807\u8BC6\u65E0\u6548");
  return text;
}
function boundedText2(value, maxLength) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : null;
}
function boundedTimeout2(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS2);
  return Number.isFinite(parsed) ? Math.min(3e4, Math.max(1e3, Math.round(parsed))) : DEFAULT_TIMEOUT_MS2;
}
function stringFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}
async function safeJson(response) {
  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
    return payload;
  } catch {
    throw new SnpayCoreError("SNPAY_RESPONSE_INVALID", "SNPAY \u8FD4\u56DE\u683C\u5F0F\u65E0\u6548");
  }
}

// lib/payments/providers/snpay.ts
var DEFAULT_API_BASE = "https://api.snpay.cn";
var DEFAULT_TIMEOUT_MS3 = 1e4;
var SnpayProviderError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SnpayProviderError";
    this.code = code;
  }
};
function configuration2() {
  const merchantId = String(process.env.SNPAY_MERCHANT_ID ?? "").trim();
  const privateKeyFile = String(process.env.SNPAY_PRIVATE_KEY_FILE ?? "").trim();
  const platformPublicKeyFile = String(process.env.SNPAY_PLATFORM_PUBLIC_KEY_FILE ?? "").trim();
  const siteUrl = httpsUrl2(process.env.SNPAY_SITE_URL, "SNPAY \u7F51\u7AD9\u5730\u5740\u914D\u7F6E\u65E0\u6548");
  if (!merchantId || !privateKeyFile || !platformPublicKeyFile) {
    throw new SnpayProviderError("SNPAY_NOT_CONFIGURED", "SNPAY \u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E");
  }
  try {
    return {
      merchantId,
      apiBaseUrl: httpsUrl2(process.env.SNPAY_API_BASE ?? DEFAULT_API_BASE, "SNPAY API \u5730\u5740\u914D\u7F6E\u65E0\u6548").toString(),
      merchantPrivateKey: readFileSync(privateKeyFile, "utf8"),
      platformPublicKey: readFileSync(platformPublicKeyFile, "utf8"),
      siteUrl,
      timeoutMs: boundedTimeout3(process.env.SNPAY_TIMEOUT_MS)
    };
  } catch (error) {
    if (error instanceof SnpayProviderError) throw error;
    throw new SnpayProviderError("SNPAY_KEY_FILE_UNREADABLE", "SNPAY \u5BC6\u94A5\u6587\u4EF6\u65E0\u6CD5\u8BFB\u53D6");
  }
}
function client() {
  try {
    return createSnpayClient(configuration2());
  } catch (error) {
    if (error instanceof SnpayProviderError) throw error;
    if (error instanceof SnpayCoreError) throw new SnpayProviderError(error.code, error.message);
    throw new SnpayProviderError("SNPAY_CONFIGURATION_INVALID", "SNPAY \u914D\u7F6E\u65E0\u6548");
  }
}
async function createPayment2(input) {
  if (!("sessionNo" in input) || typeof input.sessionNo !== "string") {
    throw new SnpayProviderError("SNPAY_UNIFIED_SESSION_REQUIRED", "SNPAY \u652F\u4ED8\u5FC5\u987B\u901A\u8FC7\u7EDF\u4E00\u652F\u4ED8\u4F1A\u8BDD\u521B\u5EFA");
  }
  if (input.currency !== "CNY") throw new SnpayProviderError("SNPAY_CURRENCY_INVALID", "SNPAY \u4EC5\u652F\u6301\u4EBA\u6C11\u5E01\u652F\u4ED8");
  if (!input.clientIp) throw new SnpayProviderError("SNPAY_CLIENT_IP_REQUIRED", "\u65E0\u6CD5\u786E\u8BA4\u4ED8\u6B3E\u5BA2\u6237\u7AEF IP");
  const config = configuration2();
  const notifyUrl = new URL(`/api/payments/callback/${input.channel.code}`, config.siteUrl).toString();
  const returnPath = input.businessType === "order" ? `/payment?order=${encodeURIComponent(input.businessNo)}` : `/payment?recharge=${encodeURIComponent(input.businessNo)}`;
  try {
    const result = await createSnpayClient(config).createPayment({
      sessionNo: input.sessionNo,
      channelCode: input.channel.code,
      notifyUrl,
      returnUrl: new URL(returnPath, config.siteUrl).toString(),
      subject: input.subject || `Jianlian ${input.businessType} ${input.businessNo}`,
      amount: input.payableAmount,
      clientIp: input.clientIp
    });
    return {
      status: "pending",
      paymentType: result.paymentType,
      artifact: result.artifact,
      paymentUrl: typeof result.paymentUrl === "string" ? result.paymentUrl : void 0,
      qrCodeValue: typeof result.qrCodeValue === "string" ? result.qrCodeValue : void 0,
      deepLinkUrl: typeof result.deepLinkUrl === "string" ? result.deepLinkUrl : void 0,
      providerOrderNo: result.providerOrderNo,
      expiresAt: input.expiresAt,
      metadata: { provider: "snpay", signatureVerified: true }
    };
  } catch (error) {
    throw providerError(error);
  }
}
async function queryPayment2(paymentNo, options) {
  if (!options?.expectedSessionNo || !options.expectedChannel || options.expectedAmount == null || !options.expectedCurrency) {
    throw new SnpayProviderError("SNPAY_QUERY_CONTEXT_REQUIRED", "SNPAY \u67E5\u8BE2\u7F3A\u5C11\u53EF\u4FE1\u8BA2\u5355\u4E0A\u4E0B\u6587");
  }
  if (options.expectedCurrency !== "CNY") {
    throw new SnpayProviderError("SNPAY_CURRENCY_INVALID", "SNPAY \u67E5\u8BE2\u4EC5\u652F\u6301\u4EBA\u6C11\u5E01\u8BA2\u5355");
  }
  try {
    const result = await client().queryPayment({
      providerOrderNo: options.expectedProviderOrderNo ?? paymentNo,
      sessionNo: options.expectedSessionNo,
      channelCode: options.expectedChannel,
      amount: options.expectedAmount,
      options: { timeoutMs: options.timeoutMs }
    });
    const payload = result.payload;
    const providerTransactionId = boundedOptional(payload.trade_no, 160);
    return {
      status: result.status,
      found: result.found,
      paid: result.paid,
      providerChannel: options.expectedChannel,
      providerTransactionIdPresent: Boolean(providerTransactionId),
      providerTransactionId,
      providerPaidAt: boundedOptional(payload.endtime ?? payload.paid_at, 64),
      paidAt: result.paidAt ?? void 0,
      amount: payload.money,
      currency: "CNY",
      rawSummarySafe: {
        found: result.found,
        paid: result.paid,
        signatureVerified: true,
        timestampVerified: true,
        identityVerified: true,
        providerTransactionIdPresent: Boolean(providerTransactionId),
        providerPaidAtPresent: Boolean(result.paidAt)
      },
      rawSummary: {
        found: result.found,
        type: boundedOptional(payload.type, 32),
        outTradeNo: boundedOptional(payload.out_trade_no, 160),
        providerTradeNoPresent: Boolean(providerTransactionId),
        endtime: boundedOptional(payload.endtime ?? payload.paid_at, 64)
      }
    };
  } catch (error) {
    throw providerError(error);
  }
}
async function verifyCallback2(_payload, context) {
  if (!context || typeof context === "string" || context.provider !== "snpay") return false;
  try {
    return client().verifyCallback(context.rawBody, { channelCode: context.channelCode });
  } catch {
    return false;
  }
}
async function parseCallback2(_payload, context) {
  if (!context || context.provider !== "snpay") throw new SnpayProviderError("SNPAY_CALLBACK_CONTEXT_INVALID", "SNPAY \u56DE\u8C03\u4E0A\u4E0B\u6587\u65E0\u6548");
  try {
    const parsed = client().parseCallback(context.rawBody, { channelCode: context.channelCode });
    return {
      provider: "snpay",
      businessNo: parsed.sessionNo,
      sessionNo: parsed.sessionNo,
      providerOrderNo: parsed.providerTransactionId,
      providerTransactionId: parsed.providerTransactionId,
      status: parsed.status,
      amount: parsed.amount,
      currency: "CNY",
      channelCode: parsed.channelCode,
      paidAt: parsed.paidAt ?? void 0,
      rawSummary: {
        signatureVerified: true,
        providerTransactionIdPresent: true,
        providerPaidAtPresent: Boolean(parsed.paidAt)
      }
    };
  } catch (error) {
    throw providerError(error);
  }
}
function providerError(error) {
  if (error instanceof SnpayProviderError) return error;
  if (error instanceof SnpayCoreError) {
    const converted = new SnpayProviderError(error.code, error.message);
    Object.assign(converted, getSnpayBusinessErrorDiagnostics(error));
    return converted;
  }
  return new SnpayProviderError("SNPAY_REQUEST_FAILED", "SNPAY \u8BF7\u6C42\u5931\u8D25");
}
function httpsUrl2(value, message) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid");
    return parsed;
  } catch {
    throw new SnpayProviderError("SNPAY_URL_INVALID", message);
  }
}
function boundedTimeout3(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS3);
  return Number.isFinite(parsed) ? Math.min(3e4, Math.max(1e3, Math.round(parsed))) : DEFAULT_TIMEOUT_MS3;
}
function boundedOptional(value, maxLength) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : void 0;
}
var snpayProvider = {
  createPayment: createPayment2,
  queryPayment: queryPayment2,
  async closePayment() {
    throw new SnpayProviderError("SNPAY_CLOSE_UNSUPPORTED", "SNPAY Stage 1 \u6682\u4E0D\u652F\u6301\u5173\u95ED\u652F\u4ED8\u5355");
  },
  verifyCallback: verifyCallback2,
  parseCallback: parseCallback2,
  formatCallbackResponse(result) {
    return new Response(result.ok ? "success" : "fail", {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};

// lib/payments/providers.ts
var PaymentProviderError = class extends Error {
  constructor(message = "\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u521B\u5EFA\u771F\u5B9E\u652F\u4ED8\u3002", code = "PROVIDER_NOT_CONFIGURED") {
    super(message);
    this.name = "PaymentProviderError";
    this.code = code;
  }
};
function unavailableProvider() {
  return {
    async createPayment(_input) {
      throw new PaymentProviderError();
    },
    async queryPayment(_paymentNo) {
      throw new PaymentProviderError("\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u67E5\u8BE2\u6E20\u9053\u72B6\u6001\u3002");
    },
    async closePayment(_paymentNo) {
      throw new PaymentProviderError("\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u5173\u95ED\u6E20\u9053\u652F\u4ED8\u5355\u3002");
    },
    async verifyCallback(_payload, _context) {
      return false;
    },
    async parseCallback(_payload, _context) {
      throw new PaymentProviderError("\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u89E3\u6790\u56DE\u8C03\u3002");
    }
  };
}
var providers = {
  liuhaoyi: liuhaoyiProvider,
  snpay: snpayProvider,
  generic_api: unavailableProvider(),
  binance: unavailableProvider(),
  crypto_address: unavailableProvider()
};
function getPaymentProvider(provider) {
  return providers[provider] ?? unavailableProvider();
}
function resolveProviderForNewPayment(channel) {
  if (!Object.prototype.hasOwnProperty.call(providers, channel.provider)) throw new PaymentProviderError();
  return getPaymentProvider(channel.provider);
}
var providerCapabilities = {
  liuhaoyi: {
    supportsCreate: true,
    supportsQuery: true,
    supportsClose: false,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: true,
    supportsRedirect: true,
    supportsDeepLink: true,
    supportsWalletAddress: false,
    supportsRecoveryQuery: true,
    supportsSandbox: false,
    supportedCurrencies: ["CNY"],
    supportedChannels: ["alipay", "wechat"],
    minimumAmount: 1,
    maximumAmount: 2e3,
    providerExternalFeeDisclosure: "\u652F\u4ED8\u5E73\u53F0\u53EF\u80FD\u989D\u5916\u6536\u53D6\u7EA6 3% \u901A\u9053\u624B\u7EED\u8D39\uFF1B\u5B9E\u9645\u4ED8\u6B3E\u91D1\u989D\u4EE5\u652F\u4ED8\u9875\u9762\u4E3A\u51C6\uFF0C\u672C\u7AD9\u672C\u91D1\u4E0D\u589E\u52A0\u8BE5\u8D39\u7528\u3002"
  },
  snpay: {
    supportsCreate: true,
    supportsQuery: true,
    supportsClose: false,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: true,
    supportsRedirect: true,
    supportsDeepLink: true,
    supportsWalletAddress: false,
    supportsRecoveryQuery: true,
    supportsSandbox: false,
    supportedCurrencies: ["CNY"],
    supportedChannels: ["alipay", "wechat"],
    minimumAmount: 0.01,
    maximumAmount: 2e3,
    providerExternalFeeDisclosure: "\u672C\u7AD9\u624B\u7EED\u8D39\u4E0E\u652F\u4ED8\u5E73\u53F0\u989D\u5916\u8D39\u7528\u5206\u522B\u8BA1\u7B97\u3002\u652F\u4ED8\u5E73\u53F0\u53EF\u80FD\u989D\u5916\u6536\u53D6\u7EA6 3% \u901A\u9053\u624B\u7EED\u8D39\uFF1B\u5B9E\u9645\u4ED8\u6B3E\u91D1\u989D\u4EE5\u652F\u4ED8\u9875\u9762\u4E3A\u51C6\uFF0C\u989D\u5916\u8D39\u7528\u4E0D\u589E\u52A0\u5145\u503C\u672C\u91D1\u6216\u5230\u8D26\u91D1\u989D\u3002"
  },
  generic_api: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["CNY"],
    supportedChannels: ["alipay", "wechat"],
    minimumAmount: null,
    maximumAmount: null
  },
  binance: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["USDT"],
    supportedChannels: ["binance_pay"],
    minimumAmount: null,
    maximumAmount: null
  },
  crypto_address: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    // Existing BEP20 flow is separate from this placeholder adapter.
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["USDT"],
    supportedChannels: ["usdt_trc20", "usdt_bep20"],
    minimumAmount: null,
    maximumAmount: null
  }
};
function getPaymentProviderCapabilities(provider) {
  return providerCapabilities[provider] ?? {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: [],
    supportedChannels: [],
    minimumAmount: null,
    maximumAmount: null
  };
}

// lib/payments/payment-session-reuse.mjs
var ACTIVE_SESSION_STATUSES = /* @__PURE__ */ new Set(["pending", "processing"]);
var FAILED_SESSION_REVIEW_MESSAGE = "\u6B64\u524D\u652F\u4ED8\u4F1A\u8BDD\u521B\u5EFA\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u52FF\u91CD\u590D\u521B\u5EFA\u6216\u4ED8\u6B3E\uFF0C\u8BF7\u5237\u65B0\u5145\u503C\u8BB0\u5F55\u6216\u8054\u7CFB\u5BA2\u670D\u3002";
function isReusablePaymentSession(row, identity, now = /* @__PURE__ */ new Date()) {
  const expiresAt = Date.parse(String(row?.expires_at ?? ""));
  return String(row?.business_type ?? "") === identity.businessType && String(row?.business_id ?? "") === identity.businessId && String(row?.business_no ?? "") === identity.businessNo && String(row?.user_id ?? "") === identity.userId && String(row?.channel_code ?? "") === identity.channelCode && (!identity.provider || String(row?.provider ?? "") === identity.provider) && ACTIVE_SESSION_STATUSES.has(String(row?.status ?? "")) && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

// lib/payments/manual-channel-readiness.mjs
function hasConfiguredText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
var PAYMENT_CHANNEL_PROVIDER_CONTRACT = Object.freeze({
  alipay: "liuhaoyi",
  wechat: "liuhaoyi",
  binance_pay: "binance",
  usdt_trc20: "crypto_address",
  usdt_bep20: "crypto_address"
});
var PAYMENT_PROVIDER_CHANNEL_SUPPORT = Object.freeze({
  liuhaoyi: ["alipay", "wechat"],
  snpay: ["alipay", "wechat"],
  generic_api: ["alipay", "wechat"],
  binance: ["binance_pay"],
  crypto_address: ["usdt_trc20", "usdt_bep20"]
});
var PAYMENT_CHANNEL_CODES = Object.freeze(
  Object.keys(PAYMENT_CHANNEL_PROVIDER_CONTRACT)
);
var PAYMENT_CHANNEL_CURRENCY_CONTRACT = Object.freeze({
  alipay: "CNY",
  wechat: "CNY",
  binance_pay: "USDT",
  usdt_trc20: "USDT",
  usdt_bep20: "USDT"
});
var PAYMENT_CHANNEL_NETWORK_CONTRACT = Object.freeze({
  alipay: [null],
  wechat: [null],
  // The existing database seed defines no Binance Pay network. Keep it
  // unset until a separately verified runtime contract exists.
  binance_pay: [null],
  usdt_trc20: ["TRON"],
  usdt_bep20: ["BSC"]
});
function isKnownPaymentChannelCode(value) {
  return typeof value === "string" && PAYMENT_CHANNEL_CODES.includes(value);
}
function getCanonicalPaymentChannelCode(row = {}) {
  const channel = row.channel;
  const code = row.code;
  if (!isKnownPaymentChannelCode(channel) || !isKnownPaymentChannelCode(code) || channel !== code) {
    return null;
  }
  return channel;
}
function suppliedPairValue(object, key) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return { supplied: false, value: void 0 };
  }
  return { supplied: true, value: object[key] };
}
function getPaymentChannelPairValidationError(input = {}) {
  const channel = suppliedPairValue(input, "channel");
  const code = suppliedPairValue(input, "code");
  if (!isKnownPaymentChannelCode(channel.value)) {
    return "Payment channel code is invalid.";
  }
  if (!code.supplied || (!isKnownPaymentChannelCode(code.value) || code.value !== channel.value)) {
    return "Payment channel and code must match.";
  }
  const provider = suppliedPairValue(input, "provider");
  const providerName = suppliedPairValue(input, "provider_name");
  if (provider.supplied && providerName.supplied && (typeof provider.value !== "string" || typeof providerName.value !== "string" || !provider.value || !providerName.value || provider.value !== providerName.value)) {
    return "Provider and provider name must match.";
  }
  const minAmount = suppliedPairValue(input, "min_amount");
  const minimumAmount = suppliedPairValue(input, "minimum_amount");
  if (minAmount.supplied && minimumAmount.supplied) {
    const legacy = parseStrictDecimal(minAmount.value, 2);
    const current = parseStrictDecimal(minimumAmount.value, 2);
    if (legacy === null || current === null || legacy !== current) {
      return "Minimum amount fields must match.";
    }
  }
  return null;
}
function parseStrictDecimal(value, maximumScale = 6) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const text = typeof value === "number" ? String(value) : value;
  if (!text || text !== text.trim() || !new RegExp(
    `^-?(?:0|[1-9]\\d*)(?:\\.\\d{1,${maximumScale}})?$`
  ).test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
function paymentReviewMode(publicConfig = {}) {
  if (publicConfig.review_mode === "manual" || publicConfig.review_mode === "provider") {
    return publicConfig.review_mode;
  }
  return publicConfig.payment_mode === "manual" ? "manual" : "provider";
}
function isChannelProviderCompatible(channel, provider) {
  return isKnownPaymentChannelCode(channel) && typeof provider === "string" && Object.prototype.hasOwnProperty.call(PAYMENT_PROVIDER_CHANNEL_SUPPORT, provider) && PAYMENT_PROVIDER_CHANNEL_SUPPORT[provider].includes(channel);
}
function isMaskedSensitivePlaceholder(value) {
  return typeof value === "string" && /^\*{4}/.test(value.trim());
}
function normalizedNetwork(value) {
  if (value === null || value === void 0) return null;
  return typeof value === "string" ? value : void 0;
}
function getPaymentChannelValidationError(input = {}) {
  const expectedCurrency = PAYMENT_CHANNEL_CURRENCY_CONTRACT[input.channel];
  const currency = typeof input.currency === "string" ? input.currency : "";
  if (!expectedCurrency || currency !== expectedCurrency) {
    return `${input.channel ?? "channel"} has an unsupported currency`;
  }
  if (!isChannelProviderCompatible(input.channel, input.provider)) {
    return `${input.channel ?? "channel"} has an incompatible provider`;
  }
  const feeRate = parseStrictDecimal(input.feeRate, 6);
  if (feeRate === null || feeRate < 0 || feeRate > 1) {
    return `${input.channel ?? "channel"} has an invalid fee rate`;
  }
  if (input.provider === "liuhaoyi" && feeRate !== 0) {
    return `${input.channel ?? "channel"} must not add a local Liuhaoyi fee`;
  }
  const minimumAmount = parseStrictDecimal(input.minimumAmount, 2);
  const maximumAmount = parseStrictDecimal(input.maximumAmount, 6);
  if (minimumAmount === null || minimumAmount < 0) {
    return `${input.channel ?? "channel"} has an invalid minimum amount`;
  }
  if (maximumAmount === null || maximumAmount <= 0 || maximumAmount < minimumAmount) {
    return `${input.channel ?? "channel"} has an invalid maximum amount`;
  }
  if (input.provider === "liuhaoyi" && maximumAmount > 2e3) {
    return `${input.channel ?? "channel"} exceeds the Liuhaoyi maximum amount`;
  }
  const allowedNetworks = PAYMENT_CHANNEL_NETWORK_CONTRACT[input.channel];
  const network = normalizedNetwork(input.network);
  if (!allowedNetworks || !allowedNetworks.includes(network)) {
    return `${input.channel ?? "channel"} has an incompatible network`;
  }
  if (isMaskedSensitivePlaceholder(input.merchantId) || isMaskedSensitivePlaceholder(input.appId)) {
    return `${input.channel ?? "channel"} contains a masked credential placeholder`;
  }
  return null;
}
function isManualPaymentReady(input = {}) {
  const {
    channel,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions
  } = input;
  if (reviewMode !== "manual") return false;
  if (!hasConfiguredText(paymentAddress) || !hasConfiguredText(paymentInstructions)) {
    return false;
  }
  if (channel === "usdt_bep20" && !hasConfiguredText(tokenContract)) {
    return false;
  }
  return true;
}
function isPublicPaymentChannelReady(input = {}) {
  if (input.enabled !== true || input.configured !== true) {
    return false;
  }
  if (input.reviewMode === "manual") {
    return isManualPaymentReady(input);
  }
  return isChannelProviderCompatible(
    input.channel,
    input.provider
  );
}
function getSafePublicManualPayment(input = {}) {
  if (input.reviewMode !== "manual" || !isPublicPaymentChannelReady(input)) {
    return void 0;
  }
  return {
    payment_address: input.paymentAddress.trim(),
    token_contract: hasConfiguredText(
      input.tokenContract
    ) ? input.tokenContract.trim() : null,
    payment_instructions: input.paymentInstructions.trim()
  };
}
function getSafePublicManualPaymentForRow(row, input = {}) {
  const channel = getCanonicalPaymentChannelCode(row);
  if (channel === null || input.channel !== channel) {
    return void 0;
  }
  return getSafePublicManualPayment(input);
}

// lib/recharges/status-machine.ts
var RECHARGE_STATUS_VALUES = [
  "pending",
  "waiting_payment",
  "submitted",
  "reviewing",
  "approved",
  "processing",
  "succeeded",
  "failed",
  "rejected",
  "cancelled",
  "expired"
];
var LEGACY_STATUS_MAP = { paid: "succeeded", closed: "cancelled" };
function parseRechargeStatusStrict(value) {
  if (typeof value !== "string") return null;
  const status = value.trim().toLowerCase();
  if (!status) return null;
  if (status in LEGACY_STATUS_MAP) return LEGACY_STATUS_MAP[status];
  return RECHARGE_STATUS_VALUES.includes(status) ? status : null;
}

// lib/payments/recharge-utils.ts
function normalizeChannelRow(row) {
  const code = getCanonicalPaymentChannelCode(row);
  if (!isKnownChannel(code)) return null;
  if (getPaymentChannelPairValidationError({
    channel: row.channel,
    code: row.code,
    provider: row.provider,
    provider_name: row.provider_name,
    min_amount: row.min_amount,
    minimum_amount: row.minimum_amount
  })) return null;
  if (row.currency !== "USDT" && row.currency !== "CNY") return null;
  const currency = row.currency;
  const provider = normalizeProvider(row.provider, code);
  if (!provider) return null;
  const enabled = row.enabled === true;
  const publicConfig = row.public_config && typeof row.public_config === "object" ? row.public_config : {};
  const maximumAmountInput = publicConfig.maximum_amount ?? (currency === "USDT" ? 1e5 : 1e6);
  const validationError = getPaymentChannelValidationError({
    channel: code,
    currency,
    provider,
    feeRate: row.fee_rate,
    minimumAmount: row.minimum_amount ?? row.min_amount,
    maximumAmount: maximumAmountInput,
    network: row.network
  });
  if (validationError) return null;
  const network = normalizeNetwork(row.network, code);
  const minimumAmount = finiteNumber(row.minimum_amount ?? row.min_amount);
  const feeRate = finiteNumber(row.fee_rate);
  const configured = row.configured === true;
  const reviewMode = paymentReviewMode(publicConfig);
  const paymentAddress = textOrNull(publicConfig.payment_address);
  const tokenContract = textOrNull(
    publicConfig.token_contract
  );
  const paymentInstructions = textOrNull(
    publicConfig.payment_instructions
  );
  const available = isPublicPaymentChannelReady({
    channel: code,
    provider: row.provider ?? row.provider_name,
    enabled,
    configured,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions
  });
  const manualPayment = getSafePublicManualPaymentForRow(row, {
    channel: code,
    provider: row.provider ?? row.provider_name,
    enabled,
    configured,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions
  });
  return {
    channel_code: code,
    code,
    display_name: String(row.display_name ?? channelLabel(code)),
    name: String(row.display_name ?? channelLabel(code)),
    currency,
    network,
    networkLabel: code === "usdt_trc20" ? "TRON" : code === "usdt_bep20" ? "BSC" : void 0,
    minimum_amount: minimumAmount,
    minimumAmount,
    fee_rate: feeRate,
    feeRate,
    status: available ? "active" : "disabled",
    enabled: available,
    configured,
    reviewMode,
    maximumAmount: finiteNumber(maximumAmountInput),
    provider,
    sort_order: Math.trunc(finiteNumber(row.sort_order, 100)),
    iconSrc: channelIcon(code),
    manualPayment
  };
}
function channelLabel(code) {
  return {
    alipay: "\u652F\u4ED8\u5B9D",
    wechat: "\u5FAE\u4FE1\u652F\u4ED8",
    binance: "\u5E01\u5B89\u8F6C\u8D26",
    binance_pay: "\u5E01\u5B89\u8F6C\u8D26",
    usdt_trc20: "USDT-TRC20",
    usdt_bep20: "USDT-BEP20"
  }[code] ?? code ?? "\u2014";
}
function isKnownChannel(value) {
  return ["alipay", "wechat", "binance_pay", "usdt_trc20", "usdt_bep20"].includes(value);
}
function normalizeProvider(value, code) {
  return typeof value === "string" && isChannelProviderCompatible(code, value) ? value : null;
}
function normalizeNetwork(value, code) {
  const text = String(value ?? "").toUpperCase();
  if (code === "usdt_trc20" || text === "TRON" || text === "TRC20") return "TRC20";
  if (code === "usdt_bep20" || text === "BSC" || text === "BEP20") return "BEP20";
  return void 0;
}
function channelIcon(code) {
  return {
    alipay: "/assets/alipay-icon.jpg",
    wechat: "/assets/wechat-pay-icon.jpg",
    binance_pay: "/assets/binance-pay-icon.jpg",
    usdt_trc20: "/assets/usdt-trc20-icon.jpg",
    usdt_bep20: "/assets/usdt-bep20-icon.jpg"
  }[code];
}
function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

// lib/supabase/service-role.ts
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
function getConfiguredServiceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_KEY ?? "").trim();
}
function readJwtRole(key) {
  if (!key.startsWith("eyJ")) return null;
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}
function getSupabaseServiceRoleConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = getConfiguredServiceRoleKey();
  const keyType = serviceRoleKey.startsWith("sb_secret_") ? "secret" : serviceRoleKey.startsWith("eyJ") ? "jwt" : "unknown";
  const jwtRole = keyType === "jwt" ? readJwtRole(serviceRoleKey) : null;
  const valid = Boolean(supabaseUrl && serviceRoleKey) && (keyType === "secret" || jwtRole === "service_role");
  return {
    urlPresent: Boolean(supabaseUrl),
    serviceRolePresent: Boolean(serviceRoleKey),
    keyType,
    jwtRole,
    valid
  };
}
function getSupabaseServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = getConfiguredServiceRoleKey();
  const configuration3 = getSupabaseServiceRoleConfiguration();
  if (!configuration3.valid) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    realtime: {
      transport: ws
    }
  });
}

// lib/payments/payment-session-service.ts
var ACTIVE_SESSION_STATUSES2 = ["pending", "processing"];
var INITIALIZATION_WAIT_ATTEMPTS = 8;
var INITIALIZATION_WAIT_MS = 250;
var PaymentSessionError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PaymentSessionError";
    this.code = code;
  }
};
async function createPaymentSession(input) {
  const service = getRequiredServiceClient();
  const mode = input.mode ?? "public";
  if (mode !== "public" && mode !== "internal_canary") {
    throw new PaymentSessionError("PAYMENT_MODE_INVALID", "\u652F\u4ED8\u6267\u884C\u6A21\u5F0F\u65E0\u6548");
  }
  if (mode === "internal_canary" && process.env.SNPAY_CANARY_EXECUTION !== "YES") {
    throw new PaymentSessionError("CANARY_EXECUTION_NOT_AUTHORIZED", "\u672A\u83B7\u5F97\u672C\u5730 canary \u6267\u884C\u6388\u6743");
  }
  const businessType = normalizeBusinessType(input.businessType);
  const business = await loadBusinessRecord(service, businessType, input.businessNo, input.userId);
  if (businessType === "order") ensureBusinessCanCreatePayment(business);
  if (businessType === "recharge" && ["succeeded", "paid"].includes(business.status)) {
    throw new PaymentSessionError("BUSINESS_ALREADY_PAID", "\u4E1A\u52A1\u5355\u5DF2\u652F\u4ED8\uFF0C\u4E0D\u80FD\u91CD\u590D\u521B\u5EFA\u652F\u4ED8\u4F1A\u8BDD");
  }
  const channelCode = normalizeChannelCode(input.channelCode || business.channelCode);
  const reusable = await getReusableSession(service, {
    businessType,
    business,
    channelCode,
    provider: businessType === "recharge" ? business.provider ?? void 0 : void 0
  });
  if (reusable) {
    ensureBusinessCanCreatePayment(business);
    const existing = await waitForInitializedSession(service, reusable);
    if (businessType === "recharge" && existing.status === "failed") {
      throw new PaymentSessionError("SESSION_FAILED_REQUIRES_REVIEW", FAILED_SESSION_REVIEW_MESSAGE);
    }
    assertReusableSessionMatches(existing, { businessType, business, channelCode });
    return toSessionResponse(existing);
  }
  if (businessType === "recharge" && isLiuhaoyiPaymentMethod(channelCode)) {
    let failedQuery = service.from("payment_sessions").select("id").eq("business_type", businessType).eq("business_id", business.id).eq("business_no", business.businessNo).eq("user_id", business.userId).eq("channel_code", channelCode).eq("status", "failed").limit(1);
    if (business.provider) failedQuery = failedQuery.eq("provider", business.provider);
    const { data: failed, error: failedError } = await failedQuery.maybeSingle();
    if (failedError) throw failedError;
    if (failed) throw new PaymentSessionError("SESSION_FAILED_REQUIRES_REVIEW", FAILED_SESSION_REVIEW_MESSAGE);
  }
  ensureBusinessCanCreatePayment(business);
  const latest = await getLatestMatchingSession(service, {
    businessType,
    business,
    channelCode,
    provider: businessType === "recharge" ? business.provider ?? void 0 : void 0
  });
  if (latest && (normalizeSessionStatus(latest.status) === "expired" || isExpiredAt(latest.expires_at))) {
    throw new PaymentSessionError("SESSION_EXPIRED", "\u539F\u652F\u4ED8\u4F1A\u8BDD\u5DF2\u8FC7\u671F\uFF0C\u4E0D\u80FD\u521B\u5EFA\u66FF\u4EE3\u652F\u4ED8\u5355");
  }
  const channel = await loadEnabledChannel(service, channelCode, mode === "internal_canary");
  if (mode === "internal_canary" && (channel.provider !== "snpay" || !["alipay", "wechat"].includes(channel.code))) {
    throw new PaymentSessionError("CANARY_CHANNEL_INVALID", "\u5185\u90E8 canary \u4EC5\u5141\u8BB8 SNPAY \u652F\u4ED8\u5B9D\u6216\u5FAE\u4FE1");
  }
  if (businessType === "recharge" && business.provider && channel.provider !== business.provider) {
    throw new PaymentSessionError("SESSION_IDENTITY_CONFLICT", "\u652F\u4ED8\u6E20\u9053\u4E0E\u539F\u5145\u503C\u5355\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
  }
  if (!channel.configured) {
    throw new PaymentSessionError("PROVIDER_NOT_CONFIGURED", "\u652F\u4ED8\u6E20\u9053\u5C1A\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u521B\u5EFA\u771F\u5B9E\u652F\u4ED8\u4F1A\u8BDD\u3002");
  }
  if (channel.provider === "liuhaoyi") {
    if (business.currency !== "CNY") {
      throw new PaymentSessionError("LIUHAOYI_CURRENCY_INVALID", "\u652F\u4ED8\u5B9D/\u5FAE\u4FE1\u652F\u4ED8\u4EC5\u652F\u6301\u4EBA\u6C11\u5E01\u8BA2\u5355");
    }
    try {
      assertLiuhaoyiAmountBreakdown(business.requestedAmount, business.feeAmount, business.payableAmount);
    } catch (error) {
      throw new PaymentSessionError("LIUHAOYI_AMOUNT_LIMIT_EXCEEDED", getSafeErrorMessage(error, "\u652F\u4ED8\u5B9D/\u5FAE\u4FE1\u652F\u4ED8\u91D1\u989D\u65E0\u6548"));
    }
    if (!input.clientIp) {
      throw new PaymentSessionError("LIUHAOYI_CLIENT_IP_REQUIRED", "\u65E0\u6CD5\u786E\u8BA4\u4ED8\u6B3E\u5BA2\u6237\u7AEF IP");
    }
  }
  if (channel.provider === "snpay") {
    if (business.currency !== "CNY") {
      throw new PaymentSessionError("SNPAY_CURRENCY_INVALID", "SNPAY \u652F\u4ED8\u4EC5\u652F\u6301\u4EBA\u6C11\u5E01\u8BA2\u5355");
    }
    if (!input.clientIp) {
      throw new PaymentSessionError("SNPAY_CLIENT_IP_REQUIRED", "\u65E0\u6CD5\u786E\u8BA4\u4ED8\u6B3E\u5BA2\u6237\u7AEF IP");
    }
  }
  const capability = getPaymentProviderCapabilities(channel.provider);
  if (business.currency === "CNY" && isOnlineCnyOverLimit(business.payableAmount)) {
    throw new PaymentSessionError("ONLINE_PAYMENT_LIMIT_EXCEEDED", ONLINE_PAYMENT_LIMIT_MESSAGE);
  }
  if (channel.provider === "snpay" && (channel.feeRate !== 0 || business.feeAmount !== 0 || business.payableAmount !== business.requestedAmount)) {
    throw new PaymentSessionError("SNPAY_FEE_CONFIGURATION_INVALID", "\u652F\u4ED8\u5E73\u53F0\u624B\u7EED\u8D39\u7531\u6536\u94F6\u53F0\u6536\u53D6\uFF0C\u672C\u7AD9\u4E0D\u5F97\u91CD\u590D\u52A0\u8D39");
  }
  if (!providerSupportsChannel(capability, channel.code, business.currency) || !providerAmountWithinLimits(capability, channel, business.payableAmount)) {
    throw new PaymentSessionError("PROVIDER_AMOUNT_OR_CHANNEL_UNSUPPORTED", "\u652F\u4ED8\u6E20\u9053\u4E0D\u652F\u6301\u8BE5\u91D1\u989D\u6216\u5E01\u79CD");
  }
  const sessionNo = generateSessionNo();
  const expiresAt = businessType === "recharge" && business.expiresAt ? business.expiresAt : createPaymentExpiryWindow().expiresAt;
  const providerNetwork = channel.code === "usdt_trc20" ? "TRON" : channel.code === "usdt_bep20" ? "BSC" : channel.network;
  const reserved = await reservePaymentSession(service, {
    sessionNo,
    businessType,
    business,
    channel,
    network: providerNetwork,
    expiresAt
  });
  if (!reserved.created) {
    const existing = await waitForInitializedSession(service, reserved.session);
    if (businessType === "recharge" && existing.status === "failed") {
      throw new PaymentSessionError("SESSION_FAILED_REQUIRES_REVIEW", FAILED_SESSION_REVIEW_MESSAGE);
    }
    assertReusableSessionMatches(existing, { businessType, business, channelCode: channel.code, provider: channel.provider });
    return toSessionResponse(existing);
  }
  try {
    const providerResult = await resolveProviderForNewPayment(channel).createPayment({
      sessionNo,
      businessType,
      businessNo: business.businessNo,
      userId: input.userId,
      channel,
      currency: business.currency,
      network: providerNetwork,
      requestedAmount: business.requestedAmount,
      feeAmount: business.feeAmount,
      payableAmount: business.payableAmount,
      expiresAt,
      clientIp: input.clientIp ?? void 0,
      clientDevice: input.clientDevice
    });
    const { data, error } = await service.from("payment_sessions").update({
      status: providerResult.status,
      payment_type: providerResult.paymentType,
      payment_url: providerResult.paymentUrl ?? providerResult.deepLinkUrl ?? null,
      qr_code_url: providerResult.qrCodeValue ?? providerResult.qrCodeUrl ?? null,
      wallet_address: providerResult.walletAddress ?? null,
      provider_order_no: providerResult.providerOrderNo ?? null,
      expires_at: expiresAt,
      metadata: { initializing: false, ...providerResult.metadata ?? {} },
      last_error: null
    }).eq("session_no", sessionNo).in("status", ACTIVE_SESSION_STATUSES2).select(sessionResponseSelect).single();
    if (error) throw error;
    return toSessionResponse(data);
  } catch (error) {
    const message = getSafeErrorMessage(error, "\u652F\u4ED8\u6E20\u9053\u521B\u5EFA\u652F\u4ED8\u5931\u8D25");
    await service.from("payment_sessions").update({
      status: "failed",
      last_error: message,
      metadata: channel.provider === "snpay" ? {
        ...reserved.session.metadata && typeof reserved.session.metadata === "object" && !Array.isArray(reserved.session.metadata) ? reserved.session.metadata : {},
        initializing: false,
        errorCode: errorCode(error),
        ...getSnpayBusinessErrorDiagnostics(error)
      } : { initializing: false, errorCode: errorCode(error) }
    }).eq("session_no", sessionNo).neq("status", "paid");
    throw error;
  }
}
var sessionResponseSelect = "session_no,business_type,business_id,business_no,user_id,status,payment_type,payment_url,qr_code_url,wallet_address,network,currency,requested_amount,fee_amount,payable_amount,expires_at,metadata,provider,channel_code";
async function reservePaymentSession(service, input) {
  const { data, error } = await service.rpc("reserve_payment_session", {
    p_session_no: input.sessionNo,
    p_business_type: input.businessType,
    p_business_id: input.business.id,
    p_business_no: input.business.businessNo,
    p_user_id: input.business.userId,
    p_channel_code: input.channel.code,
    p_provider: input.channel.provider,
    p_currency: input.business.currency,
    p_network: input.network ?? null,
    p_requested_amount: input.business.requestedAmount,
    p_fee_amount: input.business.feeAmount,
    p_payable_amount: input.business.payableAmount,
    p_expires_at: input.expiresAt
  });
  if (!error && data && typeof data === "object") {
    const result = data;
    const guardedRecharge = input.businessType === "recharge" && isLiuhaoyiPaymentMethod(input.channel.code);
    if (guardedRecharge && result.blocked === true) {
      if (result.blockCode === "SESSION_FAILED_REQUIRES_REVIEW") {
        throw new PaymentSessionError("SESSION_FAILED_REQUIRES_REVIEW", FAILED_SESSION_REVIEW_MESSAGE);
      }
      const code = ["BUSINESS_ALREADY_PAID", "BUSINESS_STATUS_INVALID", "SESSION_IDENTITY_CONFLICT"].includes(String(result.blockCode)) ? String(result.blockCode) : "SESSION_RECHARGE_GUARD_NOT_READY";
      throw new PaymentSessionError(code, "\u652F\u4ED8\u4F1A\u8BDD\u65E0\u6CD5\u5B89\u5168\u521B\u5EFA\uFF0C\u8BF7\u5237\u65B0\u5145\u503C\u8BB0\u5F55\u6216\u8054\u7CFB\u5BA2\u670D\u3002");
    }
    if (guardedRecharge && result.retryGuardVersion !== 1) {
      throw new PaymentSessionError("SESSION_RECHARGE_GUARD_NOT_READY", "\u652F\u4ED8\u4F1A\u8BDD\u5B89\u5168\u4FDD\u62A4\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
    }
    if (result.session && typeof result.session === "object") {
      return { created: result.created === true, session: result.session };
    }
  }
  if (error && !isMissingFunction(error)) throw error;
  if (input.businessType === "recharge" && isLiuhaoyiPaymentMethod(input.channel.code)) {
    throw new PaymentSessionError("SESSION_RECHARGE_GUARD_NOT_READY", "\u652F\u4ED8\u4F1A\u8BDD\u5B89\u5168\u4FDD\u62A4\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
  }
  return reservePaymentSessionFallback(service, input);
}
async function reservePaymentSessionFallback(service, input) {
  await expireStaleSessions(service, input.businessType, input.business.id);
  const payload = {
    session_no: input.sessionNo,
    business_type: input.businessType,
    business_id: input.business.id,
    business_no: input.business.businessNo,
    user_id: input.business.userId,
    channel_code: input.channel.code,
    provider: input.channel.provider,
    currency: input.business.currency,
    network: input.network ?? null,
    requested_amount: input.business.requestedAmount,
    fee_amount: input.business.feeAmount,
    payable_amount: input.business.payableAmount,
    status: "processing",
    payment_type: "redirect",
    expires_at: input.expiresAt,
    metadata: { initializing: true }
  };
  const { data, error } = await service.from("payment_sessions").insert(payload).select(sessionResponseSelect).single();
  if (!error && data) return { created: true, session: data };
  if (!isUniqueViolation(error)) throw error;
  const existing = await getReusableSession(service, {
    businessType: input.businessType,
    business: input.business,
    channelCode: input.channel.code,
    provider: input.channel.provider
  });
  if (!existing) throw error;
  return { created: false, session: existing };
}
async function waitForInitializedSession(service, initial) {
  let current = initial;
  for (let attempt = 0; attempt < INITIALIZATION_WAIT_ATTEMPTS; attempt += 1) {
    if (!isInitializing(current)) return current;
    await delay(INITIALIZATION_WAIT_MS);
    const { data, error } = await service.from("payment_sessions").select(sessionResponseSelect).eq("session_no", String(current.session_no)).maybeSingle();
    if (error) throw error;
    if (data) current = data;
  }
  return current;
}
function isInitializing(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return metadata.initializing === true;
}
function getRequiredServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    throw new PaymentSessionError("SERVICE_ROLE_NOT_CONFIGURED", "\u670D\u52A1\u7AEF\u652F\u4ED8\u5BC6\u94A5\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u6267\u884C\u53EF\u4FE1\u652F\u4ED8\u64CD\u4F5C\u3002");
  }
  return service;
}
function normalizeBusinessType(value) {
  if (value === "order") return "order";
  if (value === "recharge" || value === "account_recharge") return "recharge";
  throw new PaymentSessionError("BUSINESS_TYPE_INVALID", "\u652F\u4ED8\u4E1A\u52A1\u7C7B\u578B\u4E0D\u652F\u6301");
}
async function loadBusinessRecord(service, businessType, businessNo, userId) {
  const normalizedNo = businessNo.trim();
  if (!normalizedNo) throw new PaymentSessionError("BUSINESS_NO_REQUIRED", "\u7F3A\u5C11\u4E1A\u52A1\u5355\u53F7");
  if (businessType === "order") {
    const { data: data2, error: error2 } = await service.from("orders").select("id,order_no,user_id,status,payment_status,total_amount,currency").eq("order_no", normalizedNo).maybeSingle();
    if (error2) throw error2;
    if (!data2 || data2.user_id !== userId) {
      throw new PaymentSessionError("BUSINESS_NOT_FOUND", "\u8BA2\u5355\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u652F\u4ED8");
    }
    return {
      id: String(data2.id),
      businessNo: String(data2.order_no),
      userId: String(data2.user_id),
      status: String(data2.status),
      paymentStatus: textOrNull2(data2.payment_status),
      requestedAmount: finiteNumber2(data2.total_amount),
      feeAmount: 0,
      payableAmount: finiteNumber2(data2.total_amount),
      currency: data2.currency === "USDT" ? "USDT" : "CNY"
    };
  }
  const { data, error } = await service.from("account_recharges").select("id,recharge_no,user_id,status,amount,requested_amount,fee_amount,payable_amount,currency,channel_code,channel,expires_at,provider").eq("recharge_no", normalizedNo).maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) {
    throw new PaymentSessionError("BUSINESS_NOT_FOUND", "\u5145\u503C\u5355\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u652F\u4ED8");
  }
  return {
    id: String(data.id),
    businessNo: String(data.recharge_no),
    userId: String(data.user_id),
    status: String(data.status),
    requestedAmount: finiteNumber2(data.requested_amount ?? data.amount),
    feeAmount: finiteNumber2(data.fee_amount),
    payableAmount: finiteNumber2(data.payable_amount),
    currency: data.currency === "USDT" ? "USDT" : "CNY",
    channelCode: textOrNull2(data.channel_code ?? data.channel),
    expiresAt: textOrNull2(data.expires_at),
    provider: textOrNull2(data.provider)
  };
}
function ensureBusinessCanCreatePayment(record) {
  if (record.paymentStatus === "paid" || record.status === "paid") {
    throw new PaymentSessionError("BUSINESS_ALREADY_PAID", "\u4E1A\u52A1\u5355\u5DF2\u652F\u4ED8\uFF0C\u4E0D\u80FD\u91CD\u590D\u521B\u5EFA\u652F\u4ED8\u4F1A\u8BDD");
  }
  if (["cancelled", "closed", "expired", "refunded", "failed"].includes(record.status)) {
    throw new PaymentSessionError("BUSINESS_STATUS_INVALID", "\u5F53\u524D\u4E1A\u52A1\u5355\u72B6\u6001\u4E0D\u5141\u8BB8\u521B\u5EFA\u652F\u4ED8\u4F1A\u8BDD");
  }
  if (isLiuhaoyiPaymentMethod(record.channelCode) && isExpiredAt(record.expiresAt)) {
    throw new PaymentSessionError("BUSINESS_STATUS_INVALID", "\u5145\u503C\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4F7F\u7528\u539F\u652F\u4ED8\u5355");
  }
  if (record.payableAmount <= 0) throw new PaymentSessionError("AMOUNT_INVALID", "\u652F\u4ED8\u91D1\u989D\u65E0\u6548");
}
function isExpiredAt(value) {
  const expiresAt = Date.parse(String(value ?? ""));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
async function expireStaleSessions(service, businessType, businessId) {
  await service.from("payment_sessions").update({ status: "expired", closed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("business_type", businessType).eq("business_id", businessId).in("status", ACTIVE_SESSION_STATUSES2).lt("expires_at", (/* @__PURE__ */ new Date()).toISOString());
}
async function getReusableSession(service, identity) {
  let query = service.from("payment_sessions").select(sessionResponseSelect).eq("business_type", identity.businessType).eq("business_id", identity.business.id).eq("business_no", identity.business.businessNo).eq("user_id", identity.business.userId).eq("channel_code", identity.channelCode).in("status", ACTIVE_SESSION_STATUSES2).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: false }).limit(1);
  if (identity.provider) query = query.eq("provider", identity.provider);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
async function getLatestMatchingSession(service, identity) {
  let query = service.from("payment_sessions").select(sessionResponseSelect).eq("business_type", identity.businessType).eq("business_id", identity.business.id).eq("business_no", identity.business.businessNo).eq("user_id", identity.business.userId).eq("channel_code", identity.channelCode).order("created_at", { ascending: false }).limit(1);
  if (identity.provider) query = query.eq("provider", identity.provider);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
function assertReusableSessionMatches(row, identity) {
  const matches = isReusablePaymentSession(row, {
    businessType: identity.businessType,
    businessId: identity.business.id,
    businessNo: identity.business.businessNo,
    userId: identity.business.userId,
    channelCode: identity.channelCode,
    provider: identity.provider
  });
  if (!matches) {
    throw new PaymentSessionError("SESSION_REUSE_MISMATCH", "\u73B0\u6709\u652F\u4ED8\u4F1A\u8BDD\u4E0E\u5F53\u524D\u4E1A\u52A1\u4E0D\u5339\u914D\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
  }
}
function normalizeChannelCode(value) {
  const channelCode = String(value ?? "").trim();
  if (!channelCode) throw new PaymentSessionError("CHANNEL_REQUIRED", "\u7F3A\u5C11\u652F\u4ED8\u6E20\u9053");
  return channelCode;
}
async function loadEnabledChannel(service, code, allowDisabledCanary = false) {
  const channelCode = normalizeChannelCode(code);
  let query = service.from("payment_channels").select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order,configured,provider_config,public_config").or(`code.eq.${channelCode},channel.eq.${channelCode}`);
  if (!allowDisabledCanary) query = query.eq("enabled", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data) : null;
  const canaryBypass = allowDisabledCanary && process.env.SNPAY_CANARY_EXECUTION === "YES" && channel?.provider === "snpay" && ["alipay", "wechat"].includes(channel.code);
  if (!channel || !channel.enabled && !canaryBypass) throw new PaymentSessionError("CHANNEL_DISABLED", "\u652F\u4ED8\u6E20\u9053\u672A\u542F\u7528\u6216\u4E0D\u5B58\u5728");
  channel.configured = data?.configured === true || hasProviderConfig(data?.provider_config);
  return channel;
}
async function createPaymentSessionForInternalCanary(input) {
  if (process.env.SNPAY_CANARY_EXECUTION !== "YES") {
    throw new PaymentSessionError("CANARY_EXECUTION_NOT_AUTHORIZED", "\u672A\u83B7\u5F97\u672C\u5730 canary \u6267\u884C\u6388\u6743");
  }
  return createPaymentSession({ ...input, mode: "internal_canary" });
}
function toSessionResponse(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const artifact = normalizeLiuhaoyiSessionPresentation({
    provider: textOrUndefined(row.provider),
    channelCode: textOrUndefined(row.channel_code),
    paymentType: normalizePaymentType(row.payment_type),
    paymentUrl: textOrUndefined(row.payment_url),
    qrCodeUrl: textOrUndefined(row.qr_code_url)
  });
  const submitForm = row.provider === "liuhaoyi" && metadata.checkoutMode === "submit" ? normalizeLiuhaoyiSubmitForm(metadata.submitForm) : null;
  const validSubmitForm = submitForm && (row.channel_code === "wechat" || row.channel_code === "alipay") && submitForm.fields.out_trade_no === row.session_no && submitForm.fields.type === (row.channel_code === "wechat" ? "wxpay" : "alipay") && Number(submitForm.fields.money) === finiteNumber2(row.payable_amount) ? submitForm : void 0;
  return {
    sessionNo: String(row.session_no),
    status: normalizeSessionStatus(row.status) === "processing" ? "processing" : "pending",
    paymentType: artifact.paymentType,
    paymentUrl: artifact.paymentUrl,
    submitForm: validSubmitForm,
    providerExternalFeeDisclosure: typeof row.provider === "string" ? getPaymentProviderCapabilities(row.provider).providerExternalFeeDisclosure ?? void 0 : void 0,
    qrCodeUrl: artifact.qrCodeUrl,
    qrCodeValue: artifact.qrCodeValue,
    deepLinkUrl: artifact.deepLinkUrl,
    clientDevice: normalizeClientDevice(metadata.clientDevice),
    walletAddress: textOrUndefined(row.wallet_address),
    network: textOrUndefined(row.network),
    currency: row.currency === "USDT" ? "USDT" : "CNY",
    requestedAmount: finiteNumber2(row.requested_amount),
    feeAmount: finiteNumber2(row.fee_amount),
    payableAmount: finiteNumber2(row.payable_amount),
    expiresAt: String(row.expires_at ?? "")
  };
}
function normalizeSessionStatus(value) {
  return ["pending", "processing", "paid", "failed", "expired", "closed"].includes(String(value)) ? String(value) : "pending";
}
function normalizePaymentType(value) {
  return value === "qrcode" || value === "address" || value === "deeplink" ? value : "redirect";
}
function normalizeClientDevice(value) {
  return ["pc", "mobile", "wechat", "alipay"].includes(String(value)) ? String(value) : void 0;
}
function generateSessionNo() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PS${stamp}${random}`;
}
function hasProviderConfig(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}
function finiteNumber2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function textOrNull2(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function textOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function isMissingFunction(error) {
  return /reserve_payment_session|PGRST202|42883|schema cache/i.test(getSafeErrorMessage(error, ""));
}
function isUniqueViolation(error) {
  return Boolean(error && typeof error === "object" && error.code === "23505");
}
function errorCode(error) {
  if (error instanceof PaymentSessionError) return error.code;
  if (error && typeof error === "object" && typeof error.code === "string") {
    return String(error.code);
  }
  return "PAYMENT_CREATE_FAILED";
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// lib/i18n/config.ts
var DEFAULT_LOCALE = "zh-CN";
var DEFAULT_SUPPORTED_LOCALES = ["zh-CN"];
var DEFAULT_CURRENCY = "CNY";
var DEFAULT_BUSINESS_TIMEZONE = "Asia/Shanghai";
var DEFAULT_DATE_FORMAT = "yyyy-MM-dd";
var DEFAULT_TIME_FORMAT = "HH:mm:ss";
var DEFAULT_I18N_CONFIG = {
  defaultLocale: DEFAULT_LOCALE,
  supportedLocales: [...DEFAULT_SUPPORTED_LOCALES],
  defaultCurrency: DEFAULT_CURRENCY,
  businessTimezone: DEFAULT_BUSINESS_TIMEZONE,
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: DEFAULT_TIME_FORMAT
};

// lib/payments/channels.ts
var PAYMENT_CHANNELS = [
  {
    channel_code: "alipay",
    code: "alipay",
    display_name: "\u652F\u4ED8\u5B9D",
    name: "\u652F\u4ED8\u5B9D",
    currency: "CNY",
    minimum_amount: 10,
    minimumAmount: 10,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "liuhaoyi",
    sort_order: 10,
    iconSrc: "/assets/alipay-icon.jpg",
    description: "\u9002\u5408\u4EBA\u6C11\u5E01\u4F59\u989D\u5145\u503C\uFF0C\u5230\u8D26\u524D\u9700\u7B49\u5F85\u6E20\u9053\u56DE\u8C03\u786E\u8BA4\u3002"
  },
  {
    channel_code: "wechat",
    code: "wechat",
    display_name: "\u5FAE\u4FE1\u652F\u4ED8",
    name: "\u5FAE\u4FE1\u652F\u4ED8",
    currency: "CNY",
    minimum_amount: 10,
    minimumAmount: 10,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "liuhaoyi",
    sort_order: 20,
    iconSrc: "/assets/wechat-pay-icon.jpg",
    description: "\u9002\u5408\u4EBA\u6C11\u5E01\u4F59\u989D\u5145\u503C\uFF0C\u5230\u8D26\u524D\u9700\u7B49\u5F85\u6E20\u9053\u56DE\u8C03\u786E\u8BA4\u3002"
  },
  {
    channel_code: "binance_pay",
    code: "binance_pay",
    display_name: "\u5E01\u5B89\u8F6C\u8D26",
    name: "\u5E01\u5B89\u8F6C\u8D26",
    currency: "USDT",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "binance",
    sort_order: 30,
    iconSrc: "/assets/binance-pay-icon.jpg",
    description: "\u9884\u7559 Binance Pay \u94FE\u8DEF\uFF0C\u5F53\u524D\u672A\u914D\u7F6E\u771F\u5B9E\u4EE3\u6536\u53C2\u6570\u3002"
  },
  {
    channel_code: "usdt_trc20",
    code: "usdt_trc20",
    display_name: "USDT-TRC20",
    name: "USDT-TRC20",
    currency: "USDT",
    network: "TRC20",
    networkLabel: "TRON",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "crypto_address",
    sort_order: 40,
    iconSrc: "/assets/usdt-trc20-icon.jpg",
    description: "TRON \u7F51\u7EDC\u6536\u6B3E\u5730\u5740\u9884\u7559\uFF0C\u672A\u914D\u7F6E\u524D\u4E0D\u4F1A\u8FD4\u56DE\u5730\u5740\u3002"
  },
  {
    channel_code: "usdt_bep20",
    code: "usdt_bep20",
    display_name: "USDT-BEP20",
    name: "USDT-BEP20",
    currency: "USDT",
    network: "BEP20",
    networkLabel: "BSC",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "crypto_address",
    sort_order: 50,
    iconSrc: "/assets/usdt-bep20-icon.jpg",
    description: "BSC \u7F51\u7EDC\u6536\u6B3E\u5730\u5740\u9884\u7559\uFF0C\u672A\u914D\u7F6E\u524D\u4E0D\u4F1A\u8FD4\u56DE\u5730\u5740\u3002"
  }
].sort((a, b) => a.sort_order - b.sort_order);
function getCurrencyDecimals(currency) {
  return currency === "USDT" ? 6 : 2;
}
function normalizeRechargeAmount(value, currency) {
  const decimals = getCurrencyDecimals(currency);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
function calculateRechargeAmounts(channel, rawAmount) {
  const amount = normalizeRechargeAmount(Number.isFinite(rawAmount) ? rawAmount : 0, channel.currency);
  const fee = normalizeRechargeAmount(amount * channel.feeRate, channel.currency);
  const payableAmount = normalizeRechargeAmount(amount + fee, channel.currency);
  return {
    amount,
    fee,
    payableAmount,
    arrivalAmount: amount,
    currency: channel.currency,
    decimals: getCurrencyDecimals(channel.currency)
  };
}

// lib/risk/risk-service.ts
import { createHash as createHash2, randomUUID } from "crypto";
var RISK_RULES = {
  ACCOUNT_RECENTLY_CREATED_HIGH_VALUE: { rule_code: "ACCOUNT_RECENTLY_CREATED_HIGH_VALUE", enabled: true, weight: 35, window_seconds: 86400, threshold: 1 },
  ACCOUNT_RESTRICTED_HIGH_RISK_ACTION: { rule_code: "ACCOUNT_RESTRICTED_HIGH_RISK_ACTION", enabled: true, weight: 70, window_seconds: 300, threshold: 1 },
  ORDER_UNPAID_BURST: { rule_code: "ORDER_UNPAID_BURST", enabled: true, weight: 35, window_seconds: 900, threshold: 5 },
  ORDER_LARGE_QUANTITY: { rule_code: "ORDER_LARGE_QUANTITY", enabled: true, weight: 30, window_seconds: 300, threshold: 50 },
  ORDER_SKU_REPEATED_RESERVATION: { rule_code: "ORDER_SKU_REPEATED_RESERVATION", enabled: true, weight: 30, window_seconds: 1800, threshold: 3 },
  PAYMENT_SESSION_BURST: { rule_code: "PAYMENT_SESSION_BURST", enabled: true, weight: 35, window_seconds: 900, threshold: 6 },
  PAYMENT_CHANNEL_SWITCHING: { rule_code: "PAYMENT_CHANNEL_SWITCHING", enabled: true, weight: 25, window_seconds: 1800, threshold: 3 },
  PAYMENT_DUPLICATE_PROVIDER_TRADE: { rule_code: "PAYMENT_DUPLICATE_PROVIDER_TRADE", enabled: true, weight: 95, window_seconds: 86400, threshold: 1 },
  RECHARGE_REQUEST_BURST: { rule_code: "RECHARGE_REQUEST_BURST", enabled: true, weight: 35, window_seconds: 1800, threshold: 5 },
  RECHARGE_DUPLICATE_CLIENT_REQUEST: { rule_code: "RECHARGE_DUPLICATE_CLIENT_REQUEST", enabled: true, weight: 45, window_seconds: 86400, threshold: 1 },
  REFUND_REQUEST_BURST: { rule_code: "REFUND_REQUEST_BURST", enabled: true, weight: 40, window_seconds: 86400, threshold: 3 },
  REFUND_RATIO_HIGH: { rule_code: "REFUND_RATIO_HIGH", enabled: true, weight: 35, window_seconds: 2592e3, threshold: 1 },
  REFUND_DELIVERED_DIGITAL: { rule_code: "REFUND_DELIVERED_DIGITAL", enabled: true, weight: 30, window_seconds: 2592e3, threshold: 1 },
  SOURCE_SHARED_BY_ACCOUNTS: { rule_code: "SOURCE_SHARED_BY_ACCOUNTS", enabled: true, weight: 20, window_seconds: 86400, threshold: 3 }
};
async function evaluateRisk(input) {
  const requestId = normalizeRequestId(input.requestId);
  try {
    const matchedRules = await matchRiskRules(input);
    const riskScore = Math.min(100, matchedRules.reduce((sum, rule) => sum + rule.weight, 0));
    const riskLevel = scoreToLevel(riskScore, matchedRules);
    const recommendedAction = actionForLevel(riskLevel, input.businessType);
    const result = {
      risk_level: riskLevel,
      risk_score: riskScore,
      matched_rules: matchedRules,
      recommended_action: recommendedAction,
      review_required: recommendedAction === "require_review",
      expires_at: ["temporarily_block", "require_review"].includes(recommendedAction) ? new Date(Date.now() + 30 * 60 * 1e3).toISOString() : null,
      request_id: requestId
    };
    if (matchedRules.length > 0) {
      const event = await recordRiskEvent(input.supabase, {
        ...result,
        request_id: requestId,
        business_type: input.businessType,
        business_id: input.businessId ?? null,
        user_id: input.userId ?? null,
        source_hash: buildSourceHash(input.request),
        summary: matchedRules.map((rule) => rule.summary).join("; "),
        metadata: sanitizeRiskMetadata(input.riskContext)
      });
      result.event_id = event.eventId;
    }
    return result;
  } catch {
    if (input.failClosed) {
      return {
        risk_level: "high",
        risk_score: 80,
        matched_rules: [{ ...RISK_RULES.ACCOUNT_RESTRICTED_HIGH_RISK_ACTION, summary: "\u98CE\u9669\u670D\u52A1\u5F02\u5E38\uFF0C\u9AD8\u98CE\u9669\u4E1A\u52A1\u8FDB\u5165\u4EBA\u5DE5\u5BA1\u6838" }],
        recommended_action: "require_review",
        review_required: true,
        expires_at: new Date(Date.now() + 30 * 60 * 1e3).toISOString(),
        request_id: requestId
      };
    }
    return {
      risk_level: "low",
      risk_score: 0,
      matched_rules: [],
      recommended_action: "allow_with_monitoring",
      review_required: false,
      expires_at: null,
      request_id: requestId
    };
  }
}
function evaluateRechargeRisk(input) {
  return evaluateRisk({ ...input, businessType: "recharge", failClosed: true });
}
function shouldBlockRisk(result) {
  if (result.recommended_action === "deny") return "\u5F53\u524D\u64CD\u4F5C\u547D\u4E2D\u9AD8\u98CE\u9669\u89C4\u5219\uFF0C\u5DF2\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u5904\u7406\u3002";
}
async function matchRiskRules(input) {
  const hits = [];
  const quantity = finiteNumber3(input.quantity);
  const amount = finiteNumber3(input.orderAmount);
  const accountAgeSeconds = input.accountCreatedAt ? Math.max(0, (Date.now() - new Date(input.accountCreatedAt).getTime()) / 1e3) : null;
  if (input.userId) {
    const profile = await loadProfile(input.supabase, input.userId);
    if (profile?.risk_status && ["high_risk", "blocked"].includes(profile.risk_status)) {
      addHit(hits, "ACCOUNT_RESTRICTED_HIGH_RISK_ACTION", "\u53D7\u9650\u8D26\u6237\u7EE7\u7EED\u8C03\u7528\u9AD8\u98CE\u9669\u63A5\u53E3");
    }
  }
  if (amount >= 1e3 && accountAgeSeconds != null && accountAgeSeconds < RISK_RULES.ACCOUNT_RECENTLY_CREATED_HIGH_VALUE.window_seconds) {
    addHit(hits, "ACCOUNT_RECENTLY_CREATED_HIGH_VALUE", "\u65B0\u8D26\u6237\u7ACB\u5373\u53D1\u8D77\u9AD8\u91D1\u989D\u64CD\u4F5C");
  }
  if (input.businessType === "order") {
    if (quantity >= RISK_RULES.ORDER_LARGE_QUANTITY.threshold) addHit(hits, "ORDER_LARGE_QUANTITY", "\u5F02\u5E38\u5927\u6570\u91CF\u4E0B\u5355");
    const unpaid = await boundedCount(input.supabase, {
      table: "orders",
      userId: input.userId,
      statuses: ["pending_payment"],
      windowSeconds: RISK_RULES.ORDER_UNPAID_BURST.window_seconds
    });
    if (unpaid >= RISK_RULES.ORDER_UNPAID_BURST.threshold) addHit(hits, "ORDER_UNPAID_BURST", "\u77ED\u65F6\u95F4\u521B\u5EFA\u5927\u91CF\u672A\u652F\u4ED8\u8BA2\u5355");
    if (input.skuId) {
      const skuCount = await boundedCount(input.supabase, {
        table: "order_items",
        column: "sku_id",
        value: input.skuId,
        windowSeconds: RISK_RULES.ORDER_SKU_REPEATED_RESERVATION.window_seconds
      });
      if (skuCount >= RISK_RULES.ORDER_SKU_REPEATED_RESERVATION.threshold) addHit(hits, "ORDER_SKU_REPEATED_RESERVATION", "\u540C\u4E00 SKU \u88AB\u91CD\u590D\u9884\u7559");
    }
  }
  if (input.businessType === "payment") {
    const sessions = await boundedCount(input.supabase, {
      table: "payment_sessions",
      userId: input.userId,
      windowSeconds: RISK_RULES.PAYMENT_SESSION_BURST.window_seconds
    });
    if (sessions >= RISK_RULES.PAYMENT_SESSION_BURST.threshold) addHit(hits, "PAYMENT_SESSION_BURST", "\u9891\u7E41\u521B\u5EFA\u652F\u4ED8\u4F1A\u8BDD");
  }
  if (input.businessType === "recharge") {
    const recharges = await boundedCount(input.supabase, {
      table: "account_recharges",
      userId: input.userId,
      statuses: ["pending", "processing"],
      windowSeconds: RISK_RULES.RECHARGE_REQUEST_BURST.window_seconds
    });
    if (recharges >= RISK_RULES.RECHARGE_REQUEST_BURST.threshold) addHit(hits, "RECHARGE_REQUEST_BURST", "\u77ED\u65F6\u95F4\u5927\u91CF\u5145\u503C\u7533\u8BF7");
  }
  if (input.businessType === "refund") {
    const refunds = await boundedCount(input.supabase, {
      table: "refund_requests",
      userId: input.userId,
      windowSeconds: RISK_RULES.REFUND_REQUEST_BURST.window_seconds
    });
    if (refunds >= RISK_RULES.REFUND_REQUEST_BURST.threshold) addHit(hits, "REFUND_REQUEST_BURST", "\u77ED\u65F6\u95F4\u591A\u6B21\u9000\u6B3E\u7533\u8BF7");
    if (input.riskContext?.deliveryDelivered === true) addHit(hits, "REFUND_DELIVERED_DIGITAL", "\u5DF2\u4EA4\u4ED8\u6570\u5B57\u5546\u54C1\u7533\u8BF7\u9000\u6B3E");
  }
  return hits;
}
async function boundedCount(supabase, query) {
  const createdColumn = query.createdColumn ?? "created_at";
  let builder = supabase.from(query.table).select("id", { count: "exact", head: true }).gte(createdColumn, new Date(Date.now() - query.windowSeconds * 1e3).toISOString());
  if (query.userId) builder = builder.eq("user_id", query.userId);
  if (query.column && query.value) builder = builder.eq(query.column, query.value);
  if (query.statuses?.length) builder = builder.in("status", query.statuses);
  const { count, error } = await builder.limit(500);
  if (error) return 0;
  return Math.min(count ?? 0, 500);
}
async function loadProfile(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("id,risk_status,account_status,created_at").eq("id", userId).maybeSingle();
  if (error) return null;
  return data;
}
function addHit(hits, code, summary) {
  const rule = RISK_RULES[code];
  if (!rule.enabled) return;
  hits.push({ rule_code: code, weight: rule.weight, window_seconds: rule.window_seconds, threshold: rule.threshold, summary });
}
function scoreToLevel(score, hits) {
  if (hits.some((hit) => hit.rule_code === "PAYMENT_DUPLICATE_PROVIDER_TRADE")) return "critical";
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}
function actionForLevel(level, businessType) {
  if (level === "critical") return "deny";
  if (level === "high") return ["refund", "delivery"].includes(businessType) ? "require_review" : "temporarily_block";
  if (level === "medium") return "allow_with_monitoring";
  return "allow";
}
async function recordRiskEvent(supabase, input) {
  const writer = getSupabaseServiceRoleClient() ?? supabase;
  const fingerprint = createHash2("sha256").update([input.user_id ?? "anonymous", input.business_type, input.business_id ?? "none", input.matched_rules.map((rule) => rule.rule_code).sort().join(",")].join("|")).digest("hex");
  const primaryRule = input.matched_rules[0]?.rule_code ?? "SOURCE_SHARED_BY_ACCOUNTS";
  const row = {
    fingerprint,
    rule_code: primaryRule,
    risk_level: input.risk_level,
    risk_score: input.risk_score,
    recommended_action: input.recommended_action,
    business_type: input.business_type,
    business_id: input.business_id,
    user_id: input.user_id,
    request_id: input.request_id,
    source_hash: input.source_hash,
    summary: input.summary.slice(0, 500),
    metadata: input.metadata,
    status: input.review_required ? "pending" : "open",
    expires_at: input.expires_at,
    last_seen_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await writer.from("risk_events").upsert(row, { onConflict: "fingerprint" }).select("id").maybeSingle();
  if (error) {
    if (isRiskSchemaMissing(error)) return { ok: false, eventId: null, schemaMissing: true };
    throw error;
  }
  return { ok: true, eventId: typeof data?.id === "string" ? data.id : null, schemaMissing: false };
}
function buildSourceHash(request) {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const seed = `${forwarded.slice(0, 64)}|${summarizeUserAgent(ua)}`;
  return createHash2("sha256").update(seed).digest("hex");
}
function summarizeUserAgent(value) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").slice(0, 120);
}
function sanitizeRiskMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/password|token|secret|key|authorization|cookie|content|callback|payload/i.test(key)) continue;
    if (typeof raw === "string") output[key] = raw.slice(0, 160);
    else if (typeof raw === "number" || typeof raw === "boolean" || raw == null) output[key] = raw;
  }
  return output;
}
function normalizeRequestId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= 160 ? text : randomUUID();
}
function finiteNumber3(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function isRiskSchemaMissing(error) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message ?? "") : String(error ?? "");
  const code = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
  return /risk_events|risk_reviews|schema cache|Could not find the table/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}

// lib/users/account-guard.ts
var AccountRestrictionError = class extends Error {
  constructor(message, code = "ACCOUNT_RESTRICTED", status = 403) {
    super(message);
    this.name = "AccountRestrictionError";
    this.code = code;
    this.status = status;
  }
};
function getErrorMessage(error, fallback = "\u8D26\u6237\u72B6\u6001\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
async function assertUserBusinessAllowed(supabase, userId, action) {
  const { data, error } = await supabase.rpc("check_user_business_allowed", {
    p_user_id: userId,
    p_action: action
  });
  if (error) {
    if (/check_user_business_allowed|schema cache|PGRST|42883/i.test(getErrorMessage(error, ""))) {
      return;
    }
    throw new AccountRestrictionError(getErrorMessage(error), "ACCOUNT_CHECK_FAILED", 500);
  }
  const result = data;
  if (result && result.allowed === false) {
    throw new AccountRestrictionError(result.message || "\u8D26\u6237\u5F53\u524D\u6682\u4E0D\u80FD\u6267\u884C\u8BE5\u64CD\u4F5C\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002", "ACCOUNT_RESTRICTED", 403);
  }
}

// lib/payments/account-recharge-expiry.mjs
var ACCOUNT_RECHARGE_EXPIRY_MINUTES = 10;
var ACCOUNT_RECHARGE_EXPIRY_MS = ACCOUNT_RECHARGE_EXPIRY_MINUTES * 60 * 1e3;
function createAccountRechargeExpiryWindow(now = /* @__PURE__ */ new Date()) {
  const createdAtMs = new Date(now).getTime();
  if (!Number.isFinite(createdAtMs)) throw new TypeError("Invalid recharge creation time");
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + ACCOUNT_RECHARGE_EXPIRY_MS).toISOString()
  };
}

// lib/payments/recharge-creation-service.ts
async function prepareCanaryRecharge(input) {
  await assertUserBusinessAllowed(input.service, input.userId, "create_recharge");
  const existing = await findExistingRecharge(input.service, input.userId, input.logicalKey);
  if (existing && ["pending", "waiting_payment", "processing"].includes(existing.status)) return { ...existing, created: false };
  if (existing) throw new Error("CANARY_RECHARGE_DUPLICATE_NON_PAYABLE");
  const { data, error } = await input.service.from("payment_channels").select("channel,code,enabled,configured,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,public_config,sort_order").or(`code.eq.${input.channelCode},channel.eq.${input.channelCode}`).eq("configured", true).maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data) : null;
  if (!channel || channel.provider !== "snpay" || channel.code !== input.channelCode || channel.currency !== "CNY") throw new Error("CANARY_CHANNEL_NOT_CONFIGURED");
  const amount = 1;
  const summary = calculateRechargeAmounts(channel, amount);
  if (channel.feeRate !== 0 || summary.fee !== 0 || summary.payableAmount !== amount) throw new Error("CANARY_SNPAY_FEE_CONFIGURATION_INVALID");
  const caps = getPaymentProviderCapabilities(channel.provider);
  if (!providerSupportsChannel(caps, channel.code, channel.currency) || !providerAmountWithinLimits(caps, channel, amount)) throw new Error("CANARY_AMOUNT_UNSUPPORTED");
  const risk = await evaluateRechargeRisk({ supabase: input.service, request: new Request("https://jianlian.shop/internal/snpay-canary"), userId: input.userId, businessId: input.logicalKey, requestId: input.logicalKey, orderAmount: amount, currency: "CNY", paymentChannel: channel.code, riskContext: { provider: channel.provider, payable_amount: amount } });
  if (shouldBlockRisk(risk) || risk.recommended_action === "require_review") throw new Error("CANARY_RISK_BLOCKED");
  const window = createAccountRechargeExpiryWindow();
  const rechargeNo = await insertRecharge(input.service, { rechargeId: null, createdAt: window.createdAt, expiresAt: window.expiresAt, userId: input.userId, userEmail: input.userEmail, channel, amount, fee: 0, payableAmount: amount, clientRequestId: input.logicalKey, customerNote: "SNPAY production canary", rateSnapshot: null });
  return { rechargeNo, status: "pending", amount, payableAmount: amount, expiresAt: window.expiresAt, created: true };
}
var REUSABLE_RECHARGE_STATUSES = ["pending", "waiting_payment", "submitted", "reviewing", "approved", "processing", "failed", "rejected", "succeeded", "paid"];
async function findExistingRecharge(supabase, userId, clientRequestId) {
  const { data, error } = await supabase.from("account_recharges").select("recharge_no,status,amount,requested_amount,fee_amount,payable_amount,requested_cny_amount,expected_usdt_amount,locked_market_rate,locked_settlement_rate,rate_source,rate_effective_date,expires_at").eq("user_id", userId).eq("client_request_id", clientRequestId).in("status", [...REUSABLE_RECHARGE_STATUSES]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (isMissingClientRequestColumn(error)) return null;
    throw error;
  }
  if (!data) return null;
  const status = parseRechargeStatusStrict(data.status);
  if (!status) throw new Error("invalid recharge status");
  return { rechargeNo: String(data.recharge_no ?? ""), status, amount: finiteNumber4(data.requested_amount ?? data.amount), fee: finiteNumber4(data.fee_amount), payableAmount: finiteNumber4(data.payable_amount), requestedCnyAmount: data.requested_cny_amount ? String(data.requested_cny_amount) : null, expectedUsdtAmount: data.expected_usdt_amount ? String(data.expected_usdt_amount) : null, lockedMarketRate: data.locked_market_rate ? String(data.locked_market_rate) : null, lockedSettlementRate: data.locked_settlement_rate ? String(data.locked_settlement_rate) : null, rateSource: data.rate_source ? String(data.rate_source) : null, rateEffectiveDate: data.rate_effective_date ? String(data.rate_effective_date) : null, expiresAt: data.expires_at ? String(data.expires_at) : null, reused: true };
}
async function insertRecharge(serviceClient, input) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rechargeNo = generateRechargeNo();
    const row = { ...input.rechargeId ? { id: input.rechargeId } : {}, ...input.createdAt ? { created_at: input.createdAt } : {}, recharge_no: rechargeNo, user_id: input.userId, user_email: input.userEmail, channel: input.channel.code, channel_code: input.channel.code, channel_name: input.channel.name, provider: input.channel.provider, currency: input.rateSnapshot ? "CNY" : input.channel.currency, network: input.channel.networkLabel ?? null, amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount, requested_amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount, fee_amount: input.rateSnapshot ? "0.00" : input.fee, payable_amount: input.rateSnapshot?.requestedCnyAmount ?? input.payableAmount, received_amount: 0, credited_amount: 0, status: input.channel.reviewMode === "manual" ? "waiting_payment" : "pending", client_request_id: input.clientRequestId, payment_method: input.channel.code, review_mode: input.channel.reviewMode ?? "provider", customer_note: input.customerNote || null, user_note: input.customerNote || null, expires_at: input.expiresAt, ...input.rateSnapshot ? { settlement_currency: "USDT", requested_cny_amount: input.rateSnapshot.requestedCnyAmount, expected_usdt_amount: input.rateSnapshot.expectedUsdtAmount, locked_market_rate: input.rateSnapshot.marketRate, locked_settlement_rate: input.rateSnapshot.settlementRate, rate_source: input.rateSnapshot.source, rate_effective_date: input.rateSnapshot.effectiveDate, rate_effective_at: input.rateSnapshot.effectiveAt, rate_locked_at: (/* @__PURE__ */ new Date()).toISOString(), payment_address: input.channel.manualPayment?.payment_address ?? null, payment_token_contract: input.channel.manualPayment?.token_contract ?? null } : {} };
    const result = await serviceClient.from("account_recharges").insert(row);
    if (!result.error) return rechargeNo;
    lastError = result.error;
    if (isMissingClientRequestColumn(result.error)) {
      const retryRow = { ...row };
      delete retryRow.client_request_id;
      const retry = await serviceClient.from("account_recharges").insert(retryRow);
      if (!retry.error) return rechargeNo;
      lastError = retry.error;
    }
    if (lastError?.code === "23505") {
      const existing = await findExistingRecharge(serviceClient, input.userId, input.clientRequestId);
      if (existing?.rechargeNo) return existing.rechargeNo;
      continue;
    }
    break;
  }
  throw lastError ?? new Error("Recharge creation failed");
}
function generateRechargeNo() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/\D/g, "").slice(0, 14);
  return `RC${stamp}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
function finiteNumber4(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function isMissingClientRequestColumn(error) {
  return /client_request_id|42703|schema cache/i.test(getSafeErrorMessage(error, ""));
}

// scripts/internal/snpay-production-canary.ts
var FIXED_AMOUNT = 1;
var CHANNELS = ["alipay", "wechat"];
function fail(message) {
  throw new Error(message);
}
function logicalKey(channel) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(/* @__PURE__ */ new Date()).replaceAll("-", "");
  return `SNPAY-PROD-CANARY-${date}-${channel.toUpperCase()}`;
}
function parseArgs() {
  const args = process.argv.slice(2);
  const channel = args.find((arg) => !arg.startsWith("--"));
  if (!channel || !CHANNELS.includes(channel)) fail("CANARY_CHANNEL_INVALID");
  const mode = args.includes("--dry-run") ? "dry-run" : args.includes("--prepare") ? "prepare" : args.includes("--execute") ? "execute" : "execute";
  return { channel, mode };
}
async function actor() {
  const path = process.env.SNPAY_CANARY_ACTOR_FILE?.trim();
  if (!path) fail("CANARY_ACTOR_FILE_MISSING");
  const file = await stat(path);
  if (process.platform !== "win32" && ((file.mode & 63) !== 0 || file.uid !== 0)) fail("CANARY_ACTOR_FILE_PERMISSIONS_INVALID");
  const raw = await readFile(path, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("CANARY_ACTOR_FILE_INVALID");
  }
  const userId = typeof parsed === "object" && parsed && typeof parsed.userId === "string" ? parsed.userId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) fail("CANARY_ACTOR_INVALID");
  const service = getSupabaseServiceRoleClient();
  if (!service) fail("SERVICE_ROLE_NOT_CONFIGURED");
  const { data, error } = await service.from("profiles").select("id,email,account_status,risk_status").eq("id", userId).maybeSingle();
  if (error || !data || String(data.account_status ?? "active") !== "active" || String(data.risk_status ?? "normal") !== "normal") fail("CANARY_ACTOR_NOT_ELIGIBLE");
  return { service, userId, userEmail: String(data.email ?? "") };
}
async function existingSession(service, rechargeNo, channel) {
  if (!service) return null;
  const { data, error } = await service.from("payment_sessions").select("session_no,status,provider_order_no,payment_url,qr_code_url,channel_code,business_no").eq("business_type", "recharge").eq("business_no", rechargeNo).eq("channel_code", channel).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
async function main() {
  const { channel, mode } = parseArgs();
  if (process.env.SNPAY_CANARY_EXECUTION !== "YES") fail("CANARY_EXECUTION_NOT_AUTHORIZED");
  if (process.env.SNPAY_API_BASE?.trim() !== "https://api.snpay.cn") fail("SNPAY_API_BASE_INVALID");
  const a = await actor();
  const key = logicalKey(channel);
  const existing = await findExistingRecharge(a.service, a.userId, key);
  if (mode === "dry-run") {
    console.log(JSON.stringify({ ok: true, mode, channel, amount: FIXED_AMOUNT, logicalKey: key, recharge: existing?.rechargeNo ?? null, paymentSessionCount: 0 }));
    return;
  }
  if (mode === "prepare") {
    const prepared = await prepareCanaryRecharge({ service: a.service, userId: a.userId, userEmail: a.userEmail, channelCode: channel, logicalKey: key });
    console.log(JSON.stringify({ ok: true, mode, channel, amount: FIXED_AMOUNT, logicalKey: key, rechargeNo: prepared.rechargeNo, status: prepared.status, paymentSessionCount: 0 }));
    return;
  }
  if (!existing) fail("CANARY_RECHARGE_NOT_PREPARED");
  const session = await existingSession(a.service, existing.rechargeNo, channel);
  if (session) {
    console.log(JSON.stringify({ ok: true, duplicate: true, channel, amount: FIXED_AMOUNT, logicalKey: key, sessionNo: session.session_no, status: session.status, paymentUrl: session.payment_url ?? null, qrCodeUrl: session.qr_code_url ?? null }));
    return;
  }
  const created = await createPaymentSessionForInternalCanary({ businessType: "recharge", businessNo: existing.rechargeNo, channelCode: channel, userId: a.userId, clientIp: "127.0.0.1", clientDevice: "pc" });
  console.log(JSON.stringify({ ok: true, duplicate: false, channel, amount: FIXED_AMOUNT, logicalKey: key, sessionNo: created.sessionNo, status: created.status, paymentUrl: created.paymentUrl ?? null, qrCodeUrl: created.qrCodeUrl ?? null, qrCodeValue: created.qrCodeValue ?? null }));
}
main().catch((error) => {
  const code = error instanceof PaymentSessionError ? error.code : "CANARY_FAILED";
  console.error(`${code}: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
