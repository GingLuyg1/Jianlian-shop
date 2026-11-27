import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHumktCategoriesPath,
  buildHumktPricesPath,
  buildHumktProductDetailPath,
  buildHumktProductsPath,
  createHumktReadonlyClient,
  HumktReadError,
} from '../../lib/providers/humkt/readonly-client.mjs';
import {
  buildPlatformSummary,
  normalizeHumktProduct,
  renderComparisonMarkdown,
  runProbe,
} from '../../scripts/probe-humkt-readonly.mjs';

const makeJsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('humkt readonly client and probe contain strictly GET readonly paths and zero order/POST mutations', () => {
  const clientSrc = readFileSync(join(process.cwd(), 'lib/providers/humkt/readonly-client.mjs'), 'utf8');
  const probeSrc = readFileSync(join(process.cwd(), 'scripts/probe-humkt-readonly.mjs'), 'utf8');

  assert.doesNotMatch(clientSrc, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(clientSrc, /\/api\/v1\/(?:orders|sms\/orders|mail\/orders|smm\/orders|proxy\/orders|cards\/orders|games\/orders)/);
  assert.doesNotMatch(probeSrc, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});

test('humkt readonly path builders validate inputs and enforce documented bounds', () => {
  assert.equal(buildHumktCategoriesPath({ flat: true }), '/api/v1/categories?flat=1');
  assert.equal(
    buildHumktProductsPath({ q: 'gmail', sellerType: 'self', inStock: true, page: 2, perPage: 50 }),
    '/api/v1/products?q=gmail&in_stock=1&seller_type=self&page=2&per_page=50'
  );
  assert.equal(buildHumktProductDetailPath('12345'), '/api/v1/products/12345');
  assert.equal(buildHumktPricesPath(['10', '20', '10']), '/api/v1/prices?ids=10,20');

  assert.throws(() => buildHumktProductsPath({ perPage: 101 }), { code: 'HUMKT_PER_PAGE_INVALID' });
  assert.throws(() => buildHumktProductsPath({ sellerType: 'bad' }), { code: 'HUMKT_SELLER_TYPE_INVALID' });
  assert.throws(() => buildHumktPricesPath([]), { code: 'HUMKT_PRICE_IDS_INVALID' });
  assert.throws(
    () => buildHumktPricesPath(Array.from({ length: 301 }, (_, i) => String(i + 1))),
    { code: 'HUMKT_PRICE_IDS_INVALID' }
  );
});

test('humkt readonly client rejects HTTP 200 with code=0 legacy business failure and never leaks token', async () => {
  const calls = [];
  const fakeToken = 'test_secret_token_do_not_leak_987654';
  const client = createHumktReadonlyClient({
    apiToken: fakeToken,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, auth: init.headers.Authorization, redirect: init.redirect });
      return makeJsonResponse({ code: 0, message: 'out of stock' }, 200);
    },
  });

  await assert.rejects(() => client.readProductsPage({ sellerType: 'self' }), (err) => {
    assert.ok(err instanceof HumktReadError);
    assert.equal(err.code, 'HUMKT_BUSINESS_ERROR');
    assert.ok(!String(err.message).includes(fakeToken));
    return true;
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].auth, `Bearer ${fakeToken}`);
  assert.ok(!calls[0].url.includes(fakeToken));
});

test('humkt readonly probe collects pages, normalizes standard self products, and renders markdown comparison', async () => {
  const fakeToken = 'test_readonly_token_123456';
  const fetchImpl = async (url) => {
    if (url.includes('/api/v1/products')) {
      return makeJsonResponse({
        code: 1,
        data: [
          { id: 101, name: 'Gmail 2FA 稳定号', price: '4.20', in_stock: 80, seller_type: 'self', is_group: false, is_selectable: false, buyer_info: null },
          { id: 102, name: 'TikTok 自选粉丝号', price: '58.00', in_stock: 5, seller_type: 'self', is_group: false, is_selectable: true, buyer_info: null },
          { id: 103, name: 'Apple ID 美区小火箭', price: '16.50', in_stock: 30, seller_type: 'seller', is_group: false, is_selectable: false, buyer_info: null },
        ],
        meta: { current_page: 1, last_page: 1, total: 3 },
      });
    }
    if (url.includes('jianlian.shop/api/catalog/products')) {
      return makeJsonResponse({
        products: [
          { id: 'local-1', name: 'Gmail 新号-2FA-长期使用', price: 37.05, category_path: '数字/社媒账号/Gmail' },
        ],
      });
    }
    return makeJsonResponse({ code: 0 }, 404);
  };

  const result = await runProbe({
    apiToken: fakeToken,
    options: { mode: 'compare', sellerType: 'self', maxPages: 2 },
    fetchImpl,
  });

  assert.equal(result.operation, 'HUMKT_READONLY_COMPARE');
  assert.equal(result.purchaseExecuted, false);
  assert.equal(result.productionChanged, false);
  assert.equal(result.humktCount, 3);
  assert.equal(result.standardAutoEligibleCount, 1);
  assert.equal(result.localCount, 1);
  assert.match(result.markdown, /Gmail \/ Google/);
  assert.match(result.markdown, /¥4\.20/);
  assert.match(result.markdown, /¥37\.05/);
  assert.ok(!result.markdown.includes(fakeToken));

  const normalized = normalizeHumktProduct({ id: 200, name: 'Telegram 成品号', price: '6.50', in_stock: 12, seller_type: 'self' });
  assert.equal(normalized.standardAutoEligible, true);
  assert.equal(buildPlatformSummary([normalized])[0].key, 'telegram');
});
