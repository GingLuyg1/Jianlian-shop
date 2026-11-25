export const POSTGREST_PAGE_SIZE = 1000;

export type PaginatedQueryResult<T> = {
  data: T[] | null;
  error: { code?: string; message?: string; details?: string; hint?: string } | null;
  count?: number | null;
};

/**
 * Loops `.range(from, to)` in PostgREST-safe chunks (<= 1000 rows per request)
 * so tables exceeding Supabase's default 1000-row cap are never silently truncated.
 */
export async function selectAllPaginated<T = Record<string, unknown>>(
  buildPageQuery: (from: number, to: number) => PromiseLike<PaginatedQueryResult<T>>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<{
  rows: T[];
  error: PaginatedQueryResult<T>["error"];
  totalCount: number | null;
  truncated: boolean;
  queryCount: number;
}> {
  const pageSize = Math.min(POSTGREST_PAGE_SIZE, Math.max(1, Math.trunc(options.pageSize ?? POSTGREST_PAGE_SIZE)));
  const maxRows = Math.max(pageSize, Math.trunc(options.maxRows ?? 20000));
  const rows: T[] = [];
  let totalCount: number | null = null;
  let queryCount = 0;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const end = Math.min(offset + pageSize - 1, maxRows - 1);
    queryCount += 1;
    const result = await buildPageQuery(offset, end);
    if (result.error) {
      return { rows: [], error: result.error, totalCount, truncated: false, queryCount };
    }
    if (typeof result.count === "number" && totalCount === null) {
      totalCount = result.count;
    }
    const batch = Array.isArray(result.data) ? result.data : [];
    rows.push(...batch);

    if (batch.length < end - offset + 1) {
      return { rows, error: null, totalCount: totalCount ?? rows.length, truncated: false, queryCount };
    }
    if (totalCount !== null && rows.length >= totalCount) {
      return { rows, error: null, totalCount, truncated: false, queryCount };
    }
  }

  const truncated = totalCount !== null ? rows.length < totalCount : rows.length >= maxRows;
  return { rows, error: null, totalCount, truncated, queryCount };
}

export function chunkArray<T>(items: readonly T[], chunkSize = 200): T[][] {
  const size = Math.max(1, Math.trunc(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function formatShanghaiDateKey(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getShanghaiTodayStartIso(now: Date = new Date()): string {
  const dateKey = formatShanghaiDateKey(now);
  return new Date(`${dateKey}T00:00:00+08:00`).toISOString();
}

export function getShanghaiDayBoundsIso(dateKey: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  const end = new Date(`${dateKey}T23:59:59.999+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
