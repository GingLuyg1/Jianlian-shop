export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
};

const DEFAULT_READ_TIMEOUT_MS = 12_000;
const DEFAULT_WRITE_TIMEOUT_MS = 25_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {}
): Promise<Response> {
  const { timeoutMs, signal: externalSignal, ...rest } = init;
  const method = String(rest.method || "GET").toUpperCase();
  const effectiveTimeout =
    typeof timeoutMs === "number" && timeoutMs > 0
      ? timeoutMs
      : method === "GET" || method === "HEAD"
        ? DEFAULT_READ_TIMEOUT_MS
        : DEFAULT_WRITE_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, effectiveTimeout);

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error("网络请求超时，请检查网络连接后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}
