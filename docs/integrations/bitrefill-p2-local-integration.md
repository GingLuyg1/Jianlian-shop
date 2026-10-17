# Bitrefill P2 local paid-order integration

Base: P1 `761947367f66ddfc5c8493219fe614d684ed775a`; isolated branch
`codex/bitrefill-paid-order-local-integration-p2`. The task attachment ends in
section 19 after “继续保”; only complete visible instructions were implemented.
P1 Personal Bearer/Business Basic support remains intact. No push, deployment,
Production/Test DB operation or Bitrefill network request was authorized here.

## Audited real call chain

1. `app/api/orders/route.ts`: authenticated order creation via
   `create_order_with_item`; server-selected product/SKU and frozen snapshot.
2. `lib/orders/balance-payment-service.ts`: trusted service-role
   `pay_order_with_balance` RPC, defined in
   `supabase/migrations/20260703_balance_order_payment.sql`; it owns the customer
   balance debit and paid transition. `runPostPaymentDelivery` invokes delivery
   after the RPC returns. The Bitrefill adapter never touches this balance.
3. `lib/payments/complete-payment-service.ts`: verified provider completion
   invokes `complete_payment_session`, then `deliverDigitalOrder` for an order.
   `lib/payments/bep20-chain-service.ts` likewise invokes delivery after its
   authoritative settlement boundary. Frontend notifications are not authority.
4. `lib/delivery/delivery-service.ts`: existing reservation RPC,
   `deliver_digital_order`, then `fulfillSupplierOrderWithSupabase` via existing
   `runLocalStockPriorityDelivery` orchestration.
5. `lib/providers/core/supplier-router.ts` and `supplier-router-core.mjs`:
   frozen order snapshot determines supplier. The default registry stays Daju
   only. An optional caller-injected local handler is forwarded by delivery;
   no actual callback or payment caller supplies it. No environment toggle was
   created. `canSupplierAutoPurchase("bitrefill")` stays false.
6. `lib/providers/daju/fulfillment.ts`: existing Daju candidate loading,
   `claim_supplier_fulfillment`, Daju provider, and supplier outcome RPC.
7. `lib/providers/bitrefill/paid-order-local.mjs`: FakeTransport-only handler;
   server paid-state read, existing root claim RPC, P1 gates, existing purchase
   claim/CAS RPC, invoice ID persistence, authenticated-GET-shaped fake reads,
   exact sole-child verification, existing private delivery transaction.
8. `app/api/orders/[orderNo]/delivery/route.ts` reads owner-authorized private
   delivery through `get_order_delivery_for_user`; general order queries are
   in `lib/orders/order-queries.ts`. See the companion UI contract.

## Frozen identity and finance

P1 already freezes external product/package, quantity, denomination/currency,
quoted/max cost and internal order item/root identity in purchase unit rows.
P2 adds order ID, internal product/SKU IDs, paid item allocation, payment fee,
currency, no-FX provenance and allowed maximum profit to the semantic hash.
The existing root/request and order-item foreign keys preserve the identity
relationship. No new table or schema field is introduced. Finance context is
represented durably by its hash, not separate inspectable columns; detailed
reconstruction still requires the existing payment/order evidence source.

Only `synthetic_paid_ledger` and explicitly `synthetic: true` cost evidence are
accepted by this local handler. Amounts use exact six-decimal BigInt arithmetic;
net profit is paid allocation minus fee minus supplier cost. Different currencies,
unknown FX/cost, excessive cost, insufficient net profit and excessive profit
are blocked. The P1 face/package/availability/freshness gates still apply.
No synthetic value can enable a real transport through this handler.

On replay, a persisted attempt is loaded before any repricing; known invoice
IDs use GET reconciliation. `SUBMITTING` or `UNCERTAIN` without an invoice ID
requires manual review and never resubmits. A crash leaving `CLAIMED` is also
conservatively manual here: P2 does not reconstruct the complete frozen request
from a hash or silently fetch a new quote. This is a remaining automation limit.

Webhook wake-up stores only allowlisted IDs and a hash, then reloads the order
from persisted attempt/root identity. Payload card/status fields are ignored.
Poll and webhook converge on the existing unique child/private delivery RPC.
Cancelled/refunded/unpaid orders are checked before work and again before
delivery; the SQL claim/outcome RPCs supply the transaction boundary checks.
Failures never create a customer refund or a replacement supplier purchase.

## Offline acceptance scope

`tests/support/supplier-v13-db5-local-e2e.mjs` reuses its guarded loopback PG
17.11 disposable database and adds `bitrefill-p2-local-cases.mjs`. P2 extracts
the **exact** repository root claim/normalization function bodies into the
disposable fixture, rather than precreating the root. Tests exercise repeated
2/10/100 post-payment dispatches, concurrent dispatch, private delivery,
cost/fee/availability/funds/error/timeout guards, wrong child, pending delivery,
webhook+poll recovery, cancelled/unpaid/refunded orders and post-delivery refund.

The harness transpiles and invokes the actual TypeScript Delivery Service and
Supplier Router; only Daju's network handler is stubbed. The local-priority
reservation and local delivery callbacks are explicit empty stubs. Existing
local-inventory/Daju tests separately cover those paths. It installs the exact
repository `pay_order_with_balance` and `complete_order_payment` function bodies
against minimal synthetic customer/payment fixture tables, and checks ten
payment replays leave one synthetic customer debit and one supplier submit.
It also installs the exact owner delivery-query RPC and checks owner access,
other-user denial and anonymous denial. No live customer balance, provider
callback HTTP, full checkout browser or Production schema clone is claimed.
The V1.3 21-child batch and partial-success tests still run; P2 real-batch purchase
remains disabled. Production DB8 parity, trusted live pricing/FX and child
contract evidence remain rollout blockers. No order/SKU binding is activated.

## Acceptance evidence (2026-10-16, Asia/Shanghai)

- TypeScript and targeted ESLint passed.
- P1/P2 focused tests passed, including financial semantic-hash drift.
- Full suite: 1,468 tests, 1,461 passed, the same seven baseline failures
  (one Daju snapshot-patch assertion and six migration-runner tests), zero
  new failures. These baseline tests were not rewritten for P2.
- PostgreSQL 17.11 DB5+P2 runner passed and dropped its own disposable database.
  Duplicate 2/10/100 notifications, ten concurrent dispatches, ten customer
  balance RPC replays, owner-only secret access, two-item partial success,
  cancellation after submit, timeout/funds/availability/cost/fee/wrong-child
  guards, and webhook/poll recovery all passed. Existing 21/21, delivery
  crash/rollback, RLS/ACL and 1000-row index cases remained passing.
- Dynamic secret audit: 14 non-private tables, zero marker matches; ordinary
  delivery logs also had zero marker matches.
- Build blocked by the existing Google Fonts Inter fetch (`connect EACCES`);
  no font/UI source was changed to work around it.
- Payment core, historical migrations, environment files and dependencies were
  not modified. The new checkout/owner-query fixture fields live only in the
  disposable test runner and are not Production schema evidence.
- P2B explicitly authorizes local commits after final acceptance. The original
  P2 attachment still ends at section 19; sections 20–29 were not available or
  claimed to have been read. P2B's explicit requirements govern this audit.
  No remote operation or actual Bitrefill POST was performed.

## P2B final acceptance audit (2026-10-16)

The continuous offline checkout creates a new **unpaid** synthetic order/item
with synthetic internal product/SKU IDs in the existing tables, asserts dispatch
is blocked, calls the unchanged authoritative customer-balance/payment RPCs,
then executes the actual TypeScript Delivery Service/Router with the explicit
FakeTransport handler. It checks the frozen unit/cost/hash, one invoice, GET
child correlation, atomic private delivery, and the original owner delivery-query
RPC on that same order. A fresh worker repeats delivery after commit and leaves
one secret. This proves the complete scoped service/SQL path; synthetic creation
is direct fixture insertion, not a claim of browser checkout, Next HTTP, or
`create_order_with_item` RPC acceptance.

The final combined DB5/P2B run exited 0. The synthetic checkout SKU required
the older activation-isolation assertion to compare the SKU count before and
after evaluation rather than assume an empty table; all ten unverified Apple
denomination evaluations remain blocked. The disposable database was dropped
by the runner and the local PostgreSQL process was stopped after acceptance.

Two overlapping PostgreSQL calls assert distinct `pg_backend_pid()` results.
Two separately constructed service adapters race ten paid dispatches against
the same logical purchase. Each SQL operation uses its own real psql connection;
the existing V1.3 two-session CAS, webhook/poll and private-transaction race
tests also run. Fresh poll/webhook handlers recover a known invoice using GET
without repricing; timeout without an invoice remains UNCERTAIN with zero retry.
Missing cost and different cost currency are tested at dispatch with zero invoice
submissions, alongside over-cap cost and negative net profit.

Final required-check evidence:

| P2B gate | Evidence/result |
| --- | --- |
| Full offline purchase-to-owner-read | Continuous same-order synthetic checkout described above |
| P1 adapter | 10 unit cases including frozen semantic context; no real network |
| V1.3 PostgreSQL | 21/21, submit/restart, GET recovery, two-session delivery, rollback, ACL/RLS, secret audit |
| Daju regression | 56 cases: 55 passed, one unchanged historical snapshot-patch baseline assertion |
| Local inventory + payment failure | 49 selected cases passed, including failed-session guard and local-stock priority |
| Full suite | 1,468 total, 1,461 passed, same seven known failures; NEW_FAILURES=0 |
| TypeScript / targeted Lint | Passed |
| Build | Existing Inter Google Fonts fetch blocked by EACCES; no UI/font edit |
| UI handoff | Companion contract distinguishes paid/processing/partial/delivered, owner access, support limits, no frontend supplier credentials |
| Production isolation | No Production read/write, migration, purchase, push, PR, merge or V1.4; payment/recharge/UI/migration/dependency files untouched |

Per the user's instruction, unresolved external/baseline issues are recorded
for tomorrow: unavailable original sections 20–29, the seven known baseline
assertions, and Google Fonts network access. Production parity, live cost and
live child identity remain separately unauthorized rollout gates, not completed
by local acceptance. No question or Production action is needed to retain the
reviewable local commits.
