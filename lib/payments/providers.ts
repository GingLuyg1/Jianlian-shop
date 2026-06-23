import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentChannelCode,
  PaymentProvider,
  PaymentProviderCode,
  PaymentSessionStatus,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentResult,
  RechargeStatus,
} from "@/lib/payments/channel-types";

export const PROVIDER_INTERFACE_COMPLETE = true;

export class PaymentProviderError extends Error {
  code: string;

  constructor(
    message = "支付渠道尚未配置，无法创建真实支付。",
    code = "PROVIDER_NOT_CONFIGURED"
  ) {
    super(message);
    this.name = "PaymentProviderError";
    this.code = code;
  }
}

function unavailableProvider(): PaymentProvider {
  return {
    async createPayment(
      _input: CreatePaymentInput | ProviderCreatePaymentInput
    ): Promise<CreatePaymentResult | ProviderCreatePaymentResult> {
      throw new PaymentProviderError();
    },
    async queryPayment(_paymentNo: string): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult> {
      throw new PaymentProviderError("支付渠道尚未配置，无法查询渠道状态。");
    },
    async closePayment(_paymentNo: string): Promise<{ closed: boolean }> {
      throw new PaymentProviderError("支付渠道尚未配置，无法关闭渠道支付单。");
    },
    async verifyCallback(_payload: unknown, _context?: string | ProviderCallbackContext): Promise<boolean> {
      return false;
    },
    async parseCallback(
      _payload: unknown,
      _context?: ProviderCallbackContext
    ): Promise<Record<string, unknown> | ProviderParsedCallback> {
      throw new PaymentProviderError("支付渠道尚未配置，无法解析回调。");
    },
  };
}

const providers: Record<PaymentProviderCode, PaymentProvider> = {
  generic_api: unavailableProvider(),
  binance: unavailableProvider(),
  crypto_address: unavailableProvider(),
};

const allowedChannels = new Set<PaymentChannelCode>([
  "alipay",
  "wechat",
  "binance_pay",
  "usdt_trc20",
  "usdt_bep20",
]);

export function getPaymentProvider(provider: PaymentProviderCode) {
  return providers[provider] ?? unavailableProvider();
}

export function isPaymentChannelCode(value: string): value is PaymentChannelCode {
  return allowedChannels.has(value as PaymentChannelCode);
}

export function normalizeProviderPaymentStatus(value: unknown): PaymentSessionStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["success", "succeeded", "completed", "confirmed", "paid"].includes(normalized)) return "paid";
  if (["created", "waiting", "unpaid", "pending"].includes(normalized)) return "pending";
  if (["processing", "confirming", "in_progress"].includes(normalized)) return "processing";
  if (["expired", "timeout", "timed_out"].includes(normalized)) return "expired";
  if (["closed", "cancelled", "canceled"].includes(normalized)) return "closed";
  if (["failed", "error", "rejected"].includes(normalized)) return "failed";
  return "processing";
}

export function getPaymentProviderErrorMessage(error: unknown, fallback = "支付渠道尚未配置") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}
