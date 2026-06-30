export const DEFAULT_LOCALE = "zh-CN";
export const DEFAULT_SUPPORTED_LOCALES = ["zh-CN"] as const;
export const DEFAULT_CURRENCY = "CNY";
export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_DATE_FORMAT = "yyyy-MM-dd";
export const DEFAULT_TIME_FORMAT = "HH:mm:ss";

export type AppLocale = (typeof DEFAULT_SUPPORTED_LOCALES)[number] | string;

export type PublicI18nConfig = {
  defaultLocale: AppLocale;
  supportedLocales: string[];
  defaultCurrency: string;
  businessTimezone: string;
  dateFormat: string;
  timeFormat: string;
};

export const DEFAULT_I18N_CONFIG: PublicI18nConfig = {
  defaultLocale: DEFAULT_LOCALE,
  supportedLocales: [...DEFAULT_SUPPORTED_LOCALES],
  defaultCurrency: DEFAULT_CURRENCY,
  businessTimezone: DEFAULT_BUSINESS_TIMEZONE,
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: DEFAULT_TIME_FORMAT,
};

export function normalizeCurrency(currency: unknown, fallback = DEFAULT_CURRENCY) {
  const value = String(currency ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(value) ? value : fallback;
}

export function normalizeLocale(locale: unknown, fallback = DEFAULT_LOCALE) {
  const value = String(locale ?? "").trim();
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value) ? value : fallback;
}

export function normalizeBusinessTimezone(
  timezone: unknown,
  fallback = DEFAULT_BUSINESS_TIMEZONE
) {
  const value = String(timezone ?? "").trim();
  if (!value) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return fallback;
  }
}

