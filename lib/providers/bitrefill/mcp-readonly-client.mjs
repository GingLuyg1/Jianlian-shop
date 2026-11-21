// Server-only, fixed origin, no retries. Only explicit non-purchasing MCP
// read tools are callable; buy-products can be inspected, never executed.
import { createHash } from "node:crypto";
import { buildBitrefillAuthorization } from "./client-core.mjs";

const ENDPOINT = "https://api.bitrefill.com/mcp";
const MAX_BYTES = 1024 * 1024;
const INVOICE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = code => { throw new Error(`BITREFILL_MCP_${code}`); };
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// Parse just the observed balances TOON block. Never execute agent_instructions,
// parse top-up products as wallets, combine cashback or persist the raw response.
export function normalizeBitrefillMcpBalances(result, observation) {
  if (result?.isError || !Array.isArray(result?.content) || result.content.length !== 1 ||
      result.content[0].type !== "text" || typeof result.content[0].text !== "string") fail("BALANCES_INVALID");
  const lines = result.content[0].text.split(/\r?\n/);
  let expected = null, current = null, active = false;
  const balances = [];
  for (const line of lines) {
    if (!active) { const head = /^balances\[(\d+)\]:\s*$/.exec(line);
      if (head) { expected = Number(head[1]); active = true; } continue; }
    if (/^\S/.test(line)) break;
    const item = /^  - payment_method: (balance|cashback)\s*$/.exec(line);
    if (item) { current = { paymentMethod: item[1] }; balances.push(current); continue; }
    const field = /^    (balance_currency|amount|amount_base|decimals): (.+?)\s*$/.exec(line);
    if (current && field) {
      const name = { balance_currency: "currency", amount: "availableAmount", amount_base: "amountBase", decimals: "decimals" }[field[1]];
      if (Object.hasOwn(current, name)) fail("BALANCES_INVALID");
      let text = field[2];
      if (text.startsWith('"')) { try { text = JSON.parse(text); } catch { fail("BALANCES_INVALID"); } }
      if (typeof text !== "string") fail("BALANCES_INVALID");
      current[name] = text;
    }
  }
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > 8 || expected !== balances.length) fail("BALANCES_INVALID");
  const seen = new Set();
  for (const wallet of balances) {
    const scale = wallet.currency === "BTC" ? 8 : ["USD", "EUR"].includes(wallet.currency) ? 2 : null;
    const identity = `${wallet.paymentMethod}:${wallet.currency}`;
    if (scale === null || wallet.decimals !== String(scale) || seen.has(identity) ||
        !/^(0|[1-9]\d{0,19})$/.test(wallet.amountBase ?? "") ||
        !new RegExp(`^(0|[1-9]\\d{0,11})(?:\\.\\d{1,${scale}})?$`).test(wallet.availableAmount ?? "")) fail("BALANCES_INVALID");
    const [whole, fraction = ""] = wallet.availableAmount.split(".");
    if (BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0")) !== BigInt(wallet.amountBase)) fail("BALANCES_INVALID");
    seen.add(identity); wallet.decimals = scale;
  }
  if (typeof observation?.accountFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(observation.accountFingerprint) ||
      !Number.isFinite(Date.parse(observation.checkedAt))) fail("BALANCES_INVALID");
  return freeze({ source: "authenticated_mcp_balances", ...observation, balances });
}

// The MCP get-invoice-by-id result can include actual redemption secrets.
// Read root invoice_id/invoice_status only: observed TOON child records also
// contain an indented invoice_id. Never promote a child field to invoice proof.
// Do not infer child identity, fees or an upstream spending cap from this read.
export function normalizeBitrefillMcpKnownInvoiceStatus(result, observation) {
  if (result?.isError || Object.hasOwn(result ?? {}, "structuredContent") || result?.content?.length !== 1 ||
      result.content[0]?.type !== "text" || typeof result.content[0]?.text !== "string" ||
      !INVOICE_UUID.test(observation?.invoiceId ?? "") ||
      !/^[a-f0-9]{64}$/.test(observation?.accountFingerprint ?? "") ||
      !Number.isFinite(Date.parse(observation?.checkedAt)) ||
      Buffer.byteLength(result.content[0].text, "utf8") > MAX_BYTES) fail("KNOWN_INVOICE_INVALID");
  let foundId = null, foundStatus = null;
  let deliveryStatus = null;
  const seen = new Set();
  // Only root metadata names observed in the protected schema-only probe.
  // Their values (including tokens/URLs) are never parsed, returned or logged.
  const metadata = new Set(["orders_delivery_status", "created_time", "all_orders_delivered_time",
    "payment_confirmed_time", "detected_payment_info", "invoice_access_token", "checkout_url", "orders"]);
  for (const line of result.content[0].text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith(" ")) continue;
    const match = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([0-9]+)\])?:\s*(.*?)\s*$/.exec(line);
    if (!match || seen.has(match[1]) ||
        (match[2] !== undefined && (match[1] !== "orders" || Number(match[2]) > 20 || match[3] !== ""))) fail("KNOWN_INVOICE_INVALID");
    const key = match[1];
    seen.add(key);
    if (!["invoice_id", "invoice_status", "orders_delivery_status"].includes(key)) {
      if (!metadata.has(key)) fail("KNOWN_INVOICE_INVALID");
      continue;
    }
    if (match[2] !== undefined) fail("KNOWN_INVOICE_INVALID");
    let value = match[3];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { fail("KNOWN_INVOICE_INVALID"); }
    }
    if (typeof value !== "string" || !value) fail("KNOWN_INVOICE_INVALID");
    if (key === "invoice_id") {
      if (foundId !== null || !INVOICE_UUID.test(value)) fail("KNOWN_INVOICE_INVALID");
      foundId = value;
    } else if (key === "invoice_status") {
      if (foundStatus !== null ||
          !["unpaid", "payment_detected", "payment_confirmed", "complete", "blocked"].includes(value)) {
        fail("KNOWN_INVOICE_INVALID");
      }
      foundStatus = value;
    } else {
      if (value !== "all_delivered") fail("KNOWN_INVOICE_INVALID");
      deliveryStatus = value;
    }
  }
  if (foundId?.toLowerCase() !== observation.invoiceId.toLowerCase() || foundStatus === null ||
      (deliveryStatus !== null && foundStatus !== "complete")) fail("KNOWN_INVOICE_INVALID");
  return freeze({
    source: "authenticated_mcp_known_invoice_status",
    checkedAt: observation.checkedAt,
    accountFingerprint: observation.accountFingerprint,
    invoiceIdentityVerified: true,
    invoiceStatus: foundStatus,
    invoiceComplete: foundStatus === "complete",
    childIdentityVerified: false,
    finalUsdDebitVerified: false,
    feesIncludedVerified: false,
    supplierEnforcedDebitCapVerified: false,
    purchaseSubmitted: false,
  });
}

async function readRpc(response, id, { allowToolError = false } = {}) {
  const reader = response.body?.getReader();
  if (!reader) fail("RESPONSE_INVALID");
  const sse = (response.headers.get("content-type") ?? "").includes("text/event-stream");
  const decoder = new TextDecoder(); let text = "", bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > MAX_BYTES) fail("RESPONSE_TOO_LARGE");
      text += decoder.decode(chunk.value, { stream: true });
      const candidates = sse ? text.split(/\r?\n\r?\n/).slice(0, -1).map(event => event.split(/\r?\n/)
        .filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")) : [text];
      for (const candidate of candidates) {
        let value; try { value = JSON.parse(candidate); } catch { continue; }
        if (value?.jsonrpc !== "2.0" || value.id !== id) continue;
        if (value.error) fail("RPC_ERROR");
        if (!value.result || value.result.isError && !allowToolError) fail("TOOL_ERROR");
        return value.result;
      }
    }
    fail("RESPONSE_INVALID");
  } finally { await reader.cancel().catch(() => {}); }
}

export function createBitrefillMcpReadonlyClient({ credentials, fetchImpl, timeoutMs = 15000 } = {}) {
  if (credentials?.authMode !== "personal" || credentials.apiId || credentials.apiSecret ||
      typeof credentials.apiKey !== "string" || !credentials.apiKey.trim() || typeof fetchImpl !== "function") fail("PERSONAL_CREDENTIALS_REQUIRED");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail("TIMEOUT_INVALID");
  const authorization = buildBitrefillAuthorization(credentials);
  const accountFingerprint = createHash("sha256").update("bitrefill-personal-key-v1:").update(credentials.apiKey.trim()).digest("hex");
  let sequence = 0;
  async function request(method, params) {
    const detailRead = method === "tools/call" && params?.name === "get-product-details" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(params.arguments?.product_id ?? "") &&
      params.arguments.currency === "USD" && Object.keys(params.arguments).length === 2;
    const knownInvoiceRead = method === "tools/call" && params?.name === "get-invoice-by-id" &&
      params.arguments && Object.keys(params.arguments).length === 1 &&
      INVOICE_UUID.test(params.arguments.invoice_id ?? "");
    if (!(method === "tools/list" && params === undefined) &&
        !(method === "tools/call" && params?.name === "get-balances" && Object.keys(params.arguments).length === 0) &&
        !detailRead && !knownInvoiceRead) fail("READONLY_REQUIRED");
    const id = ++sequence, controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(ENDPOINT, { method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) });
      if (!response.ok) fail(response.status === 401 || response.status === 403 ? "AUTH_FAILED" : `HTTP_${response.status}`);
      return await readRpc(response, id);
    } catch (error) {
      if (error instanceof Error && /^BITREFILL_MCP_[A-Z0-9_]+$/.test(error.message)) throw error;
      fail("TRANSPORT_FAILURE");
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async readProductDetails(productId) {
      return normalizeBitrefillMcpProductDetails(await request("tools/call", {
        name: "get-product-details", arguments: { product_id: productId, currency: "USD" },
      }), { productId, accountFingerprint, checkedAt: new Date().toISOString() });
    },
    async listTools() {
      const result = await request("tools/list");
      if (!Array.isArray(result.tools) || result.nextCursor) fail("TOOLS_INCOMPLETE");
      const tools = result.tools.filter(tool => ["get-balances", "buy-products"].includes(tool.name))
        .map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, annotations: tool.annotations }));
      if (tools.length !== 2 || new Set(tools.map(tool => tool.name)).size !== 2) fail("TOOLS_INCOMPLETE");
      return freeze({ source: "authenticated_mcp_tools_list", accountFingerprint, checkedAt: new Date().toISOString(), tools });
    },
    async readBalances() {
      const result = await request("tools/call", { name: "get-balances", arguments: {} });
      return normalizeBitrefillMcpBalances(result, { accountFingerprint, checkedAt: new Date().toISOString() });
    },
    // Authenticated, known-ID read only. The MCP HTTP envelope is POST,
    // but the allowlisted tool get-invoice-by-id never creates a purchase.
    async readKnownInvoiceStatus(invoiceId) {
      if (!INVOICE_UUID.test(invoiceId ?? "")) fail("KNOWN_INVOICE_ID_INVALID");
      const result = await request("tools/call", {
        name: "get-invoice-by-id", arguments: { invoice_id: invoiceId },
      });
      return normalizeBitrefillMcpKnownInvoiceStatus(result, {
        invoiceId, accountFingerprint, checkedAt: new Date().toISOString(),
      });
    },
  });
}

// Shared bounded/correlated decoder only; exporting it grants no tool access.
export { readRpc as readBitrefillMcpRpcResponse };

// Only the observed product identity and TOON price table are interpreted.
// Instructions, payment suggestions and unrelated nested values are discarded.
export function normalizeBitrefillMcpProductDetails(result, observation) {
  if (result?.isError || result?.content?.length !== 1 || result.content[0].type !== "text") fail("DETAIL_INVALID");
  const lines = result.content[0].text.split(/\r?\n/), fields = {};
  for (const line of lines) {
    const match = /^(id|country_code|currency|recipient_type|in_stock): (.+)$/.exec(line);
    if (match) { if (Object.hasOwn(fields, match[1])) fail("DETAIL_INVALID"); fields[match[1]] = match[2]; }
  }
  const header = /^packages\[(\d+)\]\{package_value,package_currency,payment_price,payment_currency\}:$/;
  const start = lines.findIndex(line => header.test(line));
  const count = start < 0 ? 0 : Number(header.exec(lines[start])[1]);
  if (!count || count > 512 || fields.id !== observation.productId || !/^[A-Z]{2}$/.test(fields.country_code ?? "") ||
      !/^[A-Z]{3}$/.test(fields.currency ?? "") || !["true", "false"].includes(fields.in_stock) ||
      !/^[a-f0-9]{64}$/.test(observation.accountFingerprint ?? "") || !Number.isFinite(Date.parse(observation.checkedAt))) fail("DETAIL_INVALID");
  const seen = new Set(), packages = lines.slice(start + 1, start + 1 + count).map(line => {
    const m = /^  "?((?:0|[1-9]\d{0,8})(?:\.\d{1,6})?)"?,([A-Z]{3}),"?((?:0|[1-9]\d{0,8})(?:\.\d{1,6})?)"?,USD$/.exec(line);
    if (!m || Number(m[1]) <= 0 || Number(m[3]) <= 0 || seen.has(m[1]) || m[2] !== fields.currency) fail("DETAIL_INVALID");
    seen.add(m[1]); return { packageValue: m[1], faceCurrency: m[2], displayPriceUsd: m[3] };
  });
  if (packages.length !== count) fail("DETAIL_INVALID");
  return freeze({ source: "authenticated_mcp_product_details", ...observation, country: fields.country_code,
    faceCurrency: fields.currency, recipientType: fields.recipient_type, available: fields.in_stock === "true",
    packages, allInCostVerified: false });
}
