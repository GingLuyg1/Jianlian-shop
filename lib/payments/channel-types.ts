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

export type PaymentProvider = {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment(rechargeNo: string): Promise<{ status: RechargeStatus }>;
  closePayment(rechargeNo: string): Promise<{ closed: boolean }>;
  verifyCallback(payload: unknown, signature?: string): Promise<boolean>;
  parseCallback(payload: unknown): Promise<Record<string, unknown>>;
};
