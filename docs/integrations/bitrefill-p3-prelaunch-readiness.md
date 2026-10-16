# Bitrefill P3 prelaunch readiness — LOCAL ONLY

Date: 2026-10-16, Asia/Shanghai. This is not Production Ready, DB8 acceptance,
commercial permission, a migration instruction or authorization to spend funds.

## Lineage and safety boundary

- Frozen DB7B: `ed8a9c492d755461e09441b324f3e317f4c64321`.
- Frozen P1: `761947367f66ddfc5c8493219fe614d684ed775a`.
- P2B final: `da8eb3c7da382534778cb2c570129dea2ab2002d`, clean before P3.
  Local commits: `8708ce8` feature, `d426258` E2E, `da8eb3c` contract/evidence.
- P3: `codex/bitrefill-purchase-prelaunch-hardening-p3`, independent worktree,
  based on that P2B final commit, not main. P1/P2B/DB7B worktrees stay unchanged.
- No Production or business Test database access, real Bitrefill API request,
  purchase, payment, balance read, supplier binding, UI change, environment file,
  dependency, migration edit, remote operation or V1.4 work.

## Implemented local guards

`prelaunch-policy.mjs` has a reviewed-code release constant fixed to **false**.
Both the single-item HTTP entry and independent purchase transport enforce it;
constructor `purchaseEnabled:true`, credentials or an environment change cannot
open POST. The existing catalog transport remains GET-only. The active supplier
registry remains Daju-only. There is no registered purchase route or scheduler.

`buildBitrefillBalanceInvoiceBody` prepares pure data for the saved P1 contract:
one fixed product/package, quantity 1, `payment_method=balance`, `auto_pay=true`.
It uses no network. Personal Bearer and Business Basic encoding are exercised
with synthetic credentials and mock GET only. The live account's permission and
purchase response contract are not established by these tests. No Personal
deposit API is invented; account funding remains manual on the supplier site.
After P3 hardening, even mocked HTTP POST is release-blocked; the request body
is checked as pure data and submission behavior through FakeTransport. This
supersedes the older P1 test description. Future release work must separately
exercise the HTTP write branch in an explicitly network-blocked harness before
any real canary, without weakening the deployed release gate.
The saved auto-pay body has no verified supplier-enforced maximum-spend field.
An application quote check alone cannot prevent an upstream price change during
the debit. Confirm a binding quote/atomic spend-limit mechanism or redesign the
separately authorized payment sequence before enabling real auto-pay; do not
invent an undocumented parameter. Checking a returned cost after debit is not
an adequate substitute for this funds-risk gate.

The local handler accepts only explicit FakeTransport, synthetic ledger, quote
and balance providers. Quote identity, quantity, strict decimal strings,
currency, source, checked-at, expiry (maximum five-minute window) and spend cap
are normalized. Costs never come from face value. Net profit uses exact BigInt
six-decimal units: paid allocation minus payment fee, other explicit fees and
supplier cost. Different currency/unknown FX is blocked; no exchange service is
called. Balance sufficient/insufficient/unknown/timeout are synthetic, not a
claim that a real balance endpoint was read. Guard failures use existing
`FAILED_VALIDATION`, retryable false, and safe fixed error codes where a root
has been claimed; they do not create refunds or supplier funding operations.
The sufficient-balance fixture is a per-request evidence category, not an
atomically reserved shared supplier ledger or aggregate spend budget. Do not
infer real account capacity from the mixed-batch totals; future rollout must
verify upstream insufficient-funds behavior and separately approved global
spend/concurrency controls without assuming a supported Personal balance API.

Server order state must be paid and on an explicit eligible status allowlist.
The injected server ledger must say paid, no pending refund and no dispute.
Immediately before submit, the candidate/product/quote/finance gates run again;
after supplier GET and immediately before private write, payment/refund/dispute
are checked again. Existing SQL owns final claim/payment and delivery locking.
No browser payment flag, payment callback change or customer balance code was
added. Production atomic refund/dispute policy still needs separate validation
against its authoritative ledger/schema; these checks are not that proof.

The existing durable semantic hash additionally covers the normalized quote and
explicit other fees. A crash in `CLAIMED`, provably before send, can resume only
with **identical**, still-valid original evidence and the SQL CAS winner. A new
quote or semantic hash cannot replace it. The hash cannot reconstruct missing
finance/expiry details: if the original source cannot reproduce them, stop for
manual handling. The test fixture deliberately reproduces immutable synthetic
evidence across new handler instances; no general Production restart source is
implemented. `SUBMITTING`/`UNCERTAIN` never resubmits. Lost invoice persistence
acknowledgement recovers by GET if the ID is durable; unknown ID remains manual.
Even a pre-send guard failure after the durable SUBMITTING boundary stays
conservatively UNCERTAIN; it is not automatically reset for retry.
An active CAS loser observing SUBMITTING leaves the winning worker's root
unchanged; marking it UNCERTAIN here would incorrectly invalidate the winner's
pre-send recheck. The initial duplicated-claim batch exercises this race.

Only the single verified child may deliver. Sole invoice membership, GET child
ID/status/product/face, and supplied quantity/currency/package/invoice fields
must agree. Missing/multiple/duplicate/wrong child fails closed; the root is
marked manual UNCERTAIN when safe. Instructions-only or PIN-only payload is not
a usable card. Invoice complete alone is insufficient. Card/PIN writes still
use `internal_supplier_purchase_deliver_child` and the existing private store;
no second storage or delivery system is introduced. Real batch purchase remains
closed; the 20+1/21-child synthetic test is preserved.

## Local acceptance and limits

P2B's continuous same-order test creates an unpaid synthetic order/item fixture,
rejects premature fulfillment, invokes the unchanged authoritative customer
balance/payment RPCs, invokes the actual transpiled TypeScript delivery service
and router, purchases via FakeTransport, GET-correlates the child, commits the
private delivery and reads it through the existing owner RPC. It is not browser
checkout or `create_order_with_item` HTTP acceptance. Two overlapping SQL calls
prove distinct backend session IDs; all adapter SQL calls use independent real
local psql connections. No in-memory DB is substituted for transaction tests.

P3 adds fault injection for lost claim acknowledgement, lost external-ID commit
acknowledgement, lost private delivery acknowledgement, temporary DB connection
failure, GET failure, simulated 403/not_available, 429, 500 and POST timeout.
The temporary connection failure is an injected adapter `08006` result; it does
not stop the PostgreSQL cluster or simulate every real infrastructure outage.
All submit-side ambiguity is no-retry; known ID uses GET. Refund/dispute arising
during the final GET blocks the private write. Unit tests reject invalid child
fields/schema, unsafe redemption URL and unusable card data.

The mixed batch has exactly 100 synthetic orders: 25 normal Bitrefill, 15 Daju,
15 local inventory, 10 unbound, 10 unpaid, 10 insufficient balance, 5 untrusted
cost and 10 supplier-processing. It runs duplicate initial claims, 100 additional
paid events and 100 repeated wake-up receipts with bounded concurrency four.
Expected: 35 fake submits, 26 private deliveries (one pending child later
progresses), nine still processing, no guard bypass, cross-order secret or
customer balance change. Daju is a routing collaborator stub; local inventory
is a local-priority stub plus no-supplier routing assertion. Their independent
regression suites supply provider/inventory evidence, not the batch stubs.

The reproducible DB5/P2B/P3 entry is
`tests/support/supplier-v13-db5-local-e2e.mjs --p3-stability-seconds=1800`.
It requires the existing documented local-only process configuration/password,
checks loopback 127.0.0.1:55433, PG 17.11 and exact isolated data directory,
creates a random owned disposable DB and drops only that DB in `finally`.
No secrets belong in shell command literals or logs. Soak bounds: 1800 seconds,
at most 200 cycles, eight events per cycle, at most four concurrent jobs, 768 MiB
Node RSS and eight per-DB sessions. SQL statement/lock timeouts are 15/5 seconds,
each child command is limited to 30 seconds, sleeps at most ten seconds. Every
cycle checks the release switch and unchanged submit count; periodic webhook
replays and final SQL assertions check delivery/secret/cost/balance invariants.
Pending is expected for unresolved supplier children, not proof of a state hang.
These are containment limits, not a performance SLA or Production capacity test.
Session samples are taken after each bounded cycle to detect leaked connections;
they are not measurements of peak simultaneous connection count.
Soak timing uses a monotonic clock, checks wall-clock drift and rejects any
cycle gap over 60 seconds. Host suspension/clock jumps make the run inconclusive,
not a PASS. This was added after an interrupted run reported inflated elapsed
time and a PostgreSQL child-command timeout; the final acceptance requires a
fresh complete run, including the post-soak security/index checks and cleanup.

Acceptance result/metrics are recorded below after the completed run. The full
runner also preserves private rollback/concurrency, logical/external ID
uniqueness, owner/other-user/anonymous checks, RLS/ACL/function security,
activation isolation, synthetic secret-table scan and local index checks.

## DB8 local rehearsal, not authoritative parity

Frozen `bitrefill-v1-3-authoritative-parity.sql` is exercised against local
metadata. Transactional mutations verify detection of policy, table ACL,
function EXECUTE, search_path, constraint and trigger-definition differences;
each transaction rolls back and returns the original fingerprint.
The frozen v1 query omits `pg_trigger.tgenabled`: disabling a trigger without
changing its definition was **not detected**. It was not rewritten. The new
SELECT-only `sql/bitrefill-p3-trigger-enabled-parity.sql` supplements this gap;
a separate disable/rollback test verifies detection. Future DB8 must review
both queries and their precise scope; this is not a full-schema attestation.

The V1.3 migration remains byte-for-byte unchanged in Git. LF-canonical SHA256:
`2b31673100d15b6c55968aa71eb092a5f278032f8ec808e3a3f5b949fa38d108`.
Only an owned disposable database uses the frozen SQL. No historical or protected
recharge SQL is edited. Local security checks follow least privilege and RLS;
no public secret-table access is added outside rolled-back negative tests.

## Independent rollout gates — all Production actions NOT STARTED

1. Separately authorize DB8 authoritative SELECT-only schema/RLS/ACL/function
   comparison; review supplemental trigger-enabled evidence, missing objects,
   data drift and actual role behavior. Local fixture is not a Production clone.
2. Review migration compatibility; obtain independent migration authorization,
   backup/rollback/verification plan. Do not rewrite deployed history.
3. Review backend changes and obtain merge/deployment authority independently.
   UI handoff is `bitrefill-p3-ui-handoff.md`; no frontend Bitrefill/key access.
4. Review server-only credentials, redaction, permissions and closed switch.
   Credential presence alone grants no ability to buy. Review rotation/revocation.
5. Confirm a trusted live supplier cost/currency/expiry/max-spend source and real
   payment allocation/fees/FX provenance. `TRUSTED_LIVE_COST_AVAILABLE=no`.
6. Confirm the live sole-child identity/status/redemption contract without
   array-position guesses. `LIVE_CHILD_IDENTITY_VERIFIED=no`. Keep batch closed.
7. Confirm supplier account/commercial resale permissions, including Business
   requirements where applicable. Personal protocol development is not a waiver.
8. Obtain separate explicit small-value canary authorization (invoice, balance
   debit/payment and actual secret handling), spend/product/quantity limit and
   observation/recovery owner. No current authority covers any real canary.
9. Only after all gates: separately approve reviewed backend enablement for a
   narrow verified product allowlist; do not activate unverified Apple SKUs.
10. Establish bounded authenticated GET reconciliation, safe IDs/state metrics,
    manual UNCERTAIN handling, credential rotation and incident ownership.
    Disable new purchases first on incidents; preserve durable attempts and
    dedupe evidence. Closing procurement does not undo a supplier debit. Resume
    only after reconciliation/review; never clear attempts to force a retry.

No Production timers/scheduled jobs, deployments, balance reads, funding APIs, manual-purchase endpoint,
automatic refunds or new public storage are created by this plan. See the UI
handoff's operator section for delay, insufficient balance, invalid-card and
refund/dispute handling without new promises or permission bypass.
Reuse the existing `supplier-operations-runbook.md` incident/rotation/cache
guidance and its proposed finite GET schedule (1, 2, 5, 10, 30 minutes, five
attempts with jitter/quota-aware waits, then manual handling). This is a future
reviewed schedule, not an installed worker. Its older schema-gap description
predates the V1.3 local model; current local evidence and unverified Production
parity are distinguished in this document. Edge rate limiting remains future
infrastructure work, not protection newly implemented by P3.

## Evidence receipt

Completed checks, final complete run 2026-10-16 (Asia/Shanghai):

| Check | Result |
| --- | --- |
| TypeScript | PASS, `npm run typecheck` |
| Targeted ESLint | PASS, all changed JavaScript modules/tests |
| Focused P1/P2/P3 + shared supplier contract | 38/38 passed, including interruption/clock-jump rejection |
| Bitrefill / V1.3 / supplier contract regressions | 108/108 passed |
| Local inventory / payment failed guard / balance / post-payment | 49/49 passed |
| Daju including shared supplier contract | 55/56 passed; unchanged historical snapshot assertion is known baseline |
| Full suite | 1490 total, 1483 passed, same 7 known baseline failures, NEW_FAILURES=0 |
| Build (one normal attempt) | EXTERNAL_FONT_NETWORK_BLOCKER: Google Fonts Inter connect EACCES; no font/UI workaround |
| Frozen migration hash | PASS, LF-canonical SHA256 above; no migration changes |
| Protected paths / dependency audit | No app/components/payment/recharge/order-core/history/dependency changes |
| Full disposable PG / 30-minute soak | PASS, complete DB5/P2B/P3 runner exit 0; 1801 seconds, 162 cycles |
| Soak sampled resources | max Node RSS 176447488 bytes (about 168.3 MiB); max per-DB post-cycle sessions 1; within stated bounds |
| Soak invariants | 35 fake submits unchanged, 26 private deliveries, nine children intentionally processing; no cross-order secret or balance drift |
| Secret scan | 14 non-private tables, zero card/PIN marker matches; ordinary delivery logs zero matches |
| Local security / activation / indexes | ACL, RLS, function owner/search_path, Apple/Daju isolation and five indexes on 1000-row datasets passed |
| Local DB8 rehearsal | Six frozen-query metadata drift classes plus supplemental disabled-trigger detection passed; each rollback restored its fingerprint |

The known failures are the unchanged Daju authoritative inventory snapshot-patch
assertion plus six `tests/unit/migration-runner.test.mjs` cases on this Windows
environment (input/ref validation, target validation, dry-run/execute,
connection environment, Production confirmation text, failure status/redaction).
These tests use local test doubles; no Production execution was attempted.
The full suite exits 1 due to those seven, not a green full-suite exit code.

Resolved during local development: the frozen parity query's disabled-trigger
blind spot (supplemental query, no rewrite), and a CAS-loser status update that
could stop the active winner (observe SUBMITTING without changing its root).
The strengthened batch is re-run after the fix. Baseline failing assertions
were not relaxed to claim success.

The final run also contains the monotonic-clock/interruption guard and passed
all post-soak checks before exiting 0. Its owned disposable database was dropped
by the runner. No interrupted run is counted as the final acceptance result.

`P2_LOCAL_ACCEPTANCE_COMPLETE=yes` (verified/reused),
`P3_LOCAL_PRELAUNCH_ACCEPTANCE=yes` against the explicitly allowed seven-failure
baseline and external-font build exception. This is **local acceptance only**.
`AUTHORITATIVE_SCHEMA_PARITY_COMPLETE=no`, `V13_DB_GATE_COMPLETE=no`,
`V13_FULL_RELEASE_ACCEPTANCE=no`, `TRUSTED_LIVE_COST_AVAILABLE=no`,
`LIVE_CHILD_IDENTITY_VERIFIED=no`, `REAL_PURCHASE_ENABLED=no`,
`READY_FOR_PRODUCTION_MIGRATION=no`, `V14_ALLOWED_TO_START=no`.

Tomorrow's review items: unchanged seven baseline failures and font networking;
separate DB8 read authorization; authoritative payment/refund/finance evidence;
trusted live cost and supplier-enforced spend limits; real child identity and
account/commercial permissions; independently authorized migration, deployment
and real canary. No push, PR, merge, Production or real funds action occurred.
