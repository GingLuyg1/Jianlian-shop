# Bitrefill V1.3 purchase persistence — local design and gate status

Status: **PARTIAL / NOT READY FOR PURCHASE OR SCHEMA REVIEW**. No Production or Test database was connected, no migration was created or applied, and the real Bitrefill HTTP transport remains GET-only. This document records the current code audit and the safe offline work. It is not evidence of durable recovery.

## Existing model and reuse

`supplier_fulfillment_requests` already has `unique(order_item_id)`, `unique(request_id)`, a transactional claim RPC, attempt token/count, status including `UNCERTAIN` and `RECONCILIATION`, one `provider_order_code`, frozen binding verification, and cost fields. The generic outcome RPC atomically creates one `order_deliveries` row and its `digital_delivery_secrets` entry. `order_deliveries_supplier_item_delivered_uidx` enforces one successful supplier delivery per Jianlian order item. Daju's live route and local-inventory-first policy are unchanged. These structures must remain the root and delivery boundary; no second order state machine or secret store is justified.

The gap is real: one root row and one external reference cannot losslessly store one invoice shared across many items, multiple child orders/units, split invoices, authoritative GET history, a durable post-submit boundary, or webhook receipt dedupe. A future migration must add only these provider-neutral relations and safe evidence. The existing `UNCERTAIN` state alone is insufficient if an invoice ID has not yet been persisted. No native Bitrefill purchase idempotency key or merchant reference has been verified; a possibly sent POST must never be blindly retried.

## Offline contracts implemented

`evaluateSupplierAvailability` defines `AVAILABLE`, `UNAVAILABLE`, and `UNKNOWN` with separate exact `quantity` and `quantityKnown` evidence. Quantity `5` remains an exact quantity; boolean `in_stock=true` remains available with `quantity=null`; stale/error/malformed evidence becomes `UNKNOWN`. Bitrefill snapshot evaluation uses this shared contract. This is **not yet the P2.3 SQL activation gate**: the existing activation evaluator still accepts only Daju integer stock, and purchase capability remains off. Do not activate a Bitrefill SKU based on this helper alone.

`buildSupplierPurchaseIdentity` computes a versioned SHA-256 semantic hash from frozen non-secret identity fields (provider, order item, request/attempt identity, product/package, quantity, exact decimal amount, currency). It rejects malformed or zero money and unsafe identifiers. The hash is not yet transactionally persisted, so it is evidence preparation rather than a production idempotency guarantee. `classifySupplierSubmitBoundary` distinguishes a durable pre-submit state from a possibly-sent request: unknown post-submit outcome is `UNCERTAIN` with no POST retry; with an external ID the next action is query-only, otherwise manual review. The offline FakeTransport and existing crash fixtures continue to demonstrate behavior, not DB atomicity.

Live-observed HTTP 403 with `error_code=not_available` is now classified as `PRODUCT_NOT_AVAILABLE_IN_CURRENT_CONTEXT`, not an authentication failure. Generic 403 remains `FORBIDDEN`. The 149/200/201 package bounds and text-package purchase block have regression coverage. Apple US mapping, trusted cost, Business API approval and credentials all remain unavailable; no supplier binding was written.

## Required migration contract, not yet implemented

The [schema plan](bitrefill-purchase-schema-plan.md) remains the design source. A reviewed migration needs provider-neutral purchase attempts, attempt-to-root allocations, invoice/child-order identity, safe webhook receipts, reconciliation evidence, narrow uniqueness/FK/indexes, RLS and service-role-only ACL. The transactional submit boundary must be committed before HTTP, and the external ID/child relation must be committed atomically after response. Ambiguous post-submit failures require durable `UNCERTAIN`; if the DB cannot record the result, the operator must stop and investigate, not retry. Reconciliation may query but cannot create purchase. Webhook is a wake-up hint; authenticated GET is authoritative. Invoice `complete` does not imply every child was delivered.

No migration file or real PostgreSQL test was produced because the local host has no PostgreSQL/Docker/Supabase CLI, and obtaining the CLI was blocked by local network access. A Test project is not a substitute for a disposable database without an explicit target/provenance check and migration precheck. The migration, activation SQL parity, ACL/RLS checks, concurrency/atomicity tests, and clean/dirty apply tests therefore remain **BLOCKED / NOT RUN**, not PASS. Do not push this partial branch as a production-ready V1.3 change.

## Next safe step

Provision a disposable PostgreSQL or isolated Supabase database branch proven not to be Production, plus an available Supabase CLI. Run `supabase migration new` before authoring a migration; then precheck base schema/history, implement the minimal SQL, and exercise clean/dirty migration, RLS/ACL, two-worker claim, webhook/poll, and delivery races. Only after all V1.3 gates pass should a V1.4 authoritative worktree be cut. Production migration, Business credentials, binding, canary, and purchase require separate later authorizations.
