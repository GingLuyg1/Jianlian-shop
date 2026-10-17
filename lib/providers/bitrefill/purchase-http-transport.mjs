// Server-only purchase adapter. No application route constructs this transport.
// A caller must explicitly inject fetch and opt in; the default is read-only.
import { BITREFILL_API_BASE_URL, buildBitrefillAuthorization } from "./client-core.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "./prelaunch-policy.mjs";

const MAX_BODY_BYTES = 512 * 1024;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

export class BitrefillPurchaseHttpError extends Error {
  constructor(code, { kind = "safety", submitted = false, status = null } = {}) {
    super(code);
    this.name = "BitrefillPurchaseHttpError";
    this.code = code;
    this.kind = kind;
    this.submitted = submitted;
    this.status = status;
  }
}

function externalId(value) {
  if (typeof value !== "string" || !EXTERNAL_ID.test(value)) {
    throw new BitrefillPurchaseHttpError("BITREFILL_EXTERNAL_ID_INVALID");
  }
  return encodeURIComponent(value);
}

function singleProduct(request) {
  const products = request?.products;
  if (!Array.isArray(products) || products.length !== 1 || products[0]?.quantity !== 1 ||
      typeof products[0].product_id !== "string" || !PRODUCT_ID.test(products[0].product_id) ||
      typeof products[0].package_id !== "string" || !products[0].package_id ||
      products[0].package_id.length > 300 || /[\u0000-\u001f\u007f]/u.test(products[0].package_id)) {
    throw new BitrefillPurchaseHttpError("BITREFILL_SINGLE_ITEM_REQUEST_REQUIRED");
  }
  return { product_id: products[0].product_id, package_id: products[0].package_id, quantity: 1 };
}

// Pure official Personal/Business v2 request contract. Constructing this data
// performs no HTTP and grants no permission to submit it.
export function buildBitrefillBalanceInvoiceBody(request) {
  return { products: [singleProduct(request)], payment_method: "balance", auto_pay: true };
}

async function readBoundedJson(response, submitted) {
  const length = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new BitrefillPurchaseHttpError("BITREFILL_RESPONSE_TOO_LARGE", { kind: "response", submitted });
  }
  let body = "";
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) throw new BitrefillPurchaseHttpError("BITREFILL_RESPONSE_TOO_LARGE", { kind: "response", submitted });
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
  } else {
    body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      throw new BitrefillPurchaseHttpError("BITREFILL_RESPONSE_TOO_LARGE", { kind: "response", submitted });
    }
  }
  try { return JSON.parse(body); } catch {
    throw new BitrefillPurchaseHttpError("BITREFILL_RESPONSE_INVALID", { kind: "response", submitted });
  }
}

function classifyHttpError(response, body, submitted) {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body.error_code : null;
  const code = raw === "balance_too_low" ? "BITREFILL_BALANCE_TOO_LOW"
    : raw === "out_of_stock" ? "BITREFILL_OUT_OF_STOCK"
      : response.status === 429 ? "BITREFILL_RATE_LIMITED"
        : response.status >= 500 ? "BITREFILL_UPSTREAM_UNAVAILABLE"
          : response.status === 401 || response.status === 403 ? "BITREFILL_AUTH_OR_PERMISSION"
            : response.status === 404 ? "BITREFILL_NOT_FOUND" : "BITREFILL_REQUEST_REJECTED";
  return new BitrefillPurchaseHttpError(code, { kind: "http", submitted, status: response.status });
}

export class BitrefillPurchaseHttpTransport {
  #request;
  #purchaseEnabled;

  constructor({ authMode, apiKey, apiId, apiSecret, fetchImpl, purchaseEnabled = false,
    timeoutMs = 10_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    if (typeof fetchImpl !== "function") throw new BitrefillPurchaseHttpError("BITREFILL_INJECTED_FETCH_REQUIRED");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new BitrefillPurchaseHttpError("BITREFILL_TIMEOUT_INVALID");
    }
    const authorization = buildBitrefillAuthorization({ authMode, apiKey, apiId, apiSecret });
    this.kind = "purchase_http";
    this.#purchaseEnabled = purchaseEnabled === true && REAL_BITREFILL_PURCHASE_ENABLED;
    this.#request = async (method, path, payload = null) => {
      const post = method === "POST";
      if (post && !this.#purchaseEnabled) throw new BitrefillPurchaseHttpError("BITREFILL_REAL_PURCHASE_DISABLED");
      for (let attempt = 0; attempt < (post ? 1 : 3); attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let submitted = false;
        try {
          submitted = post;
          const response = await fetchImpl(`${BITREFILL_API_BASE_URL}${path}`, {
            method,
            headers: { Accept: "application/json", Authorization: authorization,
              ...(post ? { "Content-Type": "application/json" } : {}) },
            ...(post ? { body: JSON.stringify(payload) } : {}),
            cache: "no-store",
            redirect: "error",
            signal: controller.signal,
          });
          const body = await readBoundedJson(response, submitted);
          if (!response.ok) {
            if (!post && attempt < 2 && [429, 503].includes(response.status)) {
              await sleep(250 * (2 ** attempt));
              continue;
            }
            throw classifyHttpError(response, body, submitted);
          }
          const data = body?.data;
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new BitrefillPurchaseHttpError("BITREFILL_RESPONSE_INVALID", { kind: "response", submitted });
          }
          return data;
        } catch (error) {
          if (error instanceof BitrefillPurchaseHttpError) throw error;
          if (!post && attempt < 2) { await sleep(250 * (2 ** attempt)); continue; }
          throw new BitrefillPurchaseHttpError(post ? "BITREFILL_POST_OUTCOME_UNCERTAIN" : "BITREFILL_GET_FAILED",
            { kind: "transport", submitted });
        } finally { clearTimeout(timer); }
      }
      throw new BitrefillPurchaseHttpError("BITREFILL_GET_FAILED", { kind: "transport" });
    };
  }

  get purchaseEnabled() { return this.#purchaseEnabled; }

  async createInvoice(request) {
    if (!this.#purchaseEnabled) throw new BitrefillPurchaseHttpError("BITREFILL_REAL_PURCHASE_DISABLED");
    return this.#request("POST", "/invoices", buildBitrefillBalanceInvoiceBody(request));
  }

  async readInvoice(invoiceId) { return this.#request("GET", `/invoices/${externalId(invoiceId)}`); }
  async readOrder(orderId) { return this.#request("GET", `/orders/${externalId(orderId)}`); }
  async readProduct(productId) {
    if (typeof productId !== "string" || !PRODUCT_ID.test(productId)) {
      throw new BitrefillPurchaseHttpError("BITREFILL_PRODUCT_ID_INVALID");
    }
    return this.#request("GET", `/products/${encodeURIComponent(productId)}`);
  }
}
