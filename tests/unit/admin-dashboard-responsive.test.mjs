import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadDashboardUi, renderDashboard } from '../helpers/admin-dashboard-ui-harness.mjs';
const source = path => readFileSync(path, 'utf8');

test('390px metrics use two columns and incomplete grids have no empty border-colored slot', () => {
  const html = renderDashboard();
  assert.match(html, /grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7/);
  assert.match(html, /\[&amp;&gt;\*:last-child\]:col-span-2/);
  assert.equal((html.match(/grid shrink-0 min-h/g) ?? []).length, 3);
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
  const ui = loadDashboardUi([]);
  const html = renderToStaticMarkup(React.createElement(ui.TrendChart, { points: [{ date: '2026-10-01', payAmount: null, rechargeAmount: 1, orderCount: 1, views: null }], loading: false }));
  assert.match(html, /preserveAspectRatio="none"/);
  assert.match(html, /aria-label="查看趋势日期"/);
  assert.match(html, /aria-valuetext="2026-10-01"/);
  assert.match(html, /aria-live="polite"/);
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
  assert.match(html, /grid-cols-2 gap-2 text-left text-xs sm:grid-cols-3/);
  assert.match(html, /break-words text-sm font-semibold tabular-nums/);
  const lists = source('components/admin/v2/AdminList.tsx');
  assert.match(lists, /宽表可左右滑动查看完整信息/);
  assert.match(lists, /role="region" aria-label="数据表，可左右滑动" tabIndex=\{0\}/);
});

test('dashboard queries, aggregation and business rules match the Production base digest', () => {
  // SHA-256 of app/admin/page.tsx before the component at Production commit 4575d802.
  const baseDigest = '47e5de1ca8f0d848603f172dc40c516e0985bd8aa1ce3f5a00b31ad4a7700766';
  const prefix = text => text.replaceAll('\r\n', '\n').split('export default function AdminDashboardPage')[0];
  const digest = createHash('sha256').update(prefix(source('app/admin/page.tsx'))).digest('hex');
  assert.equal(digest, baseDigest);
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
  elements.find(el => el.type === 'input').props.onChange({ target: { value: '0' } });
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
  assert.match(html, /aria-valuetext="2026-10-01"/);
  assert.match(html, /value="0"/);
  assert.match(html, /¥123\.00/);
});
