import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDashboardReadCache } from '../../lib/admin/dashboard-read-cache.mjs';

test('dashboard-only rate budget admits normal independent controls but still rejects excess reads', async () => {
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../../lib/admin/dashboard-read-rate-limit.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: name => name === 'server-only' ? {} : require(name), Map, Date });
  for (let n = 0; n < 18; n++) assert.equal(exports.checkRateLimit('admin_analytics_read', 'a', 1000).allowed, true);
  const denied = exports.checkRateLimit('admin_analytics_read', 'a', 1000);
  assert.equal(denied.allowed, false);
  assert.equal(denied.response.status, 429);
  assert.equal(denied.response.headers.get('Retry-After'), '60');
  assert.equal(exports.checkRateLimit('admin_analytics_read', 'b', 1000).allowed, true);
  assert.equal(exports.checkRateLimit('admin_analytics_read', 'a', 61000).allowed, true);
});


test('identical reads share in-flight work and fresh results; TTL forces revalidation', async () => {
  let now = 0, calls = 0;
  const cache = createDashboardReadCache({ ttl: 15, now: () => now });
  let finish;
  const first = cache.read('same', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const second = cache.read('same', async () => { throw Error('duplicate'); });
  assert.equal(first, second);
  await Promise.resolve(); finish(42);
  assert.equal(await first, 42);
  assert.equal(await cache.read('same', async () => 99), 42);
  now = 15;
  assert.equal(await cache.read('same', async () => { calls++; return 43; }), 43);
  assert.equal(calls, 2);
});
test('clearing while a read is pending prevents old-session data from repopulating cache', async () => {
  const cache = createDashboardReadCache(); let finish;
  const old = cache.read('same', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.clear();
  assert.equal(await cache.read('same', async () => 'new'), 'new');
  finish('old'); await old;
  assert.equal(await cache.read('same', async () => 'wrong'), 'new');
});
test('failures are not cached and eviction bounds retained results', async () => {
  const cache = createDashboardReadCache({ maximum: 1 });
  await assert.rejects(cache.read('failed', async () => { throw Error('offline'); }));
  assert.equal(await cache.read('failed', async () => 'recovered'), 'recovered');
  await cache.read('other', async () => 2);
  assert.equal(await cache.read('failed', async () => 'fresh'), 'fresh');
});
test('only read-only RPC transport is used after normal administrator authorization', () => {
  for (const file of ['analytics','products']) {
    const source = readFileSync(new URL('../../app/api/admin/dashboard/'+file+'/route.ts',import.meta.url),'utf8');
    assert.ok(source.indexOf('await requireApiAdmin()') < source.indexOf('getSupabaseServiceRoleClient()'));
    assert.match(source, /\{ get: true \}/);
    assert.match(source, /abortSignal\(AbortSignal\.timeout\(8_000\)\)/);
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/);
    if (file === 'products') {
      assert.match(source, /\.\.\.\(productId \? \{ p_product_id: productId \} : \{\}\)/);
      assert.doesNotMatch(source, /p_product_id: productId \|\| null/);
    }
  }
});
