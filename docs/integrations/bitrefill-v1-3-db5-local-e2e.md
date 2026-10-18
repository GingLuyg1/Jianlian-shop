# Bitrefill V1.3-DB5: local application + PostgreSQL E2E

DB9 current candidate SHA256:
`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`.
DB5 evidence/checksums below are historical. The same smoke runner now supports
`--db9-production-default-acl` for the explicit non-superuser owner plus DB8
default-ACL model. See [DB9 acceptance](bitrefill-v1-3-db9-acl-hardening.md).

Local-only acceptance on 2026-10-15. No Production or business Test database
read/write, no Bitrefill HTTP POST, no real invoice, payment, or purchase.
`V13_LOCAL_E2E_GATE_COMPLETE=yes` is separate from
`V13_AUTHORITATIVE_SCHEMA_PARITY_COMPLETE=no`; therefore
`V13_DB_GATE_COMPLETE=no` and release acceptance remains **no**.

## Reproducible runner and safety

Run [the DB5 runner](../../tests/support/supplier-v13-db5-local-e2e.mjs) with
`V13_PGHOST`, `V13_PGPORT`, `V13_PGUSER`, `V13_PSQL_PATH`,
`V13_EXPECTED_DATA_DIRECTORY`, and `PGPASSWORD` supplied locally. The runner
contains no username, drive letter, or machine path. It refuses a non-loopback
host, non-isolated port, wrong PostgreSQL version, unexpected local data
directory, or maintenance database containing business tables. It creates a
randomly named `jianlian_bitrefill_v13_db5_<hex>` database, applies the scoped
fixture and V1.3 migration, runs all cases, then drops only the database it
created. The five pre-migration dirty cases are independently reproducible via
[the dirty matrix runner](../../tests/support/supplier-v13-current-dirty-matrix.mjs).
All records are synthetic; disposable databases can be reconstructed by rerun.

The local delivery-support fixture supplies minimal test-only `auth.role` and
delivery-log/status helpers. It is **not** an authoritative Production clone.
The private transaction itself is the repository's exact
`record_supplier_fulfillment_outcome` function, extracted from its existing
migration at test time. Production schema/RLS/function equivalence remains
pending a separately authorized read-only review.

## Application and transaction results

The offline application adapter invokes the claim, transition, child, evidence,
webhook, and private-delivery RPCs. A real `BitrefillHttpTransport` is rejected
before invoice creation; its GET-only implementation was not changed.
`BitrefillFakeTransport` is the only purchase fixture.

- A 21-item frozen order split into 20 + 1. Two external invoice IDs and all
  21 child IDs persisted; each child joined to its exact internal order item.
  The fake response carries an explicit `client_reference` equal to the durable
  attempt-item ID. Positional matching is prohibited. **Whether a future live
  Business API purchase response provides equivalent correlation is not proven
  by this local test**; real purchase remains disabled.
- Repeating the same claim performed no second submit. A changed semantic hash
  failed closed. Restart after claim but before send submitted exactly once.
  A possibly sent timeout remained `UNCERTAIN`; restart performed zero submits.
  A definite pre-send failure was classified separately but conservatively
  remained `UNCERTAIN` because the durable SQL boundary does not permit a
  `SUBMITTING` → `CLAIMED` reversal. Persisted invoice ID recovery used fake GET
  and no create call.
- An invoice marked `complete` with delivered, pending, and failed children
  yielded only one delivery candidate. Pending/failed children had no delivery.
  One hundred identical webhook replays produced one receipt and one webhook
  reconciliation action. A webhook-triggered worker and polling worker used
  separate PostgreSQL sessions; child state and evidence converged to one row.
  Webhook payload fields containing synthetic redemption values were ignored.
- The original private outcome RPC could write delivery and secret atomically,
  but service-role could not link `supplier_external_orders.delivery_id` in that
  transaction. DB5 therefore adds only
  `internal_supplier_purchase_deliver_child` to the V1.3 migration. It calls
  the existing private outcome RPC and links the exact child in the **same**
  transaction. Two workers racing the same child left one delivery, one private
  secret row, and one child-to-delivery link.
- Crash before transaction, forced failure inside the secret insert (full
  rollback), and commit before lost acknowledgement all recovered without a
  missing or duplicate secret. The transaction-failure test verified root
  status, delivery row, child link, and secret rollback together.
- A dynamic scan of all text/JSON columns in 11 non-private public tables found
  zero matches for the two synthetic redemption markers. The markers existed
  only in `digital_delivery_secrets`; `delivery_logs` had zero matches. The
  application adapter has no console logging path.

## Security, activation, and scale

All five V1.3 tables had RLS enabled and no browser policies. For each table,
`anon` and `authenticated` were denied SELECT/INSERT/UPDATE/DELETE; service-role
could SELECT but not insert directly. All six internal RPCs were denied to
browser roles and granted to service-role. The six functions were owned by the
local test role, `SECURITY DEFINER`, with `search_path=pg_catalog`.

The P2.3 original evaluator and V1.3 replacement agreed on 27 Daju cases.
Bitrefill boolean availability passed only with the complete fresh evidence;
UNKNOWN, stale, and error states remained blocked. Ten synthetic Apple face
values did not activate or write a SKU or supplier binding.

The local performance fixture added at least 1,000 supplier attempts/invoices,
1,000 external children, and 1,000 webhook receipts. Five
`EXPLAIN (ANALYZE, BUFFERS)` checks confirmed usable indexes for logical key,
external invoice, external child, single-state bounded reconciliation, and
webhook fingerprint lookups. No millisecond SLA is asserted. A cross-status
sorted reconciliation query chose another index plus sort at this scale;
workers should page **one state at a time** with a finite limit to use the
ordered reconciliation index. No worker/cron was created.

The five applicable pre-migration dirty states—duplicate logical purchase,
duplicate external invoice evidence, orphan root, invalid state, and missing
frozen binding—each aborted atomically with no partial V1.3 objects.
`DIRTY_EXTERNAL_CHILD_PREMIGRATION=N/A_BY_DESIGN`: the child table is new in
V1.3, so no old child table was fabricated. Post-migration duplicate child
binding was idempotent for the same unit and rejected for another unit.

## Candidate checksum and remaining gates

The amended V1.3 candidate SHA-256 is
`2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108`.
It applied cleanly to a **fresh** local database and passed the DB5 runner.
No historical migration was modified. TypeScript and targeted ESLint passed.
The full suite ran 1,451 tests: 1,444 passed, the same seven known baseline
failures remained, and no new failure appeared. Build failed only while
fetching the existing Google Fonts Inter asset (`connect EACCES`); no UI or
font source was modified. This build environment blocker is separate from the
local database E2E gate and blocks full release acceptance.

Before any Production migration, separately authorize and complete current
Production schema, policy, function, and candidate-checksum parity checks.
Real Bitrefill child correlation must also be established from an authorized
Business API contract before enabling purchase. DB5 does not authorize a
Production change, supplier binding write, real purchase, or V1.4 work.
