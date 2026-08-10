import {
  parseDajuBalanceResponse,
  parseDajuErrorResponse,
  parseDajuOrderResponse,
  parseDajuPurchaseReference,
  parseDajuProductDetailResponse,
  parseDajuProductsResponse,
  isPlainRecord,
} from "./protocol.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

export class DajuClientCoreError extends Error {
  constructor(kind, code, status = 503, orderCode = null) {
    super(code);
    this.name = "DajuClientCoreError";
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.orderCode = orderCode;
  }
}

function validateConfiguration(input) {
  let url;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new DajuClientCoreError("configuration", "DAJU_CONFIGURATION_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DajuClientCoreError("configuration", "DAJU_CONFIGURATION_INVALID");
  }
  if (typeof input.apiKey !== "string" || !input.apiKey.trim()) {
    throw new DajuClientCoreError("configuration", "DAJU_CONFIGURATION_MISSING");
  }
  return { url: url.toString(), apiKey: input.apiKey.trim() };
}

function safePathSegment(value) {
  const normalized = String(value);
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(normalized)) {
    throw new DajuClientCoreError("validation", "DAJU_REQUEST_INVALID", 400);
  }
  return encodeURIComponent(normalized);
}

function explicitErrorCode(value) {
  if (!isPlainRecord(value)) return null;
  const source = isPlainRecord(value.error) ? value.error : value;
  const code = typeof source.code === "string" ? source.code.trim() : typeof source.error_code === "string" ? source.error_code.trim() : "";
  return code || null;
}

async function parseBody(response) {
  const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
  }
}

export function createDajuHttpClient(input) {
  const config = validateConfiguration(input);
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Number.isInteger(input.timeoutMs) && input.timeoutMs > 0
    ? input.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  async function request(path, init = {}, authenticated = true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(authenticated ? { "X-API-Key": config.apiKey } : {}),
      };
      const response = await fetchImpl(`${config.url.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await parseBody(response);
      if (!response.ok) {
        const failure = parseDajuErrorResponse(body, response.status);
        throw new DajuClientCoreError("http", failure.code, response.status);
      }
      return body;
    } catch (error) {
      if (error instanceof DajuClientCoreError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new DajuClientCoreError("timeout", "UPSTREAM_TIMEOUT");
      }
      throw new DajuClientCoreError("transport", "UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  async function readOrder(orderCode) {
    const raw = await request(`/order/${safePathSegment(orderCode)}`);
    const failureCode = explicitErrorCode(raw);
    if (failureCode) throw new DajuClientCoreError("http", failureCode, 409, orderCode);
    const parsed = parseDajuOrderResponse(raw);
    if (!parsed || parsed.orderCode !== orderCode) {
      throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID", 503, orderCode);
    }
    return parsed;
  }

  return {
    async getHealth() {
      const body = await request("/health", {}, false);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
      }
      return { ok: true };
    },
    async getBalance() {
      const parsed = parseDajuBalanceResponse(await request("/balance"));
      if (!parsed) throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
      return parsed;
    },
    async getProducts(query = "") {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const parsed = parseDajuProductsResponse(await request(`/products${suffix}`));
      if (!parsed) throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
      return parsed;
    },
    async getProduct(id) {
      if (!Number.isSafeInteger(id) || id < 1) throw new DajuClientCoreError("validation", "DAJU_REQUEST_INVALID", 400);
      const parsed = parseDajuProductDetailResponse(await request(`/product/${id}`));
      if (!parsed) throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
      return parsed;
    },
    async purchase(purchaseInput) {
      if (!Number.isSafeInteger(purchaseInput.productId) || purchaseInput.productId < 1) {
        throw new DajuClientCoreError("validation", "DAJU_REQUEST_INVALID", 400);
      }
      if (!Number.isSafeInteger(purchaseInput.quantity) || purchaseInput.quantity < 1) {
        throw new DajuClientCoreError("validation", "DAJU_REQUEST_INVALID", 400);
      }
      if (typeof purchaseInput.requestId !== "string" || !/^jianlian:[a-zA-Z0-9-]+:[a-zA-Z0-9-]+$/.test(purchaseInput.requestId)) {
        throw new DajuClientCoreError("validation", "DAJU_REQUEST_INVALID", 400);
      }
      const body = {
        product_id: purchaseInput.productId,
        request_id: purchaseInput.requestId,
        quantity: purchaseInput.quantity,
        ...(purchaseInput.sku ? { sku: purchaseInput.sku } : {}),
        ...(purchaseInput.inputs && Object.keys(purchaseInput.inputs).length > 0 ? { inputs: purchaseInput.inputs } : {}),
      };
      const raw = await request("/purchase", { method: "POST", body: JSON.stringify(body) });
      const failureCode = explicitErrorCode(raw);
      if (failureCode) throw new DajuClientCoreError("http", failureCode, 409);
      const parsed = parseDajuOrderResponse(raw);
      if (parsed && (!parsed.requestId || parsed.requestId === purchaseInput.requestId)) {
        return parsed;
      }
      const reference = parseDajuPurchaseReference(raw);
      if (!reference || (reference.requestId && reference.requestId !== purchaseInput.requestId)) {
        throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID");
      }
      try {
        const completed = await readOrder(reference.orderCode);
        if (completed.requestId && completed.requestId !== purchaseInput.requestId) {
          throw new DajuClientCoreError("response", "DAJU_RESPONSE_INVALID", 503, reference.orderCode);
        }
        return completed;
      } catch (error) {
        if (error instanceof DajuClientCoreError) {
          throw new DajuClientCoreError(error.kind, error.code, error.status, reference.orderCode);
        }
        throw error;
      }
    },
    async getOrder(orderCode) {
      return readOrder(orderCode);
    },
  };
}
