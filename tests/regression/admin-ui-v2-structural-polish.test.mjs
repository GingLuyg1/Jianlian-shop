import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Admin shell shares sidebar, main offset, and content padding tokens", () => {
  const layout = file("components/admin/AdminLayout.tsx");
  const topbar = file("components/admin/AdminTopBar.tsx");
  const pageShell = file("components/admin/AdminPageShell.tsx");

  assert.match(layout, /--admin-sidebar-width:204px/);
  assert.match(layout, /--admin-main-offset:204px/);
  assert.match(layout, /--admin-content-padding-x:16px/);
  assert.match(layout, /w-\[var\(--admin-main-offset\)\]/);
  assert.doesNotMatch(layout, /h-\[var\(--admin-header-height\)\] w-4/);
  assert.doesNotMatch(layout, /pr-4 lg:flex/);
  assert.match(topbar, /padding-inline:var\(--admin-content-padding-x\)/);
  assert.match(pageShell, /padding-inline:var\(--admin-content-padding-x\)/);
});

test("Dashboard uses compact status and task structures without fabricated data", () => {
  const dashboard = file("app/admin/page.tsx");
  const metrics = file("components/admin/dashboard/AdminDashboardMetricCards.tsx");

  assert.match(dashboard, /variant="v2"/);
  assert.match(dashboard, /xl:grid-cols-\[2fr_1fr\]/);
  assert.match(dashboard, /<AdminMetricValueCard[\s\S]*?compact/);
  assert.match(dashboard, /gap-px bg-\[var\(--admin-v2-border\)\]/);
  assert.match(metrics, /compact \? "min-h-\[68px\]"/);
  assert.doesNotMatch(dashboard + metrics, /Math\.random|mock(?:Data|Metric|Trend)/i);
});

test("Email delivery status filter is a compact horizontally scrollable segmented control", () => {
  const deliveries = file("app/admin/notifications/email-deliveries/page.tsx");

  assert.match(deliveries, /aria-label="邮件状态筛选" className="shrink-0 overflow-x-auto"/);
  assert.match(deliveries, /inline-flex min-w-max items-center gap-1/);
  assert.match(deliveries, /inline-flex h-8 items-center/);
  assert.match(deliveries, /border-blue-200 bg-\[var\(--admin-v2-selected\)\]/);
  assert.doesNotMatch(deliveries, /active \? "bg-\[var\(--admin-v2-primary\)\] font-medium text-white"/);
});

test("Detail drawers own their scroll and payment and recharge share one information grammar", () => {
  const detail = file("components/admin/v2/AdminDetail.tsx");
  const payments = file("components/admin/payments/AdminPaymentRecordsPage.tsx");

  assert.match(detail, /h-dvh[\s\S]*overflow-hidden/);
  assert.match(detail, /DialogPrimitive\.Overlay className="fixed inset-0 z-50/);
  assert.match(detail, /DialogPrimitive\.Content[\s\S]*v2Styles\.scope[\s\S]*z-\[60\][\s\S]*isolate[\s\S]*bg-white/);
  assert.match(detail, /sticky top-0 z-10/);
  assert.match(detail, /data-admin-detail-scroll/);
  assert.match(detail, /overscroll-contain overflow-y-auto overflow-x-hidden bg-slate-50/);
  assert.match(payments, /DrawerSummaryItem/);
  assert.match(payments, /function DetailGroup[\s\S]*border border-\[var\(--admin-v2-border\)\] bg-white/);
  assert.match(payments, /function CallbackRecords[\s\S]*border border-\[var\(--admin-v2-border\)\] bg-white/);
  assert.match(payments, /title="关键字段"/);
  assert.match(payments, /title="关联业务"/);
  assert.match(payments, /isRechargePage \? <DetailGroup title="金额与汇率"/);
  assert.match(payments, /: <DetailGroup title="金额与费率"/);
  assert.match(payments, /title="状态与审计"/);
});

test("Shared list rhythm keeps compact filters and 48px rows", () => {
  const list = file("components/admin/v2/AdminList.tsx");
  const shell = file("components/admin/AdminPageShell.tsx");

  assert.match(shell, /mb-4 flex shrink-0/);
  assert.match(list, /px-3 py-2\.5 sm:px-4/);
  assert.match(list, /adminListRowClass = "h-12/);
  assert.doesNotMatch(list, /hover:scale/);
});
