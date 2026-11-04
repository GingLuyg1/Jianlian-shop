import test from 'node:test';
import assert from 'node:assert/strict';
import { auditKnownBitrefillPinInvoice } from '../../lib/providers/bitrefill/single-item-purchase.mjs';
import { BitrefillPurchaseHttpTransport } from '../../lib/providers/bitrefill/purchase-http-transport.mjs';

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

test('pending Invoice/Child may match identity but cannot be described as delivered', async () => {
  const f = fixture({ invoice: { status: 'pending', orders: [{ id: orderId, status: 'processing' }] },
    order: { status: 'processing', redemption_info: undefined } });
  const result = await auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected });
  assert.equal(result.frozenIdentityVerified, true);
  assert.equal(result.delivered, false);
  assert.equal(result.redemptionPresent, false);
  assert.equal(result.childStatus, 'PROCESSING');
  assert.equal(f.calls.length, 2);
});

test('malformed or missing known binding fails without any supplier request', async () => {
  const f = fixture();
  for (const bad of [
    { invoiceId: '../invoices' }, { expectedProductId: undefined },
    { expectedPackageId: 'bad\npackage' }, { expectedFaceValue: '10.0000001' },
    { expectedFaceCurrency: 'USD/GBP' }, { expectedChildId: '../children' },
  ]) {
    await assert.rejects(auditKnownBitrefillPinInvoice({ transport: f.transport, ...expected, ...bad }),
      /BITREFILL_KNOWN_INVOICE_AUDIT_INPUT_INVALID/);
  }
  assert.equal(f.calls.length, 0);
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
