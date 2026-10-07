# SNPAY late-payment manual review V1

Development base: `1ac25232fd96034c55b474e2e06ca5eaa5f6703f`.
This patch does **not** deploy, install its migration, or credit any real canary.

## Separate authorization boundary

Ordinary approval still accepts only `reviewing`. Expired remains terminal in the
normal state machine. Callback, reconciliation, timers, recovery and normal
completion functions are unchanged. No automatic late-payment credit is added.

Only an authenticated administrator can explicitly request `approve_late_payment`
at the existing recharge actions endpoint. A nonempty reason and UI confirmation
are required. Request amounts, timestamps, provider identity and screenshots are
not evidence and are never forwarded to the accounting RPC.

The server pins one persisted SNPAY provider-order session linked by business ID,
business number, user, channel and CNY amount. Zero or multiple provider-order
sessions fail closed. Alipay and WeChat only; BEP20 and Liuhaoyi are excluded.
An approval executes exactly one live `snpayProvider.queryPayment` (no retries).
The unchanged adapter validates HTTP/business result, RSA signature, response
timestamp, merchant/session/order identity, channel and merchant principal.
Trusted payment time must be strictly after **both** local expiries and creation
times, and no more than five minutes in the future. Paid-before-expiry is rejected
by this dedicated path, not redirected into generic completion.

## Database boundary

Forward migration:
`20261007100000_snpay_late_payment_manual_review_v1.sql`.
It installs one dedicated RPC and changes no historical rows or old functions.
Do not rerun historical expiry/repair migrations or assume migration history
records exist. Installation/deployment require a separate authorization.

RPC execution is revoked from PUBLIC, anon and authenticated; only service_role
may call it, and the supplied administrator must satisfy canonical `is_admin`.
Credentials/provider signature evidence are verified by the trusted server, not
the browser. The RPC independently checks all persisted identity, amount and
timestamp snapshots to catch concurrent changes.

Lock order matches canonical completion: session -> recharge -> profile. The
dedicated transaction follows the existing canonical balance_transactions
accounting schema without changing expired into a temporary permissive state or
weakening the old credit primitive. It adds exactly the principal to balance,
inserts one completed account_recharge credit, sets recharge to succeeded and
session to paid, preserves expiry, stores trusted paid_at, completion and review
fields, and inserts the review event atomically. Event/ledger/constraint failure
rolls back the balance change. Repeats require a consistent manually-completed
recharge, session, trusted paid time and exactly one matching ledger.

An approval-intent admin audit must succeed before any query/credit attempt.
Success and failure have allowlisted audit summaries; the atomic review event
remains authoritative if the post-commit HTTP/audit response is lost. RPC network
errors and post-credit audit failure return uncertain/manual-reconciliation;
never automatically retry. Inspect recharge, review event and ledger first.

## Validation and operation

Local integration tests use generated RSA keys, mock-only fetch and the real
route/service/SNPAY adapter/core. Unknown fetch targets or key files fail.
Ubuntu acceptance uses disposable localhost PostgreSQL only, guarded by CI,
PGHOST/PGPORT and database fixture identity, rejecting remote/libpq overrides.
It verifies real rollback, concurrent and repeat approval, ledger uniqueness and
delayed canonical callback completion. It never uses real Provider requests or
Production secrets.

Before separately authorizing deployment, require Ubuntu acceptance PASS,
read-only Production migration preflight, manual migration approval and a hidden
code deployment. Do not open public channels just to handle an expired exception.
Only then may a separately authorized administrator review a specific real case.

The simulated canary is principal 1.00 CNY with external checkout fee 0.03. Only
1.00 is credited; external fees are not refundable/creditable in this patch.
SNPAY external fee disclosure remains a separate follow-up, not mixed into this
accounting exception patch.
