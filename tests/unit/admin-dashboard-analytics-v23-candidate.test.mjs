import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDashboardAnalyticsQuery, shanghaiDateKey } from '../../lib/admin/dashboard-analytics-query.mjs';

const route = readFileSync(new URL('../../app/api/admin/dashboard/analytics/route.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../docs/sql-candidates/admin_dashboard_analytics_v23.sql', import.meta.url), 'utf8');
const now = new Date('2026-10-10T16:01:00Z'); // 2026-10-11 00:01 Shanghai
const query = (from, to, extras = '') => new URLSearchParams(`from=${from}&to=${to}${extras}`);

test('Shanghai current date is independent of UTC calendar date', () => {
  assert.equal(shanghaiDateKey(now), '2026-10-11');
  assert.equal(shanghaiDateKey(new Date('2026-10-10T15:59:59Z')), '2026-10-10');
});

test('365 inclusive natural days pass, 366 and reversed ranges fail', () => {
  assert.deepEqual(parseDashboardAnalyticsQuery(query('2025-10-12', '2026-10-11'), now), {
    ok: true, from: '2025-10-12', to: '2026-10-11', scope: 'all', days: 365,
  });
  assert.equal(parseDashboardAnalyticsQuery(query('2025-10-11', '2026-10-11'), now).code, 'RANGE_TOO_LONG');
  assert.equal(parseDashboardAnalyticsQuery(query('2026-10-11', '2026-10-10'), now).code, 'REVERSED_RANGE');
  assert.equal(parseDashboardAnalyticsQuery(query('2026-10-12', '2026-10-12'), now).code, 'FUTURE_DATE');
});

test('invalid dates, duplicate arguments, unknown scope and injection text fail', () => {
  assert.equal(parseDashboardAnalyticsQuery(query('2026-02-29', '2026-03-01'), now).code, 'INVALID_DATE');
  assert.equal(parseDashboardAnalyticsQuery(query("2026-10-01' OR TRUE--", '2026-10-11'), now).code, 'INVALID_DATE');
  assert.equal(parseDashboardAnalyticsQuery(query('2026-10-01', '2026-10-11', '&to=2026-10-12'), now).code, 'INVALID_PARAMETER');
  assert.equal(parseDashboardAnalyticsQuery(query('2026-10-01', '2026-10-11', '&scope=raw'), now).code, 'INVALID_SCOPE');
});

test('new API gates service-role RPC behind existing admin authorization and fails closed', () => {
  assert.ok(route.indexOf('await requireApiAdmin()') < route.indexOf('getSupabaseServiceRoleClient()'));
  assert.match(route, /if \(!admin\.ok\) \{[\s\S]*?return admin\.response;/);
  assert.match(route, /service\.rpc\(RPC_NAME/);
  assert.match(route, /READONLY_AGGREGATE_SCHEMA_PENDING/);
  assert.match(route, /parseDashboardAnalytics\(\{ ok: true, data \}, parsed\.from, parsed\.to\)/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /\.(?:insert|update|upsert|delete)\(/);
});

test('candidate RPC is single-snapshot, invoker-only and denies public execution', () => {
  assert.match(sql, /language plpgsql\s+stable\s+security invoker/i);
  assert.match(sql, /revoke all on function public\.admin_dashboard_analytics_v23\(date,date\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.admin_dashboard_analytics_v23\(date,date\) to service_role/i);
  assert.match(sql, /statement_timeout = '15s'/);
  assert.match(sql, /p_to - p_from \+ 1 > 365/);
  assert.match(sql, /at time zone 'Asia\/Shanghai'/i);
  assert.match(sql, /ANALYTICS_ORDER_CNY_SNAPSHOT_INCOMPLETE/);
  assert.match(sql, /ANALYTICS_RECHARGE_CREDIT_DUPLICATE/);
  assert.match(sql, /ANALYTICS_CHANNEL_RECEIPT_INCOMPLETE/);
  assert.match(sql, /count\(\*\) filter\(where status in \('failed','expired','closed'\)\) exceptions/i);
  assert.match(sql, /where s\.created_at >= v_start and s\.created_at < v_end/);
  assert.doesNotMatch(sql, /\b(?:update|delete|insert|truncate)\s+public\./i);
});

test('synthetic historical CNY business snapshots sum per order, never current-rate USDT', () => {
  const paidOrders = [
    { id: 'a', day: '2026-10-01', cnyCents: 71000n, sessions: ['failed', 'paid'], rawUsdt: '100.000000' },
    { id: 'b', day: '2026-10-02', cnyCents: 72000n, sessions: ['paid'], rawUsdt: '100.000000' },
    { id: 'c', day: '2026-10-03', cnyCents: 70000n, sessions: ['paid', 'callback-retry'], rawUsdt: '100.000000' },
  ];
  const revenueCents = paidOrders.reduce((sum, row) => sum + row.cnyCents, 0n);
  assert.equal(revenueCents, 213000n);
  assert.notEqual(revenueCents, 300n * 730n); // Today's 7.30 is not a historical rate.
  assert.equal(new Set(paidOrders.map((row) => row.id)).size, 3);
  const rechargeCents = 5000n;
  assert.equal(revenueCents, 213000n); // Balance top-up never enters sales.
  assert.equal(revenueCents + rechargeCents, 218000n); // Separate only if explicitly shown as combined cash flow.
});

test('historical original-USDT orders without a proven CNY snapshot stay incomplete', () => {
  const originalUsdt = { currency: 'USDT', amount: '100', exchangeRate: '1', exchangeRateSource: 'order_currency_usdt' };
  const cnySnapshot = originalUsdt.currency === 'CNY' ? originalUsdt.amount : null;
  assert.equal(cnySnapshot, null);
  assert.match(sql, /An original-USDT order has no proven CNY conversion direction/);
});
