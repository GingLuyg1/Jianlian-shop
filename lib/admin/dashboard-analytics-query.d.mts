export type DashboardAnalyticsQuery =
  | { ok: true; from: string; to: string; scope: 'all'; days: number }
  | { ok: false; code: 'INVALID_PARAMETER' | 'INVALID_SCOPE' | 'INVALID_DATE' | 'REVERSED_RANGE' | 'RANGE_TOO_LONG' | 'FUTURE_DATE' };

export function shanghaiDateKey(value?: Date): string;
export function parseDashboardAnalyticsQuery(searchParams: URLSearchParams, now?: Date): DashboardAnalyticsQuery;
