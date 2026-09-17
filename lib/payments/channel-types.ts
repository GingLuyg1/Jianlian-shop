export type PaymentCurrency = "CNY" | "USDT";
export type PaymentNetwork = "TRC20" | "BEP20";
export type ProviderNetwork = PaymentNetwork | "TRON" | "BSC";
export type PaymentProviderCode = "liuhaoyi" | "generic_api" | "binance" | "crypto_address";
export type PaymentProviderEnvironment = "sandbox" | "production";
export type PaymentProviderConfigStatus =
  | "not_configured"
  | "partially_configured"
  | "pending_verification"
  | "connected";
export type PaymentChannelStatus = "active" | "disabled";
export type PaymentChannelCode =
  | "alipay"
  | "wechat"
  | "binance_pay"
  | "usdt_trc20"
  | "usdt_bep20";

export type RechargeStatus = "pending" | "waiting_payment" | "submitted" | "reviewing" | "approved" | "processing" | "succeeded" | "failed" | "rejected" | "cancelled" | "expired" | "paid" | "closed";
export type PaymentSessionStatus = "pending" | "processing" | "paid" | "failed" | "expired" | "closed";
export type PaymentBusinessType = "order" | "recharge" | "account_recharge";
export type PaymentResultType = "redirect" | "qrcode" | "address" | "deeplink";
export type PaymentClientDevice = "pc" | "mobile" | "wechat" | "alipay";

// QR payloads are data to encode locally, never an <img src> or automatic redirect.
export type PaymentArtifact =
  | { type: "redirect"; url: string }
  | { type: "qrcode"; payload: string; fallbackUrl?: string }
  | { type: "deeplink"; url: string; fallbackUrl?: string }
  | { type: "address"; address: string; network: string };

export type PaymentFeeSemantics = {
  principalAmount: number;
  siteFee: number;
  payableAmount: number;
  creditedAmount: number;
  providerExternalFee?: number | null; // Disclosure only; never add to local payable/credit.
};

export type ProviderRecoveryPolicy = {
  supportsRecovery: boolean;
  minimumCallbackGracePeriodMs: number;
  queryIntervalMs: number;
  maximumQueryWindowMs: number;
  allowAutoCompletion: boolean;
  requirePaidBeforeExpiry: boolean;
};

export type ManualPaymentInstructions = {
  payment_address: string;
  token_contract: string | null;
  payment_instructions: string | null;
};

export type PaymentChannel = {
  channel_code: PaymentChannelCode;
  code: PaymentChannelCode;
  display_name: string;
  name: string;
  currency: PaymentCurrency;
  minimum_amount: number;
  minimumAmount: number;
  fee_rate: number;
  feeRate: number;
  network?: PaymentNetwork;
  networkLabel?: "TRON" | "BSC";
  status: PaymentChannelStatus;
  enabled: boolean;
  configured: boolean;
  reviewMode?: "provider" | "manual";
  maximumAmount?: number;
  providerExternalFeeDisclosure?: string;
  provider: PaymentProviderCode;
  sort_order: number;
  iconSrc?: string;
  description?: string;
  manualPayment?: ManualPaymentInstructions;
};

export type RechargeAmountSummary = {
  amount: number;
  fee: number;
  payableAmount: number;
  arrivalAmount: number;
  currency: PaymentCurrency;
  decimals: number;
};

export type CreatePaymentInput = {
  rechargeNo: string;
  channel: PaymentChannel;
  userId: string;
  amount: number;
  fee: number;
  payableAmount: number;
};

export type CreatePaymentResult = {
  rechargeNo: string;
  status: "pending" | "processing";
  paymentType: PaymentResultType;
  paymentUrl?: string;
  qrCodeUrl?: string;
  qrCodeValue?: string;
  deepLinkUrl?: string;
  address?: string;
  network?: string;
  amount: number;
  fee: number;
  payableAmount: number;
};

export type ProviderCreatePaymentInput = {
  sessionNo: string;
  businessType: PaymentBusinessType;
  businessNo: string;
  userId: string;
  channel: PaymentChannel;
  currency: PaymentCurrency;
  network?: ProviderNetwork;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  expiresAt: string;
  subject?: string;
  description?: string;
  notifyUrl?: string;
  returnUrl?: string;
  clientIp?: string;
  clientDevice?: PaymentClientDevice;
  metadata?: Record<string, unknown>;
};

export type ProviderCreatePaymentResult = {
  status: "pending" | "processing";
  paymentType: PaymentResultType;
  artifact?: PaymentArtifact;
  submitForm?: PaymentSubmitForm;
  paymentUrl?: string;
  qrCodeUrl?: string;
  qrCodeValue?: string;
  deepLinkUrl?: string;
  walletAddress?: string;
  network?: string;
  providerOrderNo?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderQueryPaymentResult = {
  status: PaymentSessionStatus;
  found?: boolean;
  paid?: boolean;
  providerChannel?: PaymentChannelCode;
  providerTransactionIdPresent?: boolean;
  providerPaidAt?: string;
  providerTransactionId?: string;
  paidAt?: string;
  amount?: number | string;
  currency?: PaymentCurrency;
  rawSummary?: Record<string, unknown>;
  rawSummarySafe?: Record<string, unknown>;
};

export type PaymentSubmitForm = {
  action: string;
  method: "POST";
  fields: {
    pid: string;
    type: "alipay" | "wxpay";
    out_trade_no: string;
    notify_url: string;
    return_url: string;
    name: string;
    money: string;
    sign_type: "MD5";
    sign: string;
  };
};

export type ProviderClosePaymentResult = {
  closed: boolean;
  status?: PaymentSessionStatus;
};

export type ProviderRefundInput = {
  merchantOrderNo: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  amount: number;
  currency: PaymentCurrency;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderRefundResult = {
  status: "pending" | "processing" | "paid" | "failed" | "closed";
  providerRefundId?: string;
  amount: number;
  currency: PaymentCurrency;
  rawReference?: Record<string, unknown>;
};

export type PaymentProviderCapabilities = {
  supportsCreate: boolean;
  supportsQuery: boolean;
  supportsClose: boolean;
  supportsCallback: boolean;
  supportsRefund: boolean;
  supportsQrCode: boolean;
  supportsRedirect: boolean;
  supportsDeepLink: boolean;
  supportsWalletAddress: boolean;
  supportsRecoveryQuery: boolean;
  supportsSandbox: boolean;
  supportedCurrencies: readonly PaymentCurrency[];
  supportedChannels: readonly PaymentChannelCode[];
  minimumAmount: number | null;
  maximumAmount: number | null;
  providerExternalFeeDisclosure?: string | null;
};

export type ProviderConfigCheck = {
  provider: PaymentProviderCode;
  status: PaymentProviderConfigStatus;
  configured: boolean;
  environment: PaymentProviderEnvironment;
  missingEnvNames: string[];
  requiredEnvNames: string[];
};

export type ProviderCallbackContext = {
  channelCode: PaymentChannelCode;
  provider: PaymentProviderCode;
  rawBody: string;
  headers: Headers;
  requestUrl: string;
};

export type ProviderParsedCallback = {
  provider?: PaymentProviderCode;
  businessNo: string;
  sessionNo?: string;
  providerOrderNo?: string;
  providerTransactionId: string;
  status: PaymentSessionStatus;
  amount: number | string;
  currency: PaymentCurrency;
  channelCode?: PaymentChannelCode;
  paidAt?: string;
  rawSummary?: Record<string, unknown>;
};

export type PaymentProvider = {
  createPayment(
    input: CreatePaymentInput | ProviderCreatePaymentInput
  ): Promise<CreatePaymentResult | ProviderCreatePaymentResult>;
  queryPayment(paymentNo: string): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult>;
  closePayment(paymentNo: string): Promise<{ closed: boolean } | ProviderClosePaymentResult>;
  verifyCallback(payload: unknown, signatureOrContext?: string | ProviderCallbackContext): Promise<boolean>;
  parseCallback(
    payload: unknown,
    context?: ProviderCallbackContext
  ): Promise<Record<string, unknown> | ProviderParsedCallback>;
  formatCallbackResponse?(result: { ok: boolean; duplicate?: boolean; message?: string }): Response | string;
  queryRefund?(refundNo: string): Promise<ProviderRefundResult>;
  createRefund?(input: ProviderRefundInput): Promise<ProviderRefundResult>;
};
