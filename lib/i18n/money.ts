import { DEFAULT_CURRENCY, DEFAULT_LOCALE, normalizeCurrency } from "@/lib/i18n/config";

const CURRENCY_DECIMALS: Record<string, number> = {
  CNY: 2,
  USD: 2,
  EUR: 2,
  HKD: 2,
  JPY: 0,
  USDT: 6,
};

export function getCurrencyDecimals(currency: unknown) {
  return CURRENCY_DECIMALS[normalizeCurrency(currency)] ?? 2;
}

export function parseAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAmount(value: unknown, currency = DEFAULT_CURRENCY) {
  const amount = parseAmount(value);
  if (amount === null) return null;

  const factor = 10 ** getCurrencyDecimals(currency);
  return Math.round(amount * factor) / factor;
}

export function toMinorUnits(value: unknown, currency = DEFAULT_CURRENCY) {
  const amount = normalizeAmount(value, currency);
  if (amount === null) return null;

  return Math.round(amount * 10 ** getCurrencyDecimals(currency));
}

export function fromMinorUnits(value: unknown, currency = DEFAULT_CURRENCY) {
  const amount = parseAmount(value);
  if (amount === null) return null;

  return normalizeAmount(amount / 10 ** getCurrencyDecimals(currency), currency);
}

export function formatCurrency(
  value: unknown,
  currency = DEFAULT_CURRENCY,
  options: { locale?: string; empty?: string; accounting?: boolean } = {}
) {
  const normalizedCurrency = normalizeCurrency(currency);
  const amount = normalizeAmount(value, normalizedCurrency);
  if (amount === null) return options.empty ?? "—";

  if (normalizedCurrency === "USDT") {
    const formatted = trimTrailingZeros(amount.toFixed(6));
    return `${formatted} USDT`;
  }

  try {
    return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
      style: "currency",
      currency: normalizedCurrency,
      currencySign: options.accounting ? "accounting" : "standard",
      minimumFractionDigits: getCurrencyDecimals(normalizedCurrency),
      maximumFractionDigits: getCurrencyDecimals(normalizedCurrency),
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(getCurrencyDecimals(normalizedCurrency))}`;
  }
}

export const formatMoney = formatCurrency;

export function formatAmountWithCurrency(value: unknown, currency = DEFAULT_CURRENCY) {
  const normalizedCurrency = normalizeCurrency(currency);
  const amount = normalizeAmount(value, normalizedCurrency);
  if (amount === null) return "—";
  return `${amount.toFixed(getCurrencyDecimals(normalizedCurrency))} ${normalizedCurrency}`;
}

function trimTrailingZeros(value: string) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

