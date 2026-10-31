import test from "node:test";
import { renderDashboard } from "../helpers/admin-dashboard-ui-harness.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard separates seven real trend metrics from numeric status metrics", () => {
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
  const html = renderDashboard();
  for (const marker of ['dashboard-primary-kpis', 'dashboard-secondary-kpis', 'dashboard-operations-grid']) assert.match(html, new RegExp(marker));
  for (const label of ['商城成交额', '余额充值到账', '区间访客', '总用户', '待处理订单', '低库存商品']) assert.ok(html.includes(label), label);

});

test("dashboard sparklines use existing seven-day business series without fabricated data", () => {
  const dashboard = file("app/admin/page.tsx");
  const cards = file("components/admin/dashboard/AdminDashboardMetricCards.tsx");

  assert.match(dashboard, /const trend7 = makeTrend\(7, orders, recharges, visits, users\)/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.payAmount\)/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.rechargeAmount\)/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.orderCount\)/);
  assert.match(dashboard, /point\.paidCount \/ point\.orderCount/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.visitors\)/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.views\)/);
  assert.match(dashboard, /trend: trend7\.map\(\(point\) => point\.newUsers\)/);
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

test("dashboard metric layout is dense on desktop and bounded on mobile", () => {
  const dashboard = file("app/admin/page.tsx");
  const cards = file("components/admin/dashboard/AdminDashboardMetricCards.tsx");

  const html = renderDashboard();
  assert.match(html, /dashboard-primary-kpis/);
  const css = file('app/admin/dashboard-v21.css');
  assert.match(css, /dashboard-primary-kpis \{[^}]*grid-template-columns: repeat\(4/);
  assert.match(css, /dashboard-primary-kpis \{ grid-template-columns: repeat\(2/);
  assert.match(html, /dashboard-operations-grid/);
  assert.match(css, /dashboard-operations-grid \{ grid-template-columns: repeat\(2/);
  assert.match(dashboard, /min-w-0[\s\S]*overflow-x-hidden overflow-y-auto/);
  assert.match(cards, /grid-cols-\[minmax\(0,1fr\)_72px\]/);
  assert.match(cards, /shadow-none/);
  assert.match(cards, /var\(--admin-v2-surface-radius\)/);
  assert.match(cards, /var\(--admin-v2-primary\)/);
  assert.match(cards, /metricSurfaceClassName\(true, compact\)/);
  assert.match(cards, /metricSurfaceClassName\(false, compact\)/);
  assert.match(cards, /interactive && "group transition-colors/);
  assert.match(cards, /compact \? "hover:bg-\[var\(--admin-v2-selected\)\]" : "hover:border-blue-300"/);
});
