import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("390px dashboard has compact metrics and no incomplete final status row", () => {
  const page = source("app/admin/page.tsx");
  const cards = source("components/admin/dashboard/AdminDashboardMetricCards.tsx");

  assert.ok(page.includes("grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7"));
  assert.ok(page.includes("grid grid-cols-2 gap-px bg-[var(--admin-v2-border)] md:grid-cols-5"));
  assert.ok(page.includes('"col-span-2 md:col-span-1"'));
  assert.ok(cards.includes("grid-cols-[minmax(0,1fr)_48px]"));
  assert.ok(cards.includes("sm:grid-cols-[minmax(0,1fr)_72px]"));
  assert.ok(cards.includes("break-all text-[18px]"));
});

test("trend, channels, and recent activity offer mobile-friendly browsing", () => {
  const page = source("app/admin/page.tsx");

  assert.ok(page.includes('aria-label="经营趋势图，可横向滚动"'));
  assert.ok(page.includes("min-w-[640px] sm:min-w-0"));
  assert.ok(page.includes("左右滑动图表查看完整趋势"));
  assert.ok(page.includes("grid grid-cols-2 gap-1.5 text-center text-xs sm:grid-cols-5"));
  assert.ok(page.includes("space-y-2 sm:hidden"));
  assert.ok(page.includes("hidden min-w-0 overflow-x-auto sm:block"));
  assert.ok(page.includes("<dl key={`${title}-mobile-${index}`}>") === false);
  assert.ok(page.includes('<dl key={`${title}-mobile-${index}`} className='));
});

test("admin shell and wide tables retain touch and keyboard scrolling", () => {
  const layout = source("components/admin/AdminLayout.tsx");
  const shell = source("components/admin/AdminPageShell.tsx");
  const list = source("components/admin/v2/AdminList.tsx");
  const scroller = source("components/admin/AdminSyncedHorizontalScroller.tsx");

  assert.ok(layout.includes("h-[100dvh] max-h-[100dvh]"));
  assert.ok(shell.includes("w-full flex-wrap sm:w-auto"));
  assert.ok(list.includes('role="region" tabIndex={0}'));
  assert.ok(list.includes("min-w-[760px]"));
  assert.ok(scroller.includes("overflow-x-auto overflow-y-auto overscroll-x-contain"));
  assert.ok(scroller.includes("h-7 shrink-0"));
});
