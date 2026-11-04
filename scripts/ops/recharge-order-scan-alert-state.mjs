// Aggregate observations only. No scanner/financial RPC, provider request or PII.
const STATES = new Set(['HEALTHY', 'FAILURE', 'STALLED', 'LEASE_STUCK']);
const need = (ok) => { if (!ok) throw Error('ORDER_MONITOR_OBSERVATION_INVALID'); };
const block = value => {
  if (value === null || value === undefined) return null;
  need(typeof value === 'string' && /^(0|[1-9]\d{0,39})$/.test(value));
  return BigInt(value);
};

// Compare the SAME pre-scan eligible windows, including ones completed by this
// invocation. Disappearing from the next dry-run list is not proof of progress.
export function durableProgressAdvanced(before, after) {
  need(Array.isArray(before) && Array.isArray(after) && before.length <= 1000 && after.length <= 1000);
  const rows = new Map(after.map(row => [row.id, row]));
  need(rows.size === after.length && new Set(before.map(row => row.id)).size === before.length);
  let advanced = false;
  for (const old of before) {
    need(typeof old.id === 'string' && rows.has(old.id));
    const next = rows.get(old.id), a = block(old.last_scanned_block), b = block(next.last_scanned_block);
    need(typeof next.complete === 'boolean');
    if (a !== null) need(b !== null && b >= a);
    if (next.complete && old.complete !== true) advanced = true;
    if (b !== null && (a === null || b > a)) advanced = true;
  }
  return advanced;
}

export function initialMonitorState() {
  return { version: 1, status: 'HEALTHY', noProgressCycles: 0, lastCycleId: null,
    lastCycleAt: null, lastCountedAt: null, episode: 0, notificationAttempted: null };
}

export function validateMonitorState(state) {
  need(state?.version === 1 && STATES.has(state.status));
  need(Number.isSafeInteger(state.noProgressCycles) && state.noProgressCycles >= 0 && state.noProgressCycles <= 3);
  need(Number.isSafeInteger(state.episode) && state.episode >= 0);
  for (const name of ['lastCycleAt', 'lastCountedAt']) need(state[name] === null || Number.isSafeInteger(state[name]) && state[name] >= 0);
  need(state.lastCycleId === null || /^[a-zA-Z0-9_-]{1,100}$/.test(state.lastCycleId));
  need(state.notificationAttempted === null || /^(alert|recovery):\d+$/.test(state.notificationAttempted));
  return Object.fromEntries(Object.keys(initialMonitorState()).map(key => [key, state[key]]));
}

export function evaluateOrderScanCycle(previous, observation) {
  const old = validateMonitorState(previous ?? initialMonitorState());
  const o = observation;
  need(o?.mode === 'order_driven' && Number.isSafeInteger(o.now) && o.now >= 0);
  need(/^[a-zA-Z0-9_-]{1,100}$/.test(o.cycleId));
  need(typeof o.success === 'boolean' && Number.isSafeInteger(o.httpStatus) && o.httpStatus >= 0 && o.httpStatus <= 599);
  need(Number.isSafeInteger(o.eligibleCount) && o.eligibleCount >= 0 && o.eligibleCount <= 1000);
  need(typeof o.progressAdvanced === 'boolean' && typeof o.leasePresent === 'boolean');
  need(o.leaseUntil === null || Number.isSafeInteger(o.leaseUntil) && o.leaseUntil >= 0);
  const cycleMs = o.cycleMs ?? 120_000, leaseMs = o.leaseMs ?? 300_000;
  need(Number.isSafeInteger(cycleMs) && cycleMs >= 1000 && Number.isSafeInteger(leaseMs) && leaseMs >= cycleMs);
  if (old.lastCycleId === o.cycleId) return { state: { ...old }, event: null, duplicate: true };
  need(old.lastCycleAt === null || o.now >= old.lastCycleAt);
  const next = { ...old, lastCycleAt: o.now, lastCycleId: o.cycleId };
  const staleLease = o.leasePresent && o.leaseUntil !== null &&
    (o.now > o.leaseUntil + cycleMs || o.leaseUntil > o.now + leaseMs + cycleMs);
  let status = 'HEALTHY';
  // HTTP/provider failures remain failures even with no eligible orders. An
  // ordinary bounded BUSY lease is observation-only, never a false recovery.
  if (staleLease) status = 'LEASE_STUCK';
  else if (o.code === 'ORDER_SCAN_BUSY' && o.leasePresent && o.leaseUntil > o.now) {
    return { state: next, event: null, duplicate: false };
  } else if (!o.success || o.httpStatus >= 400) status = 'FAILURE';
  else if (o.eligibleCount === 0 || o.progressAdvanced) {
    next.noProgressCycles = 0;
    next.lastCountedAt = null;
  } else {
    // Only distinct, normally spaced timer cycles contribute to the threshold.
    if (old.lastCountedAt === null || o.now - old.lastCountedAt >= cycleMs) {
      next.noProgressCycles = Math.min(3, old.noProgressCycles + 1);
      next.lastCountedAt = o.now;
    }
    if (next.noProgressCycles >= 3) status = 'STALLED';
    else if (old.status !== 'HEALTHY') status = old.status;
  }
  if (staleLease || !o.success || o.httpStatus >= 400) {
    next.noProgressCycles = 0;
    next.lastCountedAt = null;
  }
  next.status = status;
  let event = null;
  if (old.status === 'HEALTHY' && status !== 'HEALTHY') {
    next.episode += 1;
    event = { kind: 'alert', episode: next.episode, reason: status, at: o.now };
  } else if (old.status !== 'HEALTHY' && status === 'HEALTHY') {
    event = { kind: 'recovery', episode: next.episode, reason: 'HEALTHY', at: o.now };
  }
  // No cooldown-based resend, including a change of failure subtype within one
  // incident. global block_lag/fromBlock/toBlock are deliberately never read.
  return { state: next, event, duplicate: false };
}

export function buildMonitorEmail(event, providerHost) {
  need(['alert', 'recovery'].includes(event?.kind) && Number.isSafeInteger(event.at));
  need(typeof providerHost === 'string' && /^[a-z0-9.-]{1,253}$/.test(providerHost));
  need(STATES.has(event.reason));
  const recovered = event.kind === 'recovery';
  return {
    subject: recovered ? '[Jianlian] USDT-BEP20 自动充值扫描已恢复' : '[Jianlian] USDT-BEP20 自动充值扫描异常',
    text: [`时间：${new Date(event.at).toISOString()}`, 'scanner mode=order_driven',
      `provider host=${providerHost}`, recovered ? '自动扫描已恢复' : `state=${event.reason}`].join('\n'),
  };
}

// Persist the attempt BEFORE the network send. Uncertain delivery is not blindly
// retried next cycle. A stable provider idempotency key is supplied as well.
export async function recordMonitorCycle({ state, observation, save, send, providerHost }) {
  const result = evaluateOrderScanCycle(state, observation);
  if (result.duplicate) return { ...result, notification: 'NONE' };
  if (result.event) result.state.notificationAttempted = `${result.event.kind}:${result.event.episode}`;
  await save(result.state);
  let notification = 'NONE';
  if (result.event) {
    const email = buildMonitorEmail(result.event, providerHost);
    try {
      await send({ ...email, idempotencyKey: `usdt-order-monitor-${result.event.episode}-${result.event.kind}-${result.event.at}` });
      notification = 'SENT';
    } catch { notification = 'UNCERTAIN_NO_AUTOMATIC_RETRY'; }
  }
  return { ...result, notification };
}
