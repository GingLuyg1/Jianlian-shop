export function readBitrefillWebhookBody(
  request: Request,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }>;
