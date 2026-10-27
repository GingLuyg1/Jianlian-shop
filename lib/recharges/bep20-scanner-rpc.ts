import "server-only";

import { createHash } from "node:crypto";

const BLOCKMACHINE_HOST = "rpc-bsc.blockmachine.io";
const READ_METHODS = new Set(["eth_chainId", "eth_blockNumber", "eth_call", "eth_getLogs", "eth_getBlockByNumber"]);
const MAX_COOLDOWN_MS = 15 * 60_000;

export class ScannerRpcError extends Error {
  constructor(public readonly code: string, public readonly retryAfterMs = 0) {
    // Never retain provider messages, request options, endpoints or credentials.
    super(code);
    this.name = "ScannerRpcError";
  }
}

type RpcOptions = { url: string; apiKey?: string };
type Dependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export function scannerRpcOptions(legacyUrl: string): RpcOptions {
  return {
    url: process.env.RECHARGE_BEP20_RPC_URL?.trim() || legacyUrl,
    apiKey: process.env.RECHARGE_BEP20_BLOCKMACHINE_API_KEY,
  };
}

export function createScannerRpcTransport(deps: Dependencies = {}) {
  const send = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? 12_000;
  let identity = "";
  let busy = false;
  let nextStart = 0;
  let cooldownUntil = 0;
  let terminalCode: string | null = null;
  const failures = new Map<string, number>();

  return async function request<T>(options: RpcOptions, method: string, params: unknown[]): Promise<T> {
    if (!READ_METHODS.has(method)) throw new ScannerRpcError("BSC_RPC_METHOD_NOT_ALLOWED");
    const key = options.apiKey?.trim() || "";
    let url: URL;
    try { url = new URL(options.url); } catch { throw new ScannerRpcError("BSC_RPC_CONFIG_INVALID"); }
    const blockmachine = url.protocol === "https:" && url.hostname === BLOCKMACHINE_HOST
      && (!url.port || url.port === "443") && url.pathname === "/";
    if (key && (!blockmachine || url.search || url.hash || url.username || url.password
      || /[\u0000-\u0020\u007f]/.test(key) || key.length > 4096)) {
      throw new ScannerRpcError("BSC_RPC_AUTH_CONFIG_INVALID");
    }
    if (options.apiKey && !key) throw new ScannerRpcError("BSC_RPC_AUTH_CONFIG_INVALID");
    if (busy) throw new ScannerRpcError("BSC_RPC_BUSY");

    const fingerprint = createHash("sha256").update(options.url).update("\0").update(key).digest("hex");
    if (fingerprint !== identity) {
      identity = fingerprint;
      terminalCode = null;
      nextStart = 0;
      cooldownUntil = 0;
      failures.clear();
    }
    if (terminalCode) throw new ScannerRpcError(terminalCode);
    if (now() < cooldownUntil) throw new ScannerRpcError("BSC_RPC_COOLDOWN", cooldownUntil - now());
    busy = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const fail = (code: string, terminal = false, retryAfter = 0): never => {
      const count = Math.min(5, (failures.get(method) ?? 0) + 1);
      failures.set(method, count);
      if (terminal) terminalCode = code;
      const delay = Math.max(Math.min(MAX_COOLDOWN_MS, 60_000 * 2 ** (count - 1)), retryAfter);
      cooldownUntil = now() + delay;
      throw new ScannerRpcError(code, terminal ? 0 : delay);
    };
    try {
      // Conservative per-process pacing, including keyless Blockmachine traffic.
      // No credential is ever sent to a redirect or to an unapproved host.
      if (blockmachine && now() < nextStart) await sleep(nextStart - now());
      nextStart = now() + (blockmachine ? 1100 : 0);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (key) headers.Authorization = `Bearer ${key}`;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ScannerRpcError("BSC_RPC_TIMEOUT"));
        }, timeoutMs);
      });
      const operation = (async () => {
        const response = await send(options.url, {
          method: "POST", headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          cache: "no-store", signal: controller.signal,
          ...(key || blockmachine ? { redirect: "error" as const } : {}),
        });
        const payload = await response.json().catch(() => null) as {
          jsonrpc?: unknown; id?: unknown; result?: T; error?: { code?: unknown };
        } | null;
        return { response, payload };
      })();
      const { response, payload } = await Promise.race([operation, deadline]);
      const errorCode = payload?.error?.code;
      // Providers can report account failures with HTTP 200 or 429: classify the RPC code first.
      if (errorCode === -32030) return fail("BSC_RPC_QUOTA_EXHAUSTED", true);
      if (errorCode === -32021) return fail("BSC_RPC_AUTH_FAILED", true);
      if (errorCode === -32031) return fail("BSC_RPC_PROVIDER_UNAVAILABLE");
      if (response.status === 429 || errorCode === -32029) {
        const raw = response.headers.get("retry-after");
        const isSeconds = Boolean(raw && /^\d+$/.test(raw));
        const numeric = isSeconds ? Number(raw) * 1000 : NaN;
        if (isSeconds && !Number.isFinite(numeric)) return fail("BSC_RPC_RETRY_WINDOW_EXCESSIVE", true);
        const dated = raw ? Date.parse(raw) - now() : NaN;
        const retryAfter = Number.isFinite(numeric) ? numeric : Number.isFinite(dated) ? Math.max(0, dated) : 0;
        if (retryAfter > 7 * 24 * 60 * 60_000) return fail("BSC_RPC_RETRY_WINDOW_EXCESSIVE", true);
        return fail("BSC_RPC_RATE_LIMITED", false, retryAfter);
      }
      if (response.status === 401) return fail("BSC_RPC_AUTH_FAILED", true);
      if (response.status === 403) return fail("BSC_RPC_ACCESS_DENIED", true);
      if (!response.ok) return fail("BSC_RPC_HTTP_FAILED");
      if (!payload || payload.error || payload.result === undefined
        || (blockmachine && (payload.jsonrpc !== "2.0" || payload.id !== 1))) {
        return fail("BSC_RPC_RESPONSE_INVALID");
      }
      failures.delete(method);
      return payload.result;
    } catch (error) {
      if (error instanceof ScannerRpcError && error.code !== "BSC_RPC_TIMEOUT") throw error;
      return fail(controller.signal.aborted ? "BSC_RPC_TIMEOUT" : "BSC_RPC_UNCERTAIN");
    } finally {
      if (timer) clearTimeout(timer);
      busy = false;
    }
  };
}

// Shared only by the scanner in this server process; never imported by payment receipt logic.
export const requestScannerRpc = createScannerRpcTransport();
