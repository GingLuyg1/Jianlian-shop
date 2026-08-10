export const PAYMENT_DELIVERY_POLL_INTERVAL_MS = 1500;
export const PAYMENT_DELIVERY_POLL_TIMEOUT_MS = 24000;

function waitFor(delayMs, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const handleAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve(true);
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function pollForPaymentDelivery({
  load,
  signal,
  intervalMs = PAYMENT_DELIVERY_POLL_INTERVAL_MS,
  timeoutMs = PAYMENT_DELIVERY_POLL_TIMEOUT_MS,
  now = Date.now,
  wait = waitFor,
}) {
  const startedAt = now();

  while (!signal?.aborted) {
    const result = await load();
    if (result === "delivered") return { kind: "delivered" };
    if (result === "error") return { kind: "error" };

    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) return { kind: "timeout" };
    const continued = await wait(Math.min(intervalMs, remainingMs), signal);
    if (!continued) return { kind: "cancelled" };
  }

  return { kind: "cancelled" };
}
