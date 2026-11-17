项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# KuajingZY wiring V1: review only, disabled

No Production deployment, database mutation, purchase or activation is authorized
by this PR. This PR adds no new migration or parallel state table. PR #142 has
merged the candidate create_order_with_item KuajingZY atomic binding-freeze
migration into main, but that migration has NOT been executed in Production.
PR #143 has merged the read-only balance-ledger merchant-cost adapter.

First-party contract: https://888.kuajing.one/pc/#api-docs, captured 2026-11-17.
POST /api/open/v1/orders/mall, Bearer authorization, application/json, required
Idempotency-Key. Body itemId, optional string skuId, integer quantity and optional
numeric expectedAmount. GET /api/open/v1/orders/{id}, using returned id, not orderNo.
PRICE_CHANGED rolls back without order/debit; HTTP402 INSUFFICIENT_BALANCE is
documented no-debit. Generic422/unknown OUT_OF_STOCK is NOT assumed atomic no-debit.
Only local preflight stock rejection is NO_DEBIT_OUT_OF_STOCK.

The earlier authorized item imp_8f97c91003b23347934cb14e / SKU9 / quantity1
purchase confirmed debit0.09 CNY, processing followed by completed and one text
delivery. All repository fixtures are independently synthetic, never real secrets.
Stock58027 did not change: advisory catalog_snapshot, never local sellable stock.
Refund/idempotency replay were not experimentally tested; resale remains unverified.

## Gates and durable execution

KUAJINGZY_PURCHASE_RELEASE_ENABLED=false is a checked-in literal. Production
composition never takes an override from env or HTTP. In a future reviewed
gate-open release it additionally requires exact true global
SUPPLIER_AUTO_PURCHASE_ENABLED, KUAJINGZY_REAL_PURCHASE_ENABLED, and frozen boolean
binding.supplier_auto_purchase_enabled. KUAJINGZY_MAX_ORDER_COST_CNY must be
approved, positive and exact. Transport independently checks these gates and
frozen identity/caps. Core/transport release injection exists for synthetic tests.
Registry purchase remains false; canSupplierAutoPurchase defaults false.

Only server KUAJINGZY_API_KEY, no NEXT_PUBLIC key, NODE_DEBUG/NODE_DEBUG_NATIVE,
custom host, redirect, raw diagnostics, new HTTP route or automatic retry.

Existing paid-order router registers the gated handler. It trusts frozen
order_items.product_snapshot.supplier_binding, not current catalog metadata.
Generic claim_supplier_fulfillment validates paid order/auto delivery/identity.
Only explicit kuajingzy_v1 marked pre-attempt roots can resume after crash.
Historical PURCHASING roots remain closed.

Stable key jianlian:<orderId>:<orderItemId>. Six-decimal allocated frozen unit
costs reconstruct exact aggregate expectedAmount and canonical wire body.
Existing semantic_request_hash commits body/key, units and frozen binding.
Only the CLAIMED→SUBMITTING CAS winner may POST. CLAIMED resume revalidates all
gates, identity, price, paid financials, balance and budget. SUBMITTING/UNCERTAIN
never POST again. Persist external ID before authoritative GET. No documented
GET-by-idempotency-key exists: missing ID means manual review, not POST replay.

Safe business DTO excludes delivery. Validated authoritative GET passes private
text through a consumed in-memory boundary into the existing
record_supplier_fulfillment_outcome RPC. That RPC owns order_deliveries,
digital_delivery_secrets and fulfillment refresh and is idempotent per order item.
Attempt success follows private commit; crash there repeats GET/idempotent private
RPC, never purchase. Count/identity/money/refund/duplicate/HTML failures prevent delivery.

## Activation status: implementation prerequisites merged, activation still closed

1. PR #142 is merged into main and provides the fail-closed candidate Migration
   that atomically freezes KuajingZY binding/policy inside create_order_with_item.
   It has NOT been executed in Production. Until separately reviewed and applied,
   Production orders cannot acquire a KuajingZY frozen binding.
2. PR #143 is merged into main. The Production runtime now consumes
   getVerifiedMerchantCostsForOrder for balance-paid orders. Evidence is the real
   completed order_payment debit in balance_transactions, with
   settlementKind=balance_ledger, provider=internal_balance,
   costScope=order_settlement_only and exact zero order-settlement fee. No
   paymentSessionId is invented. Alipay/WeChat/USDT remain fail-closed for
   KuajingZY auto purchase until their merchant-cost evidence is implemented.
3. Supplier resale permission, approved product pricing/margin thresholds,
   Production Migration execution, product creation/binding, and a separate
   reviewed release-gate change remain activation decisions.

KUAJINGZY_PURCHASE_RELEASE_ENABLED remains false, registry purchase remains false,
and all environment/binding gates remain closed by default.
READY_FOR_CODE_REVIEW does not mean READY_TO_ENABLE_AUTO_PURCHASE.

## Outlook post-merge proposal: DO NOT EXECUTE

Production read-only check found0 Outlook-named products and0 exact supplier-bound
SKUs. OUTLOOK_PRODUCT_EXISTS_PRODUCTION=NO; OUTLOOK_PRODUCT_NEEDS_CREATE=YES.

After separate write authorization, use existing admin product creation service
to prepare a non-published draft. Category, sale price, customer description,
max cost, minimum profit and margin need approved input. Suggested metadata only:

    supplier_binding_candidate:
      supplier: kuajingzy
      supplier_product_id: imp_8f97c91003b23347934cb14e
      supplier_sku: "9"
      supplier_currency: CNY
      supplier_cost: "0.09"
      supplier_cost_currency: CNY
      supplier_binding_status: draft
      supplier_auto_purchase_enabled: false

This is not an executable product-create payload or active frozen binding.
Do not synchronize supplier stock or activate sale/auto fulfillment with it.
No env file, timer, Production DB, customer order or purchase changes this round.
Standing low-cost authorization does not authorize activation or another test.
