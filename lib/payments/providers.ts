import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentProviderCode,
  RechargeStatus,
} from "@/lib/payments/channel-types";

export class PaymentProviderError extends Error {
  constructor(message = "支付渠道暂未配置") {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function unavailableProvider(): PaymentProvider {
  return {
    async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
      throw new PaymentProviderError("支付渠道暂未配置");
    },
    async queryPayment(_rechargeNo: string): Promise<{ status: RechargeStatus }> {
      throw new PaymentProviderError("支付渠道暂未配置");
    },
    async closePayment(_rechargeNo: string): Promise<{ closed: boolean }> {
      throw new PaymentProviderError("支付渠道暂未配置");
    },
    async verifyCallback(_payload: unknown, _signature?: string): Promise<boolean> {
      return false;
    },
    async parseCallback(_payload: unknown): Promise<Record<string, unknown>> {
      throw new PaymentProviderError("支付渠道暂未配置");
    },
  };
}

const providers: Record<PaymentProviderCode, PaymentProvider> = {
  generic_api: unavailableProvider(),
  binance: unavailableProvider(),
  crypto_address: unavailableProvider(),
};

export function getPaymentProvider(provider: PaymentProviderCode) {
  return providers[provider];
}

export function getPaymentProviderErrorMessage(error: unknown, fallback = "支付渠道暂未配置") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}
