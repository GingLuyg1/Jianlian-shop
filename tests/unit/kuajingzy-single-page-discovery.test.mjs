import test from 'node:test';
import assert from 'node:assert/strict';
import { createKuajingZyCatalogRateGuard, createKuajingZyReadonlyClient } from '../../lib/providers/kuajingzy/readonly-client.mjs';

const key = 'synthetic-not-a-live-key';
const diagnostic = [];
function client(fetchImpl, options = {}) {
  return createKuajingZyReadonlyClient({
    apiKey: key, fetchImpl, onDiagnostics: entry => diagnostic.push(entry),
    rateGuard: createKuajingZyCatalogRateGuard(), ...options,
  });
}
const page = data => Response.json({ data: { domain: 'mall', ...data } });
const item = { id: 'SYNTHETIC-ID', name: 'Apple ID synthetic product', delivery: 'SYNTHETIC-PRIVATE-PAYLOAD' };

test('discovery makes exactly one GET even with nextCursor and sends only a selected identity to its sink', async () => {
  const requests = [];
  const privateItems = [];
  const api = client(async (raw, init) => {
    requests.push([raw, init.method]);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer ' + key);
    return page({ items: [item], total: 2, nextCursor: 'SYNTHETIC-CURSOR' });
  });
  const result = await api.discoverMallCatalogItem('Apple ID', { saveVerifiedItem: value => privateItems.push(value) });
  assert.deepEqual(requests, [['https://888.kuajing.one/api/open/v1/catalog/mall?search=Apple+ID&limit=1', 'GET']]);
  assert.deepEqual(privateItems, [{ itemId: item.id, productName: item.name }]);
  assert.deepEqual(result, { totalShape: 'NONNEGATIVE_INTEGER', nextCursorShape: 'NONEMPTY_STRING', itemIdVerified: true, errorCode: null });
  for (const value of [key, item.id, item.name, item.delivery, 'SYNTHETIC-CURSOR']) {
    assert.equal(JSON.stringify({ result, diagnostic }).includes(value), false);
  }
});

test('too large, rate limited and timed out responses stop after one request', async () => {
  const failures = [
    [() => page({ items: [], oversized: 'x'.repeat(256 * 1024) }), 'RESPONSE_TOO_LARGE'],
    [() => Response.json({ error: key }, { status: 429 }), 'RATE_LIMIT'],
    [(_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error(key)), { once: true });
    }), 'REQUEST_TIMEOUT'],
  ];
  for (const [reply, errorCode] of failures) {
    let requests = 0;
    let saved = 0;
    const api = client((...args) => { requests++; return reply(...args); }, { timeoutMs: 100 });
    await assert.rejects(api.discoverMallCatalogItem('Apple ID', { saveVerifiedItem: () => { saved++; } }),
      error => error.code === 'KUAJINGZY_' + errorCode && !String(error).includes(key));
    assert.equal(requests, 1);
    assert.equal(saved, 0);
  }
});

test('malformed, empty, mismatched, and sensitive names never reach the sink', async () => {
  const cases = [
    [{ items: [item], nextCursor: null }, 'CATALOG_PAGE_CONTRACT_INVALID'],
    [{ items: [item, item], total: 2, nextCursor: null }, 'CATALOG_PAGE_CONTRACT_INVALID'],
    [{ items: [], total: 0, nextCursor: null }, 'CATALOG_NO_MATCH'],
    [{ items: [{ ...item, name: 'Other item' }], total: 1, nextCursor: null }, 'CATALOG_ITEM_IDENTITY_UNVERIFIED'],
    [{ items: [{ ...item, name: 'Apple ID test@example.com' }], total: 1, nextCursor: null }, 'CATALOG_ITEM_IDENTITY_UNVERIFIED'],
  ];
  for (const [data, code] of cases) {
    const result = await client(() => page(data)).discoverMallCatalogItem('Apple ID', {
      saveVerifiedItem: () => assert.fail('unexpected write'),
    });
    assert.equal(result.errorCode, 'KUAJINGZY_' + code);
    assert.equal(result.itemIdVerified, false);
  }
});

test('missing and failed private sinks fail closed with no secret-bearing error', async () => {
  let calls = 0;
  const api = client(() => {
    calls++;
    return page({ items: [item], total: 1, nextCursor: null });
  });
  await assert.rejects(api.discoverMallCatalogItem('Apple ID'), /DISCOVERY_SINK_REQUIRED/);
  assert.equal(calls, 0);
  const result = await api.discoverMallCatalogItem('Apple ID', { saveVerifiedItem: () => { throw new Error(key); } });
  assert.deepEqual(result, { totalShape: 'NONNEGATIVE_INTEGER', nextCursorShape: 'NULL', itemIdVerified: false, errorCode: 'KUAJINGZY_DISCOVERY_SAVE_FAILED' });
  assert.equal(calls, 1);
});