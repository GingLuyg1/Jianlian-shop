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
 * 不做四舍五入，直接截断到小数点后一位再 +0.1（即默认截断 + 0.1）。
 * 例如：6.649 -> 截断 6.6 + 0.1 = 6.7；6.655542 -> 6.7；6.66 -> 6.7；7.15 -> 7.2；6.60 -> 6.7。
 */
export function deriveOrderUsdtRateFromMarket(marketRate: string | number): string | null {
  const raw = String(marketRate ?? "").trim();
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const firstDecStr = (match[2] ?? "").slice(0, 1) || "0";
  const baseTenths = whole * BigInt(10) + BigInt(firstDecStr);
  if (whole === BigInt(0) && !/[1-9]/.test(match[2] ?? "")) return null;
  const adjustedTenths = baseTenths + BigInt(1);
  const intPart = adjustedTenths / BigInt(10);
  const decPart = adjustedTenths % BigInt(10);
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
