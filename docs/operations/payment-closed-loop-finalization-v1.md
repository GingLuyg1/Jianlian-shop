# Payment closed-loop finalization V1 + V2

Base: `2780bf3d9a2147522a564d00bb742dc5f15a92ef`. Development only;
no Production deploy, migration, channel change or payment is authorized here.

## Approved amount contract

The user explicitly selected **cashier-collected buyer fee**. Do not add 3%
to local `payable_amount`: SNPAY API `money` and verified callback/query money
represent the principal, while the cashier may charge extra. A local surcharge
would risk charging the buyer twice. Settlement cost (e.g. a reported upstream
5%) is separate and has no verified settlement evidence in these records.

| Meaning | Principal 100 example | Persisted/canonical source |
|---|---:|---|
| PRINCIPAL / ORDER_AMOUNT | 100.00 | recharge requested/amount; order total_amount |
| Site fee | 0.00 | fee_amount; canonical channel fee_rate=0 |
| API payable/provider money | 100.00 | payable_amount; create/callback/query/RPC comparison |
| BUYER_FEE estimate | 3.00 | display-only 3% cashier estimate, integer cents half-up |
| TOTAL_PAYABLE cashier estimate | 103.00 | display-only; actual cashier total is authoritative |
| CREDIT_AMOUNT | 100.00 | canonical recharge RPC credits original principal once |
| PROVIDER_FEE / settlement cost | unknown | do not substitute the 3% estimate or infer net settlement |

The estimate never supplies a create request, callback amount or ledger input.
0.01 principal estimates 0.00 fee; 0.50 estimates 0.02. This rounding rule is
only for disclosure, not a promise about the Provider's rounding.

## Limits and canonical configuration

The 2000 CNY online boundary is the **local principal/API payable**, consistent
with current Alipay/WeChat DB maximum 2000 and the approved fee contract.
Principal 2000 may result in a cashier gross estimate 2060: this does not cross
the principal boundary. 2000.01 is rejected before ordinary online creation.
SNPAY capability now hard-caps 2000 even if a channel config is raised.

Recharge applies the 2000 CNY principal limit to SNPAY/Liuhaoyi and to the CNY
input for BEP20 recharge before conversion. Checkout applies it to external
payment order amounts, including BEP20. Internal balance spending is not an
external payment and keeps its existing behavior. Existing lower channel
maximums and minimums still apply; no new minimum is invented.

SAFE_READ_ONLY Production inspection found:
- Alipay and WeChat minimum 1 CNY, maximum 2000, site fee 0.
- USDT-BEP20 minimum 1 USDT, configured maximum 100000 USDT, site fee 0.
- BEP20's token-unit min/max remain distinct from the new CNY principal cap.
  The daily locked rate and exact fingerprint amount continue unchanged.

Both existing Radix dialogs display:
`支付金额大于2000联系人工客服处理。`
They use `openPublicSupport()` (the existing public support entrypoint), not
hard-coded contact details. The recharge primary action opens this dialog and
returns without fetch. The server also enforces limits and rejects overprecision.

## Audited paths and proof boundaries

- Recharge POST validates server canonical enabled/configured channel, amount,
  fee and immutable parent; payment-session creation independently validates
  the same contract before reservation and Provider dispatch.
- SNPAY create/query/callback uses pinned session/provider identity, signed
  responses, trusted timestamps, principal money and currency/channel checks.
- Recharge reconciliation supports pending/processing/expired only, finite
  lookback/cadence, CAS claim, fail-closed query errors, trusted paid-before-both-
  expiries. Completed, failed and closed sessions are not revived.
- Canonical completion locks session/recharge/profile and principal ledger;
  isolated PostgreSQL tests cover duplicates and callback/worker and worker/
  worker races (10 rounds each). Cashier fees cannot enter the credit.
- Purchases use canonical order payment transition and post-payment delivery.
  Balance uses its own transactional payment RPC, not a fabricated Provider
  session. BEP20 uses the chain session/verified transfer and canonical completion.
- Delivery reserves local inventory transactionally. Supplier fallback uses
  `claim_supplier_fulfillment`: per-item unique request, row lock, attempt token;
  FULFILLED returns NONE, PURCHASING/UNCERTAIN cannot dispatch another purchase.
  Duplicate completion may call delivery again; the database claim/stock locks,
  not the fact that the delivery function is called once, prevent duplicate goods.
- New BEP20 sessions now read canonical enabled/configured channel and check
  the CNY order limit before chain network/reservation. Existing transfer
  verification is intentionally unaffected by channel closure.

## V2 order reconciliation policy and proof

The existing worker scans recharge/account_recharge **and order**. There is no
second reconciliation engine. Shared signed query validation binds frozen
session number, Provider order number, amount, currency and channel. Parent
policies remain separate: recharge expiry recovery does not authorize order
resurrection.

An order is automatically completable only while `pending_payment`, unpaid and
`reservation_released_at IS NULL`. Session/order ID, business number, user,
payment method, CNY principal snapshot, original creation/expiry boundaries
must agree. No catalog price is reread. Failed/closed sessions never query.
Terminal/released orders produce deduped manual-review evidence with **zero
Provider queries**, and already-paid orders do not complete again. Such local
evidence marks Provider paid status **unknown**, not a fabricated payment.

After a trusted paid query, the service rereads both rows and frozen lifetimes.
State changes, late/untrusted payment time or identity/amount mismatch cannot
complete. If expiration released inventory during query, verified paid evidence
is preserved in `payment_reconciliations`, business_type order, searchable order
number, signed/timestamp/identity booleans and safe paid time; no raw payload,
signature, URL or key. Stable session/kind/reason dedupe prevents evidence growth
on repeated timer ticks. Refund, replacement and manual resolution are Admin
decisions outside the automatic worker.

Only `completePayment(source: reconciliation)` invokes `complete_payment_session`
then the existing `complete_order_payment` and `deliverDigitalOrder`. No direct
order/stock/payment writes are added to the service.

### Required development migration (NOT executed in Production)

`20261009180000_order_reconciliation_inventory_boundary.sql` is a minimal,
fail-closed, transaction-wrapped function patch; it does not update business
rows or create tables. Existing unknown/already-patched function definitions
abort the whole migration. Trusted-server ACL is asserted and preserved.

The session RPC acquires order before session, matching `expire_unpaid_order`,
avoiding their former lock inversion. Within the already-locked order branch,
**SNPAY only** gets authoritative pending/unpaid/unreleased, frozen context and
both paid-time lifetime guards. `complete_order_payment` itself is unchanged;
BEP20's USDT received/CNY principal conversion and manual paths are not given
SNPAY's CNY equality rule. Recharge RPC bodies/expiry policy are unchanged.

Payment wins: expiration sees paid/final and skips release. Expiration wins:
session/order become terminal, inventory releases once, completion fails closed,
and worker paid evidence becomes manual review. Paid plus released is forbidden.

The isolated native PostgreSQL runner now extracts the actual canonical order
payment, expiration, inventory release, digital delivery, supplier claims/outcomes
and delivery patches from migrations. It uses the real TS completion, delivery,
supplier router and DAJU adapter with fake signed SNPAY and fake supplier network.
No simplified SQL payment/delivery function replaces these runtime bodies.

Coverage: unpaid zero business writes; reserved digital paid delivery once;
manual orders no automatic delivery; supplier procurement once; callback/worker
and worker/worker 10 rounds each; expiration 10 rounds with deterministic both
winners plus concurrent SQL transactions; product/SKU/digital release once;
late payment manual review; delivery error leaves payment paid, then fulfillment-
only retry produces one delivery without another query/completion; BEP20
conversion regression. Existing recharge RSA/native race matrix remains intact.

Query budget is unchanged: four serial dispatches, stop after two query errors,
24h lookback, 60s minimum age, persisted cadence/CAS, four 40-row pages, saved
cursor, heartbeat and process flock. Logs now separate order/recharge candidates;
long invalid order prefixes cannot reset/starve the cursor indefinitely.

### Admin evidence boundary

Order payment detail enriches frozen Provider from a bounded, exact historical
session relation (business ID/number/user/channel/currency/principal and AUTO
session number or matching transaction). Missing/ambiguous evidence is explicitly
unavailable, never inferred from current payment channels. Detail shows principal,
site fee, API payable, received, transaction/paid time, session/reconciliation,
fulfillment and delivery error. Actual cashier fee/gross and settlement cost remain
unavailable: estimated 3% is never labeled actual. The reconciliation panel already
supports order references and manual review search.

## Final Production real E2E runbook (not executed)

1. After a separate approved PR, deploy review, prepare and activation, record
   exact SHA, enabled gates/timer, channels, new-window counts, and private
   baseline user balance/ledger. Never include customer/session IDs in public logs.
2. With separate canary authority, briefly enable ONE SNPAY channel via Admin,
   create ONE fresh recharge at its canonical safe minimum, immediately close
   it, and minimally verify exactly one session/artifact, principal, identity and
   adequate expiry time. Do not reuse any previous abandoned/completed canary.
3. User pays **once**, checks actual cashier fee, and records receipt privately.
   Do not run manual completion, recovery, retries, or process the historical
   third WeChat canary. Wait for callback/normal gated worker cadence.
4. Read-only verify provider evidence already persisted, session paid, recharge
   paid/succeeded, original expiries unchanged, principal credited exactly once,
   one completed ledger, balance delta=principal, cashier fee credited=0.
   Observe duplicate callbacks/normal worker passes without triggering another
   completion as an idempotency test. Timeout/mismatch becomes an incident,
   not another payment or a forced status change.
5. **E2E-B Shop Order:** a second, distinct small externally paid SNPAY order is
   required to prove the shop callback/worker/fulfillment chain, after verifying
   real independent inventory/supplier readiness. Brief enable -> one new order
   -> immediate disable -> minimal pre-pay signed identity/time check -> one user
   payment -> ordinary callback/worker only. Read-only check one paid session,
   one canonical order payment, reserved ownership not released, one delivery or
   supplier request/outcome, no repeated card delivery, principal/site fee contract.
   Do not intentionally suppress callbacks or force expiration in Production.
   An expired/released paid order goes manual review, never auto-resurrection.
   Balance purchase does not substitute for this SNPAY external purchase proof.
6. **FINAL_REAL_PAYMENT_COUNT_REQUIRED=2** (E2E-A recharge and E2E-B shop).
   Channels remain closed unless the user separately authorizes rollout. A/W
   real new paid automatic reconciliation E2E remains `not_tested` here.

## Validation record

Local targeted tests, payment/fulfillment/reconciliation/release regressions,
Node 20/22, typecheck, production build, and disposable localhost PostgreSQL
are run for this branch. The Windows full suite retains the previously documented
one Daju contract-drift and six Windows migration-runner baseline failures.
CI is authoritative only after its final conclusion is retrieved for the exact
commit; never mark a pushed or queued run as success.

SAFE_READ_ONLY Production: exact active 2780bf3; main PM2 online; localhost and
public health 200; app/worker gates true; reconciliation timer enabled/active;
Alipay/WeChat false, USDT true; 35 sessions, 26 recharges, 20 balance transactions;
historical third WeChat paid once, one principal ledger, profile balance 30.
No Provider query or business mutation was performed by this task.

## Deployment sequencing (plan only)

User creates one PR after final exact branch CI; no merge/deploy performed here.
Before app deployment, separately approve the new migration read-only preflight
and manual SQL execution, then verify the guarded RPC/ACL and zero business-row
changes. The worker must not gain order scope before that schema prerequisite.
Then separately approve release prepare/isolated smoke/switch, retain rollback,
verify channels remain closed and existing reconciliation timer/gates unchanged.
No new timer/unit installation or cadence change is needed for V2.
Migration is forward-only: a code rollback can stop new order processing but
must not remove released-inventory guards or restore terminal orders.
