import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createOrderDrivenMonitor, createOrderScanSnapshotReader } from '../../scripts/ops/recharge-order-scan-monitor.mjs';
import { initialMonitorState } from '../../scripts/ops/recharge-order-scan-alert-state.mjs';
import { createMonitorResendSender } from '../../scripts/ops/recharge-order-scan-monitor-production.mjs';
import { patchOrderScanRunner } from '../../scripts/ops/prepare-order-scan-monitor-runner.mjs';

const URL = 'http://127.0.0.1:3001/api/internal/recharges/bep20/scan';
const body = { success: true, mode: 'order_driven', dryRun: false, headBlock: '1000000',
  finalizedBlock: '999988', fromBlock: '100', toBlock: '200', idleReason: 'RESOURCE_BUDGET' };
function fixture() {
  let state = initialMonitorState(), tick = 0;
  const mail = [], logs = [], calls = [];
  const readSnapshot = { before: async () => ({ windows: [{ id: 'test', last_scanned_block: '100', complete: false }],
    leasePresent: false, leaseUntil: null }), after: async () => ({ progressAdvanced: true, leasePresent: false, leaseUntil: null }) };
  const store = { transact: async task => task(state, async next => { state = structuredClone(next); }) };
  return { mail, logs, calls, readSnapshot, get state() { return state; }, monitor(overrides = {}) {
    return createOrderDrivenMonitor({ mode: 'order_driven', providerHost: 'bsc-rpc.publicnode.com', readSnapshot, store,
      send: async event => mail.push(event), now: () => 1_800_000_000_000 + tick++ * 120_000,
      fetchImpl: async (...args) => { calls.push(args); return Response.json(body); }, write: line => logs.push(line), ...overrides });
  } };
}

test('existing scanner POST, headers, options, and response remain intact; no extra scan', async () => {
  const f = fixture(), m = f.monitor();
  const options = { method: 'POST', headers: { 'x-internal-job-secret': 'synthetic-only' } };
  const response = await m.fetchScanner(URL, options);
  assert.deepEqual(await response.json(), body);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1], options);
  assert.equal(f.mail.length, 0); assert.equal(f.state.status, 'HEALTHY');
});
test('HTTP503 is captured once, including the old operational-failure callback', async () => {
  const f = fixture(), m = f.monitor({ fetchImpl: async () => Response.json({ success: false, code: 'BSC_RPC_TIMEOUT' }, { status: 503 }) });
  await m.fetchScanner(URL, { method: 'POST' }); await m.operationalFailure();
  assert.equal(f.mail.length, 1); assert.equal(f.state.status, 'FAILURE');
});
test('three no-progress normal invocations across fresh monitor instances alert once and recover once', async () => {
  const f = fixture(); f.readSnapshot.after = async () => ({ progressAdvanced: false, leasePresent: false, leaseUntil: null });
  for (let i = 0; i < 6; i++) await f.monitor().fetchScanner(URL, { method: 'POST' });
  assert.equal(f.state.status, 'STALLED'); assert.equal(f.mail.length, 1);
  f.readSnapshot.after = async () => ({ progressAdvanced: true, leasePresent: false, leaseUntil: null });
  await f.monitor().fetchScanner(URL, { method: 'POST' }); await f.monitor().fetchScanner(URL, { method: 'POST' });
  assert.equal(f.mail.length, 2); assert.equal(f.state.status, 'HEALTHY');
});
test('snapshot failure never fabricates progress or prevents the original scanner call', async () => {
  const f = fixture(); f.readSnapshot.before = async () => { throw Error('sensitive database diagnostic'); };
  const response = await f.monitor().fetchScanner(URL, { method: 'POST' });
  assert.equal(f.calls.length, 1); assert.equal(response.status, 200); assert.equal(f.state.status, 'FAILURE');
  assert.ok(!JSON.stringify([...f.logs, ...f.mail]).includes('sensitive'));
});
test('transport error is rethrown unchanged while monitor records only safe failure', async () => {
  const f = fixture(), error = Error('contains secret URL');
  const m = f.monitor({ fetchImpl: async () => { throw error; } });
  await assert.rejects(m.fetchScanner(URL, { method: 'POST' }), e => e === error);
  assert.equal(f.state.status, 'FAILURE'); assert.ok(!JSON.stringify(f.mail).includes(error.message));
});
test('invalid, oversized or wrong-mode response cannot pass the monitor or consume the original', async () => {
  for (const response of [new Response('not json'), new Response('x'.repeat(70000)), Response.json({ ...body, mode: 'legacy' })]) {
    const f = fixture(), original = await response.clone().text();
    const result = await f.monitor({ fetchImpl: async () => response }).fetchScanner(URL, { method: 'POST' });
    assert.equal(await result.text(), original); assert.equal(f.state.status, 'FAILURE');
  }
});
test('legacy mode delegates unchanged without order snapshots or new notifications', async () => {
  const f = fixture(); f.readSnapshot.before = async () => { throw Error('must not read'); };
  const m = f.monitor({ mode: 'legacy' });
  await m.fetchScanner(URL, { method: 'POST' }); await m.operationalFailure();
  assert.equal(f.calls.length, 1); assert.equal(f.mail.length, 0); assert.equal(m.isOrderDriven(), false);
});
test('read-only snapshot uses authoritative channel, dry-run lease and same-window durable rows', async () => {
  const calls = [], id = '00000000-0000-0000-0000-000000000001', address = '0x' + 'a'.repeat(40), token = '0x' + 'b'.repeat(40);
  const service = { from(table) {
    calls.push(['table', table]);
    const result = table === 'payment_channels' ? { public_config: { payment_address: address, token_contract: token } }
      : table === 'account_recharge_order_scan_control' ? { mode: 'order_driven', lease_until: null, lease_token: null }
      : [{ recharge_id: id, last_scanned_block: 101, complete: true }];
    const q = { select(fields) { calls.push(['select', fields]); return q; }, or() { return q; }, eq() { return q; },
      single: async () => ({ data: result }), maybeSingle: async () => ({ data: result }), in: async () => ({ data: result }) };
    return q;
  }, async rpc(name, args) { calls.push(['rpc', name, args]); return { data: { token: null,
    windows: [{ id, last_scanned_block: '100' }] } }; } };
  const r = createOrderScanSnapshotReader(service, token), before = await r.before(), after = await r.after(before);
  assert.equal(after.progressAdvanced, true);
  assert.deepEqual(calls.find(call => call[0] === 'rpc'), ['rpc', 'lease_recharge_order_scan_v1', { p_address: address, p_contract: token, p_dry_run: true }]);
  assert.deepEqual([...new Set(calls.filter(call => call[0] === 'table').map(call => call[1]))].sort(),
    ['account_recharge_order_scan_control', 'account_recharge_order_scan_progress', 'payment_channels']);
});
test('fake Resend validates fixed endpoint, safe body, one attempt and event idempotency key', async () => {
  const sent = [], email = { apiKey: 'synthetic', from: 'test@example.invalid', recipient: 'operator@example.invalid' };
  const send = createMonitorResendSender(email, async (url, options) => { sent.push({ url, options }); return new Response('', { status: 202 }); });
  await send({ subject: 'safe', text: 'safe', idempotencyKey: 'event_1' });
  assert.equal(sent.length, 1); assert.equal(sent[0].url, 'https://api.resend.com/emails');
  assert.equal(sent[0].options.headers['idempotency-key'], 'event_1');
  assert.deepEqual(JSON.parse(sent[0].options.body), { from: email.from, to: [email.recipient], subject: 'safe', text: 'safe' });
});

const anchorFixture = Buffer.from(`#!/usr/bin/env node
async function sendOperationalFailure({ stage, httpStatus = 0, code = null, error = null, }) {
  await sendAlert({category: 'scanner_operational_failure'});
}
async function runScanner() {
  const response = await fetch(
    SCANNER_URL, {method: 'POST'});
  const body = await response.json();
  if (!response.ok) { await sendOperationalFailure({}); throw Error('HTTP'); }
  const lag = 10000n;
  if (lag > MAX_LAG_BLOCKS) { await sendAlert({category: 'scanner_block_lag'}); }
  await sendAlert({category: 'existing_review_category'});
}
async function main() {
 try { await runScanner(); } catch (error) {
  console.error("SCANNER_RUNNER_FAILED=" + error.message);
 }
}
globalThis.main = main;
`);
const moduleFile = '/www/ops/jianlian-order-monitor-' + 'a'.repeat(40) + '/scripts/ops/recharge-order-scan-monitor-production.mjs';
test('pinned patch rejects unknown source, nonimmutable module path and missing anchors', () => {
  const sha = createHash('sha256').update(anchorFixture).digest('hex');
  assert.throws(() => patchOrderScanRunner(anchorFixture, moduleFile), /IDENTITY/);
  assert.throws(() => patchOrderScanRunner(anchorFixture, '/tmp/untrusted.mjs', sha), /PATH/);
  const changed = Buffer.from(anchorFixture.toString().replace('lag > MAX_LAG_BLOCKS', 'false'));
  assert.throws(() => patchOrderScanRunner(changed, moduleFile, createHash('sha256').update(changed).digest('hex')), /ANCHOR/);
});
test('patched runner keeps its one POST and independent review alerts, suppresses old global lag', async () => {
  const sha = createHash('sha256').update(anchorFixture).digest('hex');
  const patched = patchOrderScanRunner(anchorFixture, moduleFile, sha).replace(/^import .*;$/m, '');
  const legacy = [], f = fixture(), monitor = f.monitor();
  const context = { createProductionOrderScanMonitor: () => monitor, SCANNER_URL: URL, MAX_LAG_BLOCKS: 600n,
    fetch: () => { throw Error('must use monitored existing call'); }, sendAlert: async event => legacy.push(event.category),
    console: { error() {} } };
  vm.runInNewContext(patched, context); await context.main();
  assert.equal(f.calls.length, 1); assert.equal(f.mail.length, 0);
  assert.deepEqual(legacy, ['existing_review_category']);
});

// Regression: Production Node 20 may not expose a native WebSocket. The
// standalone monitor must follow the application's installed 'ws' transport.
test('Production Supabase monitor explicitly supplies ws Realtime transport on Node 20', () => {
  const runtime = readFileSync(new URL('../../scripts/ops/recharge-order-scan-monitor-production.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../lib/supabase/service-role.ts', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.dependencies.ws, 'ws must be a production dependency');
  assert.match(app, /realtime:\s*\{\s*transport:\s*ws\s+as\s+any/);
  assert.match(runtime, /const\s+wsTransport\s*=\s*require\(['"]ws['"]\)/);
  assert.match(runtime, /const service = createClient\(url\.origin, key, \{[\s\S]*?realtime:\s*\{\s*transport:\s*wsTransport\s*\}/);
});
