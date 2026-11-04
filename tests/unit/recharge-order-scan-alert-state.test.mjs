import test from 'node:test';
import assert from 'node:assert/strict';
import { durableProgressAdvanced, evaluateOrderScanCycle, initialMonitorState,
  recordMonitorCycle, buildMonitorEmail } from '../../scripts/ops/recharge-order-scan-alert-state.mjs';

const NOW = 1_800_000_000_000;
const observation = (n, fields = {}) => ({ mode: 'order_driven', cycleId: `cycle_${n}`,
  now: NOW + n * 120_000, success: true, httpStatus: 200, eligibleCount: 1,
  progressAdvanced: false, leasePresent: false, leaseUntil: null, ...fields });
function harness() {
  let state = initialMonitorState(); const emails = [];
  return { emails, get state() { return state; }, async cycle(n, fields = {}, send) {
    return recordMonitorCycle({ state, observation: observation(n, fields),
      providerHost: 'bsc-rpc.publicnode.com', save: async next => { state = structuredClone(next); },
      send: send ?? (async mail => emails.push(mail)) });
  } };
}

test('order-driven global lag alone never sends an alert', async () => {
  const h = harness();
  for (let n = 0; n < 5; n++) await h.cycle(n, { eligibleCount: 0, block_lag: '999999999999' });
  assert.equal(h.state.status, 'HEALTHY'); assert.equal(h.emails.length, 0);
});
test('RESOURCE_BUDGET with durable progress remains healthy across cycles', async () => {
  const h = harness();
  for (let n = 0; n < 5; n++) await h.cycle(n, { idleReason: 'RESOURCE_BUDGET', progressAdvanced: true, block_lag: '999999' });
  assert.equal(h.emails.length, 0); assert.equal(h.state.noProgressCycles, 0);
});
test('NO_OPEN_WINDOWS produces no alert', async () => {
  const h = harness(); await h.cycle(0, { eligibleCount: 0, idleReason: 'NO_OPEN_WINDOWS' });
  assert.equal(h.state.status, 'HEALTHY'); assert.equal(h.emails.length, 0);
});
test('HTTP503 remains FAILURE even when no open windows exist', async () => {
  const h = harness(); await h.cycle(0, { eligibleCount: 0, success: false, httpStatus: 503 });
  assert.equal(h.state.status, 'FAILURE'); assert.equal(h.emails.length, 1);
});
test('provider error with HTTP200 is still FAILURE', async () => {
  const h = harness(); await h.cycle(0, { success: false, code: 'BSC_RPC_TIMEOUT' });
  assert.equal(h.state.status, 'FAILURE'); assert.equal(h.emails.length, 1);
});
test('three normal distinct no-progress cycles cause exactly one STALLED alert', async () => {
  const h = harness(); await h.cycle(0); await h.cycle(1);
  assert.equal(h.emails.length, 0); await h.cycle(2);
  assert.equal(h.state.status, 'STALLED'); assert.equal(h.emails.length, 1);
  for (let n = 3; n < 10; n++) await h.cycle(n);
  assert.equal(h.emails.length, 1);
});
test('fast repeats and duplicate invocation IDs cannot create three normal cycles', async () => {
  const h = harness(); await h.cycle(0); await h.cycle(0);
  await h.cycle(1, { now: NOW + 100 }); await h.cycle(2, { now: NOW + 200 });
  assert.equal(h.state.noProgressCycles, 1); assert.equal(h.emails.length, 0);
});
test('progress resets the no-progress threshold', async () => {
  const h = harness(); await h.cycle(0); await h.cycle(1);
  await h.cycle(2, { progressAdvanced: true }); await h.cycle(3); await h.cycle(4);
  assert.equal(h.emails.length, 0); assert.equal(h.state.noProgressCycles, 2);
});
test('unreleased expired lease beyond one timer grace causes LEASE_STUCK', async () => {
  const h = harness(); await h.cycle(0, { leasePresent: true, leaseUntil: NOW - 120_001 });
  assert.equal(h.state.status, 'LEASE_STUCK'); assert.equal(h.emails.length, 1);
});
test('ordinary active BUSY lease does not alert or falsely recover an incident', async () => {
  const h = harness(); await h.cycle(0, { success: false, httpStatus: 503 });
  await h.cycle(1, { success: false, code: 'ORDER_SCAN_BUSY', leasePresent: true, leaseUntil: NOW + 300_000 });
  assert.equal(h.state.status, 'FAILURE'); assert.equal(h.emails.length, 1);
});
test('recovery requires progress or an empty eligible set and is sent once', async () => {
  const h = harness(); await h.cycle(0, { success: false, httpStatus: 503 });
  await h.cycle(1); assert.equal(h.emails.length, 1);
  await h.cycle(2, { progressAdvanced: true }); await h.cycle(3, { eligibleCount: 0 });
  assert.equal(h.emails.length, 2); assert.match(h.emails[1].subject, /已恢复/);
  assert.notEqual(h.emails[0].idempotencyKey, h.emails[1].idempotencyKey);
});
test('same incident and changes of failure subtype do not spam', async () => {
  const h = harness();
  await h.cycle(0, { success: false, code: 'BSC_RPC_TIMEOUT' });
  await h.cycle(1, { leasePresent: true, leaseUntil: NOW - 500_000 });
  await h.cycle(2, { success: false, code: 'BSC_RPC_PROVIDER_UNAVAILABLE' });
  assert.equal(h.emails.length, 1);
});
test('three no-progress successful cycles after failure stay in one incident until actual recovery', async () => {
  const h = harness(); await h.cycle(0, { success: false });
  await h.cycle(1); await h.cycle(2); await h.cycle(3);
  assert.equal(h.state.status, 'STALLED'); assert.equal(h.emails.length, 1);
  await h.cycle(4, { eligibleCount: 0 }); assert.equal(h.emails.length, 2);
});
test('uncertain delivery is persisted and never retried blindly', async () => {
  const h = harness(); let sends = 0;
  const send = async () => { sends++; throw Error('transport timeout with sensitive body'); };
  const r = await h.cycle(0, { success: false }, send);
  assert.equal(r.notification, 'UNCERTAIN_NO_AUTOMATIC_RETRY');
  await h.cycle(1, { success: false }, send); assert.equal(sends, 1);
  assert.equal(h.state.notificationAttempted, 'alert:1');
});
test('state write failure prevents email; no unpersisted transition is sent', async () => {
  let sends = 0;
  await assert.rejects(recordMonitorCycle({ state: initialMonitorState(), observation: observation(0, { success: false }),
    providerHost: 'bsc-rpc.publicnode.com', save: async () => { throw Error('disk'); }, send: async () => { sends++; } }));
  assert.equal(sends, 0);
});
test('durable comparison handles large exact block strings and completed windows', () => {
  const before = [{ id: 'window', last_scanned_block: '90071992547409930', complete: false }];
  assert.equal(durableProgressAdvanced(before, [{ ...before[0], last_scanned_block: '90071992547409931' }]), true);
  assert.equal(durableProgressAdvanced(before, [{ ...before[0], complete: true }]), true);
  assert.equal(durableProgressAdvanced(before, structuredClone(before)), false);
});
test('window disappearance or regressed durable progress is not success', () => {
  const before = [{ id: 'window', last_scanned_block: '100', complete: false }];
  assert.throws(() => durableProgressAdvanced(before, []));
  assert.throws(() => durableProgressAdvanced(before, [{ ...before[0], last_scanned_block: '99' }]));
});
test('email and state never incorporate raw error, identity, txhash, balance or URL secrets', async () => {
  const h = harness(), secret = 'DO_NOT_SERIALIZE_CUSTOMER_SECRET';
  await h.cycle(0, { success: false, error: secret, txHash: secret, balance: secret, user: secret, rpcUrl: secret });
  assert.ok(!JSON.stringify({ state: h.state, emails: h.emails }).includes(secret));
  assert.deepEqual(Object.keys(h.emails[0]).sort(), ['idempotencyKey', 'subject', 'text']);
  assert.throws(() => buildMonitorEmail({ kind: 'alert', reason: 'FAILURE', at: NOW }, 'https://provider/key=SECRET'));
});
test('corrupt state, non-order mode and backward observation time fail explicitly', () => {
  assert.throws(() => evaluateOrderScanCycle({ version: 0 }, observation(0)));
  assert.throws(() => evaluateOrderScanCycle(null, observation(0, { mode: 'legacy' })));
  const r = evaluateOrderScanCycle(null, observation(1));
  assert.throws(() => evaluateOrderScanCycle(r.state, observation(2, { now: NOW })));
});
