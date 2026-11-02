// Server composition only: importing or constructing it never enables sales.
import { createHash } from 'node:crypto';
import { createBitrefillClient } from './client-core.mjs';
import { createBitrefillMcpReadonlyClient } from './mcp-readonly-client.mjs';
import { BitrefillMcpPurchaseTransport } from './mcp-purchase-transport.mjs';
import { BitrefillPurchaseHttpTransport } from './purchase-http-transport.mjs';
import { createBitrefillPinOrderRuntime, GIFFGAFF_PIN_SKUS } from './pin-order-entry.mjs';
import { buildBitrefillPinMcpPlan } from './pin-policy.mjs';
import { createBitrefillProductionLoaders, bitrefillRpc } from './production-loaders.mjs';
import { createBitrefillBudgetReserver } from './production-budget.mjs';
import { REAL_BITREFILL_PURCHASE_ENABLED } from './prelaunch-policy.mjs';

export function createBitrefillServerAccount(environment, fetchImpl) {
  if (typeof window !== 'undefined') throw Error('BITREFILL_SERVER_ONLY');
  const authMode = environment.BITREFILL_AUTH_MODE;
  let credentials, prefix;
  if (authMode === 'personal' && typeof environment.BITREFILL_API_KEY === 'string' && environment.BITREFILL_API_KEY.trim()) {
    credentials = { authMode, apiKey:environment.BITREFILL_API_KEY.trim() }; prefix = 'bitrefill-personal-key-v1:' + credentials.apiKey;
  } else if (authMode === 'business' && environment.BITREFILL_API_ID?.trim() && environment.BITREFILL_API_SECRET?.trim()) {
    credentials = { authMode, apiId:environment.BITREFILL_API_ID.trim(), apiSecret:environment.BITREFILL_API_SECRET.trim() };
    prefix = 'bitrefill-business-v1:' + credentials.apiId + ':' + credentials.apiSecret;
  } else throw Error('BITREFILL_SERVER_CREDENTIALS_REQUIRED');
  const accountFingerprint = createHash('sha256').update(prefix).digest('hex');
  const catalog = createBitrefillClient({ ...credentials, fetchImpl, maxRetries:0 });
  const readonly = authMode === 'personal' ? createBitrefillMcpReadonlyClient({ credentials, fetchImpl }) : null;
  return Object.freeze({ authMode, accountFingerprint, catalog, readonly,
    createTransport(binding, contract) {
      if (authMode === 'business') return new BitrefillPurchaseHttpTransport({ ...credentials, fetchImpl, purchaseEnabled:true });
      const { plan, frozenRequest } = buildBitrefillPinMcpPlan({ binding, packageValue:String(binding.supplier_face_value), contract });
      return new BitrefillMcpPurchaseTransport({ credentials, fetchImpl, preparedPlan:plan, frozenRequest, purchaseEnabled:true });
    },
    toJSON: () => ({ authMode, accountFingerprint, credentialsRedacted:true }),
  });
}

export function createBitrefillProductionRuntime({ service, environment, fetchImpl, trusted = {} }) {
  const enabled = () => REAL_BITREFILL_PURCHASE_ENABLED && environment.BITREFILL_PURCHASE_ENABLED === 'true';
  let account;
  const getAccount = () => account ??= createBitrefillServerAccount(environment, fetchImpl);
  async function runtime(skuId, binding) {
    if (!enabled()) throw Error('BITREFILL_REAL_PURCHASE_DISABLED');
    if (!GIFFGAFF_PIN_SKUS.includes(skuId)) throw Error('BITREFILL_PIN_SCOPE_MISMATCH');
    const a = getAccount();
    if ((binding.pin_auth_mode ?? 'business') !== a.authMode || binding.pin_account_fingerprint !== a.accountFingerprint) throw Error('BITREFILL_PIN_ACCOUNT_MISMATCH');
    // Business swaps account/transport adapters, not DB9/private delivery. Its
    // loaders are a separate trusted server integration, never a Personal fallback.
    const reads = a.readonly ?? trusted.businessReadonly;
    if (!reads) throw Error('BITREFILL_BUSINESS_READ_ADAPTER_REQUIRED');
    const loaders = createBitrefillProductionLoaders({ ...trusted, service, readonly:reads, catalog:a.catalog,
      accountFingerprint:a.accountFingerprint, authMode:a.authMode });
    const contract = a.authMode === 'personal' ? await reads.listTools() : null;
    const transport = a.createTransport(binding, contract);
    const budget = createBitrefillBudgetReserver({ service, skuId, accountFingerprint:a.accountFingerprint,
      authMode:a.authMode, readBalance:reads.readBalances });
    let receipt = null;
    const create = transport.createInvoice.bind(transport);
    transport.createInvoice = async request => {
      if (!receipt) throw Error('BITREFILL_BUDGET_REQUIRED_BEFORE_POST');
      await budget.hold(receipt); // after this point even a lost response stays held
      return create(request);
    };
    const readInvoice = transport.readInvoice.bind(transport);
    transport.readInvoice = async id => {
      const invoice = await readInvoice(id);
      // Optional supplier-specific debit verifier is server composition, NOT
      // user input. Without authoritative debit proof HELD is conservative.
      if (receipt && trusted.invoiceDebit) {
        const debit = await trusted.invoiceDebit(invoice, a.accountFingerprint);
        if (debit?.invoiceId === id) await budget.consume(receipt, debit);
      }
      return invoice;
    };
    return createBitrefillPinOrderRuntime({ service, transport, ...loaders,
      reserveBudget:async input => (receipt = await budget.reserve(input)),
      loadOrderEvidence: async input => {
        const authorization = input.authorization;
        if (authorization.auth_mode !== a.authMode || authorization.account_fingerprint !== a.accountFingerprint) throw Error('BITREFILL_PIN_ACCOUNT_MISMATCH');
        return buildOrderEvidence({ service, input, account:a, loaders, trusted });
      },
    });
  }
  return Object.freeze({
    async authorizeOrder(input) {
      if (!GIFFGAFF_PIN_SKUS.includes(input.skuId)) return { applicable:false };
      if (!enabled()) throw Error('BITREFILL_PIN_SALE_CLOSED');
      const status = await bitrefillRpc(service, 'internal_bitrefill_pin_entry_status', {
        p_user:input.userId, p_request:input.clientRequestId, p_product:input.productId, p_sku:input.skuId });
      if (status.replay) return { applicable:true, replay:true };
      if (!status.enabled) throw Error('BITREFILL_PIN_SALE_CLOSED');
      const a = status.authorization;
      const binding = { supplier:'bitrefill', supplier_product_id:a.supplier_product_id, supplier_sku:a.package_id,
        supplier_face_value:String(a.face_value), supplier_cost_currency:'USD', supplier_delivery_kind:'pin',
        pin_auth_mode:a.auth_mode, pin_account_fingerprint:a.account_fingerprint };
      return (await runtime(input.skuId, binding)).authorizeOrder(input);
    },
    async fulfillPaidOrder(servingService, orderId, triggerSource) {
      if (servingService !== service) return createBitrefillProductionRuntime({ service:servingService, environment, fetchImpl, trusted }).fulfillPaidOrder(servingService, orderId, triggerSource);
      if (!enabled()) throw Error('BITREFILL_REAL_PURCHASE_DISABLED');
      const result = await service.from('order_items').select('id,sku_id,product_snapshot').eq('order_id', orderId);
      if (result.error || !Array.isArray(result.data)) throw Error('BITREFILL_ORDER_READ_FAILED');
      const targets = result.data.filter(i => i.product_snapshot?.supplier_binding?.supplier === 'bitrefill');
      if (targets.length !== 1) throw Error('BITREFILL_SINGLE_ITEM_REQUIRED');
      const i = targets[0];
      const binding = await bitrefillRpc(service, 'internal_bitrefill_pin_read_order_binding', { p_order_item_id:i.id });
      return (await runtime(i.sku_id, binding)).fulfillPaidOrder(service, orderId, triggerSource);
    },
  });
}

async function buildOrderEvidence({ service, input, account, loaders, trusted }) {
  const a = input.authorization;
  const prices = await service.from('product_skus').select('id,product_id,price').eq('id', input.skuId);
  if (prices.error || prices.data?.length !== 1 || prices.data[0].product_id !== input.productId) throw Error('BITREFILL_PIN_PRICE_CHANGED');
  const binding = { supplier_product_id:a.supplier_product_id, supplier_sku:a.package_id, supplier_face_value:String(a.face_value) };
  const pricing = await loaders.loadPricing({ orderItem:{ product_snapshot:{ supplier_binding:binding } } });
  const fx = trusted.fx ? await trusted.fx({ service }) : null;
  if (!fx || !fx.approvedSettlementSource || fx.from !== 'USD' || fx.to !== 'CNY' || !Number.isFinite(Date.parse(fx.checkedAt)) ||
      Date.parse(fx.checkedAt) > Date.now() || Date.now() - Date.parse(fx.checkedAt) > 300000 ||
      !Number.isFinite(Date.parse(fx.expiresAt)) || Date.parse(fx.expiresAt) <= Date.now() ||
      Date.parse(fx.expiresAt) > Date.parse(fx.checkedAt) + 300000) throw Error('BITREFILL_FX_STALE_OR_UNVERIFIED');
  const fees = trusted.feePreview ? await trusted.feePreview({ service, ...input }) : null;
  if (fees?.verified !== true) throw Error('BITREFILL_CNY_FEES_UNVERIFIED');
  const b = await loaders.loadSupplierBalance({ orderItem:{ sku_id:input.skuId } }, pricing.quote);
  return { source:'authenticated_pin_order_quote', authMode:account.authMode, productId:a.supplier_product_id,
    packageId:a.package_id, faceValue:String(a.face_value), faceCurrency:a.face_currency, country:a.country,
    purchaseCurrency:'USD', deliveryKind:'pin', accountFingerprint:account.accountFingerprint,
    feesIncluded:true, cnyFeesVerified:true, supplierEnforcedCap:true, available:true, atomicBudgetReady:true,
    accountPermissionVerified:true, allInUsd:pricing.quote.allInUsd, fxRate:fx.rate, cnyFees:fees.amount,
    availableUsd:b.availableAmount, reservedUsd:b.reservedUsd, spentUsd:b.spentUsd, salePriceCny:String(prices.data[0].price),
    checkedAt:pricing.quote.checkedAt, expiresAt:pricing.quote.expiresAt, fxCheckedAt:fx.checkedAt,
    fxExpiresAt:fx.expiresAt, balanceCheckedAt:b.checkedAt };
}
