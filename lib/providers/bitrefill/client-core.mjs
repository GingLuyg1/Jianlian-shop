import {
  isPlainRecord,
  parseBitrefillPingResponse,
  parseBitrefillProductResponse,
  parseBitrefillProductsResponse,
  parseBitrefillRateLimitHeaders,
} from "./protocol.mjs";

export const BITREFILL_API_BASE_URL = "https://api.bitrefill.com/v2";
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export class BitrefillClientError extends Error {
  constructor(kind, code, status = 503, rateLimit = null) {
    super(code);
    this.name = "BitrefillClientError";
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

function requiredSecret(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new BitrefillClientError("configuration", code, 500);
  return value.trim();
}

export function buildBitrefillAuthorization(input) {
  if (input.authMode === "personal") {
    return `Bearer ${requiredSecret(input.apiKey, "BITREFILL_PERSONAL_CREDENTIAL_MISSING")}`;
  }
  if (input.authMode === "business") {
    const apiId = requiredSecret(input.apiId, "BITREFILL_BUSINESS_CREDENTIAL_MISSING");
    const apiSecret = requiredSecret(input.apiSecret, "BITREFILL_BUSINESS_CREDENTIAL_MISSING");
    return `Basic ${Buffer.from(`${apiId}:${apiSecret}`, "utf8").toString("base64")}`;
  }
  throw new BitrefillClientError("configuration", "BITREFILL_AUTH_MODE_INVALID", 500);
}

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value ?? BITREFILL_API_BASE_URL); } catch { throw new BitrefillClientError("configuration", "BITREFILL_BASE_URL_INVALID", 500); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new BitrefillClientError("configuration", "BITREFILL_BASE_URL_INVALID", 500);
  }
  return url.toString().replace(/\/$/, "");
}

function boundedInteger(value, fallback, min, max) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new BitrefillClientError("validation", "INVALID_RESPONSE", 400);
  return parsed;
}

function safeProductId(value) {
  const text = String(value ?? "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(text)) throw new BitrefillClientError("validation", "PRODUCT_NOT_FOUND", 400);
  return encodeURIComponent(text);
}

function mapError(status, body, rateLimit) {
  const errorCode = isPlainRecord(body) && typeof body.error_code === "string" ? body.error_code : null;
  if (errorCode === "out_of_stock") return new BitrefillClientError("business", "OUT_OF_STOCK", status, rateLimit);
  if (status === 401) return new BitrefillClientError("auth", "AUTH_ERROR", status, rateLimit);
  if (status === 403) return new BitrefillClientError("auth", "FORBIDDEN", status, rateLimit);
  if (status === 404 || errorCode === "not_found") return new BitrefillClientError("business", "PRODUCT_NOT_FOUND", status, rateLimit);
  if (status === 429) return new BitrefillClientError("rate_limit", "RATE_LIMITED", status, rateLimit);
  if (status === 503 || status >= 500) return new BitrefillClientError("upstream", "UPSTREAM_UNAVAILABLE", status, rateLimit);
  return new BitrefillClientError("response", "INVALID_RESPONSE", status, rateLimit);
}

async function parseJsonBody(response, requireJson) {
  const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new BitrefillClientError("response", "INVALID_RESPONSE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new BitrefillClientError("response", "INVALID_RESPONSE");
  try { return JSON.parse(body); } catch {
    if (!requireJson) return null;
    throw new BitrefillClientError("response", "INVALID_RESPONSE");
  }
}

function retryDelayMs(error, attempt) {
  if (error.status === 429 && error.rateLimit?.reset) {
    const untilReset = (error.rateLimit.reset * 1000) - Date.now();
    if (untilReset > 0) return Math.min(untilReset, 30_000);
  }
  return Math.min(250 * (2 ** attempt), 2_000);
}

export function createBitrefillClient(input) {
  const baseUrl = validateBaseUrl(input.baseUrl);
  const authorization = buildBitrefillAuthorization(input);
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRetries = boundedInteger(input.maxRetries, 2, 0, 3);
  const timeoutMs = boundedInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 60_000);

  async function get(path) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authorization },
          cache: "no-store",
          signal: controller.signal,
        });
        const rateLimit = parseBitrefillRateLimitHeaders(response.headers);
        const body = await parseJsonBody(response, response.ok);
        if (response.ok) return { body, rateLimit, status: response.status };
        const error = mapError(response.status, body, rateLimit);
        if (attempt < maxRetries && (error.status === 429 || error.status === 503)) {
          await sleep(retryDelayMs(error, attempt));
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof BitrefillClientError) throw error;
        if (attempt < maxRetries) { await sleep(retryDelayMs({ status: 503 }, attempt)); continue; }
        throw new BitrefillClientError("transport", "UPSTREAM_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
      }
    }
    throw new BitrefillClientError("upstream", "UPSTREAM_UNAVAILABLE");
  }

  function productQuery(input = {}, search = false) {
    const params = new URLSearchParams();
    params.set("start", String(boundedInteger(input.start, 0, 0, 1_000_000)));
    params.set("limit", String(boundedInteger(input.limit, 50, 1, 50)));
    if (search) {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query || query.length > 100) throw new BitrefillClientError("validation", "INVALID_RESPONSE", 400);
      params.set("q", query);
    } else if (input.country !== undefined) {
      const country = String(input.country);
      if (!/^[A-Z]{2}$/.test(country)) throw new BitrefillClientError("validation", "INVALID_RESPONSE", 400);
      params.set("country", country);
    }
    return params.toString();
  }

  return Object.freeze({
    async ping() {
      const response = await get("/ping");
      const data = parseBitrefillPingResponse(response.body);
      if (!data) throw new BitrefillClientError("response", "INVALID_RESPONSE");
      return { ...data, rateLimit: response.rateLimit, status: response.status };
    },
    async listProducts(options = {}) {
      const response = await get(`/products?${productQuery(options)}`);
      const data = parseBitrefillProductsResponse(response.body);
      if (!data) throw new BitrefillClientError("response", "INVALID_RESPONSE");
      return { ...data, rateLimit: response.rateLimit, status: response.status };
    },
    async searchProducts(query, options = {}) {
      const response = await get(`/products/search?${productQuery({ ...options, query }, true)}`);
      const data = parseBitrefillProductsResponse(response.body);
      if (!data) throw new BitrefillClientError("response", "INVALID_RESPONSE");
      return { ...data, rateLimit: response.rateLimit, status: response.status };
    },
    async getProduct(productId) {
      const response = await get(`/products/${safeProductId(productId)}`);
      const product = parseBitrefillProductResponse(response.body);
      if (!product) throw new BitrefillClientError("response", "INVALID_RESPONSE");
      return { product, rateLimit: response.rateLimit, status: response.status };
    },
  });
}

export class BitrefillClient {
  constructor(input) {
    this.readonlyClient = createBitrefillClient(input);
  }

  ping() { return this.readonlyClient.ping(); }
  listProducts(options) { return this.readonlyClient.listProducts(options); }
  searchProducts(query, options) { return this.readonlyClient.searchProducts(query, options); }
  getProduct(productId) { return this.readonlyClient.getProduct(productId); }
}
