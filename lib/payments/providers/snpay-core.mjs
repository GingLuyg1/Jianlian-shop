import {
  constants,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
} from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CLOCK_SKEW_SECONDS = 300;
const SAFE_URL_SCHEMES = new Set(["https:"]);
const SAFE_DEEP_LINK_SCHEMES = new Set(["alipays:", "weixin:", "weixinpay:"]);

export class SnpayCoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SnpayCoreError";
    this.code = code;
  }
}

export function snpayCanonicalString(parameters) {
  return Object.keys(parameters ?? {})
    .filter((key) => key !== "sign" && key !== "sign_type")
    .filter((key) => {
      const value = parameters[key];
      return value !== undefined
        && value !== null
        && String(value).trim() !== ""
        && !Array.isArray(value)
        && !Buffer.isBuffer(value);
    })
    .sort((left, right) => Buffer.compare(Buffer.from(left, "ascii"), Buffer.from(right, "ascii")))
    .map((key) => `${key}=${String(parameters[key])}`)
    .join("&");
}

export function normalizeSnpayPrivateKey(value) {
  return normalizePem(value, "PRIVATE KEY");
}

export function normalizeSnpayPlatformPublicKey(value) {
  return normalizePem(value, "PUBLIC KEY");
}

export function createSnpaySignature(parameters, privateKey) {
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(snpayCanonicalString(parameters), "utf8");
    signer.end();
    return signer.sign({
      key: createPrivateKey(normalizeSnpayPrivateKey(privateKey)),
      padding: constants.RSA_PKCS1_PADDING,
    }, "base64");
  } catch {
    throw new SnpayCoreError("SNPAY_SIGNING_FAILED", "SNPAY 请求签名失败");
  }
}

export function verifySnpaySignedPayload(parameters, publicKey, options = {}) {
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
      padding: constants.RSA_PKCS1_PADDING,
    }, signature);
  } catch {
    return false;
  }
}

export function snpayTypeForChannel(channel) {
  if (channel === "alipay") return "alipay";
  if (channel === "wechat") return "wxpay";
  throw new SnpayCoreError("SNPAY_CHANNEL_UNSUPPORTED", "SNPAY 不支持该支付渠道");
}

export function snpayChannelForType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "alipay") return "alipay";
  if (["wxpay", "wechat", "wechat_pay"].includes(normalized)) return "wechat";
  return null;
}

export function normalizeSnpayPaidAt(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:Z| ?(?:\+|-)\d{2}:?\d{2})?$/);
  if (!match) return null;
  const calendarCheck = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]),
  ));
  if (calendarCheck.getUTCFullYear() !== Number(match[1])
    || calendarCheck.getUTCMonth() !== Number(match[2]) - 1
    || calendarCheck.getUTCDate() !== Number(match[3])
    || calendarCheck.getUTCHours() !== Number(match[4])
    || calendarCheck.getUTCMinutes() !== Number(match[5])
    || calendarCheck.getUTCSeconds() !== Number(match[6])) return null;
  const hasZone = /(?:Z|(?:\+|-)\d{2}:?\d{2})$/.test(text);
  const parsed = hasZone
    ? Date.parse(text.replace(" ", "T"))
    : Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function parseSnpayCallbackBody(rawBody) {
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

export function selectSnpayPaymentArtifact(payload) {
  const value = boundedText(payload?.pay_info ?? payload?.qrcode ?? payload?.pay_url, 2048);
  if (!value) throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_MISSING", "SNPAY 未返回付款信息");
  const parsed = safeUrl(value);
  if (parsed && SAFE_URL_SCHEMES.has(parsed.protocol) && !parsed.username && !parsed.password) {
    return { paymentType: "redirect", paymentUrl: parsed.toString(), artifact: { type: "redirect", url: parsed.toString() } };
  }
  if (parsed && SAFE_DEEP_LINK_SCHEMES.has(parsed.protocol) && !parsed.username && !parsed.password) {
    return { paymentType: "deeplink", deepLinkUrl: value, artifact: { type: "deeplink", url: value } };
  }
  if (/^(?:https:\/\/|alipays:|weixin:|weixinpay:)/i.test(value)) {
    throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_UNSAFE", "SNPAY 返回了不安全的付款地址");
  }
  if (/^(?:javascript|data|file|vbscript):/i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SnpayCoreError("SNPAY_PAYMENT_ARTIFACT_UNSAFE", "SNPAY 返回了不安全的付款信息");
  }
  return { paymentType: "qrcode", qrCodeValue: value, artifact: { type: "qrcode", payload: value } };
}

export function createSnpayClient(configuration) {
  const merchantId = requiredText(configuration?.merchantId, "SNPAY_MERCHANT_ID_MISSING", "SNPAY 商户号未配置");
  const privateKey = requiredText(configuration?.merchantPrivateKey, "SNPAY_PRIVATE_KEY_MISSING", "SNPAY 商户私钥未配置");
  const platformPublicKey = requiredText(configuration?.platformPublicKey, "SNPAY_PLATFORM_KEY_MISSING", "SNPAY 平台公钥未配置");
  const apiBaseUrl = httpsBaseUrl(configuration?.apiBaseUrl);
  const fetchImpl = configuration?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new SnpayCoreError("SNPAY_FETCH_UNAVAILABLE", "SNPAY 网络客户端不可用");
  const now = typeof configuration?.now === "function" ? configuration.now : () => Date.now();
  const timeoutMs = boundedTimeout(configuration?.timeoutMs);

  async function signedRequest(path, fields, options = {}) {
    const timestamp = Math.floor(now() / 1000).toString();
    const unsigned = { pid: merchantId, ...fields, timestamp, sign_type: "RSA" };
    const form = new URLSearchParams({
      ...stringFields(unsigned),
      sign: createSnpaySignature(unsigned, privateKey),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeout(options.timeoutMs ?? timeoutMs));
    try {
      const response = await fetchImpl(new URL(path, apiBaseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json",
          "user-agent": "Jianlian-SNPAY-V2/1.0",
        },
        body: form.toString(),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new SnpayCoreError("SNPAY_HTTP_ERROR", `SNPAY HTTP ${response.status}`);
      const payload = await safeJson(response);
      if (String(payload.code ?? "") !== "0") throw new SnpayCoreError("SNPAY_API_REJECTED", "SNPAY 拒绝了请求");
      if (!verifySnpaySignedPayload(payload, platformPublicKey, { now: now() })) {
        throw new SnpayCoreError("SNPAY_RESPONSE_SIGNATURE_INVALID", "SNPAY 响应验签失败");
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new SnpayCoreError("SNPAY_TIMEOUT", "SNPAY 请求超时");
      if (error instanceof SnpayCoreError) throw error;
      throw new SnpayCoreError("SNPAY_NETWORK_ERROR", "SNPAY 网络请求失败");
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
        method: "web",
      }, input.options);
      assertMerchant(payload.pid, merchantId);
      assertIdentity(payload.out_trade_no, input.sessionNo);
      assertChannel(payload.type ?? type, input.channelCode);
      if (payload.money != null) assertAmount(payload.money, input.amount);
      const providerOrderNo = boundedRequired(payload.trade_no, 160, "SNPAY_PROVIDER_ORDER_MISSING");
      return { payload, providerOrderNo, ...selectSnpayPaymentArtifact(payload) };
    },

    async queryPayment(input) {
      const payload = await signedRequest("/api/pay/query", {
        trade_no: boundedRequired(input.providerOrderNo, 160, "SNPAY_PROVIDER_ORDER_MISSING"),
      }, input.options);
      assertMerchant(payload.pid, merchantId);
      assertIdentity(payload.out_trade_no, input.sessionNo);
      assertProviderOrder(payload.trade_no, input.providerOrderNo);
      assertChannel(payload.type, input.channelCode);
      assertAmount(payload.money, input.amount);
      const state = normalizeProviderState(payload);
      const paidAt = state.paid ? normalizeSnpayPaidAt(payload.endtime ?? payload.paid_at) : null;
      if (state.paid && !paidAt) throw new SnpayCoreError("SNPAY_PAID_AT_INVALID", "SNPAY 已支付订单缺少可信付款时间");
      return { payload, ...state, paidAt };
    },

    verifyCallback(rawBody, expected = {}) {
      const payload = parseSnpayCallbackBody(rawBody);
      return verifySnpaySignedPayload(payload, platformPublicKey, { now: now() })
        && String(payload.pid ?? "") === merchantId
        && (!expected.channelCode || snpayChannelForType(payload.type) === expected.channelCode);
    },

    parseCallback(rawBody, expected) {
      const payload = parseSnpayCallbackBody(rawBody);
      if (!this.verifyCallback(rawBody, expected)) throw new SnpayCoreError("SNPAY_CALLBACK_SIGNATURE_INVALID", "SNPAY 回调验签失败");
      const state = normalizeProviderState(payload);
      const sessionNo = boundedRequired(payload.out_trade_no, 160, "SNPAY_SESSION_ID_INVALID");
      const providerTransactionId = boundedRequired(payload.trade_no, 160, "SNPAY_PROVIDER_ORDER_MISSING");
      const channelCode = snpayChannelForType(payload.type);
      if (!channelCode) throw new SnpayCoreError("SNPAY_CHANNEL_MISMATCH", "SNPAY 回调渠道无效");
      const amount = numericMoney(payload.money);
      const paidAt = state.paid ? normalizeSnpayPaidAt(payload.endtime ?? payload.paid_at) : null;
      if (state.paid && !paidAt) throw new SnpayCoreError("SNPAY_PAID_AT_INVALID", "SNPAY 回调缺少可信付款时间");
      return { payload, sessionNo, providerTransactionId, channelCode, amount, paidAt, ...state };
    },
  };
}

function normalizeProviderState(payload) {
  const raw = String(payload.trade_status ?? payload.status ?? "").trim().toUpperCase();
  if (["1", "PAID", "SUCCESS", "TRADE_SUCCESS", "TRADE_FINISHED"].includes(raw)) return { found: true, paid: true, status: "paid" };
  if (["0", "UNPAID", "PENDING", "WAIT_BUYER_PAY", "PROCESSING"].includes(raw)) return { found: true, paid: false, status: "pending" };
  if (["CLOSED", "CANCELLED", "CANCELED"].includes(raw)) return { found: true, paid: false, status: "closed" };
  if (["EXPIRED", "TIMEOUT"].includes(raw)) return { found: true, paid: false, status: "expired" };
  throw new SnpayCoreError("SNPAY_STATUS_INVALID", "SNPAY 返回了未知订单状态");
}

function assertMerchant(value, expected) {
  if (String(value ?? "") !== expected) throw new SnpayCoreError("SNPAY_MERCHANT_MISMATCH", "SNPAY 商户身份不匹配");
}

function assertIdentity(value, expected) {
  if (String(value ?? "") !== String(expected ?? "")) throw new SnpayCoreError("SNPAY_ORDER_IDENTITY_MISMATCH", "SNPAY 商户订单身份不匹配");
}

function assertProviderOrder(value, expected) {
  if (String(value ?? "") !== String(expected ?? "")) throw new SnpayCoreError("SNPAY_PROVIDER_ORDER_MISMATCH", "SNPAY 平台订单身份不匹配");
}

function assertChannel(value, expected) {
  if (snpayChannelForType(value) !== expected) throw new SnpayCoreError("SNPAY_CHANNEL_MISMATCH", "SNPAY 渠道身份不匹配");
}

function assertAmount(value, expected) {
  if (Math.abs(numericMoney(value) - numericMoney(expected)) > 0.000001) {
    throw new SnpayCoreError("SNPAY_AMOUNT_MISMATCH", "SNPAY 金额不匹配");
  }
}

function money(value) {
  return numericMoney(value).toFixed(2);
}

function numericMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new SnpayCoreError("SNPAY_AMOUNT_INVALID", "SNPAY 金额无效");
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function validTimestamp(value, nowMs, maxClockSkewSeconds = MAX_CLOCK_SKEW_SECONDS) {
  if (typeof value !== "string") return false;
  const text = value;
  if (!/^\d{10}$/.test(text)) return false;
  const skew = Math.abs(Math.floor(Number(nowMs) / 1000) - Number(text));
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
  if (!text) throw new SnpayCoreError("SNPAY_KEY_MISSING", `SNPAY ${label} 未配置`);
  if (text.includes("-----BEGIN")) return `${text}\n`;
  const body = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) throw new SnpayCoreError("SNPAY_KEY_INVALID", `SNPAY ${label} 格式无效`);
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join("\n") ?? body}\n-----END ${label}-----\n`;
}

function httpsBaseUrl(value) {
  const parsed = safeUrl(requiredText(value, "SNPAY_API_BASE_MISSING", "SNPAY API 地址未配置"));
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new SnpayCoreError("SNPAY_API_BASE_INVALID", "SNPAY API 地址必须使用 HTTPS");
  }
  return new URL(parsed.pathname.endsWith("/") ? parsed.toString() : `${parsed.toString()}/`);
}

function safeHttpsCallback(value) {
  const parsed = safeUrl(value);
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new SnpayCoreError("SNPAY_CALLBACK_URL_INVALID", "SNPAY 回调地址必须使用 HTTPS");
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
  if (!text || text.length > 64 || !/^[0-9a-f:.]+$/i.test(text)) throw new SnpayCoreError("SNPAY_CLIENT_IP_INVALID", "SNPAY 客户端 IP 无效");
  return text;
}

function requiredText(value, code, message) {
  const text = String(value ?? "").trim();
  if (!text) throw new SnpayCoreError(code, message);
  return text;
}

function boundedRequired(value, maxLength, code) {
  const text = boundedText(value, maxLength);
  if (!text) throw new SnpayCoreError(code, "SNPAY 订单标识无效");
  return text;
}

function boundedText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : null;
}

function boundedTimeout(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.min(30_000, Math.max(1_000, Math.round(parsed))) : DEFAULT_TIMEOUT_MS;
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
    throw new SnpayCoreError("SNPAY_RESPONSE_INVALID", "SNPAY 返回格式无效");
  }
}
