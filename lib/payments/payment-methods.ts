import type { PaymentChannelCode } from "./channel-types";

export const PAYMENT_METHODS = [
  "balance",
  "alipay",
  "wechat_pay",
  "binance_pay",
  "usdt_trc20",
  "usdt_bep20",
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number];

export type PaymentMethodOption = {
  code: PaymentMethodCode;
  label: string;
  description?: string;
  network?: string;
  channelCodes: PaymentChannelCode[];
};

export const DEFAULT_PAYMENT_METHOD: PaymentMethodCode = "balance";

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    code: "balance",
    label: "余额支付",
    description: "使用账户可用余额支付",
    channelCodes: [],
  },
  {
    code: "alipay",
    label: "支付宝",
    description: "暂未开放",
    channelCodes: ["alipay"],
  },
  {
    code: "wechat_pay",
    label: "微信支付",
    description: "暂未开放",
    channelCodes: ["wechat"],
  },
  {
    code: "binance_pay",
    label: "币安支付",
    description: "暂未开放",
    channelCodes: ["binance_pay"],
  },
  {
    code: "usdt_trc20",
    label: "USDT-TRC20",
    network: "TRON 网络",
    description: "TRON 网络，暂未开放",
    channelCodes: ["usdt_trc20"],
  },
  {
    code: "usdt_bep20",
    label: "USDT-BEP20",
    network: "BNB Smart Chain 网络",
    description: "BNB Smart Chain 网络，暂未开放",
    channelCodes: ["usdt_bep20"],
  },
];

export function normalizePaymentMethod(value: unknown): PaymentMethodCode | null {
  const method = String(value ?? "").trim();
  return PAYMENT_METHODS.includes(method as PaymentMethodCode) ? (method as PaymentMethodCode) : null;
}

export function getPaymentMethodOption(value: unknown) {
  const method = normalizePaymentMethod(value);
  return PAYMENT_METHOD_OPTIONS.find((option) => option.code === method) ?? null;
}

export function getPaymentMethodLabel(value: unknown) {
  return getPaymentMethodOption(value)?.label ?? "未知支付方式";
}

export function isExternalPaymentMethod(value: unknown) {
  const method = normalizePaymentMethod(value);
  return Boolean(method && method !== "balance");
}
