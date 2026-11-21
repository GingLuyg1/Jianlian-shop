import test from 'node:test';
import assert from 'node:assert/strict';
import { auditKnownBitrefillPinInvoice } from '../../lib/providers/bitrefill/single-item-purchase.mjs';
import { BitrefillPurchaseHttpTransport } from '../../lib/providers/bitrefill/purchase-http-transport.mjs';
import { normalizeBitrefillInvoice, normalizeBitrefillReadonlyInvoice } from '../../lib/providers/bitrefill/provider-core.mjs';

const invoiceId = 'fixture-invoice-1';
const orderId = 'fixture-child-1';
const productId = 'giff-gaff-pin-united-kingdom';
const packageId = 'giff-gaff-pin-united-kingdom<&>10';
const expected = {
  invoiceId, expectedProductId: productId, expectedPackageId: packageId,
  expectedFaceValue: '10', expectedFaceCurrency: 'GBP',
  expectedChildId: orderId,
};
const secret = 'SYNTHETIC-PIN-MUST-NEVER-LEAK';

function fixture({ invoice = {}, order = {}, orders = undefined } = {}) {
  const calls = [];
  const rawInvoice = { id: invoiceId, status: 'complete',
    orders: [{ id: orderId, status: 'delivered' }], ...invoice };
  if (orders !== undefined) rawInvoice.orders = orders;
  const rawOrder = { id: orderId, invoice_id: invoiceId, status: 'delivered',
    quantity: 1, product: { id: productId, package_id: packageId, value: 10, currency: 'GBP' },
    redemption_info: { pin: secret }, ...order };
  const transport = new BitrefillPurchaseHttpTransport({
    authMode: 'personal', apiKey: 'fixture-not-live', purchaseEnabled: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method !== 'GET') throw Error('SUPPLIER_POST_FORBIDDEN');
      let data;
      if (url === 'https://api.bitrefill.com/v2/invoices/' + invoiceId) data = rawInvoice;
      else if (url === 'https://api.bitrefill.com/v2/orders/' + orderId) data = rawOrder;
      else return Response.json({ error_code: 'not_found' }, { status: 404 });
      return Response.json({ data });
    },
    sleep: async () => { throw Error('UNEXPECTED_RETRY'); },
  });
  return { transport, calls };
}

test('known Giffgaff PIN invoice uses only its exact REST Invoice and Child GET; never discloses PIN', async () => {
  const f = fixture();
  const result = await auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected });
  assert.deepEqual(f.calls, [
    { url: 'https://api.bitrefill.com/v2/invoices/' + invoiceId, method: 'GET' },
    { url: 'https://api.bitrefill.com/v2/orders/' + orderId, method: 'GET' },
  ]);
  assert.equal(result.source, 'AUTHENTICATED_KNOWN_INVOICE_REST_GET');
  assert.equal(result.frozenIdentityVerified, true);
  assert.equal(result.invoiceStatus, 'complete');
  assert.equal(result.childStatus, 'DELIVERED');
  assert.equal(result.delivered, true);
  assert.equal(result.redemptionPresent, true);
  assert.equal(result.purchaseSubmitted, false);
  assert.equal(result.privateDeliveryWritten, false);
  assert.equal(result.authoritativeUsdDebitVerified, false);
  assert.equal(result.allInFeesVerified, false);
  assert.equal(result.supplierEnforcedDebitCapVerified, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes('fixture-not-live'), false);
  assert.ok(Object.isFrozen(result));
});

test('pending Invoice/Child fails closed instead of certifying delivery identity', async () => {
  const f = fixture({ invoice: { status: 'pending', orders: [{ id: orderId, status: 'processing' }] },
    order: { status: 'processing', redemption_info: undefined } });
  await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
    /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
  assert.equal(f.calls.length, 2);
});

test('malformed or missing known binding fails without any supplier request', async () => {
  const f = fixture();
  for (const bad of [
    { invoiceId: '../invoices' }, { expectedProductId: undefined },
    { expectedPackageId: 'bad\npackage' }, { expectedFaceValue: '10.0000001' },
    { expectedFaceCurrency: 'USD/GBP' }, { expectedChildId: '../children' },
    { expectedChildId: undefined },
  ]) {
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected, ...bad }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_INPUT_INVALID/);
  }
  assert.equal(f.calls.length, 0);
});

test('observed REST top-level all_delivered plus payment.complete is read-only compatible only', async () => {
  const invoice = { id: invoiceId, status: 'all_delivered', payment: { status: 'complete', currency: 'USD' },
    orders: [{ id: orderId, status: 'delivered' }] };
  assert.equal(normalizeBitrefillInvoice(invoice).state, 'UNKNOWN'); // real purchase path unchanged
  assert.equal(normalizeBitrefillReadonlyInvoice(invoice).status, 'complete');
  const f = fixture({ invoice });
  const out = await auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected });
  assert.equal(out.frozenIdentityVerified, true);
  assert.equal(out.delivered, true);
  assert.equal(out.authoritativeUsdDebitVerified, false);
  assert.equal(JSON.stringify(out).includes(secret), false);
  assert.equal(f.calls.length, 2);
});

for (const [label, invoice] of [
  ['missing payment', { status: 'all_delivered' }],
  ['unknown payment', { status: 'all_delivered', payment: { status: 'settled' } }],
  ['payment conflict', { status: 'all_delivered', payment: { status: 'unpaid' } }],
  ['legacy payment conflict', { status: 'complete', payment: { status: 'unpaid' } }],
  ['wrong status location', { status: 'unknown', orders_delivery_status: 'all_delivered' }],
  ['unverified status alias', { status: 'complete', orders_delivery_status: 'blocked' }],
]) test('read-only invoice rejects '+label, async () => {
  const f = fixture({ invoice });
  await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
    /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
});

for (const field of ['package_id', 'currency', 'id', 'value', 'quantity']) {
  test('required frozen identity cannot be inferred when missing '+field, async () => {
    const product = { id: productId, package_id: packageId, value: 10, currency: 'GBP' };
    const order = { product, quantity: 1 };
    if (field === 'quantity') order.quantity = undefined;
    else delete product[field];
    const f = fixture({ invoice: { status: 'all_delivered', payment: { status: 'complete' } }, order });
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
  });
}

test('observed website child shape without package/quantity does not get invented identities', async () => {
  const f = fixture({ invoice: { status: 'all_delivered', payment: { status: 'complete' } },
    order: { product: { id: productId, name: 'Synthetic PIN', value: 10, currency: 'GBP', href: 'https://example.test/private' },
      quantity: undefined, invoice_id: undefined } });
  await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
    /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
  assert.equal(f.calls.length, 2);
});

test('unauthorized REST response cannot disclose supplier errors or secrets', async () => {
  let calls = 0;
  const transport = new BitrefillPurchaseHttpTransport({ authMode: 'personal', apiKey: 'synthetic-auth',
    fetchImpl: async (_url, options) => { calls++; assert.equal(options.method, 'GET');
      return Response.json({ message: secret }, { status: 401 }); } });
  await assert.rejects(auditKnownBitrefillPinInvoice({ transport, ...expected }), error => {
    assert.equal(error.code, 'BITREFILL_AUTH_OR_PERMISSION');
    assert.equal(String(error).includes(secret), false);
    return true;
  });
  assert.equal(calls, 1);
});

for (const [field, value] of [['id','other'],['package_id','other'],['value',15],['currency','USD']]) {
  test('embedded invoice child cannot conflict with authoritative GET '+field, async () => {
    const f = fixture({ invoice: { orders: [{ id: orderId, status: 'delivered', product: { [field]: value } }] } });
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
  });
}

test('absent authorization is rejected before REST fetch', () => {
  assert.throws(() => new BitrefillPurchaseHttpTransport({ authMode: 'personal', apiKey: '',
    fetchImpl: async () => { throw Error('NETWORK_FORBIDDEN'); } }), /BITREFILL/);
});

test('unknown, multiple or wrong invoice child never triggers child GET', async () => {
  for (const changes of [
    { orders: [] },
    { orders: [{ id: orderId, status: 'delivered' }, { id: 'other', status: 'delivered' }] },
    { orders: [{ id: 'unexpected-child', status: 'delivered' }] },
  ]) {
    const f = fixture(changes);
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
    assert.equal(f.calls.length, 1);
  }
});

test('frozen product, face, currency, package, quantity, invoice and statuses are verified', async () => {
  const changes = [
    { order: { product: { id: 'another', package_id: packageId, value: 10, currency: 'GBP' } } },
    { order: { product: { id: productId, package_id: 'wrong', value: 10, currency: 'GBP' } } },
    { order: { product: { id: productId, package_id: packageId, value: 15, currency: 'GBP' } } },
    { order: { product: { id: productId, package_id: packageId, value: 10, currency: 'USD' } } },
    { order: { quantity: 2 } },
    { order: { invoice_id: 'other-invoice' } },
    { invoice: { id: 'other-invoice' } },
    { invoice: { status: 'all_delivered' } },
    { order: { status: 'unknown' } },
  ];
  for (const changed of changes) {
    const f = fixture(changed);
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_MISMATCH/);
    assert.ok(f.calls.length <= 2);
  }
});

test('read-only mode cannot create an Invoice even when transport is passed a purchase opt-in', async () => {
  const f = fixture();
  await assert.rejects(f.transport.createInvoice({ products: [{ product_id: productId, package_id: packageId, quantity: 1 }] }),
    /BITREFILL_REAL_PURCHASE_DISABLED/);
  assert.equal(f.calls.length, 0);
});
