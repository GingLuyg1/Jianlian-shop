# Bitrefill V1.3-DB7 scoped current-schema contract (local only)

This is a **test fixture**, not a Production clone or migration. DB7 never
connects to Production. The historical DB4 hash
`d1e335c5e80c09f7f48d022a40092e8b71d18cc1d383c639677f9d82a8b48fbb`
has no retained canonical SQL and is `LEGACY_UNREPRODUCIBLE_FINGERPRINT`;
it must not be a gate. V1.3's migration remains unchanged at SHA-256
`2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108`.
The later [DB7B evidence freeze](bitrefill-v1-3-db7b-evidence-freeze.md)
supersedes DB7's provisional fingerprint and records the finalized local
loader, verification matrices and regression evidence.

## Extracted dependency graph and scope

The dependency set was re-extracted by matching public identifiers and SQL
references in the [V1.3 migration](../../supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql),
[application adapter](../../lib/providers/bitrefill/purchase-persistence.mjs),
[DB5 PostgreSQL E2E](../../tests/support/supplier-v13-db5-local-e2e.mjs),
the activation replacement in that migration, and the
[existing supplier fulfillment core](../../supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql).
The classification below was reviewed against the actual call sites, not
merely against matching names.

| Tier | Contract |
| --- | --- |
| DIRECT | Existing `supplier_fulfillment_requests`, `orders`, `order_items`, `order_deliveries`; activation function; the five new purchase/evidence tables; six `internal_supplier_purchase_*` RPCs and three new guard functions/triggers. Frozen root binding, request ID, item quantity/snapshot, paid order state, child-to-delivery binding and the unique delivered-item index are used directly. |
| TRANSITIVE | `internal_supplier_purchase_deliver_child` → `record_supplier_fulfillment_outcome` → `auth.role`, `log_order_item_delivery_status`, `write_delivery_log`, `refresh_order_fulfillment_status` → `delivery_logs`, `digital_delivery_secrets`, order/item/delivery updates and their two `set_updated_at` triggers. `auth.uid` and both `is_admin` signatures are policy dependencies. `products`, `product_skus`, `digital_inventory` are used by the DB5 activation/local-inventory regression checks, not by an external Bitrefill purchase. |
| OUT_OF_SCOPE | Pricing, media, category, refund, customer-profile, manual-inventory and unrelated storefront columns/constraints/policies not read or written by this graph. This fixture intentionally does not mirror them. |

The DB6 catalog capture had 101 Production-only columns relative to the old
64-column fixture. Three `order_items` fields (`sku_id`,
`delivery_failure_reason`, `delivery_started_at`) were promoted to the
transitive private-delivery contract and moved from the DB5 support fixture
into the baseline. The remaining 98 are not copied solely to make table-wide
hashes equal. DB8 must compare only the explicit column allow-list in the
versioned parity SQL; a newly discovered reference requires a reviewed v2
scope, not silent inclusion. In particular, similarly named fields on other
tables are not promoted by a global text match.

The DB6 capture also found 36 Production-only constraints. All five extra
`supplier_fulfillment_requests` checks were traced to the Daju migration and
generic supplier core and are now modeled: `supplier_check`,
`product_id_check`, `request_not_blank` are DIRECT; `price_check` and
`attempt_count_check` are TRANSITIVE through the existing claim/outcome path.
Four more transitive contracts are modeled: `orders_fulfillment_status_check`,
`order_items_delivery_status_check`, and the `sku_id` foreign keys on
`order_items` and `order_deliveries`. The other 27 constrain unrelated order
creation, inventory, product catalog, logs or refund flows and are excluded
from the v1 hash; DB8 must report any newly relevant one rather than silently
marking parity.

## Policy, ACL, function and trigger provenance

The fixture models 11 policies with unambiguous repository sources:
`orders-schema.sql` and the later delivery security migration for five
order/delivery user/admin policies; the mixed-order-item migration for two
direct-secret denials; and the digital-inventory migration for four
direct-inventory denials. These are local expected definitions only. DB6 observed 23 policies
on the nine scoped tables; the other 12 are deliberately excluded from the v1
fingerprint and returned by the parity SQL as
`authoritative_extra_policy`. Their exact current definitions are
`EXPECTED_POLICY_DEFINITION=UNRESOLVED` until DB8's authorized read.

The baseline grants were traced to the existing scoped fixture, Daju supplier
root migration (`service_role` SELECT/INSERT/UPDATE) and delivery security
migration (`service_role` SELECT/INSERT/UPDATE/DELETE on deliveries). DB6 found
effective ACL differences on all nine tables; DB7 does not copy those remote
results into the fixture. The parity SQL records effective SELECT/INSERT/UPDATE/
DELETE for `anon`, `authenticated`, `service_role`, and the Production `postgres`
owner role. In a disposable local cluster without a `postgres` role, the latter
is symbolically mapped to the fixture owner. Ambiguous table/column grants
remain `UNRESOLVED_ACL` and require DB8 interpretation.

Both `is_admin` signatures have repository-backed boolean return, stable
SECURITY DEFINER mode, `search_path=public`, and authenticated/service-role
EXECUTE grants. Their fixture bodies are explicit **TEST_STUB_BODY=yes**: the
UUID overload always returns false, and the zero-argument overload calls it
using a synthetic local `auth.uid`. These are not authoritative bodies and
cannot satisfy DB8 body-hash parity. DB6 had already observed a different
search path for `is_admin(uuid)` from the latest repository migration; DB8
must resolve this rather than treating the stub as the source of truth.

The two existing `updated_at` triggers are sourced from
`supabase/orders-schema.sql` and the Daju supplier migration. A synthetic
transaction verifies both. The private-delivery outcome RPC body comes from
the generic supplier-core migration; DB5's support fixture supplies test-only
helper implementations. DB6 found different helper security/search-path and
`refresh_order_fulfillment_status` return metadata in Production. Therefore
all helper bodies/security remain `UNRESOLVED_FUNCTIONS` for authoritative
parity, even though local delivery smoke passes. DB7B now installs the
baseline, marked support stubs, exact repository outcome RPC and frozen
migration through one guarded loader. This completes the *local composite
fixture* but not authoritative function equivalence.

## Canonical fingerprint v1 and DB8 query

[The one-file parity query](sql/bitrefill-v1-3-authoritative-parity.sql)
contains one SELECT/WITH statement. It emits sorted TSV rows with
`schema_version`, `section`, `object_type`, `schema_name`, `object_name`, and
`definition`. `contract` rows cover scoped columns (type, nullability,
default), named constraints, three existing indexes, RLS enabled/forced,
eleven policies, function identity/return/language/volatility/security/
search-path/deparsed-definition MD5, two triggers and table/column/function ACLs.
The query also emits separate read-only session-setting, migration-history,
target-conflict, unresolved-policy/function and five approved dirty-count
sections. It never returns business rows, secrets or identifiers. An `off`
session setting is evidence only that server-enforced read-only mode was not
active; it is not evidence of a write.

[The local fingerprint runner](../../tests/support/supplier-v13-schema-fingerprint.mjs)
SHA-256 hashes UTF-8 contract TSV rows only, in SQL's explicit stable order,
with LF termination. No OID, relfilenode, statistics, timestamp or row count
enters the hash. PostgreSQL's deparser supplies canonical expressions and
function text; the contract is intended for the same PostgreSQL major version.
Its [manifest](../../tests/fixtures/current-schema/supplier-v13-current-baseline.manifest.json)
is generated from a fresh fixture, never hand-edited. It flags stub bodies and
other definitions requiring authoritative capture. DB7B freezes
`FINGERPRINT_SCHEMA_VERSION=v1`; any *subsequent* scope/canonicalization
change requires a reviewed version bump and a new expected hash. The v1 hash
is a local expected value, **not yet a Production parity pass**.

DB7's provisional hash was
`64b4fd1546f162d7c9a9c8a3b577e70ca081cc6cdc0a83c7a2292f3092a24b31`.
It is superseded, not reused as a gate. DB7B's frozen `v1` scope adds
transitive function and column-ACL records; the new expected hash and object
counts are recorded in the linked evidence freeze and generated manifest.

## Local checks and remaining gate

The guarded local checks apply the fixture in two independent PostgreSQL 17.11
databases, run the same fingerprint three times in each, apply the unmodified
V1.3 migration in one, and run the DB5 claim/21-child/private-delivery/
concurrency/RLS/ACL smoke. The local policy test switches to `anon` and
`authenticated`, uses synthetic claims, checks read isolation and denied
INSERT/UPDATE/DELETE, and rolls back synthetic trigger rows. The one-file
parity SQL must be re-audited before DB8 uses any Production read path.

DB7 cannot set `AUTHORITATIVE_SCHEMA_PARITY_COMPLETE` or `V13_DB_GATE_COMPLETE`
to yes. DB8 must resolve the missing authoritative policy/ACL/function body
definitions, compare the v1 manifest's scoped rows, verify a server-enforced
read-only session if available, and keep Production migration separately
unauthorized. Business API child mapping, live purchase, deployment and canary
remain separate release gates.
