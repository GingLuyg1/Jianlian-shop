// KuajingZy ordinary Open API read-only preparation.
// No order creation, funds movement, credentials loader or production registry wiring.
import { createOfflineCatalogPageAudit } from './bounded-catalog-pages.mjs';

const BASE_URL = 'https://888.kuajing.one';
const BALANCE_PATH = '/api/open/v1/balance';
const MALL_PATH = '/api/open/v1/catalog/mall';
const MAX_BODY_BYTES = 256 * 1024;
const CNY = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const FILTER_NAMES = new Set(['category', 'search']);
export function buildKuajingZyMallFilterPath(filters) {
  if (!isRecord(filters)) reject('CATALOG_FILTER_INVALID');
  const keys = Object.keys(filters);
  if (keys.length !== 1 || !FILTER_NAMES.has(keys[0])) reject('CATALOG_FILTER_INVALID');
  const key = keys[0];
  const value = filters[key];
  const maxBytes = key === 'category' ? 120 : 200;
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      Buffer.byteLength(value, 'utf8') > maxBytes ||
      /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) {
    reject('CATALOG_FILTER_INVALID');
  }
  // Kept for the legacy single-response read.
  return MALL_PATH + '?' + new URLSearchParams([[key, value]]).toString();
}


export function buildKuajingZyMallPagePath({ category, search, itemId, limit = 50, cursor } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ category, search, itemId })) {
    if (value === undefined) continue;
    if (key === 'itemId') {
      if (typeof value !== 'string' || !value || value !== value.trim() ||
          Buffer.byteLength(value) > 120 || /[\u0000-\u001f\u007f]/u.test(value)) reject('CATALOG_ITEM_ID_INVALID');
      query.set(key, value);
    } else {
      query.set(key, new URLSearchParams(buildKuajingZyMallFilterPath({ [key]: value }).split('?')[1]).get(key));
    }
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) reject('CATALOG_LIMIT_INVALID');
  query.set('limit', String(limit));
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !cursor || Buffer.byteLength(cursor) > 2048 ||
        /[\u0000-\u001f\u007f]/u.test(cursor)) reject('CATALOG_CURSOR_INVALID');
    query.set('cursor', cursor);
  }
  return MALL_PATH + '?' + query.toString();
}

// One 60/minute budget shared by every paged catalog client in this process
// is stricter than both the per-account and per-IP provider limits.
export function createKuajingZyCatalogRateGuard(now = Date.now) {
  const recent = [];
  let blockedUntil = 0;
  return Object.freeze({
    claim() {
      const time = now();
      while (recent.length && recent[0] <= time - 60000) recent.shift();
      if (time < blockedUntil || recent.length >= 60) reject('CATALOG_RATE_BUDGET', 429);
      recent.push(time);
    },
    backoff(retryAfter) {
      const time = now();
      const requested = typeof retryAfter === 'string' && /^\d{1,9}$/.test(retryAfter)
        ? time + Number(retryAfter) * 1000 : Date.parse(retryAfter ?? '');
      blockedUntil = Math.max(blockedUntil, time + 60000, Number.isFinite(requested) ? requested : 0);
    },
  });
}
const catalogRateGuard = createKuajingZyCatalogRateGuard();

export class KuajingZyReadError extends Error {
  constructor(code, status = null) {
    super('KUAJINGZY_' + code);
    this.name = 'KuajingZyReadError';
    this.code = 'KUAJINGZY_' + code;
    this.status = status;
  }
}
const reject = (code, status = null) => { throw new KuajingZyReadError(code, status); };

async function parseBoundedJson(response, signal, diagnostic) {
  // Classify *where* reading failed, never carry exception messages or raw data
  // from the upstream response into logs, GitHub, or test error output.
  let reader;
  try {
    if (!response?.body || typeof response.body.getReader !== 'function') {
      reject('BODY_READER_MISSING');
    }
    reader = response.body.getReader();
  } catch (error) {
    if (error instanceof KuajingZyReadError) throw error;
    reject('BODY_READER_ACQUIRE_FAILED');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    while (true) {
      let part;
      try {
        part = await reader.read();
      } catch {
        reject(signal?.aborted ? 'REQUEST_TIMEOUT' : 'BODY_STREAM_READ_FAILED');
      }
      if (part.done) { diagnostic.bodyEnded(); break; }
      if (!(part.value instanceof Uint8Array)) reject('BODY_CHUNK_INVALID');
      diagnostic.bodyChunk(part.value.byteLength);
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) reject('RESPONSE_TOO_LARGE');
      try {
        text += decoder.decode(part.value, { stream: true });
      } catch {
        reject('BODY_UTF8_INVALID');
      }
    }
    try {
      text += decoder.decode();
    } catch {
      reject('BODY_UTF8_INVALID');
    }
  } finally {
    // A cleanup failure must not disguise the original diagnostic stage.
    try { await reader.cancel(); } catch {}
  }
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) reject('RESPONSE_INVALID');
    return parsed;
  } catch (error) {
    if (error instanceof KuajingZyReadError) throw error;
    reject('BODY_JSON_INVALID');
  }
}

/** Read-only, server-side entrypoint. Input keys never appear in returned values/errors. */
export function createKuajingZyReadonlyClient({ apiKey, fetchImpl, timeoutMs = 12000, onDiagnostics, rateGuard = catalogRateGuard } = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim() !== apiKey ||
      apiKey.length < 8 || apiKey.length > 4096 || /[\r\n\0]/.test(apiKey) ||
      typeof fetchImpl !== 'function') reject('CREDENTIALS_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) reject('TIMEOUT_INVALID');
  if (onDiagnostics !== undefined && typeof onDiagnostics !== 'function') reject('DIAGNOSTICS_INVALID');

  const authorization = 'Bearer ' + apiKey;
  let sequence = 0;
  async function get(path, { paged = false, signal } = {}) {
    if (path !== BALANCE_PATH && path !== MALL_PATH && !(paged && path.startsWith(MALL_PATH + '?')) &&
        !/^\/api\/open\/v1\/catalog\/mall\?(?:category|search)=/.test(path)) {
      reject('READONLY_PATH_NOT_ALLOWED');
    }
    const controller = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const started = performance.now();
    const elapsed = () => Math.max(0, Math.round((performance.now() - started) * 1000) / 1000);
    const timing = {
      sequence: ++sequence, operation: path === BALANCE_PATH ? 'BALANCE_GET' : 'CATALOG_GET',
      requestStartedMs: 0, responseHeadersMs: null, bodyStartedMs: null, bodyEndedMs: null,
      finishedMs: null, bytesRead: 0, httpStatus: null, stage: 'BEFORE_RESPONSE_HEADERS',
      outcome: 'ERROR', errorCode: null, dnsTcpTlsTiming: 'NOT_MEASURED',
      supplierProcessingTime: 'NOT_SEPARABLE_FROM_NETWORK', retryAttempted: false,
    };
    const diagnostic = {
      bodyChunk(bytes) { timing.bodyStartedMs ??= elapsed(); timing.bytesRead += bytes; timing.stage = 'READING_BODY'; },
      bodyEnded() { timing.bodyEndedMs = elapsed(); timing.stage = 'BODY_COMPLETE'; },
    };
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(BASE_URL + path, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: requestSignal,
      });
      timing.responseHeadersMs = elapsed();
      timing.stage = 'RESPONSE_HEADERS';
      if (Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599) timing.httpStatus = response.status;
      if (!response || typeof response.ok !== 'boolean') reject('RESPONSE_UNREADABLE');
      if (!response.ok) {
        if ([401, 403].includes(response.status)) reject('AUTH_OR_PERMISSION', response.status);
        if (response.status === 429) {
          if (paged) rateGuard.backoff(response.headers?.get('retry-after'));
          reject('RATE_LIMIT', response.status);
        }
        if (response.status === 503) reject('MAINTENANCE', response.status);
        reject('HTTP_ERROR', response.status);
      }
      let contentType;
      try {
        contentType = response.headers.get('content-type');
      } catch {
        reject('HEADERS_UNREADABLE');
      }
      if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('application/json')) {
        reject('CONTENT_TYPE_INVALID');
      }
      timing.stage = 'WAITING_BODY';
      const envelope = await parseBoundedJson(response, requestSignal, diagnostic);
      timing.stage = 'VALIDATING_ENVELOPE';
      if (Object.hasOwn(envelope, 'error') || !Object.hasOwn(envelope, 'data')) reject('UPSTREAM_CONTRACT_INVALID');
      if (!isRecord(envelope.data) && !Array.isArray(envelope.data)) reject('UPSTREAM_CONTRACT_INVALID');
      timing.outcome = 'PASS'; timing.stage = 'COMPLETE';
      return paged ? { data: envelope.data, bytesRead: timing.bytesRead } : envelope.data;
    } catch (error) {
      const safe = error instanceof KuajingZyReadError ? error
        : new KuajingZyReadError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'TRANSPORT_FAILED');
      timing.errorCode = safe.code;
      throw safe;
    } finally {
      clearTimeout(timer);
      timing.finishedMs = elapsed();
      // A broken telemetry sink must not change HTTP semantics or expose errors.
      try { onDiagnostics?.(Object.freeze({ ...timing })); } catch {}
    }
  }

  return Object.freeze({
    async readBalance() {
      const data = await get(BALANCE_PATH);
      if (!isRecord(data) || data.currency !== 'CNY') reject('BALANCE_CURRENCY_INVALID');
      const amount = typeof data.balance === 'number' && Number.isFinite(data.balance)
        ? String(data.balance) : data.balance;
      if (typeof amount !== 'string' || !CNY.test(amount)) reject('BALANCE_AMOUNT_INVALID');
      return Object.freeze({
        source: 'authenticated_kuajingzy_balance',
        checkedAt: new Date().toISOString(),
        currency: 'CNY', availableBalance: amount,
        purchaseAuthorized: false,
      });
    },
    async readMallCatalog() {
      const data = await get(MALL_PATH);
      // Existing legacy read retained only for regression, NOT for the next
      // real catalog probe. The unfiltered response exceeded 256 KiB.
      return Object.freeze({
        source: 'authenticated_kuajingzy_mall_catalog_raw',
        checkedAt: new Date().toISOString(),
        data,
        saleAuthorized: false, costVerified: false, inventoryVerified: false,
      });
    },

    async collectMallCatalog(options = {}, { signal } = {}) {
      if (!isRecord(options) || Object.keys(options).some(key => !['category', 'search', 'itemId', 'limit', 'cursor'].includes(key))) {
        reject('CATALOG_FILTER_INVALID');
      }
      const { limit = 50, cursor: firstCursor, ...filters } = options;
      buildKuajingZyMallPagePath({ ...filters, limit, cursor: firstCursor });
      const audit = createOfflineCatalogPageAudit();
      const cursors = new Set(firstCursor === undefined ? [] : [firstCursor]);
      const items = [];
      let cursor = firstCursor;
      let total = null;
      let pages = 0;
      let categories;
      const partial = (status) => Object.freeze({
        status, complete: false, fullCatalog: false, saleAuthorized: false,
        partial: Object.freeze({ items: Object.freeze(items), pages, reportedTotal: total, nextCursor: cursor ?? null }),
      });
      try {
        while (true) {
          if (signal?.aborted) return partial('PARTIAL_ABORTED');
          rateGuard.claim();
          const { data, bytesRead } = await get(
            buildKuajingZyMallPagePath({ ...filters, limit, cursor }), { paged: true, signal }
          );
          if (signal?.aborted) return partial('PARTIAL_ABORTED');
          if (!isRecord(data) || data.domain !== 'mall' || !Array.isArray(data.items) ||
              data.items.length > limit || !Number.isSafeInteger(data.total) || data.total < 0 ||
              !Object.hasOwn(data, 'nextCursor') || (data.categories !== undefined &&
                (!Array.isArray(data.categories) || cursor !== undefined))) reject('CATALOG_PAGE_CONTRACT_INVALID');
          if (total !== null && data.total !== total) reject('CATALOG_TOTAL_CHANGED');
          if (data.nextCursor !== null) {
            buildKuajingZyMallPagePath({ limit, cursor: data.nextCursor });
            if (data.nextCursor === undefined || cursors.has(data.nextCursor)) reject('CATALOG_CURSOR_NOT_ADVANCING');
          }
          const count = items.length + data.items.length;
          if (count > data.total || (data.nextCursor !== null && count >= data.total) ||
              (firstCursor === undefined && data.nextCursor === null && count !== data.total)) {
            reject('CATALOG_TOTAL_MISMATCH');
          }
          const state = audit.accept({
            pageNumber: pages + 1, bytesRead, productIds: data.items.map(item => item?.id),
            hasMore: data.nextCursor !== null,
          });
          total = data.total;
          if (pages === 0) categories = data.categories;
          pages += 1;
          items.push(...data.items);
          cursor = data.nextCursor ?? undefined;
          if (state.status === 'COMPLETE') {
            if (firstCursor !== undefined) return partial('PARTIAL_RESUMED_WINDOW');
            return Object.freeze({
              status: 'COMPLETE', complete: true, fullCatalog: Object.keys(filters).length === 0,
              saleAuthorized: false, items: Object.freeze(items), pages, total, categories,
            });
          }
          if (state.status !== 'CONTINUE') return partial(state.status);
          cursors.add(cursor);
        }
      } catch (error) {
        if (signal?.aborted) return partial('PARTIAL_ABORTED');
        if (!pages) throw error;
        const code = /^KUAJINGZY_[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'KUAJINGZY_CATALOG_FAILED';
        return Object.freeze({ ...partial('PARTIAL_FAILED'), errorCode: code });
      }
    },

    async readMallCatalogFiltered(filter) {
      const data = await get(buildKuajingZyMallFilterPath(filter));
      // A filtered result is NOT a complete directory or cost/stock authority.
      if (!isRecord(data) || data.domain !== 'mall' || !Array.isArray(data.items)) {
        reject('CATALOG_SCHEMA_UNVERIFIED');
      }
      return Object.freeze({
        source: 'authenticated_kuajingzy_mall_catalog_filtered',
        checkedAt: new Date().toISOString(),
        data,
        filtered: true, fullCatalog: false,
        saleAuthorized: false, costVerified: false, inventoryVerified: false,
      });
    },
  });
}
