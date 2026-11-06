import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKuajingZyMallPagePath, createKuajingZyCatalogRateGuard, createKuajingZyReadonlyClient,
} from '../../lib/providers/kuajingzy/readonly-client.mjs';
import {
  auditKuajingZyMallOrder, calculateKuajingZyExpectedAmount, classifyKuajingZyMallSubmit,
  freezeKuajingZyMallRequest, matchesKuajingZyFrozenRequest,
} from '../../lib/providers/kuajingzy/mall-order-contract.mjs';
import { decideKuajingZyOfflineContinuation } from '../../lib/providers/kuajingzy/offline-purchase-policy.mjs';

const page = (ids, total, nextCursor) => Response.json({
  data: { domain: 'mall', items: ids.map(id => ({ id })), total, nextCursor },
});
function client(fetchImpl, rateGuard = createKuajingZyCatalogRateGuard()) {
  return createKuajingZyReadonlyClient({ apiKey: 'synthetic-only-api-key', fetchImpl, rateGuard });
}

test('mall collector defaults to 50, encodes official filters, and advances only by nextCursor', async () => {
  const calls = [];
  const supplier = client(async (raw, init) => {
    const url = new URL(raw);
    calls.push(url);
    assert.equal(init.method, 'GET');
    assert.equal(url.searchParams.get('limit'), '50');
    return calls.length === 1 ? page(['A'], 2, 'opaque+/=') : page(['B'], 2, null);
  });
  const result = await supplier.collectMallCatalog({ category: '礼品卡', itemId: 'A+B' });
  assert.equal(calls[0].searchParams.get('category'), '礼品卡');
  assert.equal(calls[0].searchParams.get('itemId'), 'A+B');
  assert.equal(calls[1].searchParams.get('cursor'), 'opaque+/=');
  assert.equal(result.complete, true);
  assert.equal(result.fullCatalog, false);
  assert.deepEqual(result.items.map(item => item.id), ['A', 'B']);
  assert.throws(() => buildKuajingZyMallPagePath({ limit: 201 }), /LIMIT_INVALID/);
  assert.throws(() => buildKuajingZyMallPagePath({ limit: 0 }), /LIMIT_INVALID/);
});

test('aborted and resumed windows cannot masquerade as a full directory', async () => {
  const controller = new AbortController();
  let calls = 0;
  const supplier = client(async () => {
    if (++calls === 1) return page(['A'], 2, 'next');
    controller.abort();
    return page(['B'], 2, null);
  });
  const partial = await supplier.collectMallCatalog({}, { signal: controller.signal });
  assert.equal(partial.status, 'PARTIAL_ABORTED');
  assert.equal(partial.items, undefined);
  assert.deepEqual(partial.partial.items.map(item => item.id), ['A']);
  assert.equal(partial.partial.nextCursor, 'next');
  const resumed = await supplier.collectMallCatalog({ cursor: 'next' });
  assert.equal(resumed.status, 'PARTIAL_RESUMED_WINDOW');
  assert.equal(resumed.fullCatalog, false);
});

test('repeated cursor, total drift, duplicate IDs and oversized later pages isolate accepted pages', async () => {
  const badPages = [
    [() => page(['B'], 3, 'next'), 'CATALOG_CURSOR_NOT_ADVANCING'],
    [() => page(['B'], 4, null), 'CATALOG_TOTAL_CHANGED'],
    [() => page(['A', 'C'], 3, null), 'CATALOG_DUPLICATE_PRODUCT'],
    [() => Response.json({ data: { oversized: 'x'.repeat(256 * 1024) } }), 'RESPONSE_TOO_LARGE'],
  ];
  for (const [bad, code] of badPages) {
    let count = 0;
    const result = await client(async () => ++count === 1 ? page(['A'], 3, 'next') : bad()).collectMallCatalog();
    assert.equal(result.status, 'PARTIAL_FAILED');
    assert.equal(result.errorCode, 'KUAJINGZY_' + code);
    assert.equal(result.partial.items.length, 1);
    assert.equal(result.partial.nextCursor, 'next');
    assert.equal(count, 2);
  }
});

test('fifth page is bounded and 429 backoff is honored without retry', async () => {
  let count = 0;
  const bounded = await client(async () => {
    count++;
    return page(['I' + count], 7, 'C' + count);
  }).collectMallCatalog();
  assert.equal(count, 5);
  assert.equal(bounded.status, 'PARTIAL_BOUNDED');
  let now = 1000;
  const guard = createKuajingZyCatalogRateGuard(() => now);
  for (let n = 0; n < 60; n++) guard.claim();
  assert.throws(() => guard.claim(), /CATALOG_RATE_BUDGET/);
  now += 60000;
  let requests = 0;
  const limited = client(async () => {
    requests++;
    return Response.json({}, { status: 429, headers: { 'retry-after': '90' } });
  }, guard);
  await assert.rejects(limited.collectMallCatalog(), /KUAJINGZY_RATE_LIMIT/);
  now += 60000;
  await assert.rejects(limited.collectMallCatalog(), /CATALOG_RATE_BUDGET/);
  assert.equal(requests, 1);
});

test('CNY discount multiplies precisely before upward rounding to the mill', () => {
  assert.equal(calculateKuajingZyExpectedAmount({ quantity: 3, unitPriceCny: '1.1111', memberDiscount: '0.91' }), '3.034');
  assert.equal(calculateKuajingZyExpectedAmount({ quantity: 2, unitPriceCny: '2.005', memberDiscount: '0.8' }), '3.208');
  assert.equal(calculateKuajingZyExpectedAmount({ quantity: 1, unitPriceCny: '0.0001', memberDiscount: '0.999' }), '0.001');
  for (const memberDiscount of ['1.1', '0', '90', 0.9, '1e-1']) {
    assert.throws(() => calculateKuajingZyExpectedAmount({ quantity: 1, unitPriceCny: '5', memberDiscount }));
  }
});

test('known price and balance rejections are no-debit, conflicts and 5xx do not release unknown debit', () => {
  assert.equal(classifyKuajingZyMallSubmit({ status: 409, code: 'PRICE_CHANGED' }), 'NO_DEBIT_PRICE_CHANGED');
  assert.equal(classifyKuajingZyMallSubmit({ status: 402 }), 'NO_DEBIT_INSUFFICIENT_BALANCE');
  assert.equal(classifyKuajingZyMallSubmit({ status: 409, code: 'IDEMPOTENCY_CONFLICT' }), 'CONFLICT_REVIEW');
  assert.equal(classifyKuajingZyMallSubmit({ status: 500, code: 'PRICE_CHANGED' }), 'DEBIT_UNCONFIRMED');
  assert.equal(classifyKuajingZyMallSubmit(), 'DEBIT_UNCONFIRMED');
});

test('same-key exact payload is the only recoverable unknown submit without an order ID', () => {
  const args = { key: 'local-order-item-0001', itemId: 'A', skuId: 'V', quantity: 2, expectedAmount: '1.001' };
  const saved = freezeKuajingZyMallRequest(args);
  assert.equal(saved.body, '{"itemId":"A","skuId":"V","quantity":2,"expectedAmount":1.001}');
  assert.equal(matchesKuajingZyFrozenRequest(saved, freezeKuajingZyMallRequest(args)), true);
  assert.equal(matchesKuajingZyFrozenRequest({ ...saved, body: saved.body + ' ' }, saved), false);
  const state = {
    paused: false, expectedIdentityHash: 'a'.repeat(64), storedIdentityHash: 'a'.repeat(64),
    submitMayHaveLeft: true, durableState: 'SUBMITTING', storedRequest: saved,
  };
  assert.equal(decideKuajingZyOfflineContinuation({ ...state, proposedRequest: saved }).next, 'RECOVER_SAME_REQUEST_ONLY');
  for (const changed of [{ key: 'local-order-item-0002' }, { expectedAmount: '1.002' }, { quantity: 3 }, { skuId: 'W' }, { itemId: 'B' }]) {
    const proposedRequest = freezeKuajingZyMallRequest({ ...args, ...changed });
    assert.equal(decideKuajingZyOfflineContinuation({ ...state, proposedRequest }).next, 'MANUAL_REVIEW');
  }
  assert.equal(decideKuajingZyOfflineContinuation({ ...state, externalOrderId: 'ORIGINAL', proposedRequest: saved }).next, 'QUERY_ONLY');
});

test('authoritative order audit checks identity, CNY charge, refund and each delivery line without emitting cards', () => {
  const expected = { id: 'O', itemId: 'A', skuId: 'V', quantity: 2, expectedAmount: '1.001' };
  const order = {
    ...expected, domain: 'mall', currency: 'CNY', amount: 1.001, status: 'completed',
    refund: { status: 'none', amount: 0, currency: 'CNY' }, delivery: 'SYNTHETIC-PIN-1\r\nSYNTHETIC-PIN-2',
  };
  const run = patch => auditKuajingZyMallOrder({ expected, order: { ...order, ...patch } });
  assert.equal(run({}).deliveredCount, 2);
  assert.doesNotMatch(JSON.stringify(run({})), /SYNTHETIC-PIN/);
  for (const patch of [
    { status: 'paid' }, { status: 'processing' }, { status: 'cancelled' }, { status: 'delivered' },
    { skuId: 'OTHER' }, { amount: '1.002' }, { deliveryFormat: 'html' }, { delivery: 'one' },
    { delivery: 'one\n\ntwo' }, { delivery: 'one\none' },
    { refund: { status: 'partial', amount: '0.001', currency: 'CNY' } },
    { refund: { status: 'full', amount: '1.001', currency: 'CNY' } },
    { refund: { status: 'none', amount: '0.001', currency: 'CNY' } },
  ]) assert.equal(run(patch).deliveryEligible, false);
  assert.equal(run({ status: 'cancelled', refund: { status: 'full', amount: '1.001', currency: 'CNY' } }).refundCny, '1.0010');
});