export type BitrefillWebhookEnvelope = {
  invoiceId: string;
  status: "complete" | "denied" | "payment_error";
  orders: Array<{ id: string; status: string }>;
};

export function isPlainRecord(value: unknown): value is Record<string, unknown>;
export function parseBitrefillProduct(value: unknown): Record<string, unknown> | null;
export function parseBitrefillProductsResponse(value: unknown): { products: Array<Record<string, unknown>>; meta: Record<string, unknown> } | null;
export function parseBitrefillProductResponse(value: unknown): Record<string, unknown> | null;
export function parseBitrefillPingResponse(value: unknown): { message: "pong" } | null;
export function parseBitrefillRateLimitHeaders(headers: Headers): Record<string, number | null>;
export function mapBitrefillAvailability(product: { inStock: boolean }): { available: boolean; supplierQuantity: null; evidence: string };
export function parseBitrefillWebhookEnvelope(value: unknown): BitrefillWebhookEnvelope | null;
export function evaluateBitrefillInvoiceOutcome(invoice: BitrefillWebhookEnvelope): Record<string, unknown>;
export function createBitrefillWebhookIdempotencyKey(invoice: BitrefillWebhookEnvelope): string;
export function redactBitrefillLogValue(value: unknown, depth?: number): unknown;
