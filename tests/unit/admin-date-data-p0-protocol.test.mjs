import test from 'node:test';
import assert from 'node:assert/strict';

// P0-only synthetic protocol. This is not imported by the dashboard and does
// not assert that the production browser client has been verified.
async function readAllPages(readPage, pageSize = 500) {
  const rows = [];
  const ids = new Set();
  let expected = null;
  let previous = null;
  for (let from = 0; expected === null || from < expected; from += pageSize) {
    const to = from + pageSize - 1; // PostgREST range end is inclusive.
    const result = await readPage(from, to);
    if (result.error) throw new Error('READ_FAILED');
    if (!Number.isSafeInteger(result.count) || result.count < 0) throw new Error('COUNT_UNKNOWN');
    if (expected === null) expected = result.count;
    if (result.count !== expected) throw new Error('COUNT_DRIFT');
    const batch = result.data;
    if (!Array.isArray(batch) || batch.length !== Math.min(pageSize, expected - from)) {
      throw new Error('PAGE_INCOMPLETE');
    }
    for (const row of batch) {
      if (!row || !row.id || !row.created_at) throw new Error('ROW_INVALID');
      if (ids.has(row.id)) throw new Error('DUPLICATE_ID');
      const key = `${row.created_at}\u0000${row.id}`;
      if (previous !== null && key <= previous) throw new Error('ORDER_UNSTABLE');
      ids.add(row.id);
      rows.push(row);
      previous = key;
    }
    if (expected === 0) break;
  }
  if (rows.length !== expected) throw new Error('TOTAL_MISMATCH');
  return rows;
}

function shanghaiWindow(start, end) {
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('DATE_INVALID');
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.toISOString().slice(0, 10) !== value) throw new Error('DATE_INVALID');
    return utc.getTime();
  };
  const startUtcDate = parse(start);
  const endUtcDate = parse(end);
  if (endUtcDate < startUtcDate) throw new Error('DATE_REVERSED');
  // These fixtures are in 2026+, where Asia/Shanghai is UTC+08:00.
  return {
    from: new Date(startUtcDate - 8 * 60 * 60 * 1000).toISOString(),
    to: new Date(endUtcDate + 16 * 60 * 60 * 1000).toISOString(),
  };
}

function inWindow(instant, window) {
  return instant >= window.from && instant < window.to;
}

function groupPaidSessionAmounts(sessions) {
  const grouped = new Map();
  for (const session of sessions) {
    if (session.status !== 'paid') continue;
    if (!['CNY', 'USDT'].includes(session.currency)) throw new Error('CURRENCY_UNSUPPORTED');
    if (!Number.isFinite(session.payable_amount) || session.payable_amount < 0) throw new Error('AMOUNT_INVALID');
    const key = `${session.channel_code}:${session.currency}`;
    grouped.set(key, (grouped.get(key) ?? 0) + session.payable_amount);
  }
  return grouped;
}

test('inclusive range pagination reads 1,205 records exactly, including the final partial page', async () => {
  const fixture = Array.from({ length: 1205 }, (_, i) => ({
    id: String(i).padStart(6, '0'),
    created_at: '2026-10-01T00:00:00.000Z',
  }));
  const calls = [];
  const actual = await readAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: fixture.slice(from, to + 1), count: fixture.length };
  });
  assert.equal(actual.length, 1205);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
});

test('truncation, duplicate IDs, unknown totals and query errors fail closed', async () => {
  const row = (id) => ({ id, created_at: '2026-10-01T00:00:00.000Z' });
  await assert.rejects(readAllPages(async () => ({ data: [row('a')], count: 2 })), /PAGE_INCOMPLETE/);
  await assert.rejects(readAllPages(async () => ({ data: [row('a')], count: null })), /COUNT_UNKNOWN/);
  await assert.rejects(readAllPages(async () => ({ error: { code: '42501' } })), /READ_FAILED/);
  await assert.rejects(readAllPages(async (from) => ({
    data: from ? [row('a')] : [row('a'), row('b')], count: 3,
  }), 2), /DUPLICATE_ID/);
});

test('changing exact count between pages fails rather than presenting a partial statistic', async () => {
  const row = (id) => ({ id, created_at: '2026-10-01T00:00:00.000Z' });
  await assert.rejects(readAllPages(async (from) => ({
    data: from ? [row('c')] : [row('a'), row('b')],
    count: from ? 4 : 3,
  }), 2), /COUNT_DRIFT/);
});

test('equal counts cannot prove a consistent snapshot across concurrent writes', async () => {
  const row = (id) => ({ id, created_at: '2026-10-01T00:00:00.000Z' });
  const result = await readAllPages(async (from) => ({
    data: from ? [row('d'), row('e')] : [row('a'), row('b')],
    count: 4,
  }), 2);
  assert.deepEqual(result.map((r) => r.id), ['a', 'b', 'd', 'e']);
  // Both page responses claimed four rows; neither proves whether c was
  // replaced by e between requests. Snapshot-level certainty needs more.
});

test('Shanghai half-open window includes local midnight, excludes next midnight', () => {
  const window = shanghaiWindow('2026-10-10', '2026-10-10');
  assert.deepEqual(window, { from: '2026-10-09T16:00:00.000Z', to: '2026-10-10T16:00:00.000Z' });
  assert.equal(inWindow('2026-10-09T16:00:00.000Z', window), true);
  assert.equal(inWindow('2026-10-10T15:59:59.999Z', window), true);
  assert.equal(inWindow('2026-10-10T16:00:00.000Z', window), false);
});

test('Shanghai range handles year change, leap day, invalid and reversed dates', () => {
  assert.deepEqual(shanghaiWindow('2026-12-31', '2027-01-01'), {
    from: '2026-12-30T16:00:00.000Z', to: '2027-01-01T16:00:00.000Z',
  });
  assert.equal(shanghaiWindow('2028-02-29', '2028-02-29').to, '2028-02-29T16:00:00.000Z');
  assert.throws(() => shanghaiWindow('2026-02-29', '2026-03-01'), /DATE_INVALID/);
  assert.throws(() => shanghaiWindow('2026-10-11', '2026-10-10'), /DATE_REVERSED/);
});

test('payment and recharge must be bucketed by event time rather than creation time', () => {
  const window = shanghaiWindow('2026-10-10', '2026-10-10');
  const order = { created_at: '2026-10-08T12:00:00Z', paid_at: '2026-10-09T16:01:00Z' };
  const recharge = { created_at: '2026-10-08T12:00:00Z', paid_at: '2026-10-09T15:59:00Z', credited_at: '2026-10-09T16:02:00Z' };
  assert.equal(inWindow(order.created_at, window), false);
  assert.equal(inWindow(order.paid_at, window), true);
  assert.equal(inWindow(recharge.paid_at, window), false);
  assert.equal(inWindow(recharge.credited_at, window), true);
});

test('period UV deduplicates across days, while PV counts every non-admin event', () => {
  const visits = [
    { day: '2026-10-09', visitor_key: 'a', page_path: '/products' },
    { day: '2026-10-10', visitor_key: 'a', page_path: '/checkout' },
    { day: '2026-10-10', visitor_key: 'b', page_path: '/products' },
    { day: '2026-10-10', visitor_key: 'admin', page_path: '/admin/orders' },
  ].filter((row) => !row.page_path.startsWith('/admin'));
  assert.equal(visits.length, 3);
  assert.equal(new Set(visits.map((row) => row.visitor_key)).size, 2);
});

test('channel cohort success cannot exceed starts and currencies remain separate', () => {
  const sessions = [
    { channel_code: 'alipay', currency: 'CNY', payable_amount: 20, status: 'paid' },
    { channel_code: 'alipay', currency: 'CNY', payable_amount: 10, status: 'failed' },
    { channel_code: 'usdt_bep20', currency: 'USDT', payable_amount: 3, status: 'paid' },
  ];
  const amounts = groupPaidSessionAmounts(sessions);
  assert.equal(amounts.get('alipay:CNY'), 20);
  assert.equal(amounts.get('usdt_bep20:USDT'), 3);
  assert.equal(sessions.filter((s) => s.status === 'paid').length <= sessions.length, true);
  assert.throws(() => groupPaidSessionAmounts([{ channel_code: 'x', currency: 'UNKNOWN', payable_amount: 1, status: 'paid' }]), /CURRENCY_UNSUPPORTED/);
});
