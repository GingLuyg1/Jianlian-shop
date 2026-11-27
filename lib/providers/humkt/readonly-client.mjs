// Humkt (https://www.humkt.com/api-docs) strictly read-only API v1 client.
// Read-only scope ONLY: balance, categories, products, product detail, batch prices.
// Never sends POST/PUT/DELETE, never creates orders, never touches funds or production state.

const BASE_URL = 'https://www.humkt.com';
const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_PRICE_IDS = 300;
const MAX_PER_PAGE = 100;

const ALLOWED_SELLER_TYPES = new Set(['self', 'seller']);
const ALLOWED_SORTS = new Set(['default', 'price_asc', 'price_desc', 'newest', 'sales', 'stock_desc']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class HumktReadError extends Error {
  constructor(code, status = null, safeDetail = null) {
    super('HUMKT_' + code);
    this.name = 'HumktReadError';
    this.code = 'HUMKT_' + code;
    this.status = status;
    this.safeDetail = safeDetail;
  }
}

const reject = (code, status = null, safeDetail = null) => {
  throw new HumktReadError(code, status, safeDetail);
};

export function validateHumktToken(rawToken) {
  if (typeof rawToken !== 'string') reject('TOKEN_MISSING');
  const token = rawToken.trim();
  if (!token || token.length < 8 || token.length > 512 || /[\r\n\u0000-\u001f\u007f]/.test(token)) {
    reject('TOKEN_INVALID');
  }
  return token;
}

export function normalizePositiveId(raw, fieldCode = 'ID_INVALID') {
  const str = String(raw ?? '').trim();
  if (!/^[1-9][0-9]{0,14}$/.test(str)) reject(fieldCode);
  return str;
}

export function buildHumktCategoriesPath({ flat } = {}) {
  const query = new URLSearchParams();
  if (flat !== undefined) {
    query.set('flat', flat ? '1' : '0');
  }
  const qs = query.toString();
  return `${API_PREFIX}/categories${qs ? `?${qs}` : ''}`;
}

export function buildHumktProductsPath({
  q,
  categoryId,
  inStock,
  sellerType,
  sort,
  include,
  page = 1,
  perPage = 100,
} = {}) {
  const query = new URLSearchParams();
  if (q !== undefined && q !== '') {
    const trimmed = String(q).trim();
    if (Buffer.byteLength(trimmed, 'utf8') > 200 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      reject('QUERY_INVALID');
    }
    query.set('q', trimmed);
  }
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    query.set('category_id', normalizePositiveId(categoryId, 'CATEGORY_ID_INVALID'));
  }
  if (inStock !== undefined) {
    query.set('in_stock', inStock ? '1' : '0');
  }
  if (sellerType !== undefined && sellerType !== '' && sellerType !== 'all') {
    if (!ALLOWED_SELLER_TYPES.has(sellerType)) reject('SELLER_TYPE_INVALID');
    query.set('seller_type', sellerType);
  }
  if (sort !== undefined && sort !== '') {
    if (!ALLOWED_SORTS.has(sort)) reject('SORT_INVALID');
    query.set('sort', sort);
  }
  if (include !== undefined && include !== '') {
    const parts = String(include)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (part !== 'children' && part !== 'categories') reject('INCLUDE_INVALID');
    }
    if (parts.length > 0) query.set('include', parts.join(','));
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) reject('PAGE_INVALID');
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > MAX_PER_PAGE) reject('PER_PAGE_INVALID');
  query.set('page', String(page));
  query.set('per_page', String(perPage));
  return `${API_PREFIX}/products?${query.toString()}`;
}

export function buildHumktProductDetailPath(productId) {
  return `${API_PREFIX}/products/${normalizePositiveId(productId, 'PRODUCT_ID_INVALID')}`;
}

export function buildHumktPricesPath(ids) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH_PRICE_IDS) {
    reject('PRICE_IDS_INVALID');
  }
  const normalized = [];
  const seen = new Set();
  for (const id of ids) {
    const clean = normalizePositiveId(id, 'PRICE_ID_INVALID');
    if (!seen.has(clean)) {
      seen.add(clean);
      normalized.push(clean);
    }
  }
  return `${API_PREFIX}/prices?ids=${normalized.join(',')}`;
}

export function parseDecimalCny(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw.toFixed(2);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/.test(trimmed)) {
      return Number(trimmed).toFixed(2);
    }
  }
  return null;
}

async function readBoundedJson(response, signal) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) reject('RESPONSE_TOO_LARGE', response.status);
    try {
      return JSON.parse(text);
    } catch {
      reject('RESPONSE_INVALID_JSON', response.status);
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        reject(signal?.aborted ? 'REQUEST_TIMEOUT' : 'BODY_READ_FAILED', response.status);
      }
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) reject('RESPONSE_TOO_LARGE', response.status);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof HumktReadError) throw error;
    reject('BODY_DECODE_FAILED', response.status);
  }
  try {
    return JSON.parse(text);
  } catch {
    reject('RESPONSE_INVALID_JSON', response.status);
  }
}

function classifyHttpError(status, payload) {
  const errCode = isRecord(payload) && typeof payload.error === 'string' ? payload.error : null;
  if (status === 401) reject('UNAUTHORIZED', 401, errCode);
  if (status === 403) reject('FORBIDDEN', 403, errCode);
  if (status === 404) reject('NOT_FOUND', 404, errCode);
  if (status === 422) reject('VALIDATION_ERROR', 422, errCode);
  if (status === 429) reject('RATE_LIMITED', 429, errCode);
  if (status === 503) reject('UPSTREAM_UNAVAILABLE', 503, errCode);
  reject('HTTP_ERROR', status, errCode);
}

export function createHumktReadonlyClient({
  apiToken,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const token = validateHumktToken(apiToken);

  async function getJson(path, { signal } = {}) {
    if (!path.startsWith(`${API_PREFIX}/`)) reject('PATH_NOT_ALLOWED');
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject('REQUEST_ABORTED');
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch {
      reject(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    const payload = await readBoundedJson(response, controller.signal);
    if (response.status !== 200) {
      classifyHttpError(response.status, payload);
    }
    // Humkt legacy account endpoints return HTTP 200 + { code: 0, message } on business errors.
    if (isRecord(payload) && payload.code !== undefined && Number(payload.code) !== 1) {
      reject('BUSINESS_ERROR', 200, typeof payload.error === 'string' ? payload.error : 'CODE_NOT_ONE');
    }
    return payload;
  }

  return Object.freeze({
    async readBalance(options = {}) {
      const payload = await getJson(`${API_PREFIX}/balance`, options);
      const data = isRecord(payload?.data) ? payload.data : payload;
      const balance = parseDecimalCny(data?.balance ?? data?.amount);
      return Object.freeze({
        currency: 'CNY',
        balancePresent: balance !== null,
        hasPositiveBalance: balance !== null ? Number(balance) > 0 : false,
      });
    },

    async readCategories({ flat = false, signal } = {}) {
      const payload = await getJson(buildHumktCategoriesPath({ flat }), { signal });
      const rawList = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.categories)
          ? payload.categories
          : [];
      return rawList;
    },

    async readProductsPage(params = {}, options = {}) {
      const payload = await getJson(buildHumktProductsPath(params), options);
      const data = payload?.data;
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : [];
      const meta = isRecord(payload?.meta)
        ? payload.meta
        : isRecord(data)
          ? {
              current_page: data.current_page ?? params.page ?? 1,
              last_page: data.last_page ?? null,
              total: data.total ?? items.length,
            }
          : { current_page: params.page ?? 1, last_page: null, total: items.length };
      return { items, meta };
    },

    async collectProducts({
      q,
      categoryId,
      inStock = true,
      sellerType = 'self',
      sort,
      include,
      perPage = 100,
      maxPages = 10,
      signal,
    } = {}) {
      if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
        reject('MAX_PAGES_INVALID');
      }
      const items = [];
      let pagesFetched = 0;
      let totalReported = null;
      let truncated = false;

      for (let page = 1; page <= maxPages; page += 1) {
        const res = await this.readProductsPage(
          { q, categoryId, inStock, sellerType, sort, include, page, perPage },
          { signal }
        );
        pagesFetched += 1;
        if (typeof res.meta?.total === 'number') totalReported = res.meta.total;
        items.push(...res.items);

        const lastPage = Number(res.meta?.last_page ?? 0);
        if (res.items.length < perPage || (lastPage > 0 && page >= lastPage)) {
          break;
        }
        if (page === maxPages) {
          truncated = true;
        }
      }

      return { items, pagesFetched, totalReported, truncated };
    },

    async readProductDetail(productId, options = {}) {
      const payload = await getJson(buildHumktProductDetailPath(productId), options);
      return isRecord(payload?.data) ? payload.data : payload;
    },

    async readPricesBatch(ids, options = {}) {
      if (!Array.isArray(ids) || ids.length === 0) reject('PRICE_IDS_INVALID');
      const results = [];
      for (let i = 0; i < ids.length; i += MAX_BATCH_PRICE_IDS) {
        const chunk = ids.slice(i, i + MAX_BATCH_PRICE_IDS);
        const payload = await getJson(buildHumktPricesPath(chunk), options);
        const data = payload?.data;
        if (Array.isArray(data)) {
          results.push(...data);
        } else if (isRecord(data)) {
          for (const [key, val] of Object.entries(data)) {
            results.push(isRecord(val) ? { id: key, ...val } : { id: key, value: val });
          }
        }
      }
      return results;
    },
  });
}

export const HUMKT_READONLY_LIMITS = Object.freeze({
  BASE_URL,
  MAX_BATCH_PRICE_IDS,
  MAX_PER_PAGE,
});
