# SNPAY reliable reconciliation V1 — review only

Not installed or enabled in Production. This patch requires a separately
authorized code deployment, runtime configuration and service installation;
it requires **no new migration**. The already-applied paid-before-expiry
expired-state canonical function repair is a prerequisite, not something to rerun.

## Existing architecture and boundaries

Like the Liuhaoyi watcher, a root oneshot/flock CLI reads bounded candidates then
calls an authenticated localhost internal route. The dedicated SNPAY service uses
the existing pinned Provider adapter, payment_reconciliations unique dedupe key,
service-role client and **unchanged completePayment(source="reconciliation")**.
The generic Admin reconciliation policy remains query-only for SNPAY. This is
not a second credit engine. No callback, ledger, balance or RPC code is modified.

Candidate: SNPAY session itself, recharge/account_recharge, Alipay/WeChat, CNY,
pending/processing/expired, provider_order_no present, finite original lifetime.
Failed/closed/paid sessions never query automatically. Parent identity/owner,
provider/channel/currency/frozen amount must match; credited/completed or terminal
parents and ambiguous sibling sessions are excluded before querying.

Default creation lookback: **24h**, matching existing Liuhaoyi recovery bounds;
minimum age 60s. Pending/processing interval 60s; expired interval 300s. This
limited expired tail catches paid-in-window/missed-callback evidence without
permanently polling abandoned historical orders. It deliberately does not rescue
orders older than 24h; those require separately authorized exact review.

DB candidate query uses each status's persisted cadence and excludes NULL/empty
identity, NULL expiry and nonpositive amount before pagination. Stable keyset
order is created_at/id: four pages of 40 rows maximum (160 inspected), at most
4 dispatches serially. The last inspected key is saved in root-only heartbeat
metadata and resumed next run, then reset on exhaustion. Invalid/whitespace or
parent-excluded rows therefore cannot permanently pin the first page. Dry-run
does not write database throttles; the local cursor still provides fairness.
7s Provider timeout, 10s internal HTTP timeout, 45s worker budget; stop after two
query/HTTP errors. systemd has 50s outer timeout. Provider outages cannot run an
instant retry loop. Every execution first conditionally claims last_synced_at
against the observed version/status/provider; competing workers lose the claim.
No business status, amount or provider-transaction fields are written by a claim.

## Decisions

- Query exactly once using frozen session identity/amount/currency/channel. The
  real adapter verifies RSA, timestamp and merchant/order/type/amount context;
  safe explicit verification markers are checked again by the worker.
- Unpaid or not-found: no credit, no false failed status. Query error/timeout:
  no status corruption, generic safe query_failed evidence and persisted throttle.
- Paid with finite trusted paid_at inside **both** original lifetimes, not over
  five minutes in the future: re-read identity/state then call canonical completion
  once. Expired is never rewritten to pending. DB transaction/unique indexes are
  the final authority against callback/concurrent completion races.
- Late/missing/untrusted time: no auto-credit; deduped manual_review evidence.
  True late-payment evidence names snpay_late_payment_manual_v1 but never invokes
  manual approval. A failed canonical call is manual_review, never an alternate
  credit path. An HTTP/RPC timeout may have an uncertain outcome; future passes
  must re-read state and use canonical idempotency, not assume rollback.
- Default dry-run: query/decisions only, **zero DB mutation**, including no claim
  and no reconciliation row. Production execution requires all three gates:
  CLI --execute, service environment execute=true, and live app execute=true.
  Public channel enablement is unrelated and must remain closed during acceptance.

## Future runtime setup (not executed)

Root-only `/etc/jianlian/snpay-reconciliation.env` supplies enabled/execute gates,
`JIANLIAN_RELEASE_DIR` exact approved release, `JIANLIAN_INTERNAL_BASE_URL` localhost
3001 and **JIANLIAN_NODE_PATH absolute approved Node outside /root**. CLI loads
that release's existing production env via @next/env, like the app. Do not copy
RSA key contents into env/systemd/PM2; only the live app reads formal file paths
under /etc/jianlian. ProtectHome=true therefore remains safe. Both app and service
execute gates must be explicitly reviewed/enabled in a later authorized stage.

`jianlian-snpay-reconciliation.service`: root oneshot, explicit Node path, flock
`/run/lock/jianlian-snpay-reconciliation.lock`, strict filesystem, root-only runtime
directory. Timer: 60s after previous run ends, boot90s, jitter10s. No overlap.
No default EnvironmentFile or credential is created by this patch.

CLI emits counts only (checked/paid/completed/unpaid/manual_review/query_error/
skipped/duration), no IDs, URLs, payloads or credentials. Atomic root-only
`/run/jianlian-snpay-reconciliation/heartbeat.json` preserves last_successful_run
through failed runs; runtime directory persists after oneshot exit, not reboot.
Future alert should distinguish disabled/not-installed from a stale last success
(suggested >5min). Alert integration itself is not installed by this patch.

Each aggregate summary distinguishes scanned/eligible/processed/skipped_invalid,
provider_queries/resolved/error_count, progress_made, stop_reason and remaining
(boolean queue tail evidence, not an exact backlog count; null if unknown).
An empty queue is healthy idle. An inspected queue with zero effective queries
is no_progress, does not refresh last_successful_run, and returns a nonzero CLI
exit. Errors and scan/batch/time limits are explicit. One bounded aggregate log
per run contains no cursor or row identities; only root-only heartbeat stores
the cursor. Filtering means invalid rows outside the query are not backlog counts.

Internal route admission is process-local, acquired before body parsing and
released in finally on malformed input, gate denial or service error. It is not
a replica-wide lock. The V1 deployment contract is one flock-owned worker to
one localhost app; existing CAS claims and canonical database transactions
protect same-session competing processes and callbacks. Multi-replica global
query concurrency is not provided and requires a separately reviewed design.

## Acceptance / stop / rollback plan

Before installation: verify CI native PostgreSQL/RSA mock matrix, runtime Node
visibility under ProtectHome, canonical function ACL/baseline, internal secret,
and Provider credentials without revealing them. First use dry-run with gates
false and public channels closed. Separately authorized controlled execution must
prove one ledger and frozen principal only. Stop for schema/auth/signature/time/
identity mismatch, persistent timeout, unsafe skip/backlog, stale heartbeat or
duplicate credit; never activate failed rows or change expiries. Rollback disables
the new timer and execution gates under separate authorization; no financial
rollback or automatic schema rollback. Callback investigation remains required.

Local real DB matrix executes watcher -> internal route -> service -> real SNPAY
RSA adapter/core with mock fetch -> native PostgreSQL -> canonical completion.
Worker/worker and worker/callback completePayment races run 10 rounds each;
reconciliation dedupe and all zero-fund failure cases use actual SQL. Global
unmocked HTTP is forbidden. No real keys or Provider calls are used.
