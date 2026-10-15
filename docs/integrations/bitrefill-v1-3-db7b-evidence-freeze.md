# V1.3-DB7B local schema evidence freeze

LOCAL ONLY. No Production connection was made. This file records a reviewed
repository-derived expectation, **not** a Production schema assertion. The
only loader is `tests/support/supplier-v13-local-fixture.mjs`: guarded baseline
→ marked test-only helper fixture → exact outcome definition extracted from
`20260826190000_supplier_fulfillment_core_v1.sql` → its repo-derived EXECUTE
grant → SHA-pinned V1.3 migration. DB5 smoke and the two-fresh-DB evidence
runner use that same loader. There is no second handwritten outcome body or
manual installation order. Synthetic test rows are rolled back or discarded
with the disposable databases.

## Function and private-delivery call graph

| Function/signature group | Source class | Local security / grants | DB8 requirement |
| --- | --- | --- | --- |
| `internal_supplier_purchase_{claim,transition,record_child,record_evidence,record_webhook,deliver_child}` | `AUTHORITATIVE_REPO_DEFINITION` in frozen V1.3 migration | Migration revokes public/anon/authenticated EXECUTE and grants service_role | Compare signature, owner, mode, search_path, grants, definition hash after authorized read. |
| Three `supplier_purchase_guard_*` trigger functions | `AUTHORITATIVE_REPO_DEFINITION` in V1.3 migration | Migration revokes public/anon/authenticated EXECUTE | Compare function and trigger metadata. |
| `record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text)` | `AUTHORITATIVE_REPO_DEFINITION` extracted verbatim from generic supplier-core migration | Local SECURITY DEFINER, `pg_catalog, public`, service_role EXECUTE; never assume Production equality | Compare owner, security, search_path, grants and definition hash. |
| `log_order_item_delivery_status`, `write_delivery_log`, `refresh_order_fulfillment_status` | `TEST_ONLY_STUB` in delivery support fixture | Local SECURITY INVOKER, `pg_catalog`; fixture-local grants/defaults only | Authoritative return type, body hash, security, search_path, owner, grants are pending. |
| `auth.role()`, `auth.uid()` | `TEST_ONLY_STUB` using synthetic JWT claims | Local-only Auth emulation | Never compare stub body hash to Supabase Auth; compare metadata only after authorized read. |
| `is_admin()`, `is_admin(uuid)` | `TEST_ONLY_STUB` in baseline | Local boolean/STABLE/SECURITY DEFINER/`public`, authenticated and service_role EXECUTE | Both authoritative bodies, search paths, owner and grants pending. |
| `admin_evaluate_product_sku_activation`, `set_updated_at()` | `REPO_DERIVED_EXPECTATION` in baseline | Local definitions and grants as fixture | Compare canonical metadata and hash. |

The executed delivery chain is `internal_supplier_purchase_deliver_child` →
`record_supplier_fulfillment_outcome` → `auth.role` plus the three delivery
helpers → transactional insert into `order_deliveries`, private insert into
`digital_delivery_secrets`, update of the root and order item, and the two
`set_updated_at` triggers. The outcome function is one database transaction;
the successful delivery row is tied to its private secret by `delivery_id`.
The DB5 runner also tests concurrent delivery and rollback/recovery. Local
success proves the *test contract* only:
`LOCAL_TEST_CONTRACT_PASS=yes`, `AUTHORITATIVE_IMPLEMENTATION_PARITY=PENDING`.

## Policy verification matrix

DB6 recorded 23 relevant Production policies; the baseline models 11. The
retained DB6 summary did **not** retain identities for the remaining 12.
The following twelve are repository candidates, not an assertion that these
are exactly the twelve in Production. Each candidate is classified
`UNRESOLVED` until DB8 enumerates all policies on the nine scoped tables;
none is silently declared out of scope. `USING`/`WITH CHECK` below are
repository expressions, not copied Production definitions. `—` means the
repository policy has no explicit clause of that kind.

| Candidate policy | Table | Cmd / roles | Repo USING | Repo WITH CHECK | Evidence source | Class / DB8 |
| --- | --- | --- | --- | --- | --- | --- |
| public can read active products | products | SELECT / anon, authenticated | `status in ('active','sold_out')` | — | `20260619_products_categories_baseline.sql` | UNRESOLVED / verify |
| public can read visible products | products | SELECT / anon, authenticated | `status in ('active','sold_out')` | — | `20260702_schema_rls_consistency_compatibility.sql` | UNRESOLVED / verify |
| admins can read all products | products | SELECT / authenticated | `is_admin()` | — | `20260619_products_categories_baseline.sql` | UNRESOLVED / verify |
| admins can insert products | products | INSERT / authenticated | — | `is_admin()` | same baseline | UNRESOLVED / verify |
| admins can update products | products | UPDATE / authenticated | `is_admin()` | `is_admin()` | same baseline | UNRESOLVED / verify |
| admins can delete products | products | DELETE / authenticated | `is_admin()` | — | same baseline | UNRESOLVED / verify |
| public can read active skus | product_skus | SELECT / PUBLIC | `status in ('active','sold_out')` | — | `20260710_product_skus_compatibility_baseline.sql` | UNRESOLVED / verify |
| admins manage product skus | product_skus | ALL / authenticated | `is_admin()` | `is_admin()` | same SKU baseline | UNRESOLVED / verify |
| admins can manage orders | orders | ALL / PUBLIC | `is_admin()` | `is_admin()` | `orders-schema.sql` | UNRESOLVED / verify |
| authenticated can create order items for own orders | order_items | INSERT / PUBLIC | — | owning-order `EXISTS` | `orders-schema.sql` | UNRESOLVED / verify |
| admins can read delivery logs | delivery_logs | SELECT / authenticated | `is_admin()` | — | `20260703_digital_delivery_atomic_hardening.sql` | UNRESOLVED / verify |
| deny direct delivery log writes | delivery_logs | ALL / anon, authenticated | `false` | `false` | same delivery migration | UNRESOLVED / verify |

The repository also contains `deny direct inventory reads compatibility` on
`digital_inventory`; it is an **alternate candidate** if one of the twelve
above is absent. Neither the candidate list nor the count identifies the
authoritative set. DB8's `authoritative_extra_policy` section returns *all*
non-modeled names, table, command, roles, `USING` and `WITH CHECK`. If the
enumerated count or identity differs, stop and review before classifying
DIRECT/TRANSITIVE/OUT_OF_SCOPE.

## ACL, constraints and trigger verification matrix

The nine table objects are `products`, `product_skus`, `orders`,
`order_items`, `order_deliveries`, `supplier_fulfillment_requests`,
`digital_inventory`, `digital_delivery_secrets`, `delivery_logs`. For **each**,
DB8 returns effective SELECT/INSERT/UPDATE/DELETE for `anon`,
`authenticated`, `service_role`, and `postgres`, plus explicit table grants,
grantor and owner. For each of 67 allow-listed columns it returns effective
SELECT/INSERT/UPDATE/REFERENCES for the same four roles and any explicit
column grant with grantor. Ten current-schema functions (including both
`is_admin` signatures and four private-delivery functions) expose effective
EXECUTE per role, explicit EXECUTE grants, owner, security and search_path.
The local expected source is baseline grants plus Daju root and delivery
security migrations; exact Production grantors, owners, column grants and
helper grants are `UNRESOLVED_ACL`. No local grant was broadened to force a
match. The SQL returns metadata; DB8 must interpret each difference against
the repo migration lineage.

The five root checks are `supplier_check`, `product_id_check`,
`request_not_blank`, `price_check`, `attempt_count_check`. In two fresh local
databases, catalog definitions existed and synthetic invalid inserts raised
CHECK violations; valid insert, duplicate request/item UNIQUE violations and
invalid item FK violation were also verified inside rolled-back transactions.
The two pre-existing `updated_at` triggers and three migration guard triggers
exist once each after forward apply. The parity SQL returns trigger definitions,
function security and target conflicts; local DB5 smoke tests their transactional
effect. This is not a Production trigger parity claim.

## Frozen fingerprint and DB8 read-only coverage

The version remains `v1`; DB7's provisional 287-row hash is superseded by
this explicitly reviewed DB7B scope freeze. The frozen current-schema contract
has 1,389 canonical records: 9 tables, 67 columns, 31 constraints, 3 indexes,
11 modeled policies, 10 functions, 2 triggers, 144 effective table-ACL records,
1,072 effective column-ACL records and 40 function-ACL records. Each row has a
SHA-256 object hash, dependency classification and unresolved-field marker.
The overall local hash is
`e036759cd8baa297a4de29c3bf3dc1460bd7959fdc00ebb26a6b7807849193fb`.
It is reproducible three times in each of two fresh PostgreSQL 17.11 loopback
databases. It is **not** an unconditional Production equality gate: test-stub
and unresolved metadata rows have `authoritative_equality_comparable=false`.
The manifest also has a separate comparable-only hash. The old DB4 hash is
`LEGACY_UNREPRODUCIBLE_DO_NOT_USE`.

`bitrefill-v1-3-authoritative-parity.sql` is one SELECT/WITH statement and
does not call business RPCs. It returns column/constraint/index/RLS/policy/
function/trigger records, effective and explicit table/column/function ACLs,
function owner/security/search_path/hash, migration history, target conflicts,
session `transaction_read_only` and `default_transaction_read_only`, and five
approved COUNT-only dirty sections. It returns no order/card/secret rows.
`transaction_read_only=off` is **not** evidence of a write, but it cannot prove
a forced read-only session. DB8 must report unverified if read-only cannot be
established; it must never test by attempting a write.

All authority-pending categories have a query section:

| Pending category | DB8 SQL section | Missing required metadata? |
| --- | --- | --- |
| 12 policy identities/definitions | `authoritative_extra_policy` | no |
| Explicit table/column/function grants, grantor and owners | `authoritative_acl_explicit`, `authoritative_owner`, `contract` ACL rows | no |
| `is_admin` and delivery helper security/search_path/body hash/owner | `authoritative_dependency_function`, `contract` functions | no |
| Two existing trigger definitions and three target conflicts | `contract` triggers, `target_conflict` | no |

`DB7B_READY_FOR_DB8_READONLY_REVIEW=yes` means this local evidence package
can support a separately authorized read-only review. It does **not** mean
`AUTHORITATIVE_SCHEMA_PARITY_COMPLETE`, `V13_DB_GATE_COMPLETE`, or permission
to apply a Production migration. No Production query, Bitrefill API call,
purchase, payment, deployment, push or PR action belongs to DB7B.

## Local regression record

Two independently created local PostgreSQL 17.11 databases each passed the
single fixture loader, pre-migration fingerprint three times, five root CHECK
behaviors, item/request uniqueness, FK behavior, policy/ACL/security checks,
forward migration, and trigger counts (2 existing + 3 new). The DB5 real
PostgreSQL E2E passed 21/21 child correlation, two-invoice recovery,
semantic/restart no-blind-retry, partial invoice, 100-webhook replay and
polling race, private/concurrent delivery, rollback/ack recovery, secret
isolation, Daju regression, ACL/RLS and five index plans. Typecheck and
targeted ESLint passed.

The full Node suite ran 1,455 tests: 1,448 passed and the same seven known
baseline tests failed (one Daju source-patch formatting assertion and six
migration-runner harness assertions). None reads a DB7B-edited source path.
The scoped supplier/Bitrefill/Daju/activation suite had 175 passes plus the
same single Daju baseline failure; excluding that named baseline test, its
175 tests all passed. New failures: **0**. The baseline failures are not
silently labeled green and are not fixed under DB7B's scope.
