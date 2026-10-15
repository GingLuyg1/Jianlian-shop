# Bitrefill V1.3-DB4 current-schema forward baseline (local only)

DB5 supersession note (2026-10-15): the candidate V1.3 migration was amended
locally to atomically link an external child to the existing private delivery
transaction. Its DB5 SHA-256 is now
`2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108`.
The checksum below is the historical DB4 candidate, not the current file.
See [DB5 local E2E evidence](bitrefill-v1-3-db5-local-e2e.md).

Captured 2026-10-15 from the identified Jianlian-shop Production project's PostgreSQL
catalog through SELECT-only Supabase access. No business rows, delivery contents,
credentials, or payment data were read. The later request for policy metadata was
blocked by the approval service's usage limit; it was not retried through another
route. Production was not changed.

## Scope and provenance

The V1.3 migration directly depends on `supplier_fulfillment_requests`,
`order_items`, `order_deliveries`, `orders`, and
`admin_evaluate_product_sku_activation(text,text,integer,jsonb,bigint)`.
The synthetic delivery and P2.3 checks additionally require `products`,
`product_skus`, `digital_inventory`, `digital_delivery_secrets`, `delivery_logs`,
and the `is_admin` signatures. These are the 12 captured existing objects:
nine tables, one activation function, and two `is_admin` overloads. The five
V1.3 tables did not exist at capture time.

The selected 53-part Production dependency fingerprint was
`d1e335c5e80c09f7f48d022a40092e8b71d18cc1d383c639677f9d82a8b48fbb`.
It covered relevant table identities, selected column contracts, selected
constraints/index, RLS/ACL summary, and the activation function signature and
definition hash. This is *not* a whole-schema hash. The captured activation
definition's MD5 was `d4894493468d0d97c7628c5c7c429dbf` (5,765 bytes),
security invoker with `search_path=pg_catalog`. A scan of the definition found
no suspicious hard-coded credential literal. The local pre-migration fixture
reproduced this function MD5 exactly.

The [scoped fixture](../../tests/fixtures/current-schema/supplier-v13-current-baseline.sql)
contains DDL only. It has no Production row data and is neither a Production
migration nor a reconstruction of the damaged historical archive. It intentionally
omits unrelated storefront columns and all real policies; its selected RLS and
table-grant matrix follows the captured catalog. Because the full policy and
constraint/index comparison could not be completed after the approval-service
limit, `CURRENT_SCHEMA_FIXTURE_MATCH=no` remains the honest gate result. The
53-part hash must be recalculated from the same query on a fresh authorized
read-only session before a future Production rollout; the present precheck emits
the selected metadata for human comparison but does not assert the hash by itself.

The historical `20260622_digital_delivery_hardening.sql` archive remains
unchanged at SHA-256
`2ff47dbbb596469b4b16e1e4112839f9221e801b7c36450ede47cb93fedc753f`.
Historical clean replay is **unsupported / not trustworthy** because the
repository archive was already corrupted since its initial commit. This is not
evidence that the live Production schema is damaged.

## Local execution and limits

The fixture and candidate V1.3 migration were applied successfully to the new,
loopback-only PostgreSQL 17 database `jianlian_bitrefill_v13_current_schema`.
The candidate migration SHA-256 stayed
`5b8c79ec7b5bfb22db0c9ffab93554af1b30996257d4dfb4f638aa7e5a5ac562`.
The original P2.3 function MD5 matched before replacement. After replacement,
27 Daju golden combinations and boolean availability/unknown/stale/error checks
passed. New-table RLS, no-policy posture, service-only RPC grants, and
security-definer/search-path checks passed in PostgreSQL.

Five isolated, disposable dirty databases tested duplicate logical roots,
duplicate external invoice IDs, orphan roots, invalid states, and missing frozen
binding. Each migration aborted with its expected preflight error and left no
partial V1.3 table/RPC. An external child order table has no pre-V1.3 equivalent;
the post-migration child uniqueness rejection passed in the RPC E2E, but it
cannot honestly be counted as a sixth pre-migration dirty case.

The [offline-only application adapter](../../lib/providers/bitrefill/purchase-persistence.mjs)
accepts only `BitrefillFakeTransport`, uses the claim/transition RPCs, and
persists `SUBMITTING` before simulated submission. A local PostgreSQL E2E verified:
21 frozen units across two invoice attempts, idempotent replay, a restart after
claim before submit with exactly one Fake submission, an uncertain possible
submit with zero blind retries, and GET-only recovery of a persisted invoice ID.
The 21 frozen unit mappings are durable, but 21 authoritative external *child*
order mappings are not yet built by the application. The remaining adapter RPC
methods are exposed but not yet connected to a fully authoritative reconciliation,
webhook worker, or private-delivery transaction. No real HTTP POST is enabled.

Private delivery, concurrent delivery, delivery crash recovery, a synthetic
secret audit scan, and Production-equivalent policy comparison remain open. A
full V1.3 DB gate or release acceptance must **not** be claimed from the tests
above. The build is separately blocked by the existing Google Fonts Inter
network `EACCES` failure; no UI file was changed to work around it. The full
suite remains at its seven known baseline failures and zero new failures.

## Future Production sequence (not authorized this round)

1. Run the [read-only precheck](sql/bitrefill-v1-3-production-precheck.sql)
   with separate Production-read approval; confirm every dirty count is zero.
2. Recompute and compare the narrow dependency fingerprint, including policies,
   and stop on drift. Reconfirm the exact V1.3 migration checksum.
3. Complete authoritative child mapping, reconciliation, private delivery,
   crash/race E2E, and audited secret isolation in disposable PostgreSQL.
4. Obtain separate user authorization for any Production migration; then perform
   a read-only post-migration validation. No migration was executed remotely here.
