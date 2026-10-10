import { NextResponse } from "next/server";

import { parseBitrefillWebhookEnvelope } from "@/lib/providers/bitrefill/protocol.mjs";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function json(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return json({ ok: false, error: "invalid_content_type" }, 415);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const invoice = parseBitrefillWebhookEnvelope(payload);
  if (!invoice) return json({ ok: false, error: "invalid_webhook" }, 400);

  // V1 is intentionally side-effect free. Do not trust the unsigned body for
  // delivery. A future worker must authenticate GET /invoices/{id} and each
  // GET /orders/{id}, then use durable invoice/order idempotency records.
  return json({
    ok: true,
    accepted: true,
    side_effects: false,
    invoice_id: invoice.invoiceId,
    invoice_status: invoice.status,
    order_count: invoice.orders.length,
  }, 202);
}
