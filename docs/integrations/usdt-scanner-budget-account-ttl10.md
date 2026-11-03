# Order-driven scan progress and account recharge expiry

This change is development-only until its independent PR, migration and full-SHA release are reviewed. It does not change the live provider, create live recharge orders, authorize payments or change Bitrefill.

## Bounded scan progress

Each run retains one provider, head/finalized snapshot, block cache, deadline and lease. Windows are ordered by `created_at ASC, id ASC`. The real timestamp planner receives one window at a time; its chunks are anchored and atomically applied before the next window is planned. No estimated block time or per-method fallback is introduced.

The hard cap is **128 network RPC reads including chain/token validation**. Before a new window or chunk the runner reserves 16 requests and 5 seconds. A dense chunk or expensive planner can still reach the hard cap; that unfinished chunk is never applied. After at least one verified atomic commit, budget termination returns success with `idleReason=RESOURCE_BUDGET`. Without a committed chunk it remains `ORDER_SCAN_RESOURCE_BUDGET`, including dry runs. Provider failures still fail closed; they are not converted into budget success. Lease release always uses the owned token. Failed release leaves the existing bounded database lease, never clears another runner's lease.

Subsequent timer runs start from database CAS progress. Overlapping windows can reread the same chain range; the existing chain claim, financial transaction and unique ledger enforce exactly-once credit. A successful budget stop proves partial progress, not completion of every leased window.

## Expiry contracts

| Business | New expiry | Existing records |
|---|---:|---|
| Account recharge: USDT/BEP20, Alipay, WeChat | 600 seconds | Persisted `expires_at` unchanged |
| Shop order payment | 900 seconds | Unchanged |
| USDT planner, database lease/apply | Exactly 600 or 900 seconds | Legacy 900-second windows remain eligible |

`account-recharge-expiry.mjs` owns the account interval. Liuhaoyi recharge helpers use it. Recharge payment sessions inherit the record's persisted expiry; provider creation does not calculate another deadline. The general `payment-expiry.mjs` stays at 15 minutes. UI countdowns continue to use the server expiry; no UI redesign is required.

Fingerprint quarantine remains `expires_at + 24 hours`. Transfer **block timestamp** determines payment timeliness: payment within the 10-minute window can gain its required confirmations afterwards and still credit. Payments after expiry cannot credit automatically. Eleven-, twelve- and twenty-minute malformed windows are rejected.

Audit of production code found the remaining `900000`/15-minute constant only in the shop payment helper and the explicit legacy planner allowlist. Historical migrations and SQL snapshots remain untouched; changed assertions follow the separated account/shop contracts.

## Forward migration and staged release

New migration: `supabase/migrations/20261103054024_account_recharge_ttl10_order_scanner_compat.sql` (created with Supabase CLI `migration new`). It only replaces the TTL predicates in these two existing function definitions:

| Signature | Required pre-migration canonical definition MD5 |
|---|---|
| `lease_recharge_order_scan_v1(text,text,boolean)` | `4872e61fee39c3d2333ea6359eadbe2c` |
| `apply_recharge_order_scan_chunk_v1(uuid,jsonb,jsonb,integer,text,text,timestamptz)` | `8dcda5d2cac5a66ce2c41bf81dcfa67e` |

Definitions normalize CR line endings only before fingerprint comparison. Preflight rejects overload/source drift, a non-order-driven control row, an active lease, or preexisting ten-minute USDT rows requiring review. A row lock serializes against new leases. The transaction verifies owner, ACL, fixed `search_path`, security-definer state and final definitions are preserved. It does not rewrite records, wrap/replace financial core functions, waive history or activate scanning. Source drift means STOP and review, not rebase the fingerprint to accept an unknown function.

Future Production sequence, **not executed by this PR**:

1. Read-only `ops/account-recharge-ttl10-precheck.sql` against the authorized Production project `qvbovrvybirscaurwuov`; verify immutable release and rollback prerequisites. Preserve existing backup/recovery policy and authorization requirements.
2. Apply only this forward migration through the existing reviewed migration process when no active lease exists. Verify normal migration history plus `ops/account-recharge-ttl10-postcheck.sql`. Do not replay historical SQL or manufacture Production fixture orders as a schema test.
3. Deploy the exact reviewed full SHA through `production-release.sh` preflight/prepare/3002 smoke/switch. The application now creates ten-minute account recharges; shop order payments remain fifteen minutes.
4. Change only the dedicated scanner override to `RECHARGE_BEP20_RPC_URL=https://bsc-rpc.publicnode.com` in the existing long-term env source. Keep `BSC_RPC_URL`, Daju, payment and Bitrefill settings intact. Load the env with the necessary single controlled application restart under the established deployment procedure; do not perform a second redundant restart.
5. Observe the automatic systemd timer, not a manual scanner POST. Check old fifteen-minute progress, HTTP 200 budget stops with actual durable progress, bounded reads, lease release and eventual completion. Do not equate a 200 without progress to recovery.
6. Only after that observation, under the reviewed no-payment acceptance scope, check new USDT start/progress and a 600-second stored expiry; check new Alipay/WeChat recharge and session expiries equal 600 seconds. No real CNY or USDT payment is authorized by these checks.

If migration guards, immutable build/smoke, runtime identity, lease/CAS, anchors or automatic progress fail, STOP. Do not repeatedly call the scanner or restart a historical catch-up scanner. Use the already verified safe-stop release under the applicable release authorization. Retain successfully committed financial/progress rows. Application rollback can leave the additive dual-TTL predicates in place: the old app creates fifteen-minute records. Do not reverse the migration to fifteen-minute-only after new ten-minute records exist. The old application is not an acceptable continuing scanner for ten-minute records; keep scans safely stopped pending a corrected release. Never restore a whole old database over newer orders or balances.

## Validation boundary

The PG17 test uses committed schema-only Test metadata, synthetic users/recharges/transfers, an owned loopback cluster and the actual planner/transport/scanner plus real lease/apply/ledger SQL. It has no Production connection or credential. Linux CI repeats these scenarios without real customer data or a public deployment. Full application tests, typecheck and build are separate checks; their success does not prove a Production migration, deployment, automatic timer recovery or real funds E2E.
