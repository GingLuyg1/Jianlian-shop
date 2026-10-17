# Bitrefill RC1 — unified local candidate / release review

2026-10-16, LOCAL ONLY. **Not Production-ready and not an execution instruction.**
This is a unified DB9/P1/P2/P3 review candidate, not V1.4. No Production or
business Test database access, Bitrefill API request, real invoice/payment/
purchase, push, PR, merge to main, deployment or environment installation occurs.

## 1. Frozen inputs and complete integration chain

New worktree: `D:/Jianlian/Jianlian-shop-bitrefill-rc1-integration`.
Branch: `codex/bitrefill-rc1-local-integration`.
Start: `6c53783ccffc5137b523e4f62a0a81b2a2c6489a`, clean DB9.

Common ancestor: `ed8a9c492d755461e09441b324f3e317f4c64321` (DB7B).

| Line | Full commit | Purpose |
| --- | --- | --- |
| DB9 | 7442df060846413fc618048851c83b8c93206810 | RPC/table ACL hardening |
| DB9 | d31d445d81ef598450c6fd525d0a8f129787fca5 | real-role, owner, inheritance and atomic tests |
| DB9 | 6c53783ccffc5137b523e4f62a0a81b2a2c6489a | evidence / DB10 draft |
| P1 | d9caf25cdbf963bc33f1d817214f4dc2f2aeb7d2 | closed single-item balance purchase adapter |
| P1 | 761947367f66ddfc5c8493219fe614d684ed775a | purchase wiring evidence |
| P2 | 8708ce89e59342a4695640beb8c668ee7611a019 | paid-order integration |
| P2 | d4262587b2c6fa182acaa260645f340ef84ae6af | continuous local purchase/delivery E2E |
| P2 | da8eb3c7da382534778cb2c570129dea2ab2002d | UI/API handoff |
| P3 | 36cfc3ff71ad81f187cf4ab2e8c314097ac4b265 | financial/payment/child/restart guards |
| P3 | 8241932f58fa85384ee9e857cf4140e9fdf6a2f7 | guard tests |
| P3 | 03b9155c8005a3aeb91fccaca0bd975e38bad758 | bounded stability acceptance |
| P3 | fcc2d7c73118120e8952f95dad0d1b9b2d553b19 | prelaunch handoff |

P1 is ancestor of P2; P2 is ancestor of P3. DB9/P3 diverge at DB7B. RC1 locally
merges P3 once into DB9 so all inputs remain in history. No duplicated cherry-
picks, source-worktree edits or history rewriting. The premerge matrix is
[bitrefill-rc1-integration-matrix.md](bitrefill-rc1-integration-matrix.md).

Remote main was read-only verified through GitHub at4575d802d653e4dca726427bce826aa68c93d9e2;
local main48a7a3a… is stale and was not integrated. PR78 remains open/unmerged at
7f9a25b1bfe1fadf553179074f8f4c8869568ed4 with31 files. It is inherited history,
not another patch to apply. The only incoming P3-path overlap with that PR is
supplier-router.ts. Source/PR/main scope is analysis only; no remote mutation.

## 2. Conflict resolution and checksum adoption

One textual conflict: `tests/support/supplier-v13-db5-local-e2e.mjs`, its SQL
execution helper. Resolution combines DB9's explicit trusted-owner SET ROLE
prefix with P3's UTF-8 stdin, statement/lock limits and child-command timeout.
Both behaviors are necessary and nonexclusive. All DB9 fixture-owner/default-
ACL changes and all P1/P2/P3 application cases remain. No ours/theirs shortcut.

The shared fixture checksum update and P1's CRLF-only canonicalization auto-
merged. P3's old checksum assertion was intentionally repinned to DB9 and given
an RC1-specific title; old migration bytes were not copied back. A new RC1 test
checks **raw file bytes**, not just normalized strings. Historical P1/P2/P3
documents describe their frozen old branches; their old SHA and gate statuses
are not the authority for this integrated candidate.

Final unchanged candidate:
`supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql`.

SHA256: `90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`.

No migration, protected historical recharge SQL, payment/recharge/order-core,
app/components/hooks, product/binding, dependency or environment file changes
relative to DB9. Existing source worktrees remain frozen and clean. Dependencies
are reused via an ignored node_modules junction; no install/lockfile change.

## 3. Unified application path and limits

The same synthetic unpaid order/item/SKU is inserted in the disposable fixture;
premature fulfillment is denied. Exact repository pay_order_with_balance and
complete_order_payment RPCs confirm payment. Actual transpiled TypeScript
Delivery Service and Supplier Router invoke the explicitly injected local
Bitrefill handler. It validates paid state, trusted-shaped synthetic finance,
binding, fresh catalog/package, quote expiry/currency/cap/profit and synthetic
supplier funds. V1.3 claim freezes unit/hash, P1 submits FakeTransport invoice,
persists ID, GET-correlates sole child, then DB9 controlled RPC atomically links
the existing private outcome/secret store. Existing customer delivery RPC returns
the same order's card only to its owner. Another user/anon cannot read it.

This is a continuous service/SQL E2E, NOT browser checkout, Next HTTP route or
create_order_with_item RPC acceptance. Payment/customer fixture tables are
minimal synthetic structures, not a full Production clone. Local reservation/
delivery callbacks and Daju networking are explicit collaborators in that
application test; independent inventory/Daju regressions provide their evidence.
The default production registry stays Daju-only; actual payment callbacks do
not inject the local-only Bitrefill handler. No production worker is installed.

Customer balance is debited by the unchanged customer payment RPC only once
over10 replays, while supplier invoice submission remains once. Supplier funds
tests use injected synthetic evidence; there is no real balance endpoint read,
shared supplier wallet reservation or customer-debit call in the supplier adapter.
Insufficient/unknown supplier funds do not trigger customer refunds or re-debits.

Initial candidate remains one Jianlian item of quantity1 → one invoice → one
verified sole child. GET child ID/product/face and provided currency/package/
invoice/quantity evidence must agree; no array-position guess. Multiple/missing/
wrong child, PIN-only/instructions-only payload or unsafe URL fails closed.
Invoice complete is not all-child-delivered. The older20+1/21-child synthetic
tests remain; real batch purchase stays disabled.

## 4. DB9 permission and private transaction contract

All five new tables retain RLS, no policies, postgres owner and SELECT-only
service_role access. Explicit REVOKE covers PUBLIC/anon/authenticated/service_role
creation defaults, including PG17 MAINTAIN; BYPASSRLS is not a substitute for
table privileges. Real local SET ROLE tests attempt I/U/D/TRUNCATE/REFERENCES/
TRIGGER and deny them for each app role/table. Effective metadata checks cover
columns and inherited USAGE/SET grants; hostile inheritance rolls back DDL.

Exactly six internal JSONB RPCs (including deliver_child) retain DEFINER,
pg_catalog path, qualified objects and exact-overload service-only EXECUTE.
Three guard helpers remain INVOKER and are not directly executable by app roles.
No new owner/role requirement or direct-write grant is introduced by RC1.
Actual service calls exercise all six under the DB9 default/owner model.

Claim validates server paid order/root/frozen supplier mapping and cost bounds;
same logical key with a different semantic hash conflicts. SUBMITTING/UNCERTAIN
cannot return to automatic submit. Known durable invoice uses GET; unknown ID
stops for manual reconciliation. A pre-send CLAIMED restart requires identical
original still-valid finance/quote evidence, not a replacement quote; the hash
does not reconstruct missing evidence. Real persistence of that source still
requires separately reviewed infrastructure.

Private delivery reuses internal_supplier_purchase_deliver_child and the
existing record_supplier_fulfillment_outcome transaction. Request/token/item/
supplier/child correlation and delivered status are checked; uniqueness and
locking prevent two writers or lost-ACK restart duplicating secrets. No card is
stored in ordinary logs, webhook payload storage, cost/evidence or customer
general order lists. Refund/dispute/payment gates are rerun before private write;
authoritative Production atomic refund policy is not proved by synthetic ledgers.

## 5. Reproducible local validation

Command: `node tests/support/bitrefill-rc1-local-acceptance.mjs --local-pinned --stability-seconds=60`.
The launcher strips inherited libpq/supplier/Supabase/DB-URL settings from child
processes, supplies only the existing local disposable credential privately,
and creates no environment files/persistent settings. Guarded runners verify
127.0.0.1:55433, PostgreSQL17.11 and the exact dedicated data directory before
creating randomly named disposable databases; only their own databases are
dropped. Windows pg_ctl restricted-token start failed; the existing documented
direct postgres.exe method starts it hidden, loopback only, without a service.

Generated logs are outside Git at `D:/Jianlian/_bitrefill_v13_local_pg/`:

| Check | Result / log |
| --- | --- |
| P1/P2/P3/RC1 + DB9/V1.3 contract tests |54/54 PASS; rc1-focused-final.log |
| Daju/shared supplier contract |56/56 PASS; rc1-daju.log |
| Local Inventory, payment-failed/balance/post-payment, activation isolation |83/83 PASS; rc1-isolation-regression.log |
| TypeScript |PASS, npm run typecheck |
| Targeted ESLint |PASS, incoming and new JS/TS modules/tests |
| Full suite |1501 total,1495 pass,6 known failures; rc1-full-suite-final2.log; exit1, NEW_FAILURES=0 |
| One normal build |BLOCKED_EXTERNAL_FONT_NETWORK, Inter connect EACCES; rc1-build.log; no UI/font edits |
| DB9 real-role ACL/owner/atomic failure tests |PASS, independently completed and repeated by RC1 launcher |
| Unified disposable DB5/P1/P2/P3 + post-install plan + fresh DB7B |PASS, complete launcher exit0; rc1-local-acceptance.log final run |

Full-suite failure names (all pre-existing; no test suppressed): immutable-input/
environment refs, official targets, dry-run/execute file use, libpq connection
overrides, Production confirmation text, psql status/redaction in migration-
runner.test.mjs. The seventh historical Daju snapshot assertion passes in this
checkout with no Daju/historical source changes. Zero new failures does NOT mean
the full suite exits successfully. Build is NOT described as passing.

The new postmigration-plan tests run64 metadata assertions, then10 intentional
local metadata/history mutations inside rolled-back transactions. Production
never runs these negatives. See the final acceptance update for actual results.
The RC1 soak is explicitly60 seconds, not a fresh30-minute stability certificate;
P3's historical30-minute result belongs to its frozen earlier candidate.

The final focused set is54/54 (`rc1-focused-final.log`), including the added
history-fixture regression and fail-closed evidence-difference classifier.
The supplemental metadata rehearsal initially tried to create a schema already
provided by the scoped fixture; it was corrected to assert the existing history
is empty and insert only the synthetic version row in its owned disposable DB.
No migration SQL or frozen fixture needed changes for that correction.

### Frozen evidence versus line-ending-dependent source hashes

RC1 checks out source as LF. The historical DB9 fixture was assembled from a
CRLF checkout; pg_get_functiondef preserves those body bytes. Initial replay
therefore generated a different raw v1 hash for one existing outcome-function
row, not a SQL behavior/ACL/owner change. The generator's intermediate manifest
edit was reverted precisely; **the DB9 manifest and v1 hash algorithm remain
unchanged**. The final RC1 replay uses `--rc1-preserve-manifest`, never writes
that baseline, and compares every current contract row with the frozen input.
Only the exact outcome function may differ, only in definition_md5, and only
when reconstructing the captured current function body with LF versus CRLF
independently reproduces the frozen MD5. Arbitrary source/metadata/other-object
changes fail the comparison; negative unit cases verify that. No source SQL is
rewritten to match evidence and no canonical hash is normalized or called equal.

- Frozen v1 fingerprint: e036759cd8baa297a4de29c3bf3dc1460bd7959fdc00ebb26a6b7807849193fb.
- Observed LF fixture fingerprint:5d5eae30d3cca15c98f83e38019823eb0cd4d9feebc82ded4d93e4ea3737fcea.
- Frozen outcome source MD5:fc74424660de9098b5da87ddaa576924.
- LF outcome source MD5:f227ecfebf951752abeea83fa2331760.
- Classification: COMPATIBLE_WITH_DOCUMENTED_DIFFERENCE, not byte-identical
  full-fingerprint parity. The comparable non-stub aggregate remains unchanged.

The initial successful functional replay was not considered sufficient for this
new guard. The final run passed both fresh databases with exactly that one
proved EOL-only difference, identical observed raw hashes, and no frozen
manifest change. No difference was relabeled as byte-identical parity.

## 6. DB10 evidence is historical premigration acceptance

DB10 report is outside Git:
`D:/Jianlian/_bitrefill-db10-readonly-evidence-20261016/report.md`.
It passes the same-SHA candidate's **premigration** schema/ACL/owner compatibility.
RC1 does not reconnect to Production or refresh those observations. State and
authorization must be checked again before any later action.

V13_DB_GATE_COMPLETE=yes
POST_MIGRATION_PRODUCTION_ACL_VERIFIED=no
POST_MIGRATION_PRODUCTION_RPC_E2E_VERIFIED=no
V13_FULL_RELEASE_ACCEPTANCE=no

## 7. Production migration review prerequisites — all execution pending

An independently authorized review must pin this integrated Git artifact,
unchanged migration SHA and usable existing postgres executor. Recheck current
project identity, migration absence/history, target collisions, dirty aggregates,
owners/defaults/memberships and DB10 scope. Review backup/restore readiness,
operator, time window, statement/lock timeouts and incident ownership. Do not
run all historical migrations, db push/repair/reset or protected audit SQL.
Only the exact forward candidate may be separately authorized for execution.

Existing DB10 owner comparison is not permission to create/alter roles. Future
executor changes, permission drift or unexpected conflicts stop the migration;
never add broad write grants to make an application error disappear.

## 8. Planned post-install metadata verification

New independent plan:
[sql/bitrefill-rc1-postmigration-readonly.sql](sql/bitrefill-rc1-postmigration-readonly.sql).
It is exactly one SELECT over catalogs and migration history, intended to run
inside an independently approved READ ONLY transaction. It does not call a
business RPC or read a secret/order/payment row. It checks five tables, RLS/no
policies/owners, table and column mutation rights including reachable roles,
six RPC/three guard signatures/modes/paths/caller rights,22 indexes, constraint
type counts and complete definitions, three enabled guards, and history version.
Review returned definitions against the frozen SQL; counts alone are not an
exact schema/source attestation. Function source MD5s are supplied for review.

Supabase's migration version record does not natively prove source-file SHA.
The SQL intentionally returns source_sha_proven_by_version=false even when the
version exists. Independently hash the reviewed release artifact, preserve the
exact operator/deployment execution receipt and correlate the intended version;
do not label version presence as checksum equality. No custom Production SHA
table or schema change is invented for this check. This SELECT-only plan is
not runtime RPC E2E; any write probes require a separately authorized isolated
environment, never improvised Production synthetic transactions.

## 9. Environment, cost and real-purchase gates

No env file/value was installed or changed. Deployment review must keep
REAL_BITREFILL_PURCHASE_ENABLED=false in reviewed code; constructor opt-in,
credential presence or environment values cannot open POST. The older proposed
BITREFILL_PURCHASE_ENABLED env name is not an implemented release switch.
Review server-only BITREFILL_AUTH_MODE and Personal API_KEY or Business API_ID/
API_SECRET references, no NEXT_PUBLIC exposure, least authority, rotation,
redaction and log exports. RC1 does not install any Production credential.

REAL_PURCHASE_ENABLED=no
TRUSTED_LIVE_COST_AVAILABLE=no
LIVE_CHILD_IDENTITY_VERIFIED=no
READY_FOR_PRODUCTION_DEPLOYMENT=no

The pure balance/auto-pay request body and Personal Bearer/Business Basic adapter
are saved technical candidates, not live purchase permission or verified live
response evidence. No Personal deposit/balance interface is invented. Supplier
account funding remains official-site/manual. Obtain commercial/Business API
permission as applicable, authenticated live cost provenance/currency/expiry,
supplier-enforced atomic max spend or reviewed payment redesign, aggregate
funding/concurrency limits and authoritative paid allocation/fee/refund evidence.
Face value is never trusted cost; unknown FX/cost blocks purchase.

Independently validate real single-child identity/redemption/schema and explicitly
approved small-value limits before any canary. FakeTransport fields do not prove
the live contract. Even changing the code gate later requires an explicitly
network-blocked HTTP-write harness; existing release-blocked tests do not claim
the live POST branch was exercised. No canary is authorized by RC1.

## 10. Future code/DB/deployment sequence (planning only)

1. Human reviews this local candidate, integration parents, checks and exceptions.
2. Separately coordinate existing PR78: either review the unified candidate as
   its successor or integrate the approved old layer first and reassess RC1's
   remaining diff. Do not duplicate patches or silently alter/close PR78.
3. Obtain independent remote code-integration authority, rerun acceptance against
   current main; no merge/push happens during this task.
4. Separately review/authorize the exact migration and backup/verification plan.
   Apply only after that approval, then separately authorize post-install reads.
5. Obtain deployment authorization for a reviewed closed-purchase artifact; verify
   unchanged payment/recharge/local-stock/Daju behavior and server credential
   boundaries. Do not infer deployment permission from DB10/RC1 acceptance.
6. Resolve live cost/child/commercial/funds limits; independently authorize any
   real canary, subsequent narrow allowlist enablement and observation owner.
   No unverified Apple activation or live batch purchase.

## 11. Failure containment and recovery

Disable new procurement first; preserve customer payment, frozen attempts,
external IDs, semantic hashes, child links and private deliveries. If migration
fails before COMMIT, its existing transaction rolls back. After COMMIT, do not
drop five tables, delete attempts or run destructive down SQL: preserve evidence
and review a forward correction separately. Closing the purchase gate does not
undo a supplier debit, create a refund or justify buying again.

Known invoice → bounded authenticated GET reconciliation; unknown submitted ID
→ UNCERTAIN/manual review with no repeat POST. Existing suggested future GET
schedule is1/2/5/10/30 minutes, at most5 tries with jitter/quota awareness, then
manual escalation, not a scheduler installed by RC1. Replayed notifications are
wake-ups only. Lost delivery ACK must query/reuse the durable unique delivery,
not write another card. Legacy app rollback must retain compatible database
evidence and keep Bitrefill routing closed. No automatic data repair/refund.

## 12. Final local receipt

Complete final local acceptance exited0 after all stages: reproduced old unsafe
defaults, hardened five-table actual role denials, six service RPC executions,
owner/USAGE/SET fault atomicity, full DB5/P1/P2/P3 continuous paid-order path,
two-session concurrency/ACK-loss/restart checks,64 postmigration-plan assertions
and10 rollback negatives, and two fresh unchanged-input evidence replays.
All runner-owned random disposable databases were dropped by their finally
blocks. Final stability:60 seconds,7 cycles, max sampled sessions1, max RSS
111943680 bytes;35 fake submits,26 private deliveries,9 intentionally pending
children in the100-order batch. No card cross-order leakage or customer-balance
drift. No30-minute claim is made for RC1.

Final typecheck/targeted lint passed; full1501/1495/same6 known failures,
NEW_FAILURES=0; focused54/54, Daju56/56, isolation83/83. Build remains the recorded
external Inter networking blocker, not a successful build. The code release gate
remains false, default routing Daju-only, live cost/child proof unavailable.
DB9/P1/P2/P3 source HEADs and clean state were rechecked unchanged.

The local merge commit includes both exact DB9/P3 parents, the conflict resolution,
tests, premerge matrix and release plan. `git show --format=fuller --no-patch HEAD`
and `git rev-list --parents -1 HEAD` provide its immutable ID/parents after the
explicit local commit; no self-referential commit hash is embedded in this file.

RC1_LOCAL_INTEGRATION_COMPLETE=yes
V13_DB_GATE_COMPLETE=yes
POST_MIGRATION_PRODUCTION_ACL_VERIFIED=no
V13_FULL_RELEASE_ACCEPTANCE=no
REAL_PURCHASE_ENABLED=no
READY_FOR_PRODUCTION_DEPLOYMENT=no

Open review items: six known Windows migration-runner failures, external font
networking, documented fixture EOL difference, live cost/child/commercial/funds
limits, independent integration/migration/deployment/canary approvals. No local
acceptance blocker remains under the requested zero-new-failures baseline.
No release actions follow automatically. STOP after local handoff.

The Supabase/PostgreSQL security skills guided effective grants versus RLS,
exact-overload EXECUTE restrictions and inherited/SET-role checks. The existing
reviewed migration is not rewritten to follow generic new-schema advice. See
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
for the grants/RLS distinction; no remote advisor or database operation was used.
