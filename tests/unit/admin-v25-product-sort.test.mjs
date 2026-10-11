import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_DASHBOARD_SORTS, sortProductDashboardRows } from '../../lib/admin/product-dashboard-sort.mjs';

const samples = [
  { id: 'b', name: '乙', updatedAt: '2026-10-10', paidOrders: 2, units: 8 },
  { id: 'a', name: '甲', updatedAt: '2026-10-10', paidOrders: 2, units: 4 },
  { id: 'd', name: '丁', updatedAt: '2026-10-09', paidOrders: 0, units: 0 },
  { id: 'c', name: '丙', updatedAt: '2026-10-08', paidOrders: 7, units: 8 },
];

test('paid order and unit sorting supports both directions with stable id ties', () => {
  assert.deepEqual(sortProductDashboardRows(samples, 'paidOrders_desc').map((row) => row.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(sortProductDashboardRows(samples, 'paidOrders_asc').map((row) => row.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(sortProductDashboardRows(samples, 'units_desc').map((row) => row.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(sortProductDashboardRows(samples, 'units_asc').map((row) => row.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(samples.map((row) => row.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(PRODUCT_DASHBOARD_SORTS, ['recent', 'name', 'paidOrders_desc', 'paidOrders_asc', 'units_desc', 'units_asc']);
});

test('full matching set is sorted before paging without duplicate ids', () => {
  const many = Array.from({ length: 24 }, (_, index) => ({
    id: String(index).padStart(3, '0'), name: `商品${index}`, updatedAt: '2026-10-10',
    paidOrders: index % 4, units: (index * 3) % 7,
  }));
  const ranked = sortProductDashboardRows(many, 'paidOrders_desc');
  const pages = [ranked.slice(0, 10), ranked.slice(10, 20), ranked.slice(20, 30)].flat();
  assert.deepEqual(pages.map((row) => row.id), ranked.map((row) => row.id));
  assert.equal(new Set(pages.map((row) => row.id)).size, 24);
  assert.ok(ranked.slice(0, 10).every((row) => row.paidOrders >= ranked[10].paidOrders));
});

test('read-only route delegates full-result sort and page to one SQL snapshot', () => {
  const route = readFileSync(new URL('../../app/api/admin/dashboard/products/route.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../../docs/sql-candidates/admin_product_dashboard_v25_snapshot.sql', import.meta.url), 'utf8');
  assert.match(route, /\.rpc\("admin_product_dashboard_v25_snapshot"/);
  assert.match(sql, /with filtered as materialized/);
  assert.match(sql, /row_number\(\) over \(order by/);
  assert.match(sql, /f\.id asc/);
  assert.match(sql, /'total', \(select count\(\*\) from filtered\)/);
  assert.doesNotMatch(route, /\.(?:insert|update|upsert|delete)\(/);
});
