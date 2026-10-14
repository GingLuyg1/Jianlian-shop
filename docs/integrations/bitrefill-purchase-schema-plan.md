# Bitrefill production purchase schema plan

Status: design only; no migration SQL. V1.3 offline audit and partial implementation are recorded in [bitrefill-purchase-persistence-v1-3.md](bitrefill-purchase-persistence-v1-3.md). Real PostgreSQL validation remains required.

Date: 2026-10-14

`MIGRATION_REQUIRED_FOR_PURCHASE=yes`

## Existing contract to reuse

Keep `supplier_fulfillment_requests` as the Jianlian order-item attempt root. It already stores provider, frozen product/package identity, deterministic request ID, attempt token/count, status, retryability, cost evidence and one provider reference. It supports `UNCERTAIN` and `RECONCILIATION`, and checks the frozen order-item binding before recording an outcome.

Keep `order_deliveries` and `digital_delivery_secrets` as the only user-delivery path. The delivered-row unique index already prevents two successful supplier deliveries for one Jianlian order item. Redemption plaintext must remain in `digital_delivery_secrets` only.

All future tables and functions must use RLS, deny public/anon/authenticated access, grant the minimum required operations to `service_role`, and not be exposed through the public Data API. This design performs no database action.

## Gaps

The current root has one `provider_order_code` and is unique per Jianlian order item. Bitrefill can group up to 20 units into one invoice and creates an individual external order for each unit. The root therefore cannot losslessly represent:

- a purchase attempt before an invoice ID is known;
- one external invoice shared by several Jianlian order items;
- several Bitrefill order IDs resulting from quantity greater than one;
- per-order pending/delivered/failed/refunded state and partial outcomes;
- authoritative GET version/fingerprint and last reconciliation time;
- duplicate webhook state independently from delivery idempotency;
- a durable relation from each external order to its one private delivery.

The official invoice API currently documents no reliable merchant reference or idempotency key. Local attempt identity and reconciliation are therefore mandatory.

## Proposed entities

### `supplier_purchase_attempts`

One row for each actual outbound purchase attempt, referenced by one or more existing fulfillment roots.

Required fields: internal UUID, supplier, immutable request/attempt key, state, submit-started time, submit-finished time, external invoice ID nullable, post-submit uncertainty marker, error class, created/updated/reconciled times. Do not store credentials, request headers, raw bodies or redemption material.

Constraints/indexes:

- unique `(supplier, request_key)`;
- partial unique external invoice ID when present;
- index on `(supplier, state, updated_at)` for reconciliation;
- state constraint including `PENDING`, `SUBMITTING`, `SUBMITTED`, `SUCCEEDED`, `FAILED`, `UNCERTAIN`, `RECONCILIATION_REQUIRED`.

### `supplier_purchase_attempt_items`

Join each purchase attempt to `supplier_fulfillment_requests` and freeze product ID, package ID, quantity, expected cost and cost ceiling used for the submission.

Constraints/indexes:

- foreign keys with restrictive deletion;
- unique `(purchase_attempt_id, supplier_fulfillment_request_id)`;
- positive bounded quantity;
- no mutable catalog lookup may replace the frozen identity.

### `supplier_external_orders`

One row per Bitrefill order, related to its purchase attempt and one attempt item/root.

Required fields: supplier, external invoice ID, external order ID, normalized/raw-known status, authoritative checked time, terminal time, delivery ID nullable, safe error code, timestamps. Store neither the raw authenticated response nor redemption plaintext.

Constraints/indexes:

- unique `(supplier, external_order_id)` — primary duplicate delivery/reconciliation barrier;
- index `(purchase_attempt_id, status)`;
- unique non-null `delivery_id`;
- foreign keys to the purchase attempt, attempt item/root and `order_deliveries`.

### `supplier_webhook_receipts` (optional wake-up dedupe)

If a durable queue is introduced, store only supplier, invoice ID, normalized final status, deterministic event fingerprint, received time and processing state. Do not store the full webhook body or redemption fields.

Constraint: unique `(supplier, event_fingerprint)`. A receipt is not authority; the worker must perform authenticated GETs.

## RPC boundary

Future security-definer RPCs should be small, service-role-only and transactional:

1. claim or reuse a purchase attempt from frozen paid order items;
2. mark submit started before network I/O;
3. record a known invoice ID or mark post-submit uncertainty without making the attempt retryable;
4. upsert authoritative invoice/order states by external IDs;
5. create at most one delivered row and private secret per external order, relying on both external-order and Jianlian-item uniqueness;
6. mark partial outcomes without globally fulfilling the invoice batch.

RPCs must re-check paid/non-terminal order state, frozen binding, cost ceiling, attempt token and provider. They must never accept redemption material for a non-delivered authoritative order.

## Rollout prerequisites

Before producing migration SQL: review cardinality and batching policy, define retention and redaction, define authoritative response fingerprints, add migration pre/postchecks, test RLS and grants, test rollback without deleting purchased orders, and obtain separate database authorization. Production migration, binding, sync and canary remain out of scope for V1.1.
