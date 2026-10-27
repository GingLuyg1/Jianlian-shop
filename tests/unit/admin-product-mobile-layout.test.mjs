import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("mobile product filters scroll without collapsing the real product table", async () => {
  const source = await read("app/admin/products/page.tsx");
  assert.match(source, /CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto[^"\n]*md:overflow-hidden/);
  assert.match(source, /<div className="flex min-h-\[240px\] min-w-0 flex-1 flex-col md:min-h-0">\s*<AdminSyncedHorizontalScroller>/);
  assert.match(source, /min-w-\[1560px\]/);
});

test("mobile layout keeps native wide-table scrolling and bidirectional bottom-rail sync", async () => {
  const source = await read("components/admin/AdminSyncedHorizontalScroller.tsx");
  assert.match(source, /overflow-x-auto overflow-y-auto overscroll-x-contain/);
  assert.match(source, /data-admin-horizontal-rail/);
  assert.match(source, /railRef\.current\.scrollLeft = viewportRef\.current\.scrollLeft/);
  assert.match(source, /viewportRef\.current\.scrollLeft = railRef\.current\.scrollLeft/);
  assert.match(await read("app/admin/products/page.tsx"), /sticky right-0 z-10 bg-white/);
});
