// Server-side, fixed-origin, no retries. Only the two explicitly read-only MCP
// operations are callable; the buy-products contract can be inspected, not run.
import { createHash } from "node:crypto";
import { buildBitrefillAuthorization } from "./client-core.mjs";

const ENDPOINT = "https://api.bitrefill.com/mcp";
const MAX_BYTES = 1024 * 1024;
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

async function readRpc(response, id) {
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
        if (!value.result || value.result.isError) fail("TOOL_ERROR");
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
    if (!(method === "tools/list" && params === undefined) &&
        !(method === "tools/call" && params?.name === "get-balances" && Object.keys(params.arguments).length === 0)) fail("READONLY_REQUIRED");
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
  });
}
