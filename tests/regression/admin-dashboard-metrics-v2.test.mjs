import test from "node:test";
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
  assert.match(dashboard, /data\?\.trendMetrics\.map/);
  assert.match(dashboard, /<AdminMetricTrendCard/);
  assert.match(dashboard, /data\?\.statusMetrics\.map/);
  assert.match(dashboard, /<AdminMetricValueCard/);
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

  assert.match(dashboard, /grid-cols-1 gap-2 min-\[430px\]:grid-cols-2 md:grid-cols-4 xl:grid-cols-7/);
  assert.match(dashboard, /grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5/);
  assert.match(dashboard, /min-w-0[\s\S]*overflow-x-hidden overflow-y-auto/);
  assert.match(cards, /grid-cols-\[minmax\(0,1fr\)_72px\]/);
  assert.match(cards, /shadow-none/);
  assert.match(cards, /var\(--admin-v2-surface-radius\)/);
  assert.match(cards, /var\(--admin-v2-primary\)/);
});
