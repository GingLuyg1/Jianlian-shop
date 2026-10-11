import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard uses versioned date analytics for primary cards and keeps operational snapshots separate", () => {
  const dashboard = file("app/admin/page.tsx");
  const trendLabels = [
    "今日支付金额",
    "今日充值金额",
    "今日订单数",
    "今日支付成功率",
    "今日访客数",
    "今日访问量",
    "今日新增用户",
  ];
  const statusLabels = ["待处理订单", "待人工交付", "支付异常", "低库存商品", "商品总数"];

  assert.match(dashboard, /trendMetrics: \[/);
  assert.match(dashboard, /statusMetrics: \[/);
  for (const label of trendLabels) assert.match(dashboard, new RegExp(`label: "${label}"`));
  for (const label of statusLabels) assert.match(dashboard, new RegExp(`label: "${label}"`));
  assert.match(dashboard, /datedMetrics\.map/);
  assert.match(dashboard, /metricAnalytics\.data\?\.summary/);
  assert.match(dashboard, /metricSummary\.uv/);
  assert.doesNotMatch(dashboard, /data\?\.trendMetrics\.slice\(0, 4\)\.map/);
  assert.match(dashboard, /<AdminMetricTrendCard/);
  assert.match(dashboard, /statusByLabel\.get\(todo\.label\)/);
  assert.match(dashboard, /data\?\.statusMetrics\.filter\(\(metric\) => metric\.label === "支付异常"\)/);
});

test("dashboard sparklines use the selected API daily series without fabricated data", () => {
  const dashboard = file("app/admin/page.tsx");
  const cards = file("components/admin/dashboard/AdminDashboardMetricCards.tsx");

  assert.match(dashboard, /metricAnalytics\.data\?\.daily/);
  assert.match(dashboard, /chartNumber\(point\.revenueCny\)/);
  assert.match(dashboard, /chartNumber\(point\.rechargeCny\)/);
  assert.match(dashboard, /point\.ordersCreated/);
  assert.match(cards, /finiteValues\.length < 2/);
  assert.match(cards, /暂无趋势/);
  assert.doesNotMatch(dashboard + cards, /Math\.random|mock(?:Data|Metric|Trend)|固定增长率/i);
});

test("dashboard main trend uses restrained line rendering and independent scales", () => {
  const dashboard = file("app/admin/page.tsx");

  assert.match(dashboard, /各指标独立量程/);
  assert.match(dashboard, /buildNormalizedLine/);
  assert.match(dashboard, /支付、充值、订单与访问综合趋势折线图/);
  assert.match(dashboard, /strokeLinecap="round"/);
  assert.doesNotMatch(dashboard, /function Bar\(/);
  assert.doesNotMatch(dashboard, /linearGradient|radialGradient|drop-shadow/);
});

test("dashboard V2.2 keeps four primary cards and moves audience data into the horizontal metric strip", () => {
  const dashboard = file("app/admin/page.tsx");
  const cards = file("components/admin/dashboard/AdminDashboardMetricCards.tsx");
  const styles = file("app/admin/dashboard-v21.css");

  assert.match(dashboard, /dashboard-primary-kpis[\s\S]*datedMetrics\.map/);
  assert.match(dashboard, /dashboard-secondary-kpis[\s\S]*metricSummary\.uv/);
  assert.match(dashboard, /dashboard-secondary-kpis[\s\S]*data\?\.userOverview\.filter\(\(row\) => row\.label !== "管理员数量"\)\.map/);
  assert.match(dashboard, /dashboard-operations-grid/);
  assert.match(styles, /dashboard-primary-kpis \{ display: grid; grid-template-columns: repeat\(4/);
  assert.match(styles, /dashboard-primary-kpis \{ grid-template-columns: repeat\(2/);
  assert.match(styles, /dashboard-secondary-kpis \{[\s\S]*display: flex/);
  assert.match(styles, /dashboard-operations-grid \{ grid-template-columns: repeat\(5/);
  assert.match(dashboard, /overflow-x-hidden overflow-y-auto/);
  assert.match(cards, /dashboard-kpi-meta/);
  assert.doesNotMatch(cards.split('export function AdminMetricTrendCard')[1].split('export function AdminMetricValueCard')[0], /<AdminMiniTrendChart/);
  assert.match(cards, /shadow-none/);
  assert.match(cards, /var\(--admin-v2-surface-radius\)/);
  assert.match(cards, /var\(--admin-v2-primary\)/);
  assert.match(cards, /metricSurfaceClassName\(true, compact\)/);
  assert.match(cards, /metricSurfaceClassName\(false, compact\)/);
  assert.match(cards, /interactive && "group transition-colors/);
  assert.match(cards, /compact \? "hover:bg-\[var\(--admin-v2-selected\)\]" : "hover:border-blue-300"/);
});
