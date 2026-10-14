# Bitrefill provider V1.1 — offline fulfillment contract

Status: offline integration complete; real purchase disabled

Date: 2026-10-14

Base: `ad35a7729e62ccdad7ebabbb8a74d265ca348d10`

## Architecture

V1.1 reuses Jianlian's supplier core and adds three provider-specific layers:

1. `BitrefillHttpTransport` delegates only authenticated catalog/product GETs to the V1 client. It blocks POST, PUT, PATCH and DELETE before fetch is called.
2. `BitrefillFakeTransport` supplies deterministic catalog, invoice, order, timeout and redemption fixtures. It is the only transport that can simulate invoice creation.
3. `BitrefillProvider` exposes normalized catalog/product/availability reads. Its published capabilities are `catalog=true`, `availability=true`, `purchase=false`, `orderLookup=fixture_only`, `reconciliation=fixture_only`, and `variableAmountPurchase=false`.

The supplier router's provider-discovery registry includes Bitrefill. The active fulfillment-handler registry deliberately remains Daju-only. This is the safety boundary that makes provider discovery possible without activating order claims or purchase orchestration.

## Product and binding model

| Internal evidence | Bitrefill evidence |
| --- | --- |
| provider | `bitrefill` |
| external product ID / frozen `supplier_product_id` | product `id` |
| frozen `supplier_sku` | package `package_id` |
| fixed face value | package `value` |
| country | product `country` / `country_code` |
| currency | product `currency` |
| availability | product `in_stock` |
| supplier quantity | `null` (unknown) |

Display names are never stable identifiers. Package IDs must be unique within a product. A purchase request is built only from the frozen order-item binding and rejects mismatches against the normalized product.

Range products retain `min`, `max`, and `step` in normalization. They cannot enter invoice request construction in V1.1.

## Snapshot and freshness

The pure snapshot adapter emits provider, product/package ID, boolean availability, `quantity=null`, checked time and error state. It reuses the existing `supplier_stock_synced_at`, `supplier_stock_last_success_at`, `supplier_stock_sync_attempted_at`, `supplier_stock_stale`, `supplier_stock_sync_status`, and `supplier_stock_sync_error` names.

Schema compatibility is partial. Metadata can store this evidence without a migration, but the production catalog activation contract expects a non-negative integer `supplier_stock_snapshot`. V1.1 never fabricates a quantity and does not update product stock. A future provider-neutral boolean availability gate is required before production sync/activation.

## Offline purchase contract

`buildBitrefillInvoiceRequest` is pure and cannot send a request. It accepts fixed packages only and enforces:

- supplier is exactly `bitrefill`;
- the frozen product/package IDs match the normalized product;
- the package belongs to that product;
- availability is true;
- quantity is an integer from 1 through 20;
- expected supplier cost does not exceed the frozen maximum supplier cost;
- total invoice units do not exceed the official 20-item limit.

`planBitrefillInvoiceSplits` produces deterministic offline request groups of at most 20 items. It never submits them. Requests contain only `products`; V1.1 never adds `auto_pay`, payment method, deposit, phone, eSIM or batch purchase fields.

Official references: [integration flow](https://docs.bitrefill.com/docs/integration-flow), [core concepts](https://docs.bitrefill.com/docs/core-concepts), [error codes](https://docs.bitrefill.com/docs/error-codes), and [rate limits](https://docs.bitrefill.com/docs/rate-limits).

## Invoice, order and reconciliation semantics

Known invoice states normalize as follows:

- `unpaid`, `payment_detected`, `payment_confirmed`, `pending` → `PENDING`;
- `complete` → final invoice processing, followed by per-order evaluation;
- `blocked`, `denied`, `payment_error` → `FAILED`;
- every unknown or malformed value → `UNKNOWN`, then `RECONCILIATION_REQUIRED`.

Only `order.status=delivered` with non-empty redemption material becomes a delivery candidate. `failed` and `refunded` are failures; created/payment-detected/processing remain pending. An invoice marked complete with any failed, pending, unknown or redemption-missing order is not globally successful.

After a submitted POST times out, the pure classifier returns `UNCERTAIN`, `retryPurchase=false`, and `RECONCILIATION_REQUIRED`. No code retries a purchase POST.

The reviewed official fields do not document a merchant reference, external ID, idempotency key, or idempotency header for `POST /invoices`. `BITREFILL_NATIVE_IDEMPOTENCY=none_documented`. Production must rely on Jianlian's durable attempt record and reconciliation; it must not invent an upstream header.

## Webhook and secret boundary

The webhook remains a bounded, JSON-only wake-up signal. It strips all fields except invoice ID/status and order ID/status, responds 202 to a valid final notification, and performs no fetch, queue write, order mutation, balance change or delivery. Invalid content type, JSON, size, identifier, status and order structure fail closed with 4xx.

The official webhook guide documents no signature/HMAC mechanism, so `WEBHOOK_SIGNATURE_AVAILABLE=no_documented_mechanism`. Future processing must authenticate server-side GETs for invoice and order state and trust those reads rather than the webhook body.

Redemption fixtures normalize only code, PIN, URL/link and instructions into a payload explicitly marked for `digital_delivery_secrets`. They never enter snapshots, metadata, logs, errors, webhook responses or client responses. Duplicate delivery is keyed by the external order ID; the existing database has an additional unique delivered row per Jianlian order item.

## Offline E2E coverage

Fixtures cover:

- fixed package → fake complete invoice → delivered order → private redemption candidate;
- out of stock blocked before invoice creation;
- frozen cost ceiling exceeded blocked before invoice creation;
- timeout after accepted submission → uncertain, one submission, no retry;
- complete invoice with one delivered and one failed order → one candidate plus reconciliation;
- duplicate webhook/reconciliation → one delivery claim.

Additional unit coverage includes authentication parity, bounded pagination, availability, range parsing, fixed packages, frozen binding, 20-item split planning, pending/final/unknown states and real-transport purchase blocking.

Validation result: the V1.1 change adds 28 passing tests. The full suite reports 1,419 tests, 1,412 passing and the same seven saved baseline failures (one Daju assertion plus six Windows migration-runner harness assertions). Typecheck, targeted ESLint and production build pass. Repository-wide `next lint` remains blocked by the pre-existing ESLint parser configuration for `.d.mts` files and also reports existing UI warnings.

## Business API and production gates

Changing from Personal Bearer to Business Basic changes only credential construction. Product, snapshot, invoice, order, webhook and reconciliation parsers are shared.

Automatic purchase remains disabled until all of the following are separately verified and authorized:

- Business API approval and production credentials;
- reviewed purchase schema and migration execution;
- provider binding and boolean availability readiness;
- frozen price/cost limits;
- durable invoice/order idempotency and reconciliation;
- authenticated GET authority after webhook;
- operations monitoring and an explicitly authorized real canary.

No production environment, binding, sync, database, migration, deployment, invoice, payment or purchase was changed by V1.1.
