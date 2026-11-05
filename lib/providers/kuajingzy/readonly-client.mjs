// KuajingZy ordinary Open API read-only preparation.
// No order creation, funds movement, credentials loader or production registry wiring.
const BASE_URL = 'https://888.kuajing.one';
const BALANCE_PATH = '/api/open/v1/balance';
const MALL_PATH = '/api/open/v1/catalog/mall';
const MAX_BODY_BYTES = 256 * 1024;
const CNY = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class KuajingZyReadError extends Error {
  constructor(code, status = null) {
    super('KUAJINGZY_' + code);
    this.name = 'KuajingZyReadError';
    this.code = 'KUAJINGZY_' + code;
    this.status = status;
  }
}
const reject = (code, status = null) => { throw new KuajingZyReadError(code, status); };

async function parseBoundedJson(response) {
  if (!response?.body?.getReader) reject('RESPONSE_UNREADABLE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) reject('RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof KuajingZyReadError) throw error;
    reject('RESPONSE_UNREADABLE');
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) reject('RESPONSE_INVALID');
    return parsed;
  } catch (error) {
    if (error instanceof KuajingZyReadError) throw error;
    reject('RESPONSE_INVALID');
  }
}

/** Read-only, server-side entrypoint. Input keys never appear in returned values/errors. */
export function createKuajingZyReadonlyClient({ apiKey, fetchImpl, timeoutMs = 12000 } = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim() !== apiKey ||
      apiKey.length < 8 || apiKey.length > 4096 || /[\r\n\0]/.test(apiKey) ||
      typeof fetchImpl !== 'function') reject('CREDENTIALS_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) reject('TIMEOUT_INVALID');

  const authorization = 'Bearer ' + apiKey;
  async function get(path) {
    if (path !== BALANCE_PATH && path !== MALL_PATH) reject('READONLY_PATH_NOT_ALLOWED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(BASE_URL + path, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (!response || typeof response.ok !== 'boolean') reject('RESPONSE_UNREADABLE');
      if (!response.ok) {
        if ([401, 403].includes(response.status)) reject('AUTH_OR_PERMISSION', response.status);
        if (response.status === 429) reject('RATE_LIMIT', response.status);
        if (response.status === 503) reject('MAINTENANCE', response.status);
        reject('HTTP_ERROR', response.status);
      }
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
        reject('CONTENT_TYPE_INVALID');
      }
      const envelope = await parseBoundedJson(response);
      if (Object.hasOwn(envelope, 'error') || !Object.hasOwn(envelope, 'data')) reject('UPSTREAM_CONTRACT_INVALID');
      if (!isRecord(envelope.data) && !Array.isArray(envelope.data)) reject('UPSTREAM_CONTRACT_INVALID');
      return envelope.data;
    } catch (error) {
      if (error instanceof KuajingZyReadError) throw error;
      reject('TRANSPORT_FAILED');
    } finally { clearTimeout(timer); }
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
      // Schema/availability/unit-price mapping must be approved from a real,
      // redacted authenticated catalog observation. Raw data stays server-side.
      return Object.freeze({
        source: 'authenticated_kuajingzy_mall_catalog_raw',
        checkedAt: new Date().toISOString(),
        data,
        saleAuthorized: false, costVerified: false, inventoryVerified: false,
      });
    },
  });
}
