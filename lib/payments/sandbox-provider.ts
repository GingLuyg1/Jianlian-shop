import "server-only";

import type {
  PaymentProvider,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentResult,
} from "@/lib/payments/channel-types";
import { PaymentProviderError } from "@/lib/payments/providers";

export function assertSandboxPaymentProviderAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "test" || env.PAYMENT_PROVIDER_MODE === "sandbox") return;
  throw new PaymentProviderError("Mock payment provider is disabled outside test or explicit sandbox mode.", "MOCK_PROVIDER_DISABLED");
}

export function createSandboxPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  assertSandboxPaymentProviderAllowed(env);

  return {
    async createPayment(input: ProviderCreatePaymentInput): Promise<ProviderCreatePaymentResult> {
      return {
        status: "pending",
        paymentType: "redirect",
        paymentUrl: `https://sandbox-pay.example.invalid/pay/${encodeURIComponent(input.sessionNo)}`,
        providerOrderNo: `SANDBOX-${input.sessionNo}`,
        expiresAt: input.expiresAt,
      };
    },
    async queryPayment(paymentNo: string): Promise<ProviderQueryPaymentResult> {
      return {
        status: paymentNo.includes("PAID") ? "paid" : "pending",
        providerTransactionId: paymentNo.includes("PAID") ? `SANDBOX-TX-${paymentNo}` : undefined,
      };
    },
    async closePayment(_paymentNo: string) {
      return { closed: true, status: "closed" };
    },
    async verifyCallback(payload: unknown, context?: string | ProviderCallbackContext) {
      const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
      const signature =
        typeof context === "string" ? context : context?.headers.get("x-sandbox-payment-signature") ?? "";
      return raw.includes("sandbox") && signature === "sandbox-valid";
    },
    async parseCallback(payload: unknown): Promise<ProviderParsedCallback> {
      const body = typeof payload === "string" ? JSON.parse(payload) : (payload as Record<string, unknown>);
      return {
        businessNo: String(body.businessNo ?? ""),
        sessionNo: typeof body.sessionNo === "string" ? body.sessionNo : undefined,
        providerOrderNo: typeof body.providerOrderNo === "string" ? body.providerOrderNo : undefined,
        providerTransactionId: String(body.providerTransactionId ?? "SANDBOX-TX"),
        status: body.status === "paid" ? "paid" : "pending",
        amount: Number(body.amount ?? 0),
        currency: body.currency === "USDT" ? "USDT" : "CNY",
        paidAt: typeof body.paidAt === "string" ? body.paidAt : undefined,
        rawSummary: { sandbox: true },
      };
    },
    formatCallbackResponse(result: { ok: boolean; duplicate?: boolean }) {
      return JSON.stringify({ ok: result.ok, duplicate: result.duplicate === true });
    },
  };
}
