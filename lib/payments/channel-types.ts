export type PaymentCurrency = "CNY" | "USDT";
export type PaymentNetwork = "TRC20" | "BEP20";
export type PaymentProviderCode = "generic_api" | "binance" | "crypto_address";
export type PaymentChannelStatus = "active" | "disabled";
export type PaymentChannelCode =
  | "alipay"
  | "wechat"
  | "binance_pay"
  | "usdt_trc20"
  | "usdt_bep20";

export type RechargeStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "closed";

export type PaymentSessionStatus = RechargeStatus;
export type PaymentBusinessType = "order" | "recharge" | "account_recharge";
export type PaymentResultType = "redirect" | "qrcode" | "address";

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
  provider: PaymentProviderCode;
  sort_order: number;
  iconSrc?: string;
  description?: string;
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
  network?: PaymentNetwork;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  expiresAt: string;
};

export type ProviderCreatePaymentResult = {
  status: "pending" | "processing";
  paymentType: PaymentResultType;
  paymentUrl?: string;
  qrCodeUrl?: string;
  walletAddress?: string;
  providerOrderNo?: string;
  expiresAt?: string;
};

export type ProviderQueryPaymentResult = {
  status: PaymentSessionStatus;
  providerTransactionId?: string;
  paidAt?: string;
  amount?: number;
  currency?: PaymentCurrency;
  rawSummary?: Record<string, unknown>;
};

export type ProviderClosePaymentResult = {
  closed: boolean;
  status?: PaymentSessionStatus;
};

export type ProviderCallbackContext = {
  channelCode: PaymentChannelCode;
  provider: PaymentProviderCode;
  rawBody: string;
  headers: Headers;
};

export type ProviderParsedCallback = {
  businessNo: string;
  sessionNo?: string;
  providerOrderNo?: string;
  providerTransactionId: string;
  status: PaymentSessionStatus;
  amount: number;
  currency: PaymentCurrency;
  channelCode?: PaymentChannelCode;
  paidAt?: string;
  rawSummary?: Record<string, unknown>;
};

export type PaymentProvider = {
  createPayment(input: CreatePaymentInput | ProviderCreatePaymentInput): Promise<CreatePaymentResult | ProviderCreatePaymentResult>;
  queryPayment(paymentNo: string): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult>;
  closePayment(paymentNo: string): Promise<{ closed: boolean } | ProviderClosePaymentResult>;
  verifyCallback(payload: unknown, signatureOrContext?: string | ProviderCallbackContext): Promise<boolean>;
  parseCallback(payload: unknown, context?: ProviderCallbackContext): Promise<Record<string, unknown> | ProviderParsedCallback>;
};
