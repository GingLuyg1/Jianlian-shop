import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentChannelCode,
  PaymentChannel,
  PaymentProviderCapabilities,
  PaymentProviderConfigStatus,
  PaymentProvider,
  PaymentProviderCode,
  ProviderRecoveryPolicy,
  PaymentSessionStatus,
  ProviderConfigCheck,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentResult,
  RechargeStatus,
} from "@/lib/payments/channel-types";
import { liuhaoyiProvider } from "@/lib/payments/providers/liuhaoyi";

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
  liuhaoyi: liuhaoyiProvider,
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

export function resolveProviderForNewPayment(channel: Pick<PaymentChannel, "provider">): PaymentProvider {
  if (!Object.prototype.hasOwnProperty.call(providers, channel.provider)) throw new PaymentProviderError();
  return getPaymentProvider(channel.provider);
}

export function resolveProviderForExistingSession(session: { provider?: unknown }): PaymentProvider {
  const pinned = session.provider;
  if (typeof pinned !== "string" || !Object.prototype.hasOwnProperty.call(providers, pinned)) {
    throw new PaymentProviderError("支付会话 Provider 不存在", "SESSION_PROVIDER_UNKNOWN");
  }
  return getPaymentProvider(pinned as PaymentProviderCode);
}

export const providerCapabilities: Record<PaymentProviderCode, PaymentProviderCapabilities> = {
  liuhaoyi: {
    supportsCreate: true,
    supportsQuery: true,
    supportsClose: false,
    supportsCallback: true,
    supportsRefund: false,
    supportsQrCode: true,
    supportsRedirect: true,
    supportsDeepLink: true,
    supportsWalletAddress: false,
    supportsRecoveryQuery: true,
    supportsSandbox: false,
    supportedCurrencies: ["CNY"],
    supportedChannels: ["alipay", "wechat"],
    minimumAmount: 1,
    maximumAmount: 2000,
    providerExternalFeeDisclosure: "支付平台可能额外收取约 3% 通道手续费；实际付款金额以支付页面为准，本站本金不增加该费用。",
  },
  generic_api: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["CNY"],
    supportedChannels: ["alipay", "wechat"],
    minimumAmount: null,
    maximumAmount: null,
  },
  binance: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["USDT"],
    supportedChannels: ["binance_pay"],
    minimumAmount: null,
    maximumAmount: null,
  },
  crypto_address: {
    supportsCreate: false,
    supportsQuery: false,
    supportsClose: false,
    supportsCallback: false,
    supportsRefund: false,
    supportsQrCode: false,
    supportsRedirect: false,
    supportsDeepLink: false,
    supportsWalletAddress: false, // Existing BEP20 flow is separate from this placeholder adapter.
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: ["USDT"],
    supportedChannels: ["usdt_trc20", "usdt_bep20"],
    minimumAmount: null,
    maximumAmount: null,
  },
};

const noRecovery: ProviderRecoveryPolicy = {
  supportsRecovery: false,
  minimumCallbackGracePeriodMs: 0,
  queryIntervalMs: 0,
  maximumQueryWindowMs: 0,
  allowAutoCompletion: false,
  requirePaidBeforeExpiry: true,
};

export const providerRecoveryPolicies: Record<PaymentProviderCode, ProviderRecoveryPolicy> = {
  liuhaoyi: {
    supportsRecovery: true,
    minimumCallbackGracePeriodMs: 30_000, // Existing single-session recovery gate.
    queryIntervalMs: 180_000, // Diagnostic watcher cadence; watcher remains disabled.
    maximumQueryWindowMs: 3_600_000,
    allowAutoCompletion: false, // The watcher stays disabled until a separate rollout.
    requirePaidBeforeExpiry: true,
  },
  generic_api: noRecovery,
  binance: noRecovery,
  crypto_address: noRecovery,
};

const providerRequiredEnvNames: Record<PaymentProviderCode, string[]> = {
  liuhaoyi: [
    "LIUHAOYI_API_BASE_URL",
    "LIUHAOYI_MERCHANT_ID",
    "LIUHAOYI_MERCHANT_KEY",
    "LIUHAOYI_SITE_URL",
  ],
  generic_api: [
    "GENERIC_PAYMENT_API_BASE_URL",
    "GENERIC_PAYMENT_MERCHANT_ID",
    "GENERIC_PAYMENT_API_SECRET",
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
    supportsDeepLink: false,
    supportsWalletAddress: false,
    supportsRecoveryQuery: false,
    supportsSandbox: false,
    supportedCurrencies: [],
    supportedChannels: [],
    minimumAmount: null,
    maximumAmount: null,
  };
}

export function getPaymentProviderChannelReadiness(
  provider: PaymentProviderCode,
  channel: PaymentChannelCode,
  env: NodeJS.ProcessEnv = process.env,
) {
  const capabilities = getPaymentProviderCapabilities(provider);
  const config = checkPaymentProviderConfig(provider, env);
  const channelSupported = capabilities.supportedChannels.includes(channel);
  const currency = channel.startsWith("usdt_") || channel === "binance_pay" ? "USDT" : "CNY";
  const currencySupported = capabilities.supportedCurrencies.includes(currency);
  return {
    provider,
    channel,
    configured: config.configured,
    channelSupported,
    currencySupported,
    createSupported: capabilities.supportsCreate,
    querySupported: capabilities.supportsQuery,
    callbackSupported: capabilities.supportsCallback,
    recoverySupported: capabilities.supportsRecoveryQuery,
    codeReady: config.configured && channelSupported && currencySupported
      && capabilities.supportsCreate && capabilities.supportsQuery && capabilities.supportsCallback,
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
    recoveryPolicy: providerRecoveryPolicies[provider],
    channels: providerCapabilities[provider].supportedChannels.map((channel) =>
      getPaymentProviderChannelReadiness(provider, channel, env)),
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
