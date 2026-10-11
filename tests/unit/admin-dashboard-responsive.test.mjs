import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { loadDashboardUi, renderDashboard } from '../helpers/admin-dashboard-ui-harness.mjs';
const source = path => readFileSync(path, 'utf8');

test('V2.2 dashboard uses four primary cards, scrollable audience strip and merged operations', () => {
  const html = renderDashboard();
  assert.match(html, /dashboard-primary-kpis/);
  assert.match(html, /dashboard-secondary-kpis/);
  assert.match(html, /dashboard-operations-grid/);
  assert.match(html, /总用户/);
  assert.match(html, /区间访客/);
  assert.doesNotMatch(html, /用户与访问概览/);
  assert.equal((html.match(/dashboard-kpi-value/g) ?? []).length, 4);
  assert.doesNotMatch(html, /aria-label="商城成交额所选区间趋势"/);
  assert.match(source('app/admin/dashboard-v21.css'), /dashboard-primary-kpis \{ grid-template-columns: repeat\(2/);
  assert.doesNotMatch(source('app/admin/page.tsx'), /min-h-\[300px\]/);
  assert.match(source('components/admin/AdminLayout.tsx'), /h-\[100dvh\] max-h-\[100dvh\]/);
});

test('recent mobile records retain every field; desktop retains table and Chinese states', () => {
  const html = renderDashboard();
  assert.match(html, /space-y-3 md:hidden/);
  assert.match(html, /hidden md:block/);
  assert.match(html, /<dt[^>]*>订单号<\/dt>/);
  assert.match(html, /synthetic-long-name@example.invalid/);
  assert.match(html, /JL_SYNTHETIC_VERY_LONG_IDENTIFIER_123456/);
  assert.match(html, /<table/);
  assert.doesNotMatch(html, />pending<|>paid</);
});

test('chart has readable mobile date labels, keyboard inspection and exact values, not zero-filled missing data', () => {
  const ui = loadDashboardUi([['payAmount'], 0]);
  const html = renderToStaticMarkup(React.createElement(ui.TrendChart, { points: [{ date: '2026-10-01', payAmount: null, rechargeAmount: 1, orderCount: 1, views: null }], loading: false }));
  assert.match(html, /preserveAspectRatio="none"/);
  assert.match(html, /tabindex="0" aria-label="支付、充值、订单与访问综合趋势折线图"|role="img" tabindex="0"/);
  assert.doesNotMatch(html, /type="range"/);
  assert.match(source('app/admin/page.tsx'), /onPointerDown=/);
  assert.match(source('app/admin/page.tsx'), /onKeyDown=/);
  assert.match(html, /—/);
  const line = ui.buildNormalizedLine([1, null, 3], 720, 220, { left: 12, right: 12, top: 16, bottom: 28 });
  assert.equal(line.points[1], null);
  assert.equal(line.paths.length, 2);
});

test('loading, error and empty records remain explicit, no fake successful data', () => {
  assert.match(renderDashboard('loading'), /aria-busy="true"/);
  assert.match(renderDashboard('error'), /控制台数据加载失败/);
  const ui = loadDashboardUi([]);
  const html = renderToStaticMarkup(React.createElement(ui.CompactTableCard, { title: '最近订单', emptyTitle: '暂无订单', headers: ['订单号'], rows: [], href: '/admin/orders', loading: false }));
  assert.match(html, /暂无订单/);
  assert.doesNotMatch(html, /<table|<dl/);
});

test('channel amounts are not truncated and shared wide tables offer keyboard scrolling', () => {
  const html = renderDashboard();
  assert.match(html, /dashboard-channel-amount/);
  assert.match(html, /dashboard-channel-stats/);
  assert.match(html, /data table, can scroll horizontally|数据表，可左右滑动/);
  assert.match(html, /break-words text-sm font-semibold tabular-nums/);
  const lists = source('components/admin/v2/AdminList.tsx');
  assert.match(lists, /宽表可左右滑动查看完整信息/);
  assert.match(lists, /role="region" aria-label="数据表，可左右滑动" tabIndex=\{0\}/);
});

test('dashboard 30-day source queries retain their filters while recent previews have stable five-row ordering', () => {
  const dataSection = text => text.replaceAll('\r\n', '\n').split('async function loadDashboardData')[1].split('export default function AdminDashboardPage')[0];
  const data = dataSection(source('app/admin/page.tsx'));
  assert.match(data, /\.from\("orders"\)[\s\S]*?\.gte\("created_at", thirtyDaysAgo\.toISOString\(\)\)/);
  assert.match(data, /\.from\("account_recharges"\)[\s\S]*?\.gte\("created_at", thirtyDaysAgo\.toISOString\(\)\)/);
  assert.match(data, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(data, /recentOrders: latestOrders \?\? \[\]/);
  assert.match(data, /recentRecharges: latestRecharges \?\? \[\]/);
  assert.match(data, /recentOrdersFailed: latestOrders === null/);
  assert.match(data, /recentRechargesFailed: latestRecharges === null/);
  assert.doesNotMatch(data, /\.(?:insert|update|upsert|delete)\(/);
});

test('chart day inspection and metric toggles update display state without network or business actions', () => {
  const updates = [];
  const ui = loadDashboardUi([['payAmount'], null], (index, value) => updates.push({ index, value }));
  const tree = ui.TrendChart({ points: [{ date: '2026-10-01', payAmount: 1, rechargeAmount: null, orderCount: 2, views: 3 }], loading: false });
  const elements = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node?.props) return;
    elements.push(node);
    walk(node.props.children);
  }
  walk(tree);
  elements.find(el => el.type === 'svg').props.onPointerDown({ currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) }, clientX: 0 });
  assert.deepEqual(updates.pop(), { index: 1, value: 0 });
  const toggles = elements.filter(el => el.type === 'button');
  toggles[0].props.onClick();
  assert.deepEqual(updates.pop(), { index: 0, value: ['payAmount'] }, 'Last series cannot be hidden');
  toggles[1].props.onClick();
  assert.deepEqual(updates.pop(), { index: 0, value: ['payAmount', 'rechargeAmount'] });
});

test('switching a selected day from 30 days to 7 days clamps the display index safely', () => {
  const ui = loadDashboardUi([['payAmount'], 29]);
  const tree = ui.TrendChart({ points: [{ date: '2026-10-01', payAmount: 123, rechargeAmount: null, orderCount: 1, views: 1 }], loading: false });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /role="tooltip"/);
  assert.doesNotMatch(html, /type="range"/);
  assert.match(html, /¥123\.00/);
});
