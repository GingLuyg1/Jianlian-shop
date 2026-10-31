// Dormant production transport. The compile-time release gate remains false;
// only local synthetic responses exercise purchase parsing in this release prep.
import { buildBitrefillAuthorization } from "./client-core.mjs";
import { createHash } from "node:crypto";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "./prelaunch-policy.mjs";
import { BitrefillPurchaseHttpTransport, BitrefillPurchaseHttpError } from "./purchase-http-transport.mjs";
import { readBitrefillMcpRpcResponse } from "./mcp-readonly-client.mjs";

const blocked = code => { throw new BitrefillPurchaseHttpError(code, { submitted: false }); };
const uncertain = () => { throw new BitrefillPurchaseHttpError("BITREFILL_MCP_PAYMENT_UNCERTAIN", { kind: "response", submitted: true }); };

export function bindBitrefillMcpUsdRequest(request, plan, frozenRequest) {
  const item = request?.products?.[0], expected = frozenRequest?.products?.[0], args = plan?.request?.params?.arguments;
  if (request?.products?.length !== 1 || frozenRequest?.products?.length !== 1 ||
      item.quantity !== 1 || item.product_id !== expected.product_id || item.package_id !== expected.package_id ||
      plan?.status !== "PREPARED_NOT_SUBMITTED" || plan.request.method !== "tools/call" || plan.request.params.name !== "buy-products" ||
      args?.cart_items?.length !== 1 || args.cart_items[0].product_id !== item.product_id ||
      typeof args.cart_items[0].package_value !== "string" || args.payment_method !== "balance" || args.balance_currency !== "USD") {
    blocked("BITREFILL_MCP_FROZEN_REQUEST_MISMATCH");
  }
  return { cart_items: [{ product_id: item.product_id, package_value: args.cart_items[0].package_value }],
    payment_method: "balance", balance_currency: "USD", return_payment_link: false };
}

// MCP creation returns a JSON response envelope. Retain only the Invoice ID;
// never deliver from its embedded codes/status. Exact REST Invoice/Child GET
// reconciliation and the original private-delivery RPC remain authoritative.
export function extractBitrefillMcpCreatedInvoice(result) {
  if (!Array.isArray(result?.content) || result.content.length !== 1 || result.content[0].type !== "text") uncertain();
  let value; try { value = JSON.parse(result.content[0].text); } catch { uncertain(); }
  // If the provider supplies an explicit valid Invoice ID with an uncertain
  // payment, persist that reference for authoritative GET; never send again.
  const pending = value?.code === "PAYMENT_UNCERTAIN" || value?.response?.code === "PAYMENT_UNCERTAIN";
  const id = pending ? value?.response?.invoice_id ?? value?.details?.invoice_id : value?.response?.invoice_id;
  if ((result?.isError || value?.error) && !pending) uncertain();
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) uncertain();
  return { id, ...(pending ? { requiresManualReview: true } : {}) };
}

export class BitrefillMcpPurchaseTransport {
  #enabled; #fetch; #authorization; #plan; #frozen; #timeout; #rest; #account;
  constructor({ credentials, fetchImpl, preparedPlan, frozenRequest, purchaseEnabled = false, timeoutMs = 15000 } = {}) {
    if (credentials?.authMode !== "personal" || !credentials.apiKey || credentials.apiId || credentials.apiSecret || typeof fetchImpl !== "function") blocked("BITREFILL_MCP_PERSONAL_CREDENTIALS_REQUIRED");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) blocked("BITREFILL_MCP_TIMEOUT_INVALID");
    this.#account = createHash("sha256").update("bitrefill-personal-key-v1:").update(credentials.apiKey.trim()).digest("hex");
    if (preparedPlan?.accountFingerprint !== this.#account) blocked("BITREFILL_MCP_TRANSPORT_ACCOUNT_MISMATCH");
    bindBitrefillMcpUsdRequest(frozenRequest, preparedPlan, frozenRequest);
    this.#enabled = purchaseEnabled === true && REAL_BITREFILL_PURCHASE_ENABLED;
    this.#plan = structuredClone(preparedPlan); this.#frozen = structuredClone(frozenRequest);
    this.#fetch = fetchImpl; this.#timeout = timeoutMs; this.#authorization = buildBitrefillAuthorization(credentials);
    this.#rest = new BitrefillPurchaseHttpTransport({ ...credentials, fetchImpl, timeoutMs, purchaseEnabled: false });
  }
  get purchaseEnabled() { return this.#enabled; }
  get accountFingerprint() { return this.#account; }
  async createInvoice(request) {
    if (!this.#enabled) blocked("BITREFILL_REAL_PURCHASE_DISABLED");
    const args = bindBitrefillMcpUsdRequest(request, this.#plan, this.#frozen);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.#timeout);
    try {
      // Exactly one attempt. Neither timeout nor PAYMENT_UNCERTAIN can retry.
      const response = await this.#fetch("https://api.bitrefill.com/mcp", { method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Authorization: this.#authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "buy-products", arguments: args } }) });
      if (!response.ok) uncertain();
      return extractBitrefillMcpCreatedInvoice(await readBitrefillMcpRpcResponse(response, 1, { allowToolError: true }));
    } catch { uncertain(); } finally { clearTimeout(timer); }
  }
  async payInvoice() { blocked("BITREFILL_MCP_SECOND_PAYMENT_FORBIDDEN"); }
  readInvoice(id) { return this.#rest.readInvoice(id); }
  readOrder(id) { return this.#rest.readOrder(id); }
  readProduct(id) { return this.#rest.readProduct(id); }
}
