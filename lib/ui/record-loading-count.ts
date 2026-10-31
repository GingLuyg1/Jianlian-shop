// Component-local, count-only hints. Never persist records or share between
// mounted account panels; never query a separate count endpoint for skeletons.
export type RecordCountHint = { count: number; savedAt: number };
const MAX_AGE = 15_000;
export function readRecordCountHint(hints: Map<number, RecordCountHint>, page: number, now = Date.now()) {
  const hint = hints.get(page);
  if (!hint || now - hint.savedAt >= MAX_AGE) { hints.delete(page); return undefined; }
  return hint.count;
}
export function rememberRecordCount(hints: Map<number, RecordCountHint>, page: number, count: number, now = Date.now()) {
  hints.delete(page);
  hints.set(page, { count: Math.max(0, Math.min(10, Math.trunc(count))), savedAt: now });
  while (hints.size > 20) hints.delete(hints.keys().next().value!);
}
