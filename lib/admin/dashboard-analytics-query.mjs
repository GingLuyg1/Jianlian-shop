const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 2000) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const piece = (type) => parts.find((part) => part.type === type)?.value;
  return `${piece('year')}-${piece('month')}-${piece('day')}`;
}

export function parseDashboardAnalyticsQuery(searchParams, now = new Date()) {
  const allowed = new Set(['from', 'to', 'scope']);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      return { ok: false, code: 'INVALID_PARAMETER' };
    }
  }
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const scope = searchParams.get('scope') ?? 'all';
  if (scope !== 'all') return { ok: false, code: 'INVALID_SCOPE' };
  const start = parseDate(from);
  const end = parseDate(to);
  if (start === null || end === null) return { ok: false, code: 'INVALID_DATE' };
  if (end < start) return { ok: false, code: 'REVERSED_RANGE' };
  if ((end - start) / DAY_MS + 1 > 365) return { ok: false, code: 'RANGE_TOO_LONG' };
  if (to > shanghaiDateKey(now)) return { ok: false, code: 'FUTURE_DATE' };
  return { ok: true, from, to, scope, days: (end - start) / DAY_MS + 1 };
}
