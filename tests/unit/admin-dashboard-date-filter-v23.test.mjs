import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../components/admin/dashboard/DashboardDateRangeFilter.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)((name) =>
  name === '@/lib/admin/dashboard-analytics-query.mjs' ? { shanghaiDateKey: () => '2026-10-11' } :
  name.startsWith('@/') ? {} : require(name), module, module.exports);
const { dashboardPreset, dashboardRangeError, dashboardRangeLabel } = module.exports;

test('Shanghai presets span exact inclusive natural days across month and year', () => {
  assert.deepEqual(dashboardPreset('today', '2026-10-11'), { kind: 'today', from: '2026-10-11', to: '2026-10-11' });
  assert.deepEqual(dashboardPreset('7', '2026-01-03'), { kind: '7', from: '2025-12-28', to: '2026-01-03' });
  assert.deepEqual(dashboardPreset('30', '2026-03-01'), { kind: '30', from: '2026-01-31', to: '2026-03-01' });
});

test('custom interval rejects invalid, reversed, future and 366-day ranges', () => {
  assert.equal(dashboardRangeError('2025-10-12', '2026-10-11', '2026-10-11'), '');
  assert.match(dashboardRangeError('2025-10-11', '2026-10-11', '2026-10-11'), /365/);
  assert.match(dashboardRangeError('2026-10-12', '2026-10-11', '2026-10-11'), /结束日期/);
  assert.match(dashboardRangeError('2026-10-11', '2026-10-12', '2026-10-11'), /未来日期/);
  assert.match(dashboardRangeError('2026-02-29', '2026-03-01', '2026-10-11'), /有效/);
});

test('each filter identifies its effective period and timezone', () => {
  assert.equal(dashboardRangeLabel({ kind: 'custom', from: '2026-01-01', to: '2026-02-01' }), '自定义 · 2026-01-01 至 2026-02-01（北京时间）');
});

test('dashboard keeps three independent ranges and hides stale responses during a range change', () => {
  const page = readFileSync(new URL('../../app/admin/page.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../../lib/admin/use-dashboard-analytics.ts', import.meta.url), 'utf8');
  for (const [state, setter, label] of [
    ['metricRange', 'setMetricRange', '核心经营指标'],
    ['trendRange', 'setTrendRange', '经营趋势'],
    ['channelRange', 'setChannelRange', '支付渠道表现'],
  ]) {
    assert.match(page, new RegExp(`value=\\{${state}\\} onChange=\\{${setter}\\}`));
    assert.match(page, new RegExp(`label="${label}"`));
  }
  assert.match(hook, /if \(current\) setState\(\{ key, data/);
  assert.match(hook, /state\.key === key \? state : \{ data: null, loading: true, error: "" \}/);
});
