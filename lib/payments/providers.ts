import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentChannelCode,
  PaymentProviderCapabilities,
  PaymentProviderConfigStatus,
  PaymentProvider,
  PaymentProviderCode,
  PaymentSessionStatus,
  ProviderConfigCheck,
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

export const providerCapabilities: Record<PaymentProviderCode, PaymentProviderCapabilities> = {
  generic_api: {
    supportsCreate: true,
    supportsQuery: true,
    supportsClose: true,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: true,
    supportsRedirect: true,
    supportsWalletAddress: false,
    supportsSandbox: false,
  },
  binance: {
    supportsCreate: true,
    supportsQuery: true,
    supportsClose: true,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: true,
    supportsRedirect: true,
    supportsWalletAddress: false,
    supportsSandbox: false,
  },
  crypto_address: {
    supportsCreate: true,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsWalletAddress: true,
    supportsSandbox: false,
  },
};

const providerRequiredEnvNames: Record<PaymentProviderCode, string[]> = {
  generic_api: [
    "GENERIC_PAYMENT_API_BASE_URL",
    "GENERIC_PAYMENT_MERCHANT_ID",
    "GENERIC_PAYMENT_API_SECRET",
    "GENERIC_PAYMENT_WEBHOOK_SECRET",
  ],
  binance: [
    "BINANCE_PAY_API_BASE_URL",
    "BINANCE_PAY_MERCHANT_ID",
    "BINANCE_PAY_API_KEY",
    "BINANCE_PAY_API_SECRET",
    "BINANCE_PAY_WEBHOOK_SECRET",
  ],
  crypto_address: ["CRYPTO_PAYMENT_WALLET_ADDRESS", "CRYPTO_PAYMENT_WEBHOOK_SECRET"],
};

export function getPaymentProviderCapabilities(provider: PaymentProviderCode): PaymentProviderCapabilities {
  return providerCapabilities[provider] ?? {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsWalletAddress: false,
    supportsSandbox: false,
  };
}

export function checkPaymentProviderConfig(
  provider: PaymentProviderCode,
  env: NodeJS.ProcessEnv = process.env,
  verified = false
): ProviderConfigCheck {
  const requiredEnvNames = providerRequiredEnvNames[provider] ?? [];
  const missingEnvNames = requiredEnvNames.filter((name) => !String(env[name] ?? "").trim());
  const configuredCount = requiredEnvNames.length - missingEnvNames.length;
  const status: PaymentProviderConfigStatus =
    configuredCount === 0
      ? "not_configured"
      : missingEnvNames.length > 0
        ? "partially_configured"
        : verified
          ? "connected"
          : "pending_verification";

  return {
    provider,
    status,
    configured: missingEnvNames.length === 0 && requiredEnvNames.length > 0,
    environment: env.PAYMENT_PROVIDER_ENV === "production" ? "production" : "sandbox",
    missingEnvNames,
    requiredEnvNames,
  };
}

export function getPaymentProviderReadiness(env: NodeJS.ProcessEnv = process.env) {
  return (Object.keys(providerCapabilities) as PaymentProviderCode[]).map((provider) => ({
    ...checkPaymentProviderConfig(provider, env, env[`PAYMENT_PROVIDER_${provider.toUpperCase()}_VERIFIED`] === "true"),
    capabilities: getPaymentProviderCapabilities(provider),
  }));
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
