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

export function toPublicRechargeRate(row: RechargeDailyRateRow) {
  return {
    effectiveDate: row.effective_date,
    marketRate: String(row.market_rate),
    settlementRate: String(row.settlement_rate),
    source: row.source,
    effectiveAt: row.effective_at,
  };
}
