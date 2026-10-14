import { NextResponse } from "next/server";

import { parseBitrefillWebhookEnvelope } from "@/lib/providers/bitrefill/protocol.mjs";
import { readBitrefillWebhookBody } from "@/lib/providers/bitrefill/webhook-body.mjs";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function json(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) return json({ ok: false, error: "invalid_content_type" }, 415);
  const parsed = await readBitrefillWebhookBody(request, { maxBytes: MAX_WEBHOOK_BYTES });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status);
  const invoice = parseBitrefillWebhookEnvelope(parsed.value);
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
