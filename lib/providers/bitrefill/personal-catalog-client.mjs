// Shared by the server-only Next wrapper and explicit loopback workspace CLI.
import { createBitrefillClient } from "./client-core.mjs";
export function createPersonalCatalogClient(apiKey, fetchImpl = fetch) {
  if (!apiKey || process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) throw new Error("BITREFILL_CATALOG_NOT_CONFIGURED");
  return createBitrefillClient({ authMode: "personal", apiKey, maxRetries: 0, timeoutMs: 8000,
    fetchImpl: async (url, options) => {
      const target = new URL(String(url));
      if (target.origin !== "https://api.bitrefill.com" || options?.method !== "GET" ||
        !/^\/v2\/products(?:\/[A-Za-z0-9_-]+)?$/.test(target.pathname)) throw new Error("CATALOG_ONLY_REQUIRED");
      const response = await fetchImpl(target, { ...options, redirect: "error" });
      const limit = 512 * 1024;
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
        void response.body?.cancel().catch(() => {}); throw new Error("CATALOG_RESPONSE_TOO_LARGE");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("CATALOG_RESPONSE_STREAM_REQUIRED");
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > limit) { void reader.cancel().catch(() => {}); throw new Error("CATALOG_RESPONSE_TOO_LARGE"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return new Response(Buffer.concat(chunks, size), { status: response.status, headers: response.headers });
    } });
}
