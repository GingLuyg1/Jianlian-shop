import assert from "node:assert/strict";
import test from "node:test";
import { readRecordCountHint, rememberRecordCount } from "../../lib/ui/record-loading-count.ts";

test("record hints are page-specific and remember exact current-page 0/2/3/4 counts", () => {
  const hints = new Map();
  assert.equal(readRecordCountHint(hints, 1, 100), undefined);
  for (const [page, count] of [[1, 2], [2, 3], [3, 4], [4, 0]]) rememberRecordCount(hints, page, count, 100);
  assert.deepEqual([1, 2, 3, 4, 5].map((page) => readRecordCountHint(hints, page, 101)), [2, 3, 4, 0, undefined]);
});
test("record hints expire after 15s, never infer a count for another page", () => {
  const hints = new Map();
  rememberRecordCount(hints, 1, 4, 100);
  assert.equal(readRecordCountHint(hints, 1, 15_099), 4);
  assert.equal(readRecordCountHint(hints, 1, 15_100), undefined);
  assert.equal(hints.size, 0);
});
test("successful refresh replaces counts; invalidation removes them; panels are isolated", () => {
  const recharge = new Map(), balance = new Map();
  rememberRecordCount(recharge, 1, 4, 100);
  rememberRecordCount(recharge, 1, 2, 101);
  assert.equal(readRecordCountHint(recharge, 1, 102), 2);
  assert.equal(readRecordCountHint(balance, 1, 102), undefined);
  recharge.delete(1);
  assert.equal(readRecordCountHint(recharge, 1, 102), undefined);
});
test("record hints are bounded by page size and retain at most 20 pages", () => {
  const hints = new Map();
  for (let page = 1; page <= 21; page++) rememberRecordCount(hints, page, 99, 100);
  assert.equal(hints.size, 20);
  assert.equal(readRecordCountHint(hints, 1, 101), undefined);
  assert.equal(readRecordCountHint(hints, 21, 101), 10);
});
