import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDashboardAnalyticsQuery } from '../../lib/admin/dashboard-analytics-query.mjs';

const route = readFileSync(new URL('../../app/api/admin/dashboard/products/route.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../components/admin/dashboard/DashboardProductData.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');

test('product read API authorizes before service role and never writes', () => {
  assert.ok(route.indexOf('await requireApiAdmin()') < route.indexOf('getSupabaseServiceRoleClient()'));
  assert.match(route, /if \(!admin\.ok\) \{[\s\S]*?return admin\.response;/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /\.(?:insert|update|upsert|delete)\(/);
  assert.match(route, /\.rpc\("admin_product_dashboard_v25_snapshot"/);
  assert.match(route, /validPayload\(result\.data/);
  assert.match(route, /商品统计结果不完整/);
});

test('product dates are Shanghai paid-time boundaries and incomplete data fails closed', () => {
  const sql = readFileSync(new URL('../../docs/sql-candidates/admin_product_dashboard_v25_snapshot.sql', import.meta.url), 'utf8');
  assert.match(sql, /at time zone 'Asia\/Shanghai'/);
  assert.match(sql, /o\.paid_at >= v_start and o\.paid_at < v_end/);
  assert.match(sql, /o\.payment_status = 'paid' and o\.paid_at is null/);
  assert.match(sql, /'amountCny', null/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /set statement_timeout = '8s'/);
  assert.match(sql, /'date', d\.day::date::text/);
  assert.match(sql, /p_page is null/);
  assert.match(sql, /^begin;[\s\S]*revoke all on function[\s\S]*commit;\s*$/m);
  assert.match(sql, /revoke all on function[\s\S]*?from public, anon, authenticated/);
  const now = new Date('2026-10-10T16:01:00Z');
  assert.equal(parseDashboardAnalyticsQuery(new URLSearchParams('from=2025-10-12&to=2026-10-11'), now).ok, true);
  assert.equal(parseDashboardAnalyticsQuery(new URLSearchParams('from=2025-10-11&to=2026-10-11'), now).code, 'RANGE_TOO_LONG');
});

test('product UI labels unsupported metrics instead of synthetic zeros', () => {
  assert.match(ui, /const unavailable = "暂未接入"/);
  assert.match(ui, /成交额待分摊核对/);
  assert.match(ui, /role="tooltip"/);
  assert.match(ui, /onPointerMove=/);
  assert.match(ui, /onKeyDown=/);
  assert.match(page, /<DashboardProductData \/>/);
  assert.match(page, /point\.dailyUv/);
});
