import { auditKuajingZyMallOrder, freezeKuajingZyMallRequest, matchesKuajingZyFrozenRequest, parseKuajingZyCny } from './mall-order-contract.mjs';
import { cny, formatCny, need, assertKuajingZyPurchaseGates, KUAJINGZY_PURCHASE_RELEASE_ENABLED } from './purchase-policy.mjs';

const ORIGIN = 'https://888.kuajing.one';
const CREATE = '/api/open/v1/orders/mall';
const privateDelivery = new WeakMap();
export const KUAJINGZY_DURABLE_SUBMIT = Symbol('kuajingzy durable submit boundary');
const orderId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x);

const safeProviderCode = x => typeof x === 'string' && /^[A-Z0-9_]{1,60}$/.test(x) ? x : null;

export class KuajingZyPurchaseError extends Error {
  constructor(classification, code, status = null, providerCode = null) {
    super('KUAJINGZY_' + code);
    this.name = 'KuajingZyPurchaseError';
    this.classification = classification;
    this.code = code;
    this.httpStatus = status;
    this.providerCode = safeProviderCode(providerCode);
    // No raw error cause, response, request headers or provider message.
  }
}
const problem = (classification, code, status, providerCode = null) => { throw new KuajingZyPurchaseError(classification,code,status,providerCode); };

function normalizeOrder(order, expectedId) {
  need(order && orderId(order.id) && (!expectedId || order.id === expectedId)
    && order.domain === 'mall' && /^[A-Za-z0-9_-]{1,120}$/.test(order.itemId ?? '')
    && (order.skuId == null || typeof order.skuId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(order.skuId))
    && Number.isSafeInteger(order.quantity) && order.quantity >= 1 && order.quantity <= 20
    && order.currency === 'CNY' && ['paid','processing','completed','cancelled'].includes(order.status), 'ORDER_SCHEMA_INVALID');
  const total = parseKuajingZyCny(cny(order.amount));
  const refund = parseKuajingZyCny(cny(order.refund?.amount));
  need(total > 0n && order.refund?.currency === 'CNY'
    && (order.refund.status === 'none' && refund === 0n
      || order.refund.status === 'partial' && refund > 0n && refund < total
      || order.refund.status === 'full' && refund === total), 'REFUND_SCHEMA_INVALID');
  const content = typeof order.delivery === 'string' ? order.delivery.trim() : '';
  const lines = content ? content.split(/\r?\n/).map(x=>x.trim()) : [];
  return Object.freeze({ orderCode:order.id, itemId:order.itemId, skuId:order.skuId ?? null,
    quantity:order.quantity, currency:'CNY', unitPrice:total % BigInt(order.quantity) === 0n
      ? formatCny(total / BigInt(order.quantity)) : null, totalPrice:formatCny(total),
    status:order.status, refundStatus:order.refund.status, refundAmount:formatCny(refund),
    deliveryPresent:Boolean(content), deliveryCount:lines.length });
}
export function classifyKuajingZyOrder(result) {
  if (result.refundStatus !== 'none') return 'REFUNDED';
  return {paid:'ORDER_CREATED',processing:'ORDER_PROCESSING',completed:'ORDER_COMPLETED',cancelled:'ORDER_CANCELLED'}[result.status];
}

async function boundedJson(response) {
  need(response?.body?.getReader, 'RESPONSE_UNREADABLE');
  need(response.headers?.get('content-type')?.toLowerCase().includes('application/json'), 'RESPONSE_CONTENT_TYPE');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8',{fatal:true});
  let text = '', bytes = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength; need(bytes <= 262144, 'RESPONSE_TOO_LARGE');
      text += decoder.decode(value,{stream:true});
    }
    text += decoder.decode(); return JSON.parse(text);
  } finally { try { await reader.cancel(); } catch {} }
}

/** Node-only transport. Production composes this exclusively in purchase-server.ts.
 * No automatic retry, configurable origin, redirect following or raw diagnostics.
 */
export function createKuajingZyPurchaseClient({ apiKey, fetchImpl, timeoutMs = 12000, environment = process.env,
  releaseGate = KUAJINGZY_PURCHASE_RELEASE_ENABLED } = {}) {
  need(typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node, 'SERVER_ONLY');
  need(!environment.NODE_DEBUG && !environment.NODE_DEBUG_NATIVE, 'NODE_DEBUG_FORBIDDEN');
  need(!environment.NEXT_PUBLIC_KUAJINGZY_API_KEY, 'PUBLIC_KEY_CONFIG_FORBIDDEN');
  need(typeof apiKey === 'string' && apiKey.length >= 8 && apiKey.length <= 4096
    && apiKey === apiKey.trim() && !/[\r\n\0]/.test(apiKey) && typeof fetchImpl === 'function', 'CREDENTIALS_REQUIRED');
  need(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30000, 'TIMEOUT_INVALID');
  const attempted = new Set();
  async function request(path, init, submitted) {
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response = await fetchImpl(ORIGIN+path,{...init,headers:{Authorization:'Bearer '+apiKey,Accept:'application/json',...init.headers},
        cache:'no-store',redirect:'error',signal:controller.signal});
      if (response.status >= 500) problem('DEBIT_UNCONFIRMED','UPSTREAM_UNAVAILABLE',response.status);
      const body = await boundedJson(response);
      if (!response.ok || body?.error) {
        const code = body?.error?.code;
        if (submitted && code === 'PRICE_CHANGED' && [409,422].includes(response.status)) problem('NO_DEBIT_PRICE_CHANGED','PRICE_CHANGED',response.status,code);
        if (submitted && code === 'INSUFFICIENT_BALANCE' && response.status === 402) problem('NO_DEBIT_INSUFFICIENT_BALANCE','INSUFFICIENT_BALANCE',402,code);
        if (code === 'IDEMPOTENCY_CONFLICT' && response.status === 409) problem('IDEMPOTENCY_CONFLICT','IDEMPOTENCY_CONFLICT',409,code);
        // Official docs do not identify an atomic no-debit OUT_OF_STOCK code.
        // Never invent that guarantee from an arbitrary 422 message.
        problem('DEBIT_UNCONFIRMED','PROVIDER_ERROR_UNVERIFIED',response.status,code);
      }
      need(body && Object.hasOwn(body,'data'), 'RESPONSE_SCHEMA_INVALID');
      return body.data;
    } catch (e) {
      if (e instanceof KuajingZyPurchaseError) throw e;
      problem(submitted ? 'DEBIT_UNCONFIRMED' : 'PRE_SUBMIT_FAILED', submitted ? 'SUBMIT_RESPONSE_UNVERIFIED' : 'QUERY_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async purchase(frozen, authority, binding) {
      if (authority !== KUAJINGZY_DURABLE_SUBMIT) problem('PRE_SUBMIT_FAILED','DURABLE_CAPABILITY_REQUIRED');
      const cap=assertKuajingZyPurchaseGates({env:environment,releaseGate,binding});
      need(!environment.NODE_DEBUG && !environment.NODE_DEBUG_NATIVE,'NODE_DEBUG_FORBIDDEN');
      let canonical;
      try {
        const b = JSON.parse(frozen.body);
        need(Object.keys(b).every(k=>['itemId','skuId','quantity','expectedAmount'].includes(k)), 'REQUEST_FIELDS_INVALID');
        const total=parseKuajingZyCny(cny(b.expectedAmount));
        need(b.itemId===binding.productId && (b.skuId ?? null)===binding.sku
          && Number.isSafeInteger(b.quantity) && b.quantity>=1 && b.quantity<=20
          && total<=cap && total<=parseKuajingZyCny(binding.maxUnitCost)*BigInt(b.quantity),'TRANSPORT_COST_OR_IDENTITY_GATE');
        canonical = freezeKuajingZyMallRequest({key:frozen.key,itemId:b.itemId,skuId:b.skuId,quantity:b.quantity,
          expectedAmount:formatCny(parseKuajingZyCny(cny(b.expectedAmount))).slice(0,-1)});
        need(matchesKuajingZyFrozenRequest(frozen,canonical), 'REQUEST_DRIFT');
      } catch { problem('PRE_SUBMIT_FAILED','FROZEN_REQUEST_INVALID'); }
      if (attempted.has(frozen.key)) problem('PRE_SUBMIT_FAILED','POST_ALREADY_ATTEMPTED');
      attempted.add(frozen.key); // Even a synchronous throw cannot permit retry.
      const data = await request(CREATE,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':canonical.key},body:canonical.body},true);
      try { return normalizeOrder(data.order); }
      catch { problem('DEBIT_UNCONFIRMED','CREATE_RESPONSE_UNVERIFIED'); }
    },
    async getOrder(id, expected) {
      need(orderId(id), 'ORDER_ID_INVALID');
      const order = await request('/api/open/v1/orders/'+encodeURIComponent(id),{method:'GET'},false);
      try {
        const result = normalizeOrder(order,id);
        const audit = auditKuajingZyMallOrder({expected:{id,...expected},order});
        if (audit.deliveryEligible) privateDelivery.set(result,order.delivery.trim().split(/\r?\n/).map(x=>x.trim()).join('\n'));
        return result;
      } catch { problem('PRE_SUBMIT_FAILED','QUERY_RESPONSE_UNVERIFIED'); }
    },
  });
}

// The sole secret boundary: validated authoritative GET -> existing private RPC.
// Return values/errors are independent of the secret and the cache is consumed.
export async function commitKuajingZyPrivateDelivery(result, commit) {
  const content = privateDelivery.get(result); privateDelivery.delete(result);
  need(typeof content === 'string' && typeof commit === 'function', 'PRIVATE_DELIVERY_NOT_VERIFIED');
  try { await commit(content); }
  catch { problem('PRE_SUBMIT_FAILED','PRIVATE_COMMIT_FAILED'); }
}
