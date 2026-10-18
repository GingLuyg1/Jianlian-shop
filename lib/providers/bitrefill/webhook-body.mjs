const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

function boundedStructure(value) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    nodes += 1;
    if (nodes > 1_000 || current.depth > 12) return false;
    if (current.value && typeof current.value === "object") {
      for (const child of Array.isArray(current.value) ? current.value : Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return true;
}

export async function readBitrefillWebhookBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > DEFAULT_MAX_BYTES
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    return { ok: false, status: 400, error: "invalid_webhook_limits" };
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "invalid_json" };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result.timedOut) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: 408, error: "body_timeout" };
      }
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!boundedStructure(value)) return { ok: false, status: 400, error: "invalid_webhook" };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
