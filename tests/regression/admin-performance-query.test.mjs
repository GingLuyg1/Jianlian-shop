import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "app/api/admin/system/performance/route.ts"), "utf8");

test("admin performance list and summary apply category after select", () => {
  const listQuery = source.match(/let listQuery = ([\s\S]*?);\r?\n\r?\n    listQuery = applyFilters/)?.[1] ?? "";
  const summaryQuery = source.match(/let summaryQuery = ([\s\S]*?);\r?\n\r?\n    summaryQuery = applyFilters/)?.[1] ?? "";
  const performanceQuery = /client\s*\.from\("system_error_events"\)\s*\.select\([\s\S]*?\)\s*\.eq\("category", "performance"\)/;

  assert.match(listQuery, performanceQuery);
  assert.match(summaryQuery, performanceQuery);
  assert.doesNotMatch(source, /\.from\("system_error_events"\)\s*\.eq\("category", "performance"\)/);
});
