import { createHash } from 'node:crypto';

function requireContract(condition, code) {
  if (!condition) throw new Error('KUAJINGZY_' + code);
}

function decimal(value, fractionDigits, integerDigits = 12) {
  requireContract(typeof value === 'string' && /^(0|[1-9]\d*)(?:\.\d+)?$/.test(value), 'DECIMAL_INVALID');
  const [integer, fraction = ''] = value.split('.');
  requireContract(integer.length <= integerDigits && fraction.length <= fractionDigits, 'DECIMAL_INVALID');
  const scale = 10n ** BigInt(fraction.length);
  return { units: BigInt(integer + fraction), scale };
}

export function parseKuajingZyCny(value) {
  try {
    const { units, scale } = decimal(value, 4);
    return units * (10000n / scale);
  } catch {
    throw new Error('KUAJINGZY_CNY_AMOUNT_INVALID');
  }
}

export function calculateKuajingZyExpectedAmount({ quantity, unitPriceCny, memberDiscount }) {
  requireContract(Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 5000, 'QUANTITY_INVALID');
  const price = decimal(unitPriceCny, 4);
  const discount = decimal(memberDiscount, 12, 1);
  requireContract(price.units > 0n && discount.units > 0n && discount.units <= discount.scale, 'PRICE_OR_DISCOUNT_INVALID');
  const denominator = price.scale * discount.scale;
  const numerator = BigInt(quantity) * price.units * discount.units * 1000n;
  const mills = (numerator + denominator - 1n) / denominator;
  const amount = (mills / 1000n) + '.' + String(mills % 1000n).padStart(3, '0');
  parseKuajingZyCny(amount);
  return amount;
}

function validText(value, maxBytes) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() &&
    Buffer.byteLength(value) <= maxBytes && !/[\u0000-\u001f\u007f]/u.test(value);
}

// For the existing private-card SKU path. The saved wire payload and hash must
// be persisted in the same transaction as the existing purchase claim.
export function freezeKuajingZyMallRequest({ key, itemId, skuId, quantity, expectedAmount }) {
  requireContract(validText(key, 120) && key.length >= 8 && /^[\x21-\x7e]+$/.test(key), 'IDEMPOTENCY_KEY_INVALID');
  requireContract(validText(itemId, 120) && (skuId === undefined || validText(skuId, 80)), 'ORDER_IDENTITY_INVALID');
  requireContract(Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 5000, 'QUANTITY_INVALID');
  requireContract(parseKuajingZyCny(expectedAmount) > 0n && /^\d+\.\d{3}$/.test(expectedAmount), 'EXPECTED_AMOUNT_INVALID');
  const identity = JSON.stringify({ itemId, ...(skuId === undefined ? {} : { skuId }), quantity });
  // The API field is numeric. Emit the validated decimal directly, without
  // converting the frozen amount through a binary floating point number.
  const body = identity.slice(0, -1) + ',"expectedAmount":' + expectedAmount + '}';
  const fingerprint = createHash('sha256').update(JSON.stringify([key, body])).digest('hex');
  return Object.freeze({ key, body, fingerprint });
}

export function matchesKuajingZyFrozenRequest(stored, proposed) {
  if (!stored || !proposed || !validText(stored.key, 120) ||
      typeof stored.body !== 'string' || !/^[a-f0-9]{64}$/.test(stored.fingerprint)) return false;
  const hash = createHash('sha256').update(JSON.stringify([stored.key, stored.body])).digest('hex');
  return hash === stored.fingerprint && stored.key === proposed.key &&
    stored.body === proposed.body && stored.fingerprint === proposed.fingerprint;
}

export function classifyKuajingZyMallSubmit({ status, code } = {}) {
  if (status === 409 && code === 'PRICE_CHANGED') return 'NO_DEBIT_PRICE_CHANGED';
  if (status === 402) return 'NO_DEBIT_INSUFFICIENT_BALANCE';
  if (status === 409) return 'CONFLICT_REVIEW';
  return 'DEBIT_UNCONFIRMED';
}

function readOrderAmount(value) {
  // API examples show JSON numbers. Convert only bounded values whose scaled
  // integer is safe, and retain strict decimal text for all comparisons.
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  const units = parseKuajingZyCny(normalized);
  requireContract(typeof value !== 'number' || units <= BigInt(Number.MAX_SAFE_INTEGER), 'ORDER_AMOUNT_UNSAFE');
  return units;
}

const money = units => (units / 10000n) + '.' + String(units % 10000n).padStart(4, '0');

// The caller supplies the already authenticated GET result. This summary
// never contains card secrets and cannot perform fulfillment on its own.
export function auditKuajingZyMallOrder({ expected, order } = {}) {
  const closed = code => Object.freeze({ code, deliveryEligible: false });
  if (!expected || !order || order.domain !== 'mall' || !validText(expected.id, 40) ||
      !validText(expected.itemId, 120) || !Number.isSafeInteger(expected.quantity) || expected.quantity < 1 ||
      order.id !== expected.id || order.itemId !== expected.itemId || (order.skuId ?? null) !== (expected.skuId ?? null) ||
      order.quantity !== expected.quantity || order.currency !== 'CNY') return closed('ORDER_IDENTITY_MISMATCH');
  if (!['paid', 'processing', 'completed', 'cancelled'].includes(order.status)) return closed('ORDER_STATUS_UNKNOWN');
  try {
    const debit = readOrderAmount(order.amount);
    const refund = readOrderAmount(order.refund?.amount);
    const refundStatus = order.refund?.status;
    const validRefund = order.refund?.currency === 'CNY' && (
      (refundStatus === 'none' && refund === 0n) ||
      (refundStatus === 'partial' && refund > 0n && refund < debit) ||
      (refundStatus === 'full' && refund === debit)
    );
    if (debit <= 0n || debit !== parseKuajingZyCny(expected.expectedAmount) || !validRefund) {
      return closed('ORDER_MONEY_MISMATCH');
    }
    const summary = {
      status: order.status,
      terminal: order.status === 'completed' || order.status === 'cancelled',
      debitCny: money(debit), refundStatus, refundCny: money(refund),
    };
    if (order.status !== 'completed' || refundStatus !== 'none') {
      return Object.freeze({ ...summary, ...closed('DELIVERY_NOT_ELIGIBLE') });
    }
    if (order.deliveryFormat !== undefined && order.deliveryFormat !== null && order.deliveryFormat !== 'text') {
      return Object.freeze({ ...summary, ...closed('DELIVERY_FORMAT_UNSUPPORTED') });
    }
    const lines = typeof order.delivery === 'string' ? order.delivery.trim().split(/\r?\n/).map(line => line.trim()) : [];
    if (lines.length !== expected.quantity || lines.some(line => !line || /[<>\u0000-\u001f\u007f]/u.test(line)) ||
        new Set(lines).size !== lines.length) {
      return Object.freeze({ ...summary, ...closed('DELIVERY_COUNT_OR_CONTENT_INVALID') });
    }
    return Object.freeze({ ...summary, code: 'ORDER_MATCH', deliveryEligible: true, deliveredCount: lines.length });
  } catch {
    return closed('ORDER_MONEY_UNVERIFIED');
  }
}