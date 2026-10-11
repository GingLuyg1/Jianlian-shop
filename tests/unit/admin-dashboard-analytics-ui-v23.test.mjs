import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../lib/admin/dashboard-analytics-ui.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { parseDashboardAnalytics, formatDashboardMoney } = module.exports;

function fixture() {
  return { ok: true, data: {
    version: 2, completeness: 'complete', timezone: 'Asia/Shanghai', from: '2026-10-01', to: '2026-10-02',
    summary: { revenueCny: '71.00', rechargeCny: '0.00', ordersCreated: 2, ordersCreatedCurrentlyPaid: 1, pv: 3, uv: 2 },
    daily: [
      { date: '2026-10-01', revenueCny: '0.00', rechargeCny: '0.00', ordersCreated: 1, pv: 1, dailyUv: 1 },
      { date: '2026-10-02', revenueCny: '71.00', rechargeCny: '0.00', ordersCreated: 1, pv: 2, dailyUv: 2 },
    ],
    channelRevenueCny: [{ channel: 'usdt_trc20', amountCny: '71.00' }],
    channels: [
      { channel: 'usdt_trc20', currency: 'USDT', initiated: 2, successful: 1, exceptions: 1, failed: 1, expired: 0, closed: 0, receivedAmount: '10.000000' },
    ],
  } };
}

test('valid complete range preserves CNY business and raw USDT separately', () => {
  const result = parseDashboardAnalytics(fixture(), '2026-10-01', '2026-10-02');
  assert.equal(formatDashboardMoney(result.summary.revenueCny), '¥71.00');
  assert.equal(formatDashboardMoney(result.channels[0].receivedAmount, 'USDT'), '10.000000 USDT');
});

test('incomplete dates, mismatch, wrong endpoint, or duplicate day fail closed', () => {
  for (const change of [
    x => x.data.daily.pop(),
    x => { x.data.daily[1].date = '2026-10-01'; },
    x => { x.data.summary.revenueCny = '70.00'; },
    x => { x.data.summary.pv = 4; },
    x => { x.data.to = '2026-10-03'; },
  ]) {
    const value = fixture(); change(value);
    assert.throws(() => parseDashboardAnalytics(value, '2026-10-01', '2026-10-02'));
  }
});

test('pending is not counted as exception, and breakdown must reconcile', () => {
  const pending = fixture();
  pending.data.channels[0].initiated = 3;
  assert.equal(parseDashboardAnalytics(pending, '2026-10-01', '2026-10-02').channels[0].exceptions, 1);
  pending.data.channels[0].exceptions = 2;
  assert.throws(() => parseDashboardAnalytics(pending, '2026-10-01', '2026-10-02'));
});
