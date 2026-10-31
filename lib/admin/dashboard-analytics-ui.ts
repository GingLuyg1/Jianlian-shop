export type DashboardAnalytics = {
  version: 2;
  completeness: "complete";
  timezone: "Asia/Shanghai";
  from: string;
  to: string;
  summary: {
    revenueCny: string;
    rechargeCny: string;
    ordersCreated: number;
    ordersCreatedCurrentlyPaid: number;
    pv: number;
    uv: number;
  };
  daily: Array<{
    date: string;
    revenueCny: string;
    rechargeCny: string;
    ordersCreated: number;
    pv: number;
    dailyUv: number;
  }>;
  channelRevenueCny: Array<{ channel: string; amountCny: string }>;
  channels: Array<{
    channel: string;
    currency: string;
    initiated: number;
    successful: number;
    exceptions: number;
    failed: number;
    expired: number;
    closed: number;
    receivedAmount: string;
  }>;
};

const money = /^\d+(?:\.\d{1,6})?$/;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
function decimalUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
}

export function parseDashboardAnalytics(value: unknown, from: string, to: string): DashboardAnalytics {
  const envelope = value as { ok?: unknown; data?: unknown } | null;
  const data = envelope?.data as Partial<DashboardAnalytics> | undefined;
  if (envelope?.ok !== true || !data || data.version !== 2 || data.completeness !== "complete" ||
      data.timezone !== "Asia/Shanghai" || data.from !== from || data.to !== to ||
      !data.summary || !Array.isArray(data.daily) || !Array.isArray(data.channels) || !Array.isArray(data.channelRevenueCny)) {
    throw new Error("统计结果不完整或日期不匹配，请重试。");
  }
  const s = data.summary;
  if (!money.test(s.revenueCny ?? "") || !money.test(s.rechargeCny ?? "") ||
      !count(s.ordersCreated) || !count(s.ordersCreatedCurrentlyPaid) || !count(s.pv) || !count(s.uv) ||
      s.ordersCreatedCurrentlyPaid > s.ordersCreated ||
      data.daily.some((row) => !dateKey.test(row.date) || !money.test(row.revenueCny) ||
        !money.test(row.rechargeCny) || !count(row.ordersCreated) || !count(row.pv) || !count(row.dailyUv)) ||
      data.channels.some((row) => typeof row.channel !== "string" || typeof row.currency !== "string" ||
        !count(row.initiated) || !count(row.successful) || !count(row.exceptions) ||
        !count(row.failed) || !count(row.expired) || !count(row.closed) ||
        row.successful > row.initiated || row.exceptions > row.initiated ||
        row.exceptions !== row.failed + row.expired + row.closed || !money.test(row.receivedAmount)) ||
      data.channelRevenueCny.some((row) => typeof row.channel !== "string" || !money.test(row.amountCny))) {
    throw new Error("统计字段校验失败，未展示可能不完整的数据。");
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = (end - start) / 86_400_000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 365 || data.daily.length !== days ||
      data.daily.some((row, index) => row.date !== new Date(start + index * 86_400_000).toISOString().slice(0, 10)) ||
      data.daily.reduce((sum, row) => sum + decimalUnits(row.revenueCny), BigInt(0)) !== decimalUnits(s.revenueCny) ||
      data.daily.reduce((sum, row) => sum + decimalUnits(row.rechargeCny), BigInt(0)) !== decimalUnits(s.rechargeCny) ||
      data.daily.reduce((sum, row) => sum + row.ordersCreated, 0) !== s.ordersCreated ||
      data.daily.reduce((sum, row) => sum + row.pv, 0) !== s.pv) {
    throw new Error("每日明细与汇总不一致，未展示可能不完整的数据。");
  }
  return data as DashboardAnalytics;
}

export function formatDashboardMoney(value: string, currency: "CNY" | "USDT" = "CNY") {
  if (!money.test(value)) return "—";
  const [whole, fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return currency === "CNY" ? `¥${grouped}.${fraction.padEnd(2, "0")}` : `${grouped}.${fraction.padEnd(2, "0")} USDT`;
}

export function chartNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
