# Bitrefill read-only integration assessment

Assessment date: 2026-10-10

Base commit: `4575d802d653e4dca726427bce826aa68c93d9e2`

Scope: architecture assessment, official-document review, fixture tests, and an optional credential-gated read-only probe. No purchase, invoice, payment, balance, database, migration, or production mutation is in scope.

## Official API baseline

- Base URL used by this implementation: `https://api.bitrefill.com/v2`.
- Personal authentication: `Authorization: Bearer <BITREFILL_API_KEY>`.
- Business authentication: HTTP Basic with `BITREFILL_API_ID:BITREFILL_API_SECRET`.
- Allowed V1 client methods are only `GET /ping`, `GET /products`, `GET /products/search`, and `GET /products/{id}`.
- Product list/search pages are capped at 50. Product endpoints have a documented hourly quota in addition to endpoint rate limits.
- Personal credentials are suitable only for technical validation. A reseller production integration requires Business API credentials.

Official references reviewed: [API overview](https://docs.bitrefill.com/docs/api-overview), [core concepts](https://docs.bitrefill.com/docs/core-concepts), [searching products](https://docs.bitrefill.com/docs/searching-products), [rate limits](https://docs.bitrefill.com/docs/rate-limits), [B2B integration flow](https://docs.bitrefill.com/docs/integration-flow), [webhooks](https://docs.bitrefill.com/docs/webhooks), and [error codes](https://docs.bitrefill.com/docs/error-codes).

## Existing supplier architecture

The repository already has a useful provider-neutral core and must not be replaced:

- `lib/providers/core/supplier-router.ts` reads the immutable `order_items.product_snapshot.supplier_binding` and routes by its frozen `supplier` value. The production registry currently contains only Daju.
- `lib/providers/core/fulfillment-core.mjs` implements provider injection, claim-before-purchase, uncertain-result handling, GET-only reconciliation, and secret extraction through adapter callbacks.
- `supplier_fulfillment_requests` provides one durable request per Jianlian order item, deterministic `jianlian:<order-id>:<item-id>` request IDs, attempt tokens, attempt counts, retryability, a provider order reference, and `PENDING/PURCHASING/FULFILLED/FAILED/UNCERTAIN/RECONCILIATION` states.
- `products.metadata` and `product_skus.metadata` hold the supplier binding; checkout freezes it into the order item snapshot. The generic supplier migration changes `supplier_product_id` to text, which is compatible with Bitrefill string IDs.
- Successful supplier delivery is stored through `order_deliveries`; the actual redemption content is isolated in `digital_delivery_secrets` and is denied to direct public reads.
- Daju has provider-specific product parsing, stock resolution, HTTP handling, purchase and fulfillment adapters. This assessment adds no Daju behavior change.

Provider fit: **good for catalog parsing and one-item fulfillment orchestration, incomplete for production Bitrefill invoice/order cardinality and boolean-only availability**.

## Catalog and binding mapping

### Fixed packages

Use existing metadata and frozen snapshot fields:

| Jianlian field | Bitrefill source |
| --- | --- |
| `fulfillment_source` | literal `supplier` |
| `supplier` | literal `bitrefill` |
| `supplier_product_id` | product `id` |
| `supplier_sku` | package `package_id` (the parser also accepts API responses that name it `id`) |
| `supplier_country` | product `country_code` / `country` |
| ProductSku price/title | package value plus the site's pricing policy |

The API credential's account country is not product country. Product country must come from each product record. No new schema is needed for catalog binding because metadata can carry `supplier_country` and the frozen supplier binding already carries product/package identity.

### Variable ranges

Status: **requires_future_feature**.

The current storefront and `ProductSku` path model a selected fixed SKU/price. A Bitrefill range has `min`, `max`, and `step`, and the chosen value becomes purchase identity and cost evidence. It should not be forced into fake fixed SKUs or an unbounded SKU explosion. A future feature needs validated variable amount selection, frozen amount/currency in the order item, pricing/cost limits, and reconciliation checks.

### Availability

`in_stock=true` means available evidence; `false` means unavailable. Bitrefill does not provide a count, so `supplier_quantity` must remain `null`/unknown. Never write `999999`, `1`, or another invented quantity.

The existing Daju snapshot writer assumes a non-negative integer quantity and updates catalog `stock`. That mechanism cannot be reused unchanged. Bitrefill can initially cache `supplier_in_stock`, `supplier_quantity: null`, timestamps, and freshness in metadata, but production checkout needs a provider-neutral availability gate rather than pretending a quantity exists.

## Cache, freshness, and rate limits

- Cache catalog server-side; never call Bitrefill for every shopper page view.
- Start with hourly catalog refresh for active countries and on-demand admin refresh. Daily is acceptable only for low-volume/inactive catalogs.
- Refresh availability more often for active mapped products (recommended 15–30 minutes) and re-check before invoice creation in the future purchase workflow.
- Do not hardcode a production timer in this phase.
- Honor `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-product-quota-remaining`, and `X-product-quota-next-window`.
- The read-only client retries only idempotent GETs, at most three configured retries, with bounded backoff and reset awareness. There is no infinite retry.

## Error contract

| Upstream evidence | Internal code |
| --- | --- |
| HTTP 401 | `AUTH_ERROR` |
| HTTP 403 | `FORBIDDEN` |
| HTTP 404 / `not_found` | `PRODUCT_NOT_FOUND` |
| `out_of_stock` | `OUT_OF_STOCK` |
| HTTP 429 | `RATE_LIMITED` |
| HTTP 5xx / transport failure | `UPSTREAM_UNAVAILABLE` |
| malformed or oversized response | `INVALID_RESPONSE` |

Raw upstream messages, Authorization values, API credentials, redemption codes, PINs, and full payloads must not reach browser errors or logs.

## Webhook assessment

The route did not exist at the base commit. V1 adds `POST /api/webhooks/bitrefill` as a bounded, JSON-only, side-effect-free acceptance skeleton. It validates and retains only invoice ID/status and order ID/status. It does not query Bitrefill, write a database row, deliver a secret, change an order, credit a balance, or log the payload.

The official webhook guide reviewed for this assessment documents no signature header, shared secret, or HMAC verification. Therefore `WEBHOOK_SIGNATURE_AVAILABLE=no_documented_mechanism`. A future business implementation must treat the body as a notification only, then use authenticated `GET /invoices/{id}` and `GET /orders/{id}` as authority.

An invoice status of `complete` does **not** prove every order was delivered. Only individual `order.status=delivered` entries may proceed to authenticated order retrieval and private redemption handling. Partial failure is a first-class state.

## Idempotency, reconciliation, and schema needs

Reuse the current deterministic request and attempt-token framework, but do not enable purchase yet. A future flow is:

1. Freeze Bitrefill product ID, package ID or selected range value, country, currency, and cost ceiling into the order item snapshot.
2. Claim the supplier request before any invoice call.
3. Persist the client idempotency key and purchase-attempt state durably.
4. Create at most one invoice for the claimed attempt; after a timeout, mark `UNCERTAIN` and reconcile instead of creating another invoice.
5. Persist invoice ID separately from every Bitrefill order ID/status.
6. Use webhook as a wake-up signal and authenticated polling as fallback.
7. Deliver only authenticated orders whose status is `delivered`; write redemption material only through `digital_delivery_secrets`.

Current `supplier_fulfillment_requests.provider_order_code` holds only one external reference and the row is unique per Jianlian order item. It cannot losslessly represent both invoice ID and multiple Bitrefill order IDs, webhook event/state idempotency, or partial invoice results. Production Bitrefill purchase/webhook support therefore requires a later reviewed schema/migration (for invoice/purchase attempt plus child order references), but this read-only phase requires none.

One Bitrefill invoice supports at most 20 items. Future batching must split larger Jianlian orders deterministically and must not assume one Jianlian order equals one Bitrefill invoice.

Failure handling must cover out of stock, insufficient Bitrefill balance, denied/payment error, partial failure, delayed delivery, duplicate or missing webhook, 503, and timeout after invoice creation. The central rule is: **a timeout after submission is uncertain, never permission to buy again**.

## Business upgrade compatibility

`BUSINESS_API_UPGRADE_READY=yes` for this V1 client: catalog/product parsing, availability mapping, error normalization, and webhook parsing do not depend on auth mode. The switch is credential/auth strategy only. Production reseller enablement still requires Business API credentials, durable invoice/order storage, authenticated reconciliation, provider-neutral boolean availability, purchase limits/cost checks, and an explicitly reviewed rollout.

## Probe status

`BITREFILL_API_KEY` was absent from the execution environment, so the live API probe was skipped without failure. `scripts/probe-bitrefill-readonly.mjs` performs only the allowed GET calls, limits catalog pages, emits summaries instead of payload dumps, and has no purchase method.

To run locally without storing the secret, open a new PowerShell process, set a temporary process-scoped environment variable, run the script, and close that shell. Do not paste or save the value in source, reports, screenshots, shell history, or environment files.

```powershell
$env:BITREFILL_API_KEY = Read-Host -MaskInput "Bitrefill API key"
node scripts/probe-bitrefill-readonly.mjs
Remove-Item Env:BITREFILL_API_KEY
```

## Assessment conclusion

There is no blocker to Bitrefill becoming a second supplier for read-only catalog integration and fixed-package mapping. Production purchase is intentionally blocked until Business API access and the schema/reconciliation/availability gaps above are implemented and separately authorized. No production environment or database change is required for this phase.

## V1.1 offline provider addendum (2026-10-14)

V1.1 implements the safe portion of the assessment without enabling a purchase path:

- `BitrefillHttpTransport` enforces read-only mode before network I/O. Every non-GET method is rejected with `READ_ONLY_MODE_METHOD_BLOCKED`.
- `BitrefillFakeTransport` is the only transport allowed to simulate invoice creation. `BitrefillProvider.createOrder` rejects every non-fake transport with `PURCHASE_DISABLED`.
- Provider discovery exposes catalog and availability while declaring purchase false. The active fulfillment handler registry remains Daju-only, so discovering Bitrefill cannot claim an order or trigger a purchase.
- Bounded catalog pagination uses the official maximum page size of 50, explicit page and product ceilings, and the existing per-request timeout/abort behavior. The upstream `_next` URL is never followed directly.
- Fixed packages map `product.id` to `supplier_product_id` and `package_id` to `supplier_sku`. Range parsing remains available for assessment, but variable-amount purchase remains unsupported.
- Boolean availability becomes `available` plus `supplier_quantity=null`; the adapter reuses the existing `supplier_stock_*` freshness metadata names. The current catalog `stock`/activation contract still cannot safely consume unknown quantity, so production snapshot activation remains blocked without a provider-neutral boolean gate.
- Invoice request construction, cost checks, split planning, invoice/order normalization, reconciliation, redemption mapping and delivery deduplication are pure offline logic. They perform no HTTP or database writes.

The current official invoice request documentation lists product/package/value/quantity, payment, webhook and contact fields, but no merchant reference, external ID, or idempotency-key field. No official idempotency header was found in the reviewed API overview, integration flow, core concepts, webhook or invoice reference. V1.1 therefore sets `BITREFILL_NATIVE_IDEMPOTENCY=none_documented` and does not invent one. A post-submit timeout is always `UNCERTAIN`, with no automatic second purchase.

No live probe ran because `BITREFILL_API_KEY` was absent. Candidate mappings for Apple US, Amazon US and Steam US remain fixture-only and `LIVE_VALIDATION_PENDING`; none were written to product metadata or bindings.

## Validation result

- Bitrefill unit/safety tests: 20/20 pass.
- Supplier, Daju, catalog, and order targeted selection: all new and relevant tests pass except the unchanged known Daju `CREATE_ORDER_CONTRACT_DRIFT` baseline assertion.
- TypeScript: pass.
- Production build: pass with pre-existing optional `ws` and Supabase bundling warnings.
- Full suite: 1391 tests, 1384 pass, 7 fail. The saved pre-task baseline is 1371 tests, 1364 pass, 7 fail; all 20 added tests pass and there are zero new failures. The unchanged failures are one known Daju assertion and six Windows migration-runner harness assertions.
