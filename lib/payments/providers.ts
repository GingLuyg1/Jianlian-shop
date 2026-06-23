import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentProviderCode,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentResult,
  RechargeStatus,
} from "@/lib/payments/channel-types";

export class PaymentProviderError extends Error {
  constructor(message = "支付渠道尚未配置，无法创建真实支付。") {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function unavailableProvider(): PaymentProvider {
  return {
    async createPayment(_input: CreatePaymentInput | ProviderCreatePaymentInput): Promise<CreatePaymentResult | ProviderCreatePaymentResult> {
      throw new PaymentProviderError();
    },
    async queryPayment(_paymentNo: string): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult> {
      throw new PaymentProviderError("支付渠道尚未配置，无法查询渠道状态。");
    },
    async closePayment(_paymentNo: string): Promise<{ closed: boolean }> {
      throw new PaymentProviderError("支付渠道尚未配置，无法关闭渠道支付单。");
    },
    async verifyCallback(_payload: unknown, _signatureOrContext?: string | ProviderCallbackContext): Promise<boolean> {
      return false;
    },
    async parseCallback(_payload: unknown, _context?: ProviderCallbackContext): Promise<Record<string, unknown> | ProviderParsedCallback> {
      throw new PaymentProviderError("支付渠道尚未配置，无法解析回调。");
    },
  };
}

const providers: Record<PaymentProviderCode, PaymentProvider> = {
  generic_api: unavailableProvider(),
  binance: unavailableProvider(),
  crypto_address: unavailableProvider(),
};

export function getPaymentProvider(provider: PaymentProviderCode) {
  return providers[provider] ?? unavailableProvider();
}

export function getPaymentProviderErrorMessage(error: unknown, fallback = "支付渠道尚未配置") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}
