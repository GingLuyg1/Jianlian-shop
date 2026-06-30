import type {
  PaymentChannel,
  PaymentChannelCode,
  PaymentCurrency,
  RechargeAmountSummary,
} from "@/lib/payments/channel-types";
import { formatCurrency } from "@/lib/i18n/money";

export const PAYMENT_CHANNELS = [
  {
    channel_code: "alipay",
    code: "alipay",
    display_name: "支付宝",
    name: "支付宝",
    currency: "CNY",
    minimum_amount: 10,
    minimumAmount: 10,
    fee_rate: 0.03,
    feeRate: 0.03,
    status: "active",
    enabled: true,
    configured: false,
    provider: "generic_api",
    sort_order: 10,
    iconSrc: "/assets/alipay-icon.jpg",
    description: "适合人民币余额充值，到账前需等待渠道回调确认。",
  },
  {
    channel_code: "wechat",
    code: "wechat",
    display_name: "微信支付",
    name: "微信支付",
    currency: "CNY",
    minimum_amount: 10,
    minimumAmount: 10,
    fee_rate: 0.03,
    feeRate: 0.03,
    status: "active",
    enabled: true,
    configured: false,
    provider: "generic_api",
    sort_order: 20,
    iconSrc: "/assets/wechat-pay-icon.jpg",
    description: "适合人民币余额充值，到账前需等待渠道回调确认。",
  },
  {
    channel_code: "binance_pay",
    code: "binance_pay",
    display_name: "币安转账",
    name: "币安转账",
    currency: "USDT",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "binance",
    sort_order: 30,
    iconSrc: "/assets/binance-pay-icon.jpg",
    description: "预留 Binance Pay 链路，当前未配置真实代收参数。",
  },
  {
    channel_code: "usdt_trc20",
    code: "usdt_trc20",
    display_name: "USDT-TRC20",
    name: "USDT-TRC20",
    currency: "USDT",
    network: "TRC20",
    networkLabel: "TRON",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "crypto_address",
    sort_order: 40,
    iconSrc: "/assets/usdt-trc20-icon.jpg",
    description: "TRON 网络收款地址预留，未配置前不会返回地址。",
  },
  {
    channel_code: "usdt_bep20",
    code: "usdt_bep20",
    display_name: "USDT-BEP20",
    name: "USDT-BEP20",
    currency: "USDT",
    network: "BEP20",
    networkLabel: "BSC",
    minimum_amount: 1,
    minimumAmount: 1,
    fee_rate: 0,
    feeRate: 0,
    status: "active",
    enabled: true,
    configured: false,
    provider: "crypto_address",
    sort_order: 50,
    iconSrc: "/assets/usdt-bep20-icon.jpg",
    description: "BSC 网络收款地址预留，未配置前不会返回地址。",
  },
].sort((a, b) => a.sort_order - b.sort_order) as PaymentChannel[];

export function getPublicPaymentChannels() {
  return PAYMENT_CHANNELS.map(({ configured: _configured, ...channel }) => channel);
}

export function getPaymentChannel(code: string | null | undefined) {
  return PAYMENT_CHANNELS.find((channel) => channel.code === code) ?? null;
}

export function isPaymentChannelCode(value: string): value is PaymentChannelCode {
  return PAYMENT_CHANNELS.some((channel) => channel.code === value);
}

export function getCurrencyDecimals(currency: PaymentCurrency) {
  return currency === "USDT" ? 6 : 2;
}

export function normalizeRechargeAmount(value: number, currency: PaymentCurrency) {
  const decimals = getCurrencyDecimals(currency);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calculateRechargeAmounts(
  channel: Pick<PaymentChannel, "currency" | "feeRate">,
  rawAmount: number
): RechargeAmountSummary {
  const amount = normalizeRechargeAmount(Number.isFinite(rawAmount) ? rawAmount : 0, channel.currency);
  const fee = normalizeRechargeAmount(amount * channel.feeRate, channel.currency);
  const payableAmount = normalizeRechargeAmount(amount + fee, channel.currency);
  return {
    amount,
    fee,
    payableAmount,
    arrivalAmount: amount,
    currency: channel.currency,
    decimals: getCurrencyDecimals(channel.currency),
  };
}

export function formatPaymentAmount(value: number, currency: PaymentCurrency) {
  return formatCurrency(value, currency);
}

export function formatFeeRate(feeRate: number) {
  if (!feeRate) return "免手续费";
  return `${trimTrailingZeros((feeRate * 100).toFixed(2))}%`;
}

function trimTrailingZeros(value: string) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
