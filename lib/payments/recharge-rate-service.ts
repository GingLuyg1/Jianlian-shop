import type { SupabaseClient } from "@supabase/supabase-js";

export type RechargeDailyRateRow = {
  effective_date: string;
  market_rate: string | number;
  settlement_rate: string | number;
  source: string;
  effective_at: string;
  created_at: string;
};

export function currentShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function loadCurrentRechargeDailyRate(
  client: SupabaseClient,
  effectiveDate = currentShanghaiDate(),
) {
  const { data, error } = await client
    .from("account_recharge_daily_rates")
    .select("effective_date,market_rate,settlement_rate,source,effective_at,created_at")
    .eq("effective_date", effectiveDate)
    .maybeSingle();
  if (error) throw error;
  return data as RechargeDailyRateRow | null;
}

export async function loadLatestRechargeDailyRate(
  client: SupabaseClient,
  effectiveDate = currentShanghaiDate(),
): Promise<RechargeDailyRateRow | null> {
  const today = await loadCurrentRechargeDailyRate(client, effectiveDate);
  if (today) return today;
  const { data, error } = await client
    .from("account_recharge_daily_rates")
    .select("effective_date,market_rate,settlement_rate,source,effective_at,created_at")
    .lte("effective_date", effectiveDate)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RechargeDailyRateRow | null;
}

/**
 * 订单 USDT 支付动态汇率换算：
 * 先直接截断小数点第三位及以后（保留两位小数，不进位），再按第二位小数四舍五入至一位小数。
 * 例如：6.655542 -> 6.65 -> 6.7；6.66 -> 6.66 -> 6.7；7.15 -> 7.15 -> 7.2；6.64 -> 6.64 -> 6.6。
 */
export function deriveOrderUsdtRateFromMarket(marketRate: string | number): string | null {
  const raw = String(marketRate ?? "").trim();
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const frac2 = (match[2] ?? "").padEnd(2, "0").slice(0, 2);
  const hundredths = whole * BigInt(100) + BigInt(frac2);
  if (hundredths <= BigInt(0)) return null;
  const roundedTenths = (hundredths + BigInt(5)) / BigInt(10);
  const intPart = roundedTenths / BigInt(10);
  const decPart = roundedTenths % BigInt(10);
  return `${intPart.toString()}.${decPart.toString()}`;
}

export function toPublicRechargeRate(row: RechargeDailyRateRow) {
  return {
    effectiveDate: row.effective_date,
    marketRate: String(row.market_rate),
    settlementRate: String(row.settlement_rate),
    source: row.source,
    effectiveAt: row.effective_at,
  };
}
