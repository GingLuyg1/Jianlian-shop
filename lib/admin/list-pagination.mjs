// Read-only list normalization; no database or accounting side effects.
export function boundedListInteger(value, fallback, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

export function listPagination(total, page, pageSize) {
  const count = boundedListInteger(total, 0, 0, Number.MAX_SAFE_INTEGER);
  const size = boundedListInteger(pageSize, 50, 1, 100);
  const current = boundedListInteger(page, 1, 1, 100000);
  const totalPages = Math.max(1, Math.ceil(count / size));
  return { count, totalPages, hasPrevious: current > 1, hasNext: current < totalPages };
}
