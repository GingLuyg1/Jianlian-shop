# Bitrefill PIN fulfillment wiring

This scope is PIN/digital redemption only. Giffgaff GBP 10/15/20 requires no
customer phone number. No number binding, direct-topup callback or carrier
integration is added. Existing catalog-only classification is retained.

`createBitrefillPinFulfillment` supplies the existing unified delivery entry's
Bitrefill handler dependency. It reuses `createBitrefillFulfillmentCore`, DB9
claims and transitions, authoritative single Invoice/Child GET reconciliation,
and `internal_supplier_purchase_deliver_child`. No second queue or purchase
state machine is introduced. The default Production registry remains unchanged.

Trusted server composition after separate release/account approval:

```js
const pinHandler = createBitrefillPinFulfillment({
  transport, loadPricing, loadFinancialEvidence, loadSupplierBalance, reserveBudget,
});
await deliverDigitalOrder(service, orderId, triggerSource, undefined, pinHandler);
```

The dependency factories read no environment or credentials. Non-fake transports
require the unchanged compiled release gate and the existing enabled HTTP
transport. Changing an environment flag or passing a true readiness value cannot
activate purchases. A live release still needs verified account permissions,
fee-inclusive debit/FX contracts, an enforceable USD cap, and a real atomic budget
reserver. No production implementation of those trusted loaders is fabricated.

## Frozen and pre-submit contracts

- Read paid order, item and frozen root using the existing authenticated service
  client; never accept a browser's paid assertion.
- Require `recipient_type=none`, exact Product/Package, face value, country and
  fresh availability. Existing order binding additionally names
  `supplier_delivery_kind=pin`, `supplier_cost_currency=USD`, country, face
  currency/value and the approved USD unit-cost cap. Minimum profit is CNY.
- Keep GBP denomination, USD debit and CNY paid allocation separate. Reuse PR91
  fixed-point 15% policy, verified CNY-side fees, fresh quote/FX, balance and limits.
- Keep the same `bitrefill:<order-item>:1` DB9 logical key. Bind SKU, root lease,
  frozen binding fingerprint, approved quote/account, USD cap, FX, paid CNY and
  fees in the immutable semantic hash. Existing attempts are queried first.
- Only the SUBMITTING CAS winner rechecks fresh payment/catalog/quote/balance,
  compares the frozen economic contract, and obtains an atomic budget receipt
  before one create-invoice operation. Any failure here is recorded as not sent
  but remains an uncertain stop requiring review; no automatic resubmission.
- Invoice complete alone never delivers. Sole Child, Product/Package/value and
  delivered status must match authoritative GET results. Code or an existing
  validated redemption link is required for generic gift cards. PIN-only is
  accepted only after an additional exact frozen PIN-binding read; an auxiliary
  PIN on an untyped gift card remains rejected. Instructions alone never deliver.
- The existing private delivery transaction and owner-only order-card read are
  reused. A private-write rollback is retried through GET and the same child,
  never by buying again. Supplier failure is manual aftercare, not an invented
  customer refund. No real refund is implemented or tested here.

## Inventory and remaining order-entry gate

Local inventory is attempted first by the existing delivery entry. Supplier
availability stays boolean with quantity null; no 9999 stock or fake card rows.
DB9's existing `admin_evaluate_product_sku_activation` already supports this
structural boolean source with stock zero. The JS stock decision still requires
the closed release gate and validated sale policy before supplier purchasing.

Production SELECT identified the currently deployed 10-argument
`create_order_with_item` MD5 `afbc647a11cad528b230f217f3481450`: it freezes Daju
only and does not capture the PIN face/cost/country contract. This PR does not
pretend the existing storefront can already create a correct Bitrefill order.
Before activation, a separately reviewed minimal order-entry extension must
preserve Daju/payment/idempotency and local priority, enforce fresh approved
Bitrefill stock/price authorization, freeze the explicit contract, and keep
internal financial fields out of customer DTOs. No Production SQL was executed.

## Validation limits

Targeted Node tests exercise three denominations and failed payment, identity,
stock, fees, caps, margin, balance and stale evidence. Isolated PG17 executes
the exact existing DB9 and private-outcome bodies through the actual TS
delivery/router injection. Supplier responses, budget reservation, auth identity
and transitive fixture helper/reservation boundaries are explicit synthetic
stubs. This proves the scoped PIN server workflow, not real supplier debit,
Production storefront checkout, live budget enforcement or real-funds E2E.

Personal and Business balance request construction and closed HTTP boundary are
reused/tested. Live account permissions, wallet debit currency, full fees and
supplier-enforced spending caps remain unverified. Official test-product GET
evidence is reused; no invoice/pay/buy is called against any real account.
