/**
 * Sanitizes user input for PostgREST `.or(...)` filter expressions so operators
 * like `,`, `(`, `)`, `*`, `\`, `%`, `_` cannot inject extra clauses or DoS wildcards.
 */
export function sanitizePostgrestFilterTerm(raw: string, maxLength = 120): string {
  return String(raw ?? "")
    .trim()
    .slice(0, maxLength)
    .replace(/[\\%_*(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Escapes `%`, `_`, and `\` for standalone Supabase `.ilike(col, pattern)` calls.
 */
export function escapeIlikePattern(raw: string, maxLength = 120): string {
  return String(raw ?? "")
    .trim()
    .slice(0, maxLength)
    .replace(/[\\%_]/g, "\\$&");
}

/**
 * Parses a bounded integer query parameter, safely guarding against NaN, Infinity,
 * negative numbers, and extreme integer offsets.
 */
export function boundedListInteger(
  raw: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
