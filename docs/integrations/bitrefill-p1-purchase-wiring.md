# Bitrefill P1 — disabled balance-purchase wiring candidate

Status: **local/offline only; not enabled for real purchase or Production**. This
branch adds no route, scheduled worker, environment variable, supplier binding,
schema migration or production credential. `BitrefillHttpTransport` remains
GET-only. `BitrefillPurchaseHttpTransport` is separate, requires an injected
`fetchImpl`, and rejects POST unless its constructor receives an explicit
`purchaseEnabled: true`. No application code constructs it. The tests inject
only a network-blocking fake fetch or `BitrefillFakeTransport`; no Bitrefill
POST, invoice, payment, balance read or purchase was performed.

## Prepared path

1. Server-side `loadBitrefillSingleItemCandidate` reads the order, exact order
   item and existing supplier root using a service-role client. It never trusts
   a browser's payment assertion. The candidate must have `payment_status=paid`,
   a nonterminal order status, an automatic item with quantity exactly **1**,
   an undelivered item and a Bitrefill frozen `product_snapshot.supplier_binding`.
   The existing SQL claim RPC rechecks paid status, frozen product/package,
   quantity and prior delivery transactionally.
2. A fresh authenticated GET product can be normalized with
   `loadFreshBitrefillProduct`. `prepareBitrefillSingleItem` requires the exact
   frozen product/package/currency/face value, boolean availability, and a
   product check no older than five minutes. It also requires a separate
   authenticated **cost** quote with product/package/currency identity and a
   five-minute timestamp. The gift-card face value or package display price is
   never substituted for trusted procurement cost. The quote must be at or
   below the frozen supplier cost cap and leave the frozen minimum unit profit.
   P1 compares only matching sale/cost currencies; it performs no FX lookup.
   Until a vetted source can provide this cost evidence and the frozen fields
   (`supplier_currency`, `supplier_face_value`, `supplier_max_unit_cost`,
   `supplier_min_unit_profit`), automatic purchase remains unavailable.
3. The existing `internal_supplier_purchase_claim` persists one frozen unit and
   a semantic SHA-256 hash. The existing compare-and-swap transition records
   `SUBMITTING` before the POST. Replay of a claimed/submitting/uncertain attempt
   does **not** send another POST. Any response loss or malformed invoice ID
   leaves `UNCERTAIN`; if the invoice ID was not persisted, only manual
   reconciliation is safe. A persisted invoice ID permits GET-only recovery.
4. The isolated purchase adapter prepares exactly one `POST /v2/invoices` body:
   one fixed-package product, `quantity: 1`, `payment_method: "balance"`,
   `auto_pay: true`. It supports Personal Bearer and Business Basic ID/Secret
   authentication. It performs no automatic POST retry; generic errors contain
   only safe classifications, never the raw response or credentials. GET
   `/v2/invoices/{id}` and `/v2/orders/{id}` have bounded retry for transient
   failures. No separate balance-payment POST or Personal API deposit endpoint
   is implemented. Personal account funding remains manual on Bitrefill's site.
5. `reconcileBitrefillSingleItem` accepts an invoice with **exactly one** child
   ID and confirms that `GET /orders/{child}` returns that same ID, status,
   product ID, face value and, when present, package ID. No array-position or
   unverifiable client reference is used. A missing/extra/mismatched child
   fails closed before child persistence or delivery. Invoice `complete` alone
   never proves the child was delivered. Only an invoice `complete` plus the
   exact delivered child and redemption data is a delivery candidate.
6. `deliverBitrefillSingleItem` rechecks invoice and order by GET and invokes
   only the existing `internal_supplier_purchase_deliver_child` RPC. That RPC
   owns the transaction linking the existing `order_deliveries` and private
   `digital_delivery_secrets`; no card data is put in ordinary logs, webhook
   receipts, or reconciliation evidence. Webhook payloads remain wake-up
   signals, not delivery authority. The V1.3 20+1 offline split tests remain
   intact; real batch procurement is **not** enabled.

## Offline evidence and release blockers

The P1 unit tests use a blocked-network fetch to inspect Personal/Business auth,
balance request construction, no POST retry, GET paths, 503 retry, cost/payment
gates, unknown child, and secret-safe errors. The disposable PostgreSQL 17.11
DB5 runner additionally loads a synthetic paid order through the server-side
store, uses the actual V1.3 claim/transition/child/evidence/private-delivery
RPCs with `BitrefillFakeTransport`, verifies replay submits zero invoices, and
checks two-worker delivery leaves one delivery and one private secret. It also
rejects a synthetic unpaid order before claim. All data and card markers are
synthetic. The only test-harness correction normalizes Windows CRLF checkout
to repository LF before checking the **unchanged** candidate migration's
frozen SHA-256; no migration was edited or applied outside a disposable DB.

This is not release acceptance. DB8 authoritative Production schema/RLS/
function parity is pending. The actual Bitrefill account's product pricing
currency and trusted cost quote contract are unverified; no current live Apple
binding or usable profit evidence is supplied by this branch. The one-child
order identity assumptions also need separately authorized live read-only
validation and Business API contractual confirmation. A possibly sent POST
without a persisted invoice ID still requires manual investigation, not an
automatic retry. Before any real purchase, Production migration, deployment,
credential installation and activation each need separate explicit approval.

API references: [Bitrefill integration flow](https://docs.bitrefill.com/docs/integration-flow),
[Personal quickstart](https://docs.bitrefill.com/docs/quickstart-2),
[Business API](https://docs.bitrefill.com/docs/Common%20Use%20Cases), and
[Supabase Data API grants update](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
